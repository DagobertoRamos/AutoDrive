// =============================================================================
// Extrato da negociação para os contratos (PURO, testado).
//
// Monta o quadro de débitos (o que o comprador deve) e o de pagamentos (como
// pagou), no formato de extrato, a partir do que está cadastrado na negociação.
// Cuidados com os dados importados do AutoConf:
//   • "débitos" trazem também CUSTOS INTERNOS da loja (custo de compra,
//     comissão de compra, laudo/perícia da avaliação) — não vão para o contrato;
//   • a documentação vem como débito E como taxa (documentationFee) — conta 1×;
//   • "Retorno de financiamento" é a comissão do banco para a loja, não é
//     pagamento do cliente — fica de fora.
// Cortesia (loja paga) aparece com o valor e a marca "cortesia", sem somar.
// =============================================================================

export type LineKind = 'COBRADO' | 'CORTESIA' | 'DESCONTO'
export interface StatementLine { descricao: string; valor: number; tipo: LineKind; obs?: string }
export interface PaymentLine { forma: string; valor: number; detalhe?: string; data?: Date | null; status: 'CONFIRMADO' | 'PENDENTE' }

export interface StatementInput {
  vehicleLabel: string
  vehicleValue: number
  documentationFee?: number | null
  documentationPaidBy?: string | null
  debts: Array<{ type?: string | null; description?: string | null; notes?: string | null; value: unknown; vehicleRole?: string | null; responsavel?: string | null }>
  services?: Array<{ name?: string | null; value: unknown }>
  warranties?: Array<{ name: string; value: unknown; status?: string | null }>
  warrantyPaidBy?: string | null
  flatDiscount?: number | null
  discountRequests?: Array<{ status: string; approvedValue?: unknown; requestedValue?: unknown; reason?: string | null }>
  payments: Array<{ type?: string | null; method?: string | null; status?: string | null; value: unknown; notes?: string | null; bank?: string | null; installments?: number | null; installmentValue?: unknown; paidAt?: Date | null; dueDate?: Date | null }>
  tradeIns?: Array<{ label: string; value: number }>
}

export interface Statement {
  itens: StatementLine[]
  pagamentos: PaymentLine[]
  totalDevido: number
  totalPago: number
  saldo: number
}

