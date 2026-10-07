// =============================================================================
// DRE gerencial de revenda — PURO (testado).
// Cada categoria do plano de contas aponta para um grupo da DRE (dreGroup);
// a DRE soma por grupo, então a loja renomeia/cria categorias à vontade sem
// quebrar o relatório. Lançamento sem categoria cai no grupo da sua origem
// (source) e, por último, no genérico do tipo.
// =============================================================================

import { baseSource } from './settlement-core'

export type DreSection =
  | 'RECEITA_BRUTA' | 'DEDUCOES' | 'CMV' | 'DESPESAS_OPERACIONAIS'
  | 'RESULTADO_FINANCEIRO' | 'IMPOSTOS_LUCRO' | 'FORA_DRE'

export interface DreGroupDef {
  key: string
  label: string
  section: DreSection
  kind: 'RECEITA' | 'DESPESA'
}

export const DRE_GROUPS: DreGroupDef[] = [
  { key: 'REC_VEICULOS',     label: 'Venda de veículos',                       section: 'RECEITA_BRUTA',         kind: 'RECEITA' },
  { key: 'REC_FI',           label: 'Retorno financeiro (F&I)',                section: 'RECEITA_BRUTA',         kind: 'RECEITA' },
  { key: 'REC_INTERMEDIACAO', label: 'Intermediação e consignação',            section: 'RECEITA_BRUTA',         kind: 'RECEITA' },
  { key: 'REC_SERVICOS',     label: 'Serviços (garantia, documentação, seguros)', section: 'RECEITA_BRUTA',      kind: 'RECEITA' },
  { key: 'REC_OUTRAS',       label: 'Outras receitas operacionais',            section: 'RECEITA_BRUTA',         kind: 'RECEITA' },
  { key: 'DED_IMPOSTOS',     label: 'Impostos sobre vendas',                   section: 'DEDUCOES',              kind: 'DESPESA' },
  { key: 'DED_DEVOLUCOES',   label: 'Devoluções, distratos e descontos',       section: 'DEDUCOES',              kind: 'DESPESA' },
  { key: 'CMV_AQUISICAO',    label: 'Custo de aquisição dos veículos',         section: 'CMV',                   kind: 'DESPESA' },
  { key: 'CMV_PREPARACAO',   label: 'Preparação (oficina, estética, peças, laudo)', section: 'CMV',              kind: 'DESPESA' },
  { key: 'CMV_DOCUMENTACAO', label: 'Documentação e débitos dos veículos',     section: 'CMV',                   kind: 'DESPESA' },
  { key: 'CMV_SERVICOS',     label: 'Custo de garantias e serviços vendidos',  section: 'CMV',                   kind: 'DESPESA' },
  { key: 'DESP_PESSOAL',     label: 'Pessoal (salários, encargos, benefícios, pró-labore)', section: 'DESPESAS_OPERACIONAIS', kind: 'DESPESA' },
  { key: 'DESP_COMISSOES',   label: 'Comissões e premiações',                  section: 'DESPESAS_OPERACIONAIS', kind: 'DESPESA' },
  { key: 'DESP_OCUPACAO',    label: 'Ocupação (aluguel, energia, água, IPTU)', section: 'DESPESAS_OPERACIONAIS', kind: 'DESPESA' },
  { key: 'DESP_MARKETING',   label: 'Marketing e portais',                     section: 'DESPESAS_OPERACIONAIS', kind: 'DESPESA' },
  { key: 'DESP_ADMIN',       label: 'Administrativas',                         section: 'DESPESAS_OPERACIONAIS', kind: 'DESPESA' },
  { key: 'DESP_COMERCIAIS',  label: 'Comerciais e variáveis',                  section: 'DESPESAS_OPERACIONAIS', kind: 'DESPESA' },
  { key: 'FIN_RECEITAS',     label: 'Receitas financeiras (rendimentos)',      section: 'RESULTADO_FINANCEIRO',  kind: 'RECEITA' },
  { key: 'FIN_DESPESAS',     label: 'Despesas financeiras (juros, tarifas, IOF)', section: 'RESULTADO_FINANCEIRO', kind: 'DESPESA' },
  { key: 'IR_CSLL',          label: 'IR e CSLL',                               section: 'IMPOSTOS_LUCRO',        kind: 'DESPESA' },
  { key: 'NAO_OPERACIONAL',  label: 'Não operacional (aportes, retiradas, investimentos)', section: 'FORA_DRE',   kind: 'DESPESA' },
]

export const DRE_GROUP_BY_KEY: Record<string, DreGroupDef> = Object.fromEntries(DRE_GROUPS.map((g) => [g.key, g]))

/** Grupos que custeiam o veículo: entram no CMV no mês da VENDA do carro. */
export const VEHICLE_COST_GROUPS = new Set(['CMV_AQUISICAO', 'CMV_PREPARACAO', 'CMV_DOCUMENTACAO'])

