// =============================================================================
// seller-queue/automation.ts — automações da fila:
//   • autoCheckoutStalePauses: remove da fila quem ficou PAUSADO tempo demais
//     (proxy de "saiu da loja / esqueceu pausado"). Registra evento p/ avisar.
//   • isQueueOpenNow: a fila está dentro do horário/dias configurados? (BRT)
// Chamadas de forma "lazy" no /current (sem cron).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { logQueueEvent } from './queue'

export const AUTO_PAUSE_REASON = 'AUTO_PAUSE_TIMEOUT'

/** Remove (LEFT) entradas PAUSADAS há mais de maxPauseMinutes. Registra evento. */
export async function autoCheckoutStalePauses(opts: { tenantId: string; unitId: string; queueId: string; maxPauseMinutes?: number | null }): Promise<void> {
  const max = opts.maxPauseMinutes ?? 0
  if (!max || max <= 0) return
  const cutoff = new Date(Date.now() - max * 60 * 1000)
  const stale = await prisma.sellerQueueEntry.findMany({
    where: { queueId: opts.queueId, status: 'PAUSED', pausedAt: { lt: cutoff } },
    select: { id: true, sellerId: true },
  })
  for (const e of stale) {
    try {
      await prisma.sellerQueueEntry.update({ where: { id: e.id }, data: { status: 'LEFT', leftAt: new Date() } })
      await logQueueEvent({ tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, type: 'CHECK_OUT', sellerId: e.sellerId, actorId: e.sellerId, entryId: e.id, reason: `${AUTO_PAUSE_REASON}: removido por ficar pausado/fora por muito tempo (${max} min)` })
    } catch { /* segue */ }
  }
}

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** A fila está aberta agora? (horário de Brasília). Sem horário → sempre aberta. */
export function isQueueOpenNow(openTime?: string | null, closeTime?: string | null, allowedDays?: string[] | null): boolean {
  let hh = '00', mm = '00', wd = 'SUN'
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date())
    hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
    mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
    const wdShort = (parts.find((p) => p.type === 'weekday')?.value ?? 'Sun').toUpperCase().slice(0, 3)
    wd = WD.includes(wdShort) ? wdShort : 'SUN'
  } catch { return true }
  if (hh === '24') hh = '00'
  if (allowedDays && allowedDays.length > 0 && !allowedDays.includes(wd)) return false
  if (openTime && closeTime) {
    const cur = `${hh}:${mm}`
    return openTime <= closeTime ? (cur >= openTime && cur <= closeTime) : (cur >= openTime || cur <= closeTime)
  }
  return true
}
