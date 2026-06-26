package br.com.autodrive.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

// =============================================================================
// PresenceService — serviço em primeiro plano que mantém o AutoDrive ATIVO em
// 2º plano (estilo Uber/99/WhatsApp). Exibe um aviso fixo discreto e impede o
// sistema (Doze/suspensão da fabricante) de adormecer o app, garantindo que o
// push da chamada e o alarme cheguem mesmo na bateria, com a tela bloqueada.
// =============================================================================

public class PresenceService extends Service {

    public static final String CHANNEL_ID = "presence";
    public static final int NOTIFICATION_ID = 7100;

    public static void start(Context ctx) {
        try {
            Intent i = new Intent(ctx, PresenceService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception ignored) {}
    }

    public static void stop(Context ctx) {
        try { ctx.stopService(new Intent(ctx, PresenceService.class)); } catch (Exception ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannel(nm);

        int icon = getResources().getIdentifier("ic_notification", "drawable", getPackageName());
        if (icon == 0) icon = android.R.drawable.ic_popup_reminder;

        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);

        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(icon)
                .setContentTitle("AutoDrive ativo")
                .setContentText("Pronto para receber chamadas da fila")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setShowWhen(false)
                .setContentIntent(pi)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Exception ignored) {}

        return START_STICKY; // o sistema reinicia o serviço se ele for morto
    }

    private void ensureChannel(NotificationManager nm) {
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
            if (ch == null) {
                ch = new NotificationChannel(CHANNEL_ID, "Serviço ativo", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Mantém o AutoDrive pronto para receber chamadas em 2º plano");
                ch.setShowBadge(false);
                ch.setSound(null, null);
                nm.createNotificationChannel(ch);
            }
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
