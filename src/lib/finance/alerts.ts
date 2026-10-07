// =============================================================================
// Alertas diários do financeiro (cron /api/internal/finance/alerts/run).
// Para cada loja, avisa quem tem acesso ao financeiro sobre:
//   • contas a pagar e a receber vencidas; contas a pagar que vencem hoje;
//   • financiamentos vendidos aguardando o banco há mais de 7 dias;
//   • possíveis lançamentos duplicados (mesmo tipo, valor, vencimento e
//     contraparte, criados nas últimas 24h).
// Uma vez por dia por loja (SystemSetting `finance:alerts:last:<tenantId>`).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { notifyMany } from '@/services/notification.service'
import { hasFinanceAccess } from './access'
import { COMMISSION_ELIGIBLE_DEAL_STATUSES } from '@/lib/commission/status'

const spYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TRANSIT_DAYS = 7
const LAST_KEY = (tenantId: string) => `finance:alerts:last:${tenantId}`

export interface TenantAlerts { overduePay: { count: number; total: number }; overdueReceive: { count: number; total: number }; dueToday: { count: number; total: number }; transitLate: { count: number; total: number }; duplicates: number }

export async function computeAlerts(tenantId: string, now = new Date()): Promise<TenantAlerts> {
  const today = spYmd(now)
  const startToday = new Date(`${today}T00:00:00-03:00`)
  const endToday = new Date(`${today}T23:59:59.999-03:00`)
  const base = { tenantId, status: 'PREVISTO' as const, transferGroupId: null, parentEntryId: null }
  const [pay, rec, todayPay, transit, recent] = await Promise.all([
    prisma.financialEntry.aggregate({ where: { ...base, type: 'DESPESA', dueDate: { lt: startToday } }, _count: true, _sum: { amount: true } }),
    prisma.financialEntry.aggregate({ where: { ...base, type: 'RECEITA', dueDate: { lt: startToday } }, _count: true, _sum: { amount: true } }),
    prisma.financialEntry.aggregate({ where: { ...base, type: 'DESPESA', dueDate: { gte: startToday, lte: endToday } }, _count: true, _sum: { amount: true } }),
    prisma.dealPayment.findMany({
      where: {
        type: 'FINANCIAMENTO', OR: [{ status: null }, { status: { notIn: ['CONFIRMADO', 'PAGO', 'CANCELADO', 'ESTORNADO', 'RECUSADO'] } }],
        deal: { tenantId, status: { in: COMMISSION_ELIGIBLE_DEAL_STATUSES } },
      },
      select: { value: true, deal: { select: { approvedAt: true, releasedAt: true, finalizedAt: true, saleDate: true, createdAt: true } } },
    }),
    prisma.financialEntry.findMany({
      where: { tenantId, status: { not: 'CANCELADO' }, transferGroupId: null, parentEntryId: null, createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
      select: { type: true, amount: true, dueDate: true, counterparty: true, description: true },
    }),
  ])
  const limit = now.getTime() - TRANSIT_DAYS * 86_400_000
  const late = transit.filter((t) => +(t.deal.approvedAt ?? t.deal.releasedAt ?? t.deal.finalizedAt ?? t.deal.saleDate ?? t.deal.createdAt) < limit)
  const seen = new Map<string, number>()
  for (const e of recent) {
    const k = [e.type, Number(e.amount).toFixed(2), e.dueDate ? spYmd(e.dueDate) : '', (e.counterparty ?? e.description).trim().toLowerCase()].join('|')
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const num = (v: unknown) => Number(v ?? 0)
  return {
    overduePay: { count: pay._count, total: num(pay._sum.amount) },
    overdueReceive: { count: rec._count, total: num(rec._sum.amount) },
    dueToday: { count: todayPay._count, total: num(todayPay._sum.amount) },
    transitLate: { count: late.length, total: late.reduce((s, t) => s + Number(t.value), 0) },
    duplicates: [...seen.values()].filter((n) => n > 1).length,
  }
}

function messages(a: TenantAlerts): { title: string; message: string; url: string }[] {
  const out: { title: string; message: string; url: string }[] = []
  if (a.overduePay.count) out.push({ title: 'Contas a pagar vencidas', message: `${a.overduePay.count} conta(s) vencida(s): ${brl(a.overduePay.total)}.`, url: '/financeiro/pagar' })
  if (a.dueToday.count) out.push({ title: 'Contas a pagar vencendo hoje', message: `${a.dueToday.count} conta(s): ${brl(a.dueToday.total)}.`, url: '/financeiro/pagar' })
  if (a.overdueReceive.count) out.push({ title: 'Recebimentos vencidos', message: `${a.overdueReceive.count} recebimento(s) vencido(s): ${brl(a.overdueReceive.total)}.`, url: '/financeiro/receber' })
  if (a.transitLate.count) out.push({ title: 'Financiamentos aguardando o banco', message: `${a.transitLate.count} contrato(s) há mais de ${TRANSIT_DAYS} dias: ${brl(a.transitLate.total)}.`, url: '/financeiro/relatorios?view=contratos-transito' })
  if (a.duplicates) out.push({ title: 'Possível lançamento duplicado', message: `${a.duplicates} grupo(s) de lançamentos iguais criados nas últimas 24h. Confira.`, url: '/financeiro/lancamentos' })
  return out
}

/** Roda para todas as lojas (cron). Retorna quantas lojas foram avisadas. */
export async function runFinanceAlerts(now = new Date()): Promise<{ tenants: number; notified: number }> {
  const today = spYmd(now)
  const tenants = await prisma.tenant.findMany({ select: { id: true } })
  let notified = 0
  for (const t of tenants) {
    try {
      const last = await prisma.systemSetting.findUnique({ where: { key: LAST_KEY(t.id) }, select: { value: true } })
      if (last?.value === today) continue
      const hasFinance = await prisma.financialEntry.count({ where: { tenantId: t.id }, take: 1 })
      if (!hasFinance) continue
      const msgs = messages(await computeAlerts(t.id, now))
      await prisma.systemSetting.upsert({ where: { key: LAST_KEY(t.id) }, create: { tenantId: t.id, key: LAST_KEY(t.id), value: today, group: 'finance' }, update: { value: today } })
      if (!msgs.length) continue
      const users = await prisma.user.findMany({ where: { tenantId: t.id, status: 'ATIVO', role: { notIn: ['VENDEDOR', 'VENDEDOR_LIDER'] as never[] } }, select: { id: true, role: true, tenantId: true } })
      const ids: string[] = []
      for (const u of users) if (await hasFinanceAccess({ id: u.id, role: u.role, tenantId: u.tenantId }).catch(() => false)) ids.push(u.id)
      if (!ids.length) continue
      for (const m of msgs) {
        await notifyMany({ userIds: ids, tenantId: t.id, type: 'SISTEMA', title: m.title, message: m.message, actionUrl: m.url, metadata: { kind: 'finance_alert' }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] })
      }
      notified++
    } catch (e) {
      console.error('[finance-alerts]', t.id, e)
    }
  }
  return { tenants: tenants.length, notified }
}