// Origem automática → grupo (quando o lançamento não tem categoria com grupo).
export function sourceDreGroup(source: string | null | undefined, type: 'RECEITA' | 'DESPESA'): string | null {
  const s = baseSource(source) ?? ''
  if (s === 'VENDA' || s.startsWith('NEG_PGTO_') || s.startsWith('NEG_TROCA_')) return 'REC_VEICULOS'
  if (s === 'COMISSAO' || s === 'RETORNO' || s === 'GARANTIA') return 'DESP_COMISSOES'
  if (s.startsWith('NEG_DEBITO_')) return 'CMV_DOCUMENTACAO'
  if (s.startsWith('NEG_CHARGEBACK_')) return 'REC_FI'
  if (s.startsWith('VEICULO_')) {
    const cat = s.slice('VEICULO_'.length)
    if (type === 'RECEITA') return cat === 'RETORNO' ? 'REC_FI' : 'REC_OUTRAS'
    if (cat === 'COMPRA_VEICULO' || cat === 'REPASSE') return 'CMV_AQUISICAO'
    if (cat === 'DOCUMENTACAO' || cat === 'DEBITO' || cat === 'MULTA' || cat === 'IMPOSTO') return 'CMV_DOCUMENTACAO'
    if (cat === 'COMISSAO') return 'DESP_COMISSOES'
    return 'CMV_PREPARACAO'
  }
  return null
}

export function fallbackDreGroup(type: 'RECEITA' | 'DESPESA'): string {
  return type === 'RECEITA' ? 'REC_OUTRAS' : 'DESP_ADMIN'
}

/** Grupo efetivo: categoria (ou pai) → origem → genérico do tipo. */
export function resolveDreGroup(
  e: { type: 'RECEITA' | 'DESPESA'; source?: string | null; categoryId?: string | null },
  categoryGroup: (categoryId: string) => string | null,
): string {
  const byCat = e.categoryId ? categoryGroup(e.categoryId) : null
  if (byCat && DRE_GROUP_BY_KEY[byCat]) return byCat
  return sourceDreGroup(e.source, e.type) ?? fallbackDreGroup(e.type)
}

/** Grupo de uma categoria herdando do pai (até 4 níveis). */
export function categoryGroupResolver(cats: { id: string; parentId: string | null; dreGroup: string | null }[]) {
  const byId = new Map(cats.map((c) => [c.id, c]))
  return (id: string): string | null => {
    let c = byId.get(id)
    for (let i = 0; c && i < 5; i++) {
      if (c.dreGroup) return c.dreGroup
      c = c.parentId ? byId.get(c.parentId) : undefined
    }
    return null
  }
}

export interface DreEntryInput {
  type: 'RECEITA' | 'DESPESA'
  group: string
  amount: number
  /** Chave do período (ex.: '2026-10') já resolvida pelo chamador. */
  period: string
}

export interface DreLine { key: string; label: string; values: Record<string, number>; total: number; kind: 'group' | 'subtotal' | 'result'; section?: DreSection }

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Monta a DRE por período. Despesas entram negativas. Subtotais:
 * Receita líquida, Margem bruta, EBITDA (resultado operacional), Resultado
 * antes do IR e Resultado líquido. FORA_DRE não entra nos totais.
 */
export function buildDre(entries: DreEntryInput[], periods: string[]): DreLine[] {
  const acc: Record<string, Record<string, number>> = {}
  for (const e of entries) {
    const g = DRE_GROUP_BY_KEY[e.group]
    if (!g) continue
    const signed = e.type === 'RECEITA' ? e.amount : -e.amount
    acc[g.key] ??= {}
    acc[g.key][e.period] = (acc[g.key][e.period] ?? 0) + signed
  }
  const groupLine = (g: DreGroupDef): DreLine => {
    const values = Object.fromEntries(periods.map((p) => [p, r2(acc[g.key]?.[p] ?? 0)]))
    return { key: g.key, label: g.label, values, total: r2(periods.reduce((s, p) => s + values[p], 0)), kind: 'group', section: g.section }
  }
  const sum = (lines: DreLine[], key: string, label: string, kind: DreLine['kind']): DreLine => {
    const values = Object.fromEntries(periods.map((p) => [p, r2(lines.reduce((s, l) => s + (l.values[p] ?? 0), 0))]))
    return { key, label, values, total: r2(periods.reduce((s, p) => s + values[p], 0)), kind }
  }
  const of = (section: DreSection) => DRE_GROUPS.filter((g) => g.section === section).map(groupLine)

  const receita = of('RECEITA_BRUTA'), deducoes = of('DEDUCOES'), cmv = of('CMV')
  const opex = of('DESPESAS_OPERACIONAIS'), fin = of('RESULTADO_FINANCEIRO'), ir = of('IMPOSTOS_LUCRO')
  const receitaBruta = sum(receita, 'RECEITA_BRUTA', 'Receita bruta', 'subtotal')
  const receitaLiquida = sum([...receita, ...deducoes], 'RECEITA_LIQUIDA', 'Receita líquida', 'subtotal')
  const margemBruta = sum([...receita, ...deducoes, ...cmv], 'MARGEM_BRUTA', 'Margem bruta', 'subtotal')
  const ebitda = sum([...receita, ...deducoes, ...cmv, ...opex], 'EBITDA', 'Resultado operacional (EBITDA)', 'subtotal')
  const antesIr = sum([...receita, ...deducoes, ...cmv, ...opex, ...fin], 'RESULTADO_ANTES_IR', 'Resultado antes do IR/CSLL', 'subtotal')
  const liquido = sum([...receita, ...deducoes, ...cmv, ...opex, ...fin, ...ir], 'RESULTADO_LIQUIDO', 'Resultado líquido', 'result')

  return [
    receitaBruta, ...receita,
    ...deducoes, receitaLiquida,
    ...cmv, margemBruta,
    ...opex, ebitda,
    ...fin, antesIr,
    ...ir, liquido,
  ]
}

