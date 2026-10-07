// =============================================================================
// Conciliação bancária — regras puras (testadas).
//   parseOfx / parseCsv → linhas { date 'YYYY-MM-DD', amount (+ entrada / − saída),
//   description, document }. matchScore compara uma linha com um lançamento:
//   valor igual é obrigatório; data próxima, documento e descrição somam pontos.
//   Confiança alta (≥ 90) = sugestão forte; mesmo assim a conciliação é sempre
//   confirmada por uma pessoa.
// =============================================================================

export interface StatementLineInput { date: string; amount: number; description: string; document: string | null }

const c2 = (n: number) => Math.round(n * 100) / 100
const YMD = /^\d{4}-\d{2}-\d{2}$/

function ofxTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : null
}

/** OFX (SGML ou XML): blocos <STMTTRN>. */
export function parseOfx(text: string): StatementLineInput[] {
  const out: StatementLineInput[] = []
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  for (const raw of blocks) {
    const b = raw.split(/<\/STMTTRN>/i)[0]
    const dt = ofxTag(b, 'DTPOSTED') ?? ''
    const amt = Number((ofxTag(b, 'TRNAMT') ?? '').replace(',', '.'))
    if (!/^\d{8}/.test(dt) || !Number.isFinite(amt) || amt === 0) continue
    const date = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`
    const description = [ofxTag(b, 'NAME'), ofxTag(b, 'MEMO')].filter(Boolean).join(' — ') || 'Lançamento bancário'
    out.push({ date, amount: c2(amt), description: description.slice(0, 300), document: ofxTag(b, 'FITID') ?? ofxTag(b, 'CHECKNUM') })
  }
  return out
}

/** Valor em formato brasileiro ou internacional ("-1.234,56", "1234.56", "R$ 10,00 D"). */
export function parseMoney(s: string): number | null {
  let t = s.trim()
  if (!t) return null
  const negative = /^-|\(.*\)|\sD$|^D\s/i.test(t)
  t = t.replace(/[R$\s()DdCc+-]/g, '')
  if (!t) return null
  if (t.includes(',') && t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return c2(negative ? -Math.abs(n) : n)
}

export function parseDate(s: string): string | null {
  const t = s.trim()
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (ch === sep && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * CSV de extrato: acha as colunas pelo cabeçalho (data; histórico/descrição;
 * valor — ou crédito e débito separados; documento opcional).
 */
export function parseCsv(text: string): StatementLineInput[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const head = splitCsvLine(lines[0], sep).map(fold)
  const find = (re: RegExp) => head.findIndex((h) => re.test(h))
  const iDate = find(/^data|date/)
  const iDesc = find(/hist|descri|lanc|memo|detalhe/)
  const iVal = find(/^valor|amount|^vlr/)
  const iCred = find(/credit|entrada/)
  const iDeb = find(/debit|saida/)
  const iDoc = find(/doc|fitid|n[ºo°]?\s*doc/)
  if (iDate < 0 || (iVal < 0 && iCred < 0 && iDeb < 0)) return []
  const out: StatementLineInput[] = []
  for (const l of lines.slice(1)) {
    const c = splitCsvLine(l, sep)
    const date = parseDate(c[iDate] ?? '')
    if (!date) continue
    let amount: number | null = null
    if (iVal >= 0) amount = parseMoney(c[iVal] ?? '')
    else {
      const cr = iCred >= 0 ? parseMoney(c[iCred] ?? '') : null
      const db = iDeb >= 0 ? parseMoney(c[iDeb] ?? '') : null
      amount = cr ? Math.abs(cr) : db ? -Math.abs(db) : null
    }
    if (amount == null || amount === 0) continue
    const description = (iDesc >= 0 ? c[iDesc] : '') || 'Lançamento bancário'
    out.push({ date, amount, description: description.slice(0, 300), document: iDoc >= 0 ? c[iDoc] || null : null })
  }
  return out
}

export function parseStatement(fileName: string, text: string): StatementLineInput[] {
  return /\.ofx$/i.test(fileName) || /<OFX>|<STMTTRN>/i.test(text) ? parseOfx(text) : parseCsv(text)
}

/** Chave de idempotência: a mesma linha importada duas vezes não duplica. */
export function lineFingerprint(accountId: string, l: StatementLineInput, occurrence = 0): string {
  const base = l.document ? `doc:${l.document}` : `desc:${fold(l.description).replace(/\s+/g, ' ').slice(0, 80)}#${occurrence}`
  return `${accountId}|${l.date}|${l.amount.toFixed(2)}|${base}`
}

const daysBetween = (a: string, b: string) => Math.round(Math.abs(+new Date(`${a}T12:00:00Z`) - +new Date(`${b}T12:00:00Z`)) / 86_400_000)
const tokens = (s: string) => new Set(fold(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3))

export interface MatchCandidate { id: string; signedAmount: number; date: string | null; description: string; counterparty: string | null; documentNumber: string | null }

/** 0 (não serve) a 100. Valor diferente → 0. */
export function matchScore(line: { date: string; amount: number; description: string; document: string | null }, e: MatchCandidate): number {
  if (Math.abs(line.amount - e.signedAmount) > 0.009) return 0
  let s = 60
  const d = e.date && YMD.test(e.date) ? daysBetween(line.date, e.date) : 99
  s += d === 0 ? 25 : d <= 2 ? 18 : d <= 5 ? 10 : d <= 10 ? 3 : 0
  if (line.document && e.documentNumber && fold(line.document).includes(fold(e.documentNumber))) s += 10
  const lt = tokens(line.description)
  const et = tokens(`${e.description} ${e.counterparty ?? ''}`)
  const common = [...lt].filter((t) => et.has(t)).length
  if (common) s += Math.min(15, common * 6)
  return Math.min(100, s)
}

/** Soma assinada de lançamentos para conferir com a linha (1×N). */
export function sumsMatch(lineAmount: number, entries: { signedAmount: number }[]): boolean {
  return Math.abs(c2(entries.reduce((a, e) => a + e.signedAmount, 0)) - lineAmount) <= 0.009
}
