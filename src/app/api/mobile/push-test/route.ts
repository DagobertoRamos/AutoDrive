// =============================================================================
// /api/mobile/push-test — dispara um push de teste pelo CAMINHO REAL de
// produção para os aparelhos/inscrições do próprio usuário logado:
//   • Nativo (Android/iOS) via FCM
//   • PWA/iPhone via Web Push (VAPID)
// Serve para diagnosticar o envio do servidor. Abra logado no app/navegador.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { sendToTokens, fcmConfigured, fcmSelfTest } from '@/lib/push/fcm'
import { sendWebPushToUser, webPushConfigured } from '@/lib/push/web-push'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  const nativos = await prisma.mobileDevice.findMany({
    where: { userId: user.id, isActive: true, platform: { in: ['ANDROID', 'IOS'] } },
    select: { deviceToken: true },
  })
  const webSubs = await prisma.mobileDevice.count({ where: { userId: user.id, isActive: true, platform: 'WEBPUSH' } })

  const title = 'Teste de chamada 🔔'
  const body = 'Push de teste do AutoDrive — produção'
  const data = { type: 'QUEUE_CALL', attendanceId: 'PUSHTEST', customerName: 'Teste', timeoutSeconds: '15' }

  const [fcm, web] = await Promise.all([
    sendToTokens(nativos.map((d) => d.deviceToken), { title, body, ttlSeconds: 60, data }),
    sendWebPushToUser(user.id, { title, body, data }),
  ])

  const enviados = fcm.sent + web.sent
  return NextResponse.json({
    fcmConfigured: fcmConfigured(),
    webPushConfigured: webPushConfigured(),
    credencial: await fcmSelfTest(),
    userId: user.id,
    devicesNativos: nativos.length,
    webPushInscricoes: webSubs,
    enviadosNativo: fcm.sent,
    enviadosWeb: web.sent,
    enviados,
    diagnostico: enviados > 0
      ? 'Push enviado pelo servidor com sucesso'
      : (nativos.length + webSubs) === 0
        ? 'Nenhum aparelho/inscrição registrado para este usuário'
        : 'Há registros mas o envio falhou (ver credenciais/logs)',
  })
}