// ── Plano de contas padrão "Revenda de veículos" ─────────────────────────────
export interface DefaultCategory { code: string; name: string; kind: 'RECEITA' | 'DESPESA'; dreGroup: string; children?: { code: string; name: string }[] }

export const DEFAULT_CHART: DefaultCategory[] = [
  { code: '1', name: 'Vendas de veículos', kind: 'RECEITA', dreGroup: 'REC_VEICULOS', children: [
    { code: '1.1', name: 'Vendas' }, { code: '1.2', name: 'Entrada em troca' } ] },
  { code: '2', name: 'Retorno financeiro (F&I)', kind: 'RECEITA', dreGroup: 'REC_FI', children: [
    { code: '2.1', name: 'Retorno de financiamento' }, { code: '2.2', name: 'Comissão de seguros' },
    { code: '2.3', name: 'Bonificação de bancos' }, { code: '2.4', name: 'Acordos comerciais' }, { code: '2.5', name: 'PLUS por contrato' } ] },
  { code: '3', name: 'Intermediação e consignação', kind: 'RECEITA', dreGroup: 'REC_INTERMEDIACAO' },
  { code: '4', name: 'Serviços vendidos', kind: 'RECEITA', dreGroup: 'REC_SERVICOS', children: [
    { code: '4.1', name: 'Garantias' }, { code: '4.2', name: 'Documentação cobrada do cliente' }, { code: '4.3', name: 'Acessórios' },
    { code: '4.4', name: 'Funilaria e pintura cobrada' }, { code: '4.5', name: 'Estética cobrada' }, { code: '4.6', name: 'Outros serviços cobrados' } ] },
  { code: '5', name: 'Outras receitas', kind: 'RECEITA', dreGroup: 'REC_OUTRAS' },
  { code: '6', name: 'Receitas financeiras', kind: 'RECEITA', dreGroup: 'FIN_RECEITAS', children: [
    { code: '6.1', name: 'Rendimentos de aplicação' } ] },
  { code: '7', name: 'Impostos sobre vendas', kind: 'DESPESA', dreGroup: 'DED_IMPOSTOS', children: [
    { code: '7.1', name: 'Simples Nacional / DAS' }, { code: '7.2', name: 'ICMS' }, { code: '7.3', name: 'PIS/COFINS' }, { code: '7.4', name: 'ISS' } ] },
  { code: '8', name: 'Devoluções e distratos', kind: 'DESPESA', dreGroup: 'DED_DEVOLUCOES' },
  { code: '9', name: 'Aquisição de veículos', kind: 'DESPESA', dreGroup: 'CMV_AQUISICAO', children: [
    { code: '9.1', name: 'Compra do veículo' }, { code: '9.2', name: 'Repasse ao proprietário (consignado)' } ] },
  { code: '10', name: 'Preparação de veículos', kind: 'DESPESA', dreGroup: 'CMV_PREPARACAO', children: [
    { code: '10.1', name: 'Mecânica' }, { code: '10.2', name: 'Funilaria e pintura' }, { code: '10.3', name: 'Estética e lavagem' },
    { code: '10.4', name: 'Peças e pneus' }, { code: '10.5', name: 'Laudos e perícia' } ] },
  { code: '11', name: 'Documentação de veículos', kind: 'DESPESA', dreGroup: 'CMV_DOCUMENTACAO', children: [
    { code: '11.1', name: 'Despachante e transferência' }, { code: '11.2', name: 'IPVA, licenciamento e multas' } ] },
  { code: '12', name: 'Pessoal', kind: 'DESPESA', dreGroup: 'DESP_PESSOAL', children: [
    { code: '12.1', name: 'Salários' }, { code: '12.2', name: 'Encargos (INSS, FGTS)' }, { code: '12.3', name: 'Benefícios' },
    { code: '12.4', name: 'Pró-labore' }, { code: '12.5', name: 'Adiantamentos e vales' } ] },
  { code: '13', name: 'Comissões e premiações', kind: 'DESPESA', dreGroup: 'DESP_COMISSOES' },
  { code: '14', name: 'Ocupação', kind: 'DESPESA', dreGroup: 'DESP_OCUPACAO', children: [
    { code: '14.1', name: 'Aluguel' }, { code: '14.2', name: 'Energia' }, { code: '14.3', name: 'Água' },
    { code: '14.4', name: 'IPTU' }, { code: '14.5', name: 'Segurança e manutenção do pátio' } ] },
  { code: '15', name: 'Marketing', kind: 'DESPESA', dreGroup: 'DESP_MARKETING', children: [
    { code: '15.1', name: 'Portais de anúncio' }, { code: '15.2', name: 'Anúncios Meta/Google' }, { code: '15.3', name: 'Fotos e vídeos' } ] },
  { code: '16', name: 'Administrativas', kind: 'DESPESA', dreGroup: 'DESP_ADMIN', children: [
    { code: '16.1', name: 'Sistemas e softwares' }, { code: '16.2', name: 'Contabilidade' }, { code: '16.3', name: 'Telefone e internet' },
    { code: '16.4', name: 'Material de escritório' }, { code: '16.5', name: 'Jurídico' } ] },
  { code: '17', name: 'Comerciais e variáveis', kind: 'DESPESA', dreGroup: 'DESP_COMERCIAIS', children: [
    { code: '17.1', name: 'Frete e guincho' }, { code: '17.2', name: 'Combustível' } ] },
  { code: '18', name: 'Despesas financeiras', kind: 'DESPESA', dreGroup: 'FIN_DESPESAS', children: [
    { code: '18.1', name: 'Tarifas bancárias' }, { code: '18.2', name: 'Juros e multas pagos' }, { code: '18.3', name: 'Juros de floor plan / capital de giro' } ] },
  { code: '19', name: 'IR e CSLL', kind: 'DESPESA', dreGroup: 'IR_CSLL' },
  { code: '21', name: 'Custo dos serviços vendidos', kind: 'DESPESA', dreGroup: 'CMV_SERVICOS', children: [
    { code: '21.1', name: 'Custo de documentação / despachante' }, { code: '21.2', name: 'Custo de funilaria e pintura' },
    { code: '21.3', name: 'Custo de estética' }, { code: '21.4', name: 'Custo de acessórios' },
    { code: '21.5', name: 'Custo de garantias' }, { code: '21.6', name: 'Custo de outros serviços' } ] },
  { code: '20', name: 'Não operacional', kind: 'DESPESA', dreGroup: 'NAO_OPERACIONAL', children: [
    { code: '20.1', name: 'Retiradas dos sócios' }, { code: '20.2', name: 'Investimentos' } ] },
]


