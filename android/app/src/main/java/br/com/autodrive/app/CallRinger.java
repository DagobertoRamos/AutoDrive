package br.com.autodrive.app;

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

// =============================================================================
// CallRinger — alarme de CHAMADA em loop (estilo Uber/99). Toca no volume de
// alarme e vibra forte. Usado pelo FCM (push) e pode ser parado ao aceitar/
// recusar/expirar. Estático para sobreviver entre serviço e Activity.
// =============================================================================

public final class CallRinger {
    private static MediaPlayer player;
    private static int savedVolume = -1;

    private CallRinger() {}

    public static synchronized void start(Context ctx) {
        if (player != null && player.isPlaying()) return;
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                if (savedVolume < 0) savedVolume = am.getStreamVolume(AudioManager.STREAM_ALARM);
                am.setStreamVolume(AudioManager.STREAM_ALARM, max, 0);
            }
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri != null) {
                MediaPlayer mp = new MediaPlayer();
                mp.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                mp.setLooping(true);
                mp.setDataSource(ctx, uri);
                mp.setOnPreparedListener(MediaPlayer::start);
                mp.prepareAsync();
                player = mp;
            }
            vibrate(ctx);
        } catch (Exception ignored) { stop(ctx); }
    }

    public static synchronized void stop(Context ctx) {
        if (player != null) {
            try { if (player.isPlaying()) player.stop(); player.release(); } catch (Exception ignored) {}
            player = null;
        }
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && savedVolume >= 0) { am.setStreamVolume(AudioManager.STREAM_ALARM, savedVolume, 0); savedVolume = -1; }
        } catch (Exception ignored) {}
        try {
            Vibrator v = vibrator(ctx);
            if (v != null) v.cancel();
        } catch (Exception ignored) {}
    }

    private static void vibrate(Context ctx) {
        Vibrator v = vibrator(ctx);
        if (v == null || !v.hasVibrator()) return;
        long[] pattern = {0, 600, 400, 600, 400, 600, 400};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(pattern, 0)); // repeat
        } else {
            v.vibrate(pattern, 0);
        }
    }

    private static Vibrator vibrator(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
