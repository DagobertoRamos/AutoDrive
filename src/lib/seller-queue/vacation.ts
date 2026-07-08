// =============================================================================
// seller-queue/vacation.ts — Férias/Ausências do colaborador na fila (Fase 2).
// Model SellerVacation (datas/tipo/status). Uma ausência "em vigor" (não
// cancelada e dentro do período) bloqueia o check-in — logo o colaborador não
// entra na fila, não vira vendedor da vez, não recebe push e fica fora do
// escalonamento. O status é derivado das datas na leitura (sem cron para virar
// PROGRAMADO→ATIVO→ENCERRADO); só CANCELADO é persistido explicitamente.
// =============================================================================

import { prisma } from '@/lib/prisma'

export const VACATION_TYPES = ['FERIAS', 'FOLGA', 'ATESTADO', 'TREINAMENTO', 'AUSENCIA', 'BLOQUEIO_ADM', 'OUTRO'] as const
export type VacationType = typeof VACATION_TYPES[number]

export const VACATION_TYPE_LABELS: Record<string, string> = {
  FERIAS: 'Férias',
  FOLGA: 'Folga',
  ATESTADO: 'Atestado',
  TREINAMENTO: 'Treinamento',
  AUSENCIA: 'Ausência temporária',
  BLOQUEIO_ADM: 'Bloqueio administrativo',
  OUTRO: 'Outro',
}

export function normalizeVacationType(v: unknown): VacationType {
  const s = String(v ?? '').toUpperCase()
  return (VACATION_TYPES as readonly string[]).includes(s) ? (s as VacationType) : 'FERIAS'
}

type VacRow = { status: string; startAt: Date; endAt: Date }

/** Uma ausência está "em vigor" agora? (não cancelada e dentro do período). */
export function vacationInEffect(v: VacRow, at: Date = new Date()): boolean {
  if (v.status === 'CANCELADO') return false
  const t = at.getTime()
  return v.startAt.getTime() <= t && t < v.endAt.getTime()
}

/** Status derivado das datas (para exibição). Respeita CANCELADO persistido. */
export function effectiveStatus(v: VacRow, at: Date = new Date()): 'PROGRAMADO' | 'ATIVO' | 'ENCERRADO' | 'CANCELADO' {
  if (v.status === 'CANCELADO') return 'CANCELADO'
  const now = at.getTime()
  if (now < v.startAt.getTime()) return 'PROGRAMADO'
  if (now >= v.endAt.getTime()) return 'ENCERRADO'
  return 'ATIVO'
}

/** Ausência ATIVA (em vigor) do colaborador, se houver. Query indexada.
 *  FAIL-OPEN: se a tabela ainda não existe (deploy antes da migration) ou a
 *  consulta falha, retorna null — não bloqueia check-in nem quebra o /current. */
export async function getActiveVacation(tenantId: string, unitId: string, sellerId: string, at: Date = new Date()) {
  try {
    return await prisma.sellerVacation.findFirst({
      where: { tenantId, unitId, sellerId, status: { not: 'CANCELADO' }, startAt: { lte: at }, endAt: { gt: at } },
      orderBy: { endAt: 'desc' },
    })
  } catch (err) {
    console.error('[vacation] getActiveVacation falhou (migration aplicada?):', err)
    return null
  }
}

/** true se o colaborador está ausente agora (bloqueia check-in / chamada). */
export async function isSellerAbsent(tenantId: string, unitId: string, sellerId: string, at: Date = new Date()): Promise<boolean> {
  return !!(await getActiveVacation(tenantId, unitId, sellerId, at))
}

/** IDs dos colaboradores com ausência em vigor agora na unidade (para filtrar em lote). */
export async function absentSellerIds(tenantId: string, unitId: string, at: Date = new Date()): Promise<Set<string>> {
  try {
    const rows = await prisma.sellerVacation.findMany({
      where: { tenantId, unitId, status: { not: 'CANCELADO' }, startAt: { lte: at }, endAt: { gt: at } },
      select: { sellerId: true },
    })
    return new Set(rows.map((r) => r.sellerId))
  } catch (err) {
    console.error('[vacation] absentSellerIds falhou (migration aplicada?):', err)
    return new Set()
  }
}