/** Grupo da DRE para categorias antigas (criadas antes do plano de contas), pelo nome. */
export function guessDreGroup(name: string, kind: 'RECEITA' | 'DESPESA'): string {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (kind === 'RECEITA') {
    if (/retorno/.test(n)) return 'REC_FI'
    if (/venda/.test(n)) return 'REC_VEICULOS'
    if (/garantia|servic|documenta|cobrado/.test(n)) return 'REC_SERVICOS'
    if (/rendiment|aplica/.test(n)) return 'FIN_RECEITAS'
    return 'REC_OUTRAS'
  }
  if (/comiss|premia/.test(n)) return 'DESP_COMISSOES'
  if (/compra do veiculo|repasse|aquisi/.test(n)) return 'CMV_AQUISICAO'
  if (/debito|documenta|ipva|licencia|multa|despachante/.test(n)) return 'CMV_DOCUMENTACAO'
  if (/servico|preparac|peca|laudo|pericia|combust|terceir|prestador|oficina|funilaria|estetica/.test(n)) return 'CMV_PREPARACAO'
  if (/imposto|simples|das\b|icms|iss\b/.test(n)) return 'DED_IMPOSTOS'
  if (/salari|encargo|pro-labore|pro labore|beneficio|vale|folha/.test(n)) return 'DESP_PESSOAL'
  if (/aluguel|energia|agua|iptu/.test(n)) return 'DESP_OCUPACAO'
  if (/marketing|anuncio|portal|publicidade/.test(n)) return 'DESP_MARKETING'
  if (/juros|tarifa|iof|banc/.test(n)) return 'FIN_DESPESAS'
  return 'DESP_ADMIN'
}
