package br.com.autodrive.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
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
// Banner heads-up (canal IMPORTANCE_HIGH) + ALARME ALTO em loop no fluxo de
// alarme (com o volume de alarme forçado ao máximo, restaurado ao parar) +
// vibração forte. alert() inicia/mantém; stop() encerra. Chamado pelo web app
// via window.Capacitor.Plugins.LoudAlert. Java puro (sem Kotlin).
// =============================================================================

@CapacitorPlugin(name = "LoudAlert")
public class LoudAlertPlugin extends Plugin {

    private static final String CHANNEL_ID = "loud_alerts";
    private static final int NOTIFICATION_ID = 4711;

    private MediaPlayer player;
    private int savedAlarmVolume = -1;

    @PluginMethod
    public void alert(PluginCall call) {
        final String title = call.getString("title", "Você é o vendedor da vez 🔔");
        final String body = call.getString("body", "Cliente presencial aguardando.");
        try {
            showBanner(title, body);
            vibrateStrong();
            startAlarm();
        } catch (Exception e) {
            // best-effort: nunca quebra o fluxo do web app
        }
        call.resolve();
    }

    /** Para o alarme e restaura o volume (chamar ao aceitar/recusar). */
    @PluginMethod
    public void stop(PluginCall call) {
        stopAlarm();
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopAlarm();
        super.handleOnDestroy();
    }

    private void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
            if (ch == null) {
                ch = new NotificationChannel(CHANNEL_ID, "Alertas críticos", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Avisos urgentes da fila de atendimento");
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 800});
                ch.setSound(null, null); // o alarme é tocado explicitamente (volume de alarme)
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

    /** Inicia o alarme em loop (idempotente). Força o volume de alarme ao máximo. */
    private void startAlarm() {
        if (player != null && player.isPlaying()) return; // já tocando

        Context ctx = getContext();
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am != null) {
            try {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                if (savedAlarmVolume < 0) savedAlarmVolume = am.getStreamVolume(AudioManager.STREAM_ALARM);
                am.setStreamVolume(AudioManager.STREAM_ALARM, max, 0);
            } catch (Exception ignored) {}
        }

        Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        if (uri == null) return;

        try {
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            mp.setLooping(true);
            mp.setDataSource(ctx, uri);
            mp.setOnPreparedListener(MediaPlayer::start);
            mp.prepareAsync();
            player = mp;
        } catch (Exception e) {
            stopAlarm();
        }
    }

    private void stopAlarm() {
        if (player != null) {
            try { if (player.isPlaying()) player.stop(); player.release(); } catch (Exception ignored) {}
            player = null;
        }
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am != null && savedAlarmVolume >= 0) {
            try { am.setStreamVolume(AudioManager.STREAM_ALARM, savedAlarmVolume, 0); } catch (Exception ignored) {}
            savedAlarmVolume = -1;
        }
    }
}
