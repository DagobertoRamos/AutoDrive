// Validação da conta financeira (criação/edição) — campos do Centro Financeiro.
import { z } from 'zod'

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const text = (max: number) => z.string().trim().max(max).nullish()

export const accountSchema = z.object({
  name:           z.string().trim().min(2, 'Informe o nome da conta.').max(120),
  type:           z.enum(['CAIXA', 'BANCO', 'CARTAO', 'OUTRO']).default('CAIXA'),
  openingBalance: z.number({ invalid_type_error: 'Saldo inválido.' }).default(0),
  openingDate:    ymd.nullish(),
  bankName:       text(80),
  agency:         text(20),
  accountNumber:  text(30),
  unitId:         text(40),
  color:          text(20),
  includeInTotal: z.boolean().default(true),
  active:         z.boolean().default(true),
})

export const accountUpdateSchema = z.object({
  name:           z.string().trim().min(2, 'Informe o nome da conta.').max(120).optional(),
  type:           z.enum(['CAIXA', 'BANCO', 'CARTAO', 'OUTRO']).optional(),
  openingBalance: z.number({ invalid_type_error: 'Saldo inválido.' }).optional(),
  openingDate:    ymd.nullish(),
  bankName:       text(80).optional(),
  agency:         text(20).optional(),
  accountNumber:  text(30).optional(),
  unitId:         text(40).optional(),
  color:          text(20).optional(),
  includeInTotal: z.boolean().optional(),
  active:         z.boolean().optional(),
})

type AnyAccount = Partial<z.infer<typeof accountSchema>>

/** Converte o corpo validado nos dados do Prisma (só as chaves presentes). */
export function accountData(d: AnyAccount): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue
    if (k === 'openingDate') out.openingDate = v ? new Date(`${String(v)}T12:00:00.000Z`) : null
    else if (k === 'openingBalance') out.openingBalance = Math.round(Number(v) * 100) / 100
    else out[k] = typeof v === 'string' && k !== 'name' ? (v || null) : v
  }
  return out
}