export const num = (v: unknown): number => {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

const clean = (s?: string | null) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** Categoria do AutoConf no fim da observação ("… — DESPACHANTE"). */
export const debtCategory = (notes?: string | null): string => (/—\s*([^—]+)$/.exec(clean(notes))?.[1] ?? '').toUpperCase().trim()

/** Custos internos da loja que não são cobrados do cliente (não vão para o contrato). */
const INTERNAL = /CUSTO COM COMPRA|COMISS[AÃ]O DE COMPRA|LAUDO CAUTELAR|RECEITA|CUSTO COM VENDA|DESPESA COM VENDA/i

export function isInternalDebt(d: { notes?: string | null; description?: string | null }): boolean {
  return INTERNAL.test(debtCategory(d.notes))
}

const TYPE_LABEL: Record<string, string> = {
  DOCUMENTACAO: 'Documentação / transferência', MULTA: 'Multa', IPVA: 'IPVA', LICENCIAMENTO: 'Licenciamento',
  FINANCIAMENTO: 'Quitação de financiamento', OUTROS: 'Outros',
}

/** Descrição legível do débito (tira o prefixo do AutoConf e repetições). */
export function debtLabel(d: { type?: string | null; description?: string | null; vehicleRole?: string | null }): string {
  const t = String(d.type ?? '').toUpperCase()
  let s = clean(d.description)
  const auto = /^Negocia[cç][aã]o #\d+\s*-\s*/i.test(s)
  s = s.replace(/^Negocia[cç][aã]o #\d+\s*-\s*/i, '').replace(/^D[eé]bito do ve[ií]culo:\s*/i, '')
  let out: string
  if (auto) {
    // "Multa Toyota YARIS …, Placa: EJH-0I52, Renavam: … - PREF. SP (CPF/CNPJ: …)"
    const what = /^([^,]+?)\s+[A-Z][\w-]*\s/.exec(s)?.[1] ?? TYPE_LABEL[t] ?? 'Débito'
    const plate = /Placa:\s*([A-Z0-9-]{7,8})/i.exec(s)?.[1]
    const org = /\s-\s([^(]+?)\s*\(CPF\/CNPJ/i.exec(s)?.[1]
    const base = TYPE_LABEL[t] && t !== 'OUTROS' ? TYPE_LABEL[t] : what
    out = [base, org && t !== 'DOCUMENTACAO' ? org.trim() : '', plate ? `placa ${plate.toUpperCase()}` : ''].filter(Boolean).join(' — ')
  } else {
    out = s || TYPE_LABEL[t] || 'Débito'
    if (TYPE_LABEL[t] && s && !s.toLowerCase().includes(TYPE_LABEL[t].split(' ')[0].toLowerCase()) && t !== 'OUTROS') out = `${TYPE_LABEL[t]} — ${s}`
  }
  if (String(d.vehicleRole ?? '').toUpperCase() === 'TROCA' && !/troca/i.test(out)) out += ' (veículo da troca)'
  return out.slice(0, 160)
}

const PAY_LABEL: Record<string, string> = {
  DINHEIRO: 'Dinheiro', PIX: 'PIX', CARTAO_DEBITO: 'Cartão de débito', CARTAO_CREDITO: 'Cartão de crédito', FINANCIAMENTO: 'Financiamento',
  BOLETO: 'Boleto', TRANSFERENCIA: 'Transferência', SINAL: 'Sinal', ENTRADA: 'Sinal / entrada', DUPLICATA: 'Duplicata', OUTROS: 'Outros',
}

/** Retorno de financiamento = comissão do banco para a loja (não é pagamento do cliente). */
export const isStoreIncome = (p: { notes?: string | null }) => /retorno de financiamento|RECEITA COM RETORNO/i.test(clean(p.notes))

export function paymentLabel(p: { type?: string | null; method?: string | null; notes?: string | null; bank?: string | null; installments?: number | null; installmentValue?: unknown }): { forma: string; detalhe?: string } {
  const tt = String(p.type ?? '').toUpperCase()
  if ((tt === 'SINAL' || tt === 'ENTRADA') && p.method) return { forma: 'Sinal / entrada', detalhe: PAY_LABEL[String(p.method).toUpperCase()] ?? String(p.method) }
  const n = clean(p.notes).replace(/^Negocia[cç][aã]o #\d+\s*-\s*/i, '')
  const t = String(p.type ?? '').toUpperCase()
  // O AutoConf às vezes marca financiamento como cartão: a observação diz a verdade.
  const fin = /^Financiamento\s*-\s*([^-]+)/i.exec(n)
  const cons = /^Cons[oó]rcio\s*-\s*([^-]+)/i.exec(n)
  if (fin) return { forma: 'Financiamento', detalhe: clean(fin[1]) }
  if (cons) return { forma: 'Consórcio', detalhe: clean(cons[1]) }
  const forma = PAY_LABEL[t] ?? 'Pagamento'
  const parts: string[] = []
  if (p.bank) parts.push(clean(p.bank))
  if (p.installments && p.installments > 1) parts.push(`${p.installments}x de ${brl(num(p.installmentValue))}`)
  if (t === 'CARTAO_CREDITO' || t === 'CARTAO_DEBITO') { const b = /\|\s*([A-Za-z]+)\s*-/.exec(n)?.[1]; if (b) parts.push(b) }
  return { forma, detalhe: parts.join(' · ') || undefined }
}

export function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function buildStatement(i: StatementInput): Statement {
  const itens: StatementLine[] = [{ descricao: i.vehicleLabel, valor: num(i.vehicleValue), tipo: 'COBRADO' }]
  const docCortesia = String(i.documentationPaidBy ?? '').toUpperCase() === 'LOJA'
  const fee = num(i.documentationFee)
  let docSeen = false
  for (const d of i.debts) {
    if (isInternalDebt(d)) continue
    const v = num(d.value)
    if (v <= 0) continue
    const isDoc = String(d.type ?? '').toUpperCase() === 'DOCUMENTACAO' || /documenta[cç][aã]o|despachante|transfer[eê]ncia/i.test(debtCategory(d.notes) + ' ' + clean(d.description))
    const cortesia = (isDoc && docCortesia) || String(d.responsavel ?? '').toUpperCase() === 'VENDEDOR'
    if (isDoc) docSeen = true
    itens.push({ descricao: debtLabel(d), valor: v, tipo: cortesia ? 'CORTESIA' : 'COBRADO', ...(cortesia ? { obs: 'cortesia da loja — não cobrado' } : {}) })
  }
  if (fee > 0 && !docSeen) itens.push({ descricao: 'Documentação / transferência', valor: fee, tipo: docCortesia ? 'CORTESIA' : 'COBRADO', ...(docCortesia ? { obs: 'cortesia da loja — não cobrado' } : {}) })
  for (const s of i.services ?? []) if (num(s.value) > 0) itens.push({ descricao: `Serviço: ${clean(s.name) || 'serviço'}`, valor: num(s.value), tipo: 'COBRADO' })
  const wCortesia = String(i.warrantyPaidBy ?? '').toUpperCase() === 'LOJA'
  for (const w of i.warranties ?? []) {
    if (w.status && !['ATIVA', 'ATIVO'].includes(String(w.status).toUpperCase())) continue
    if (num(w.value) <= 0) continue
    itens.push({ descricao: `Garantia contratual: ${clean(w.name)}`, valor: num(w.value), tipo: wCortesia ? 'CORTESIA' : 'COBRADO', ...(wCortesia ? { obs: 'cortesia da loja — não cobrado' } : {}) })
  }
  if (num(i.flatDiscount) > 0) itens.push({ descricao: 'Desconto concedido', valor: num(i.flatDiscount), tipo: 'DESCONTO' })
  for (const r of i.discountRequests ?? []) {
    if (String(r.status).toUpperCase() !== 'APROVADO') continue
    const v = num(r.approvedValue ?? r.requestedValue)
    if (v > 0) itens.push({ descricao: `Desconto concedido${clean(r.reason) ? ` (${clean(r.reason).slice(0, 80)})` : ''}`, valor: v, tipo: 'DESCONTO' })
  }

  const pagamentos: PaymentLine[] = []
  for (const t of i.tradeIns ?? []) if (t.value > 0) pagamentos.push({ forma: 'Veículo na troca', valor: t.value, detalhe: t.label, status: 'CONFIRMADO' })
  for (const p of i.payments) {
    const st = String(p.status ?? '').toUpperCase()
    if (['CANCELADO', 'ESTORNADO', 'RECUSADO'].includes(st) || isStoreIncome(p)) continue
    const v = num(p.value)
    if (v <= 0) continue
    const l = paymentLabel(p)
    pagamentos.push({ ...l, valor: v, data: p.paidAt ?? p.dueDate ?? null, status: st === 'CONFIRMADO' || st === 'PAGO' ? 'CONFIRMADO' : 'PENDENTE' })
  }

  const r2 = (n: number) => Math.round(n * 100) / 100
  const totalDevido = r2(itens.reduce((s, l) => s + (l.tipo === 'COBRADO' ? l.valor : l.tipo === 'DESCONTO' ? -l.valor : 0), 0))
  const totalPago = r2(pagamentos.reduce((s, p) => s + p.valor, 0))
  return { itens, pagamentos, totalDevido, totalPago, saldo: r2(totalDevido - totalPago) }
}

/**
 * Veículo importado sem cadastro no estoque: separa marca, modelo, combustível
 * e ano da descrição única ("VolksWagen VIRTUS TSI 1.0 Flex 12V 4p Aut. Flex 2025").
 */
export function parseVehicleText(text?: string | null): { marca?: string; modelo?: string; combustivel?: string; anoModelo?: number } {
  let t = clean(text)
  if (!t) return {}
  const out: { marca?: string; modelo?: string; combustivel?: string; anoModelo?: number } = {}
  const y = /\s((?:19|20)\d{2})$/.exec(t)
  if (y) { out.anoModelo = Number(y[1]); t = t.slice(0, y.index).trim() }
  const fuel = /\s(Flex|Gasolina|Etanol|[AÁ]lcool|Diesel|El[eé]trico|H[ií]brido)$/i.exec(t)
  if (fuel) { out.combustivel = fuel[1][0].toUpperCase() + fuel[1].slice(1).toLowerCase(); t = t.slice(0, fuel.index).trim() }
  const sp = t.indexOf(' ')
  if (sp > 0) { out.marca = t.slice(0, sp); out.modelo = t.slice(sp + 1) } else out.modelo = t
  return out
}

/** RENAVAM citado nos débitos importados ("Placa: TKH-3J81, Renavam: 01234567890"). */
export function renavamFromDebts(plate: string | null | undefined, debts: Array<{ description?: string | null }>): string | null {
  const p = String(plate ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (!p) return null
  for (const d of debts) {
    const m = /Placa:\s*([A-Z0-9-]{7,8}),\s*Renavam:\s*(\d{9,11})/i.exec(clean(d.description))
    if (m && m[1].replace(/-/g, '').toUpperCase() === p) return m[2]
  }
  return null
}

// ── Valor por extenso (reais) ────────────────────────────────────────────────

const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100); const r = n % 100
  const parts: string[] = []
  if (c) parts.push(CEN[c])
  if (r) parts.push(r < 20 ? UN[r] : [DEZ[Math.floor(r / 10)], UN[r % 10]].filter(Boolean).join(' e '))
  return parts.join(' e ')
}

/** 105900.5 → "cento e cinco mil e novecentos reais e cinquenta centavos". */
export function extenso(valor: number): string {
  const v = Math.round(Math.abs(valor) * 100)
  const reais = Math.floor(v / 100); const cent = v % 100
  const grupos: Array<[number, string, string]> = [[1_000_000_000, 'bilhão', 'bilhões'], [1_000_000, 'milhão', 'milhões'], [1000, 'mil', 'mil'], [1, '', '']]
  const partes: Array<{ txt: string; n: number }> = []
  let rest = reais
  for (const [g, s, p] of grupos) {
    const q = Math.floor(rest / g); rest %= g
    if (!q) continue
    const t = g === 1000 && q === 1 ? 'mil' : `${ate999(q)}${s ? ` ${q === 1 ? s : p}` : ''}`
    partes.push({ txt: t, n: q * g })
  }
  let txt = ''
  partes.forEach((p, i) => {
    if (i === 0) { txt = p.txt; return }
    const last = i === partes.length - 1
    // "e" antes do último grupo quando ele é < 100 ou centena redonda (ex.: mil e novecentos)
    const small = p.n < 1000 && (p.n < 100 || p.n % 100 === 0)
    txt += last && small ? ` e ${p.txt}` : `, ${p.txt}`
  })
  txt = txt.replace(/^, /, '')
  const milhaoRedondo = reais >= 1_000_000 && reais % 1_000_000 === 0
  const r = reais ? `${txt}${milhaoRedondo ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}` : ''
  const c = cent ? `${ate999(cent)} ${cent === 1 ? 'centavo' : 'centavos'}` : ''
  return [r, c].filter(Boolean).join(' e ') || 'zero real'
}
