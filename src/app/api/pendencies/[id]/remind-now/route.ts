// =============================================================================
// POST /api/pendencies/[id]/remind-now — envio MANUAL do lembrete ("cobrar
// agora"): dispara o push na hora para o responsável, fora da régua/janela.
// Gate: pendencies.manage (gerência). Auditado indiretamente (totalSent++).
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { sendPendencyReminderNow } from '@/lib/pendencies/reminders'

export const maxDuration = 30

export async function POST(_req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'pendencies.manage')) {
      return NextResponse.json({ success: false, error: 'Apenas a gerência pode cobrar manualmente.' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    const r = await sendPendencyReminderNow(params.id)
    if (!r.ok) return NextResponse.json({ success: false, error: r.reason ?? 'Falha ao cobrar.' }, { status: 409 })
    return NextResponse.json({ success: true, sent: r.sent, message: r.sent > 0 ? 'Lembrete enviado.' : 'Enviado, mas o responsável não tem aparelho ativo.' })
  } catch (err) {
    console.error('[POST /api/pendencies/[id]/remind-now]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
