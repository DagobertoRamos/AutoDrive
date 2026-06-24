package br.com.autodrive.app;

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
}
