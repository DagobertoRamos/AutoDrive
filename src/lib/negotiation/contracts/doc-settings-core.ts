// =============================================================================
// Configurações dos documentos da venda (PURO, testado): cabeçalho (logo,
// endereço, contatos — por padrão os do cadastro da loja) e os OUTORGADOS das
// procurações (quem a loja indica para representar o cliente no DETRAN etc.).
// Guardado em SystemSetting t:{tenantId}:documents:v1 (sem migration).
// =============================================================================

export interface Outorgado {
  id: string
  nome: string
  cpf: string
  rg?: string
  orgaoRg?: string
  nacionalidade?: string
  estadoCivil?: string
  profissao?: string
  endereco?: string
  /** Cargo/função na loja (ex.: despachante, gerente). */
  cargo?: string
  ativo: boolean
}

export interface DocSettings {
  /** Logo do cabeçalho (vazio = logo da loja / do site). */
  logoUrl: string
  /** Endereço do cabeçalho e da qualificação (vazio = endereço do cadastro da loja). */
  endereco: string
  telefone: string
  email: string
  /** Cidade/UF do local de assinatura (vazio = cidade do cadastro da loja). */
  cidade: string
  uf: string
  outorgados: Outorgado[]
  /** Validade da procuração do comprador (veículo vendido), em dias. */
  validadeProcuracaoDias: number
  /** Texto exigido pelo DETRAN: lembrete de reconhecer firma. */
  exigirFirmaReconhecida: boolean
}

export const DEFAULT_DOC_SETTINGS: DocSettings = {
  logoUrl: '', endereco: '', telefone: '', email: '', cidade: '', uf: '',
  outorgados: [], validadeProcuracaoDias: 180, exigirFirmaReconhecida: true,
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

export function sanitizeDocSettings(input: unknown, base: DocSettings = DEFAULT_DOC_SETTINGS): DocSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const pick = (k: keyof DocSettings, max = 200) => (k in o ? str(o[k], max) : (base[k] as string))
  const list = Array.isArray(o.outorgados) ? o.outorgados : base.outorgados
  const outorgados: Outorgado[] = list.slice(0, 20).flatMap((x, i): Outorgado[] => {
    const r = (x ?? {}) as Record<string, unknown>
    const nome = str(r.nome, 120)
    const cpf = digits(r.cpf).slice(0, 11)
    if (!nome) return []
    return [{
      id: str(r.id, 40) || `o${Date.now().toString(36)}${i}`,
      nome, cpf, rg: str(r.rg, 30), orgaoRg: str(r.orgaoRg, 20), nacionalidade: str(r.nacionalidade, 40) || 'brasileiro(a)',
      estadoCivil: str(r.estadoCivil, 40), profissao: str(r.profissao, 60), endereco: str(r.endereco, 240), cargo: str(r.cargo, 60),
      ativo: r.ativo !== false,
    }]
  })
  const dias = Number(o.validadeProcuracaoDias ?? base.validadeProcuracaoDias)
  return {
    logoUrl: pick('logoUrl', 500), endereco: pick('endereco', 240), telefone: pick('telefone', 40), email: pick('email', 120),
    cidade: pick('cidade', 80), uf: pick('uf', 2).toUpperCase(),
    outorgados,
    validadeProcuracaoDias: Number.isFinite(dias) ? Math.min(730, Math.max(30, Math.round(dias))) : base.validadeProcuracaoDias,
    exigirFirmaReconhecida: 'exigirFirmaReconhecida' in o ? o.exigirFirmaReconhecida !== false : base.exigirFirmaReconhecida,
  }
}

export const formatCpf = (v: string) => { const d = digits(v); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : v }
