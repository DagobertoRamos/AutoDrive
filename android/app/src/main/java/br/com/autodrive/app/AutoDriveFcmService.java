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
import androidx.core.app.Person;

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
    public static final String GENERAL_CHANNEL_ID = "general_alerts";
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
        if (!"QUEUE_CALL".equals(type)) {
            showGenericNotification(d);
            return;
        }

        String title = d.getOrDefault("title", "Você é o vendedor da vez 🔔");
        String body = d.getOrDefault("body", "Cliente aguardando — aceite ou recuse.");
        String attId = d.getOrDefault("attendanceId", "");
        int timeout = 90;
        try { timeout = Integer.parseInt(d.getOrDefault("timeoutSeconds", "90")); } catch (Exception ignored) {}

        // toca/vibra e AUTO-PARA no fim do prazo (rede de segurança contra loop)
        try { CallRinger.start(getApplicationContext(), timeout); } catch (Exception ignored) {}
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

        PendingIntent piOpen = open("open", attId, 100);
        PendingIntent piAccept = open("accept", attId, 101);
        PendingIntent piReject = open("reject", attId, 102);

        // Ícone pequeno DEVE ser um drawable monocromático simples — usar o ícone
        // adaptativo do app faz o Android descartar a notificação silenciosamente.
        int smallIcon = getResources().getIdentifier("ic_notification", "drawable", getPackageName());
        if (smallIcon == 0) smallIcon = android.R.drawable.ic_popup_reminder;

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(piOpen)
                .setFullScreenIntent(piOpen, true); // tela cheia mesmo bloqueado

        // CallStyle (Android 12+) — visual de CHAMADA RECEBIDA com Aceitar/Recusar.
        // Tem tratamento prioritário do sistema (heads-up/lock screen) em qualquer
        // fabricante, igual app de ligação. Abaixo do 12, usa botões de ação.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Person caller = new Person.Builder().setName(title).setImportant(true).build();
            b.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, piReject, piAccept));
        } else {
            b.addAction(0, "Aceitar", piAccept).addAction(0, "Recusar", piReject);
        }

        nm.notify(NOTIFICATION_ID, b.build());
    }

    private void ensureGeneralChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = nm.getNotificationChannel(GENERAL_CHANNEL_ID);
            if (ch == null) {
                // IMPORTANCE_HIGH → heads-up + som (pendências/cobranças precisam
                // ser notadas). Alinhado com MainActivity.ensureNotificationChannels().
                ch = new NotificationChannel(GENERAL_CHANNEL_ID, "Avisos do AutoDrive", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Notificações gerais, pendências, cobranças e alertas administrativos");
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[]{0, 400, 200, 400});
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
        }
    }

    private PendingIntent openGeneric(String url, int reqCode) {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("pushUrl", url == null || url.trim().isEmpty() ? "/dashboard" : url.trim());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, reqCode, i, flags);
    }

    private int genericNotificationId(Map<String, String> d) {
        String id = d.get("notificationId");
        if (id == null || id.isEmpty()) id = d.get("entityId");
        if (id == null || id.isEmpty()) return (int) (System.currentTimeMillis() % 100000);
        return 8000 + Math.abs(id.hashCode() % 90000);
    }

    private void showGenericNotification(Map<String, String> d) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureGeneralChannel(nm);

        String title = d.getOrDefault("title", "AutoDrive");
        String body = d.getOrDefault("body", "Você recebeu uma nova notificação.");
        String url = d.getOrDefault("url", "/dashboard");
        int notificationId = genericNotificationId(d);

        int smallIcon = getResources().getIdentifier("ic_notification", "drawable", getPackageName());
        if (smallIcon == 0) smallIcon = android.R.drawable.ic_dialog_info;

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, GENERAL_CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setAutoCancel(true)
                .setContentIntent(openGeneric(url, notificationId));

        nm.notify(notificationId, b.build());
    }
}
