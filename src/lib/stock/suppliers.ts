// Fornecedores/prestadores — validação do formulário.
export const SUPPLIER_KINDS = [
  ['OFICINA', 'Oficina mecânica'], ['FUNILARIA', 'Funilaria e pintura'], ['ESTETICA', 'Estética/lavagem/polimento'], ['MECANICA', 'Mecânica especializada'],
  ['ELETRICA', 'Elétrica/ar-condicionado'], ['PECAS', 'Peças/autopeças'], ['PNEUS', 'Pneus/alinhamento'], ['DESPACHANTE', 'Despachante/documentação'],
  ['LAUDO', 'Laudo/vistoria'], ['OUTRO', 'Outro'],
] as const
const KINDS = new Set(SUPPLIER_KINDS.map(([k]) => k as string))

const FIELDS = ['document', 'contactName', 'phone', 'whatsapp', 'email', 'city', 'address', 'pixKey', 'bankInfo', 'notes'] as const
type Field = (typeof FIELDS)[number]
export type SupplierInput = { name: string; kind: string } & { [K in Field]: string | null }

export function supplierData(body: Record<string, unknown>): { ok: true; data: SupplierInput } | { ok: false; error: string } {
  const name = String(body.name ?? '').trim().slice(0, 120)
  if (!name) return { ok: false, error: 'Informe o nome do fornecedor.' }
  const kind = String(body.kind ?? 'OFICINA').toUpperCase()
  const data = { name, kind: KINDS.has(kind) ? kind : 'OUTRO' } as SupplierInput
  for (const f of FIELDS) {
    const v = String(body[f] ?? '').trim()
    data[f] = v ? v.slice(0, f === 'notes' || f === 'bankInfo' ? 1000 : 200) : null
  }
  for (const f of ['document', 'phone', 'whatsapp'] as const) if (data[f]) data[f] = data[f]!.replace(/\D/g, '') || null
  if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return { ok: false, error: 'E-mail inválido.' }
  return { ok: true, data }
}
