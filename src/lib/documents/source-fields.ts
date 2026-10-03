// =============================================================================
// documents/source-fields.ts — dados da base (negociação, cliente, veículo do
// estoque, fornecedor, loja) → campos dos modelos do gerador de documentos.
// PURO (testado). Só devolve chaves com valor; o painel aplica as que o
// modelo tiver.
// =============================================================================

import type { Party, VehicleData } from '@/lib/negotiation/contracts/documents-core'

export interface SourceOutorgado { nome: string; cpf?: string | null; rg?: string | null; endereco?: string | null }

/** O que a rota /api/documents/source devolve (datas já em texto). */
export interface DocSource {
  loja?: Party | null
  cidade?: string | null
  uf?: string | null
  /** Cliente / outorgante / quem recebe (comprador da negociação, cliente ou fornecedor). */
  parte?: Party | null
  veiculo?: VehicleData | null
  /** Valor pago/quitado (negociação) — senão o valor do veículo. */
  valor?: number | null
  formaPagamento?: string | null
  outorgado?: SourceOutorgado | null
}

const s = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim())

export const brlNumber = (n?: number | null) =>
  n != null && Number.isFinite(n) && n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

export const dateBR = (d: Date = new Date()) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })

export function vehicleTitle(v?: VehicleData | null): string {
  if (!v) return ''
  return s([v.marca, v.modelo, v.versao].filter(Boolean).join(' '))
}

export function vehicleYear(v?: VehicleData | null): string {
  if (!v) return ''
  if (v.anoFab && v.anoModelo && v.anoFab !== v.anoModelo) return `${v.anoFab}/${v.anoModelo}`
  return s(v.anoModelo ?? v.anoFab)
}

/** Dados da base → valores dos campos dos modelos (chaves de templates.ts). */
export function sourceToFields(src: DocSource): Record<string, string> {
  const out: Record<string, string> = {}
  const put = (k: string, v: unknown) => { const t = s(v); if (t) out[k] = t }

  const l = src.loja
  if (l) {
    put('empresa', l.nome)
    put('empresaDoc', l.documento)
    put('empresaEndereco', l.endereco)
    put('empresaRepresentante', l.representante?.nome)
  }
  put('cidade', [s(src.cidade), s(src.uf)].filter(Boolean).join('/'))

  const p = src.parte
  if (p) {
    for (const prefix of ['cliente', 'outorgante']) {
      put(`${prefix}Nome`, p.nome)
      put(`${prefix}Cpf`, p.documento)
      put(`${prefix}Rg`, p.tipo === 'PJ' ? p.ie : p.rg)
      put(`${prefix}Endereco`, p.endereco)
      put(`${prefix}Telefone`, p.telefone)
      put(`${prefix}Email`, p.email)
    }
  }

  const v = src.veiculo
  if (v) {
    put('veiculo', vehicleTitle(v))
    put('ano', vehicleYear(v))
    put('cor', v.cor)
    put('placa', v.placa?.toUpperCase())
    put('renavam', v.renavam)
    put('chassi', v.chassi?.toUpperCase())
    if (v.km != null && v.km > 0) put('km', v.km.toLocaleString('pt-BR'))
  }
  put('valor', brlNumber(src.valor ?? v?.valor))
  put('formaPagamento', src.formaPagamento)

  const o = src.outorgado
  if (o) {
    put('outorgadoNome', o.nome)
    put('outorgadoCpf', o.cpf)
  }
  return out
}

/** Campos de cada bloco: trocar a pessoa/veículo limpa os campos do bloco antes. */
const PARTY_SUFFIX = ['Nome', 'Cpf', 'Rg', 'Endereco', 'Telefone', 'Email']
export const FIELD_GROUPS = {
  loja: ['empresa', 'empresaDoc', 'empresaEndereco', 'empresaRepresentante', 'cidade'],
  parte: ['cliente', 'outorgante'].flatMap((p) => PARTY_SUFFIX.map((s) => p + s)),
  veiculo: ['veiculo', 'ano', 'cor', 'placa', 'renavam', 'chassi', 'km', 'valor'],
  outorgado: ['outorgadoNome', 'outorgadoCpf'],
} as const

/**
 * Aplica a origem sobre os valores atuais: cada bloco presente em `src`
 * (loja, parte, veiculo, outorgado) substitui o bloco inteiro; o resto fica.
 */
export function applySource(values: Record<string, string>, src: DocSource): Record<string, string> {
  const next = { ...values }
  const clear = (keys: readonly string[]) => keys.forEach((k) => delete next[k])
  if (src.loja !== undefined) clear(FIELD_GROUPS.loja)
  if (src.parte !== undefined) clear(FIELD_GROUPS.parte)
  if (src.veiculo !== undefined) clear(FIELD_GROUPS.veiculo)
  if (src.outorgado !== undefined) clear(FIELD_GROUPS.outorgado)
  if (src.formaPagamento !== undefined) delete next.formaPagamento
  return { ...next, ...sourceToFields(src) }
}
