// =============================================================================
// /api/marketing/telephony/providers — provedores homologados (camada GLOBAL).
//   GET : marketing.telephony — lista provedores ativos p/ a loja escolher.
// O cadastro/edição de provedores é do MASTER (master.marketing.telephony,
// painel futuro). Aqui é somente leitura para a loja montar conexões.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony')) return forbiddenResponse('Sem acesso à telefonia.')
  { const gate = await assertModuleEnabled(user, 'marketing.telephony'); if (gate) return gate }
  try {
    const rows = await prisma.telephonyProvider.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true, kind: true, active: true, supportsInbound: true, supportsOutbound: true, supportsRecording: true, supportsWebhook: true },
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}
