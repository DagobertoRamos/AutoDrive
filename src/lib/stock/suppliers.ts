// =============================================================================
// Fornecedores — tipos, validação do cadastro (PF/PJ pelo documento) e
// qualificação para contratos. Fornecedor de VEÍCULOS é quem a loja intermedeia:
// sai no contrato como PROPRIETÁRIO(A)/VENDEDOR(A), por isso exige endereço
// completo e, se PJ, representante legal.
// =============================================================================

import { isValidCPF } from '@/lib/br-docs/cpf'
import { isValidCNPJ } from '@/lib/br-docs/cnpj'

export const SUPPLIER_KINDS = [
  ['VEICULOS', 'Veículos'],
  ['PECAS', 'Peças e acessórios'],
  ['OFICINA', 'Oficina mecânica'],
  ['MECANICA', 'Mecânica especializada'],
  ['FUNILARIA', 'Funilaria e pintura'],
  ['ESTETICA', 'Estética e lavagem'],
  ['ELETRICA', 'Elétrica e ar-condicionado'],
  ['PNEUS', 'Pneus e alinhamento'],
  ['DESPACHANTE', 'Despachante'],
  ['LAUDO', 'Laudo e vistoria'],
  ['MATERIAL_ESCRITORIO', 'Material de escritório'],
  ['LIMPEZA', 'Limpeza e conservação'],
  ['MARKETING', 'Marketing e publicidade'],
  ['TECNOLOGIA', 'Tecnologia e sistemas'],
  ['SERVICOS', 'Serviços gerais'],
  ['OUTRO', 'Outro'],
] as const
export type SupplierKind = (typeof SUPPLIER_KINDS)[number][0]
export const SUPPLIER_KIND_LABEL = Object.fromEntries(SUPPLIER_KINDS) as Record<string, string>
const KINDS = new Set(SUPPLIER_KINDS.map(([k]) => k as string))

/** Prestadores da preparação do veículo (aparecem nos serviços do carro). */
export const PREP_SUPPLIER_KINDS: SupplierKind[] = ['OFICINA', 'MECANICA', 'FUNILARIA', 'ESTETICA', 'ELETRICA', 'PNEUS', 'PECAS', 'DESPACHANTE', 'LAUDO', 'SERVICOS', 'OUTRO']

const TEXT = ['legalName', 'rg', 'stateRegistration', 'repName', 'contactName', 'email', 'street', 'number', 'complement', 'district', 'city', 'commission', 'pixKey', 'bankInfo', 'notes'] as const
const DIGITS = ['document', 'repCpf', 'phone', 'whatsapp', 'cep'] as const
type TextField = (typeof TEXT)[number]
type DigitField = (typeof DIGITS)[number]
export type SupplierInput =
  { name: string; kind: string; personType: 'PF' | 'PJ'; state: string | null }
  & { [K in TextField]: string | null } & { [K in DigitField]: string | null }

const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const text = (v: unknown, max: number) => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s ? s.slice(0, max) : null }

/** PF/PJ pelo documento: 11 dígitos = CPF, 14 = CNPJ. */
export function personTypeOf(document: string | null | undefined): 'PF' | 'PJ' | null {
  const d = onlyDigits(document)
  return d.length === 11 ? 'PF' : d.length === 14 ? 'PJ' : null
}

/**
 * Valida e normaliza o cadastro. Obrigatórios: tipo, CPF/CNPJ válido, nome
 * (razão social / nome completo) e um telefone. Fornecedor de VEÍCULOS
 * (sai no contrato): endereço completo e, se PJ, representante legal com CPF.
 */
export function supplierData(body: Record<string, unknown>): { ok: true; data: SupplierInput } | { ok: false; error: string } {
  const kind = String(body.kind ?? '').toUpperCase()
  if (!KINDS.has(kind)) return { ok: false, error: 'Selecione o tipo de fornecedor.' }

  const document = onlyDigits(body.document)
  const personType = personTypeOf(document)
  if (!personType) return { ok: false, error: 'Informe o CPF ou CNPJ.' }
  if (personType === 'PF' ? !isValidCPF(document) : !isValidCNPJ(document)) return { ok: false, error: `${personType === 'PF' ? 'CPF' : 'CNPJ'} inválido.` }

  const data = { kind, personType, document } as SupplierInput
  for (const f of TEXT) data[f] = text(body[f], f === 'notes' || f === 'bankInfo' ? 1000 : 200)
  for (const f of DIGITS) if (f !== 'document') data[f] = onlyDigits(body[f]) || null
  data.state = text(body.state, 2)?.toUpperCase() ?? null

  // Nome: PJ = razão social (+ fantasia opcional); PF = nome completo.
  const name = text(body.name, 160)
  if (personType === 'PJ') {
    if (!data.legalName && !name) return { ok: false, error: 'Informe a razão social.' }
    data.legalName = data.legalName ?? name
    data.name = name ?? data.legalName!
    data.rg = null
  } else {
    const full = name ?? data.legalName
    if (!full) return { ok: false, error: 'Informe o nome completo.' }
    data.name = full
    data.legalName = full
    data.stateRegistration = null; data.repName = null; data.repCpf = null
  }

  if (!data.whatsapp && !data.phone) return { ok: false, error: 'Informe o WhatsApp ou telefone.' }
  for (const f of ['whatsapp', 'phone'] as const) if (data[f] && (data[f]!.length < 10 || data[f]!.length > 11)) return { ok: false, error: `${f === 'whatsapp' ? 'WhatsApp' : 'Telefone'} inválido.` }
  if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return { ok: false, error: 'E-mail inválido.' }
  if (data.cep && data.cep.length !== 8) return { ok: false, error: 'CEP inválido.' }
  if (data.repCpf && !isValidCPF(data.repCpf)) return { ok: false, error: 'CPF do representante inválido.' }

  if (kind === 'VEICULOS') {
    const missing = [
      !data.cep && 'CEP', !data.street && 'logradouro', !data.number && 'número', !data.district && 'bairro', !data.city && 'cidade', !data.state && 'UF',
      personType === 'PJ' && !data.repName && 'representante legal', personType === 'PJ' && !data.repCpf && 'CPF do representante',
    ].filter(Boolean)
    if (missing.length) return { ok: false, error: `Fornecedor de veículos sai no contrato — informe: ${missing.join(', ')}.` }
  }
  return { ok: true, data }
}

/** Endereço em uma linha (estruturado; senão o texto legado). */
export function supplierAddress(s: { street?: string | null; number?: string | null; complement?: string | null; district?: string | null; city?: string | null; state?: string | null; cep?: string | null; address?: string | null }): string | null {
  const cep = onlyDigits(s.cep)
  const parts = [
    [s.street, s.number].filter(Boolean).join(', '), s.complement, s.district,
    [s.city, s.state].filter(Boolean).join('/'), cep.length === 8 ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : null,
  ].map((p) => String(p ?? '').trim()).filter(Boolean)
  return s.street ? parts.join(', ') : (s.address?.trim() || parts.join(', ') || null)
}
