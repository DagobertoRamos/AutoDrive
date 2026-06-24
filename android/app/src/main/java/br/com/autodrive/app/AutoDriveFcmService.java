package br.com.autodrive.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

// =============================================================================
// AutoDriveFcmService — recebe o push (FCM) e, para uma CHAMADA da fila
// (type=QUEUE_CALL), mostra uma notificação full-screen "estilo chamada" com
// ALARME em loop + botões Aceitar / Recusar — funciona com o app fechado, em
// 2º plano ou com a tela bloqueada. Os botões abrem o app já com a ação.
// =============================================================================

public class AutoDriveFcmService extends FirebaseMessagingService {

    public static final String CHANNEL_ID = "queue_calls";
    public static final int NOTIFICATION_ID = 7001;
    public static final String PREFS = "autodrive_push";
    public static final String KEY_TOKEN = "fcm_token";

    @Override
    public void onNewToken(String token) {
        // Guarda o token; a WebView lê e registra no backend (tem a sessão).
        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().putString(KEY_TOKEN, token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> d = remoteMessage.getData();
        String type = d.get("type");
        if (!"QUEUE_CALL".equals(type)) return;

        String title = d.getOrDefault("title", "Você é o vendedor da vez 🔔");
        String body = d.getOrDefault("body", "Cliente aguardando — aceite ou recuse.");
        String attId = d.getOrDefault("attendanceId", "");

        try { CallRinger.start(getApplicationContext()); } catch (Exception ignored) {}
        showCallNotification(title, body, attId);
    }

    private void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
            if (ch == null) {
                ch = new NotificationChannel(CHANNEL_ID, "Chamadas da fila", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Chamada do vendedor da vez (aceitar/recusar)");
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[]{0, 600, 400, 600});
                ch.setSound(null, null); // o CallRinger toca o alarme em loop
                ch.setBypassDnd(true);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
        }
    }

    private PendingIntent open(String sqAction, String attId, int reqCode) {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (sqAction != null) i.putExtra("sqAction", sqAction);
        i.putExtra("attId", attId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, reqCode, i, flags);
    }

    private void showCallNotification(String title, String body, String attId) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(nm);

        PendingIntent piOpen = open(null, attId, 100);
        PendingIntent piAccept = open("accept", attId, 101);
        PendingIntent piReject = open("reject", attId, 102);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(true)
                .setContentIntent(piOpen)
                .setFullScreenIntent(piOpen, true) // pop-up/tela cheia mesmo bloqueado
                .addAction(0, "Aceitar", piAccept)
                .addAction(0, "Recusar", piReject);

        nm.notify(NOTIFICATION_ID, b.build());
    }
}
