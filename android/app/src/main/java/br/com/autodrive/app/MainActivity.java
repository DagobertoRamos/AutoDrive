package br.com.autodrive.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

  // IMPORTANTE: o launcher precisa ser registrado na CONSTRUÇÃO da Activity
  // (antes de STARTED). Registrar dentro de onCreate, depois do super, dá
  // IllegalStateException em vários aparelhos e a permissão NUNCA é pedida —
  // por isso a notificação não aparecia em alguns devices. Campo = universal.
  private final ActivityResultLauncher<String[]> permLauncher =
      registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
        for (String p : result.keySet()) {
          android.util.Log.d("AutoDrivePerm", p + " => " + result.get(p));
        }
      });

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Registra plugins locais ANTES do super.onCreate (exigência do Capacitor)
    registerPlugin(LoudAlertPlugin.class);
    registerPlugin(PushBridgePlugin.class);
    super.onCreate(savedInstanceState);
    requestRequiredPermissions();
    ensureFullScreenIntentAccess();
    PresenceService.start(getApplicationContext()); // mantém o app ativo p/ chamadas
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

    // SOMENTE aceitar/recusar param o alarme e fecham a chamada. Abrir pela
    // tela cheia / toque no corpo ("open") apenas traz o app — o alarme CONTINUA
    // tocando até o usuário decidir (senão a chamada "acende e apaga" ao abrir
    // sozinha na tela bloqueada).
    if ("accept".equals(action) || "reject".equals(action)) {
      try { CallRinger.stop(getApplicationContext()); } catch (Exception ignored) {}
      try {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(AutoDriveFcmService.NOTIFICATION_ID);
      } catch (Exception ignored) {}
    }

    if (action != null) PushBridgePlugin.setPending(action, attId);
  }

  private void requestRequiredPermissions() {
    List<String> toRequest = new ArrayList<>();

    String[] required = {
      Manifest.permission.CAMERA,
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION,
      Manifest.permission.RECORD_AUDIO,
    };
    for (String p : required) {
      if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) toRequest.add(p);
    }

    // Android 13+ exige POST_NOTIFICATIONS — sem ela a notificação de chamada
    // é descartada em silêncio (o alarme toca, mas o balão não aparece).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      toRequest.add(Manifest.permission.POST_NOTIFICATIONS);
    }

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R
        && ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
      toRequest.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
    }

    if (!toRequest.isEmpty()) {
      try { permLauncher.launch(toRequest.toArray(new String[0])); } catch (Exception ignored) {}
    }
  }

  // Android 14+ não concede "notificação em tela cheia" por padrão. Sem isso a
  // chamada não sobrepõe a tela bloqueada. Pedimos UMA vez levando o usuário à
  // tela de configuração correta.
  private void ensureFullScreenIntentAccess() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return;
    try {
      NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null && nm.canUseFullScreenIntent()) return;
      SharedPreferences sp = getSharedPreferences("autodrive_push", Context.MODE_PRIVATE);
      if (sp.getBoolean("fsi_asked", false)) return;
      sp.edit().putBoolean("fsi_asked", true).apply();
      Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName()));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(i);
    } catch (Exception ignored) {}
  }
}
