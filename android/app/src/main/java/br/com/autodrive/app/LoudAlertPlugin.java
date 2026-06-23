package br.com.autodrive.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// =============================================================================
// LoudAlertPlugin — alerta CRÍTICO nativo (vendedor da vez).
// Mostra um banner heads-up (canal IMPORTANCE_HIGH), toca o ALARME do sistema
// no volume de alarme (alto) e vibra forte. Chamado pelo web app via
// window.Capacitor.Plugins.LoudAlert.alert({title, body}).
// Java puro (sem Kotlin) para evitar conflitos de JVM target no build.
// =============================================================================

@CapacitorPlugin(name = "LoudAlert")
public class LoudAlertPlugin extends Plugin {

    private static final String CHANNEL_ID = "loud_alerts";
    private static final int NOTIFICATION_ID = 4711;
    private Ringtone activeRingtone;

    @PluginMethod
    public void alert(PluginCall call) {
        final String title = call.getString("title", "Você é o vendedor da vez 🔔");
        final String body = call.getString("body", "Cliente presencial aguardando.");
        try {
            showBanner(title, body);
            vibrateStrong();
            playAlarm();
        } catch (Exception e) {
            // best-effort: nunca quebra o fluxo do web app
        }
        call.resolve();
    }

    /** Para o alarme/ringtone (chamar quando o vendedor aceitar/recusar). */
    @PluginMethod
    public void stop(PluginCall call) {
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) activeRingtone.stop();
        } catch (Exception ignored) {}
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        } catch (Exception ignored) {}
        call.resolve();
    }

    private void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
            if (ch == null) {
                ch = new NotificationChannel(CHANNEL_ID, "Alertas críticos", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Avisos urgentes da fila de atendimento");
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 800});
                // sem som no canal: o alarme é tocado explicitamente no volume de alarme
                ch.setSound(null, null);
                ch.enableLights(true);
                nm.createNotificationChannel(ch);
            }
        }
    }

    private void showBanner(String title, String body) {
        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(nm);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(ctx.getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVibrate(new long[]{0, 500, 200, 500, 200, 800})
                .setAutoCancel(true);

        nm.notify(NOTIFICATION_ID, b.build());
    }

    private void vibrateStrong() {
        Context ctx = getContext();
        Vibrator vib;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vib = vm != null ? vm.getDefaultVibrator() : null;
        } else {
            vib = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (vib == null || !vib.hasVibrator()) return;

        long[] pattern = {0, 500, 200, 500, 200, 800};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vib.vibrate(VibrationEffect.createWaveform(pattern, -1));
        } else {
            vib.vibrate(pattern, -1);
        }
    }

    private void playAlarm() {
        Context ctx = getContext();
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) activeRingtone.stop();
        } catch (Exception ignored) {}

        Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        if (uri == null) return;

        Ringtone r = RingtoneManager.getRingtone(ctx, uri);
        if (r == null) return;
        // toca no fluxo de ALARME → usa o volume de alarme (alto)
        r.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        activeRingtone = r;
        r.play();
    }
}
