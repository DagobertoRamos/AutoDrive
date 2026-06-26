package br.com.autodrive.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

// =============================================================================
// PushBridgePlugin — ponte entre o FCM nativo e a WebView.
//   getToken()      → token FCM atual (a WebView registra em /api/mobile/devices)
//   consumeAction() → ação pendente da notificação (accept/reject) + attId,
//                     setada pela MainActivity ao abrir por uma chamada.
// =============================================================================

@CapacitorPlugin(name = "PushBridge")
public class PushBridgePlugin extends Plugin {

    private static String pendingAction = null;
    private static String pendingAttId = null;

    /** Chamado pela MainActivity quando o app abre por uma ação da notificação. */
    public static void setPending(String action, String attId) {
        pendingAction = action;
        pendingAttId = attId;
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    JSObject ret = new JSObject();
                    ret.put("token", task.getResult());
                    call.resolve(ret);
                } else {
                    call.reject("Falha ao obter token FCM");
                }
            });
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void consumeAction(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("action", pendingAction);
        ret.put("attId", pendingAttId);
        pendingAction = null;
        pendingAttId = null;
        call.resolve(ret);
    }

    /** A WebView chama ao Aceitar/Recusar/encerrar: para o alarme e fecha a chamada. */
    @PluginMethod
    public void stopRinger(PluginCall call) {
        try { CallRinger.stop(getContext()); } catch (Exception ignored) {}
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(AutoDriveFcmService.NOTIFICATION_ID);
        } catch (Exception ignored) {}
        call.resolve();
    }

    // ── Fase 4: diagnóstico e atalhos para as configurações do aparelho ─────────

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("available", true);
        r.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);

        boolean notifications = true;
        try { notifications = NotificationManagerCompat.from(ctx).areNotificationsEnabled(); } catch (Exception ignored) {}
        r.put("notifications", notifications);

        boolean battery = true;
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) battery = pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        } catch (Exception ignored) {}
        r.put("batteryUnrestricted", battery);

        boolean fullScreen = true;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                fullScreen = nm != null && nm.canUseFullScreenIntent();
            }
        } catch (Exception ignored) {}
        r.put("fullScreen", fullScreen);

        call.resolve(r);
    }

    private void launch(Intent i) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
    }

    private void openAppDetailsInternal() {
        try {
            launch(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void openNotifications(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            launch(i);
        } catch (Exception e) { openAppDetailsInternal(); }
        call.resolve();
    }

    @PluginMethod
    public void openBattery(PluginCall call) {
        try {
            launch(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName())));
        } catch (Exception e) {
            try { launch(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
            catch (Exception e2) { openAppDetailsInternal(); }
        }
        call.resolve();
    }

    @PluginMethod
    public void openFullScreen(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                launch(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getContext().getPackageName())));
            } else { openAppDetailsInternal(); }
        } catch (Exception e) { openAppDetailsInternal(); }
        call.resolve();
    }

    @PluginMethod
    public void openAppDetails(PluginCall call) {
        openAppDetailsInternal();
        call.resolve();
    }
}
