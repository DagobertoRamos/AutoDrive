// =============================================================================
// /api/mobile/push-test — dispara um push de teste pelo CAMINHO REAL de
// produção (fcm.ts + FIREBASE_SERVICE_ACCOUNT_B64) para os aparelhos do próprio
// usuário logado. Serve para diagnosticar o envio do servidor (diferente do
// teste manual local). Abra esta URL logado no app/navegador.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { sendToTokens, fcmConfigured, fcmSelfTest } from '@/lib/push/fcm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  const devices = await prisma.mobileDevice.findMany({
    where: { userId: user.id, isActive: true },
    select: { deviceToken: true },
  })

  const configured = fcmConfigured()
  const res = await sendToTokens(devices.map((d) => d.deviceToken), {
    title: 'Teste de chamada 🔔',
    body: 'Push de teste do AutoDrive — produção',
    ttlSeconds: 60,
    data: { type: 'QUEUE_CALL', attendanceId: 'PUSHTEST', customerName: 'Teste', timeoutSeconds: '15' },
  })

  const selfTest = await fcmSelfTest()

  return NextResponse.json({
    fcmConfigured: configured,
    credencial: selfTest,
    userId: user.id,
    devicesAtivos: devices.length,
    enviados: res.sent,
    invalidos: res.invalid.length,
    diagnostico: !configured
      ? 'FIREBASE_SERVICE_ACCOUNT_B64 ausente/ilegível no servidor'
      : devices.length === 0
        ? 'Nenhum aparelho registrado para este usuário'
        : res.sent === 0
          ? 'Credencial existe mas o envio falhou (ver logs do servidor — chave/JWT)'
          : 'Push enviado pelo servidor com sucesso',
  })
}
