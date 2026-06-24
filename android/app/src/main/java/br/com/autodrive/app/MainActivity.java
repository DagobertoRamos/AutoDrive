package br.com.autodrive.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Registra plugins locais ANTES do super.onCreate (exigência do Capacitor)
    registerPlugin(LoudAlertPlugin.class);
    registerPlugin(PushBridgePlugin.class);
    super.onCreate(savedInstanceState);
    requestRequiredPermissions();
    handleCallIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleCallIntent(intent);
  }

  // Abriu por uma CHAMADA da fila (toque na notificação ou botão Aceitar/Recusar):
  // para o alarme, fecha a notificação e guarda a ação p/ a WebView executar.
  private void handleCallIntent(Intent intent) {
    if (intent == null) return;
    String action = intent.getStringExtra("sqAction");
    String attId = intent.getStringExtra("attId");
    if (action == null && attId == null) return;

    try { CallRinger.stop(getApplicationContext()); } catch (Exception ignored) {}
    try {
      NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.cancel(AutoDriveFcmService.NOTIFICATION_ID);
    } catch (Exception ignored) {}

    if (action != null) PushBridgePlugin.setPending(action, attId);
  }

  private void requestRequiredPermissions() {
    List<String> permissionsToRequest = new ArrayList<>();

    // Permissões necessárias
    String[] requiredPermissions = {
      Manifest.permission.INTERNET,
      Manifest.permission.CAMERA,
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION,
      Manifest.permission.READ_EXTERNAL_STORAGE,
      Manifest.permission.RECORD_AUDIO,
    };

    // Android 13+ requer POST_NOTIFICATIONS
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS);
    }

    // Android 11+ (WRITE_EXTERNAL_STORAGE)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      permissionsToRequest.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
    }

    // Verificar quais permissões já foram concedidas
    for (String permission : requiredPermissions) {
      if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
        permissionsToRequest.add(permission);
      }
    }

    // Se houver permissões a pedir, pedir
    if (!permissionsToRequest.isEmpty()) {
      ActivityResultLauncher<String[]> launcher = registerForActivityResult(
        new ActivityResultContracts.RequestMultiplePermissions(),
        result -> {
          // Permissões foram processadas
          for (String permission : permissionsToRequest) {
            if (result.getOrDefault(permission, false)) {
              android.util.Log.d("PermissionManager", "Permission granted: " + permission);
            } else {
              android.util.Log.w("PermissionManager", "Permission denied: " + permission);
            }
          }
        }
      );
      launcher.launch(permissionsToRequest.toArray(new String[0]));
    }
  }
}
