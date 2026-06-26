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
// CallRinger — alarme de CHAMADA (estilo Uber/99). Toca no volume de alarme e
// vibra forte. PARA SOZINHO no fim do prazo SEM depender de timer (que o Doze
// adia): a vibração é um padrão FINITO que termina por conta própria, e o som
// só repete enquanto não passou do prazo. stop() corta tudo na hora ao
// aceitar/recusar. Estático para sobreviver entre serviço e Activity.
// =============================================================================

public final class CallRinger {
    private static MediaPlayer player;
    private static int savedVolume = -1;
    private static long deadline = 0;

    private CallRinger() {}

    public static synchronized void start(Context ctx) {
        start(ctx, 90);
    }

    /** Toca/vibra por no máximo maxSeconds e termina SOZINHO (robusto contra Doze). */
    public static synchronized void start(Context ctx, int maxSeconds) {
        final int secs = Math.max(5, maxSeconds);
        deadline = System.currentTimeMillis() + secs * 1000L;
        if (player != null && player.isPlaying()) return; // já tocando: só estendeu o prazo
        final Context app = ctx.getApplicationContext();
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
                mp.setLooping(false);
                mp.setDataSource(ctx, uri);
                mp.setOnPreparedListener(MediaPlayer::start);
                // Repete o toque só enquanto não venceu o prazo — sem timer.
                mp.setOnCompletionListener(m -> {
                    if (System.currentTimeMillis() < deadline) {
                        try { m.seekTo(0); m.start(); } catch (Exception ignored) {}
                    } else {
                        stop(app);
                    }
                });
                mp.prepareAsync();
                player = mp;
            }
            vibrate(ctx, secs);
        } catch (Exception ignored) { stop(ctx); }
    }

    public static synchronized void stop(Context ctx) {
        deadline = 0;
        if (player != null) {
            try { player.setOnCompletionListener(null); if (player.isPlaying()) player.stop(); player.release(); } catch (Exception ignored) {}
            player = null;
        }
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && savedVolume >= 0) { am.setStreamVolume(AudioManager.STREAM_ALARM, savedVolume, 0); savedVolume = -1; }
        } catch (Exception ignored) {}
        // Cancela a vibração de forma robusta (Vibrator e, no S+, o VibratorManager).
        try {
            Vibrator v = vibrator(ctx);
            if (v != null) v.cancel();
        } catch (Exception ignored) {}
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) vm.cancel();
            }
        } catch (Exception ignored) {}
    }

    // Vibração FINITA: ~1 ciclo por segundo, repetido 'seconds' vezes, então PARA
    // sozinha. Não usa repeat infinito nem timer — imune ao Doze/processo congelado.
    private static void vibrate(Context ctx, int seconds) {
        Vibrator v = vibrator(ctx);
        if (v == null || !v.hasVibrator()) return;
        int cycles = Math.max(5, seconds);
        long[] pattern = new long[1 + cycles * 2];
        pattern[0] = 0;
        for (int i = 0; i < cycles; i++) { pattern[1 + i * 2] = 600; pattern[2 + i * 2] = 400; }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(pattern, -1)); // -1 = NÃO repetir
            } else {
                v.vibrate(pattern, -1);
            }
        } catch (Exception ignored) {}
    }

    private static Vibrator vibrator(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
