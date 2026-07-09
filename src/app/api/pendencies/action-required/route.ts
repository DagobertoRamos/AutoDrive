// =============================================================================
// GET /api/pendencies/action-required — pop-ups de SLA que o RESPONSÁVEL logado
// precisa resolver ao entrar: compromisso de prazo (Alta/Urgente) ou cobrança
// (Urgente com prazo estourado). Estado derivado de pendency_events; config no
// settings (JSON). Tolerante a migration pendente (.catch). Gate: pendencies.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { loadTenantPendencySettings, DEFAULT_PENDENCY_SETTINGS } from '@/lib/pendencies/settings'
import { decidePendencyPopup, type SlaEventLite } from '@/lib/pendencies/sla-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerAuthSession()
  if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
  if (!canAccessModule(session.user.role, 'pendencies') && !canAccessModule(session.user.role, 'pendencies.central')) {
    return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
  }

  // O pop-up é para o RESPONSÁVEL. responsibleId = Seller.id → mapeia do usuário.
  const seller = await prisma.seller.findFirst({ where: { userId: session.user.id }, select: { id: true } }).catch(() => null)
  if (!seller) return NextResponse.json({ success: true, data: [] })

  const config = session.user.tenantId
    ? await loadTenantPendencySettings(session.user.tenantId).catch(() => DEFAULT_PENDENCY_SETTINGS)
    : DEFAULT_PENDENCY_SETTINGS
  if (!config.slaEngine.enabled) return NextResponse.json({ success: true, data: [] })

  const pendencies = await prisma.pendency.findMany({
    where: {
      responsibleId: seller.id,
      priority: { in: config.slaEngine.requireCommitFor as never[] },
      status: { notIn: ['FINALIZADA', 'CANCELADA', 'AGUARDANDO_RESPOSTA'] },
    },
    select: { id: true, customerName: true, plate: true, type: true, description: true, priority: true, status: true, dueDate: true, unit: { select: { name: true } } },
    take: 50,
  }).catch(() => [])
  if (pendencies.length === 0) return NextResponse.json({ success: true, data: [] })

  // Eventos de todas as candidatas de uma vez. IMPORTANTE: se a tabela
  // pendency_events ainda NÃO existe (migration da Fase 2 pendente), o motor
  // fica DESLIGADO — senão o pop-up de compromisso apareceria e o commit não
  // teria onde gravar, criando um loop de cobrança que nunca se satisfaz.
  let events: Array<{ pendencyId: string } & SlaEventLite>
  try {
    events = await prisma.pendencyEvent.findMany({
      where: { pendencyId: { in: pendencies.map((p) => p.id) } },
      select: { pendencyId: true, type: true, content: true, newDueDate: true, createdAt: true },
    })
  } catch {
    return NextResponse.json({ success: true, data: [] })
  }

  const byPendency = new Map<string, SlaEventLite[]>()
  for (const e of events) {
    const arr = byPendency.get(e.pendencyId) ?? []
    arr.push(e)
    byPendency.set(e.pendencyId, arr)
  }

  const now = new Date()
  const data = pendencies
    .map((p) => {
      const decision = decidePendencyPopup({ priority: p.priority, status: p.status, events: byPendency.get(p.id) ?? [], now, config: config.slaEngine })
      return { pendency: p, decision }
    })
    .filter((x) => x.decision.kind !== 'none')

  return NextResponse.json({ success: true, data })
}
