package br.com.autodrive.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// =============================================================================
// BootReceiver — religa o PresenceService quando o celular é reiniciado, para o
// vendedor continuar recebendo as chamadas sem precisar abrir o app de novo.
// =============================================================================

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(a)
                || "android.intent.action.QUICKBOOT_POWERON".equals(a)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            PresenceService.start(ctx);
        }
    }
}
