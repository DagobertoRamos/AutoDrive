// =============================================================================
// seller-queue/queue-date.ts — "dia da fila" no fuso da loja (America/Sao_Paulo).
// Puro (sem banco) p/ ser testável. O formato gravado no campo @db.Date segue o
// mesmo de antes: meia-noite UTC do dia — só que do dia de SÃO PAULO (antes, às
// 21:00 locais já virava o dia seguinte em UTC e abria uma fila nova).
// =============================================================================

const TZ = 'America/Sao_Paulo'
// Brasil sem horário de verão desde 2019: São Paulo = UTC-3.
const SP_OFFSET_MS = 3 * 60 * 60 * 1000

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

function spYmd(now: Date): [number, number, number] {
  const parts = fmt.formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return [get('year'), get('month'), get('day')]
}

/** Data (sem hora) de hoje em São Paulo, como meia-noite UTC — chave @db.Date da fila. */
export function queueDate(now = new Date()): Date {
  const [y, m, d] = spYmd(now)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Instante em que o dia da fila começou (00:00 de São Paulo) — p/ filtros `createdAt >=`. */
export function queueDayStart(now = new Date()): Date {
  return new Date(queueDate(now).getTime() + SP_OFFSET_MS)
}
