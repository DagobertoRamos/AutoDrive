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
    ensureNotificationChannels();
    requestRequiredPermissions();
    ensureFullScreenIntentAccess();
    PresenceService.start(getApplicationContext()); // mantém o app ativo p/ chamadas
    handleCallIntent(getIntent());
    handleGenericPushIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleCallIntent(intent);
    handleGenericPushIntent(intent);
  }

  // Abriu por uma CHAMADA da fila (toque na notificação ou botão Aceitar/Recusar):
  // para o alarme, fecha a notificação e guarda a ação p/ a WebView executar.
  private void handleCallIntent(Intent intent) {
    if (intent == null) return;
    String action = intent.getStringExtra("sqAction");
    String attId = intent.getStringExtra("attId");
    if (action == null && attId == null) return;

    // Aberto por uma CHAMADA → mostrar POR CIMA da tela bloqueada e acordar a
    // tela (senão a Activity abre atrás do cadeado e o usuário só ouve o alarme).
    showOverLockScreen();

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

  // Push genérico (avisos/notificações comuns): abre a rota indicada sem tela
  // cheia, sem alarme e sem ações de chamada. QUEUE_CALL continua separado.
  private void handleGenericPushIntent(Intent intent) {
    if (intent == null) return;
    String url = intent.getStringExtra("pushUrl");
    if (url == null || url.trim().isEmpty()) return;
    intent.removeExtra("pushUrl");

    String target = resolvePushUrl(url);
    if (target == null || getBridge() == null || getBridge().getWebView() == null) return;
    getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(target));
  }

  private String resolvePushUrl(String rawUrl) {
    if (getBridge() == null) return null;
    String server = getBridge().getServerUrl();
    if (server == null || server.trim().isEmpty()) return null;

    String url = rawUrl.trim();
    if (url.startsWith("https://") || url.startsWith("http://")) {
      return url.startsWith(server) ? url : null;
    }

    while (server.endsWith("/")) server = server.substring(0, server.length() - 1);
    if (!url.startsWith("/")) url = "/" + url;
    return server + url;
  }

  // Faz a Activity aparecer sobre a tela bloqueada e acende a tela (estilo
  // chamada recebida). Pede ao sistema para dispensar o cadeado não seguro.
  private void showOverLockScreen() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        setShowWhenLocked(true);
        setTurnScreenOn(true);
        android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (km != null) km.requestDismissKeyguard(this, null);
      } else {
        getWindow().addFlags(
            android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
          | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          | android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      }
    } catch (Exception ignored) {}
  }

  // Cria os canais de notificação já na ABERTURA do app (não só quando chega um
  // push). Sem isso, um aviso (pendência/cobrança) enviado com o app fechado
  // cai num canal que ainda não existe e o Android 8+ o DESCARTA em silêncio.
  // O canal "general_alerts" é o padrão do manifesto → recebe os avisos comuns.
  private void ensureNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    try {
      NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm == null) return;
      if (nm.getNotificationChannel(AutoDriveFcmService.GENERAL_CHANNEL_ID) == null) {
        android.app.NotificationChannel ch = new android.app.NotificationChannel(
            AutoDriveFcmService.GENERAL_CHANNEL_ID, "Avisos do AutoDrive",
            NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Notificações gerais, pendências, cobranças e alertas administrativos");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 400, 200, 400});
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
      }
    } catch (Exception ignored) {}
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
