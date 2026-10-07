// =============================================================================
// CRM — leitura de e-mail de lead (portais sem API: Webmotors, iCarros,
// Mobiauto, NaPista, UsadosBR, portais regionais...). PURO (testado).
// Abordagem determinística: rótulos ("Nome:", "Telefone:", "Veículo:"...),
// padrões de telefone/e-mail/placa/link do anúncio e o remetente para saber o
// portal. Sem IA — o e-mail original fica guardado para auditoria.
// =============================================================================

export interface InboundEmail {
  messageId: string
  from: string
  to: string[]
  subject: string
  text: string
  date: string
}

const s = (v: unknown, max = 20_000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

const emailsIn = (v: string) => (v.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase())

/**
 * Normaliza o corpo dos serviços de recebimento de e-mail mais comuns:
 * Postmark (From/To/TextBody), SendGrid Inbound Parse (from/to/text/html),
 * Mailgun (sender/recipient/body-plain) e Cloudflare Email Workers (JSON livre).
 */
export function normalizeInboundEmail(body: unknown): InboundEmail | null {
  const b = obj(body)
  const toFull = Array.isArray(b.ToFull) ? (b.ToFull as unknown[]).map((x) => s(obj(x).Email)).join(',') : ''
  const toRaw = [toFull, s(b.To), s(b.to), s(b.recipient), s(b.envelope && typeof b.envelope === 'string' ? (() => { try { return (JSON.parse(b.envelope as string) as { to?: string[] }).to?.join(',') } catch { return '' } })() : '')].join(',')
  const to = [...new Set(emailsIn(toRaw))]
  const from = emailsIn([s(b.From), s(b.from), s(b.sender), s(obj(b.FromFull).Email)].join(','))[0] ?? ''
  const html = s(b.HtmlBody) || s(b.html) || s(b['body-html']) || s(b['stripped-html'])
  const text = s(b.TextBody) || s(b.text) || s(b['body-plain']) || s(b['stripped-text']) || (html ? htmlToText(html) : '')
  if (!to.length || !text.trim()) return null
  return {
    messageId: (s(b.MessageID) || s(b.messageId) || s(b['Message-Id']) || s(b['message-id'])).trim().slice(0, 300),
    from, to,
    subject: (s(b.Subject) || s(b.subject)).trim().slice(0, 300),
    text: text.slice(0, 20_000),
    date: (s(b.Date) || s(b.date)).slice(0, 60),
  }
}

/**
 * Chave do canal no endereço exclusivo: leads+<chave>@dominio → <chave>.
 * E-mail não preserva maiúsculas: a chave volta em minúsculas e é procurada
 * sem diferenciar (ver resolveChannelInsensitive).
 */
export function channelKeyFromAddress(addresses: string[], domain: string): string | null {
  const d = domain.toLowerCase().replace(/^@/, '')
  for (const a of addresses) {
    const m = a.toLowerCase().match(/^leads\+([a-z0-9_-]{16,64})@(.+)$/)
    if (m && m[2] === d) return m[1]
  }
  return null
}

/** Endereço exclusivo de e-mail de um canal (null se a plataforma não configurou o domínio). */
export function channelEmailAddress(key: string, domain: string | null | undefined): string | null {
  const d = (domain ?? '').trim().toLowerCase().replace(/^@/, '')
  return d ? `leads+${key}@${d}` : null
}

export const PORTALS: { code: string; label: string; domains: string[] }[] = [
  { code: 'WEBMOTORS', label: 'Webmotors', domains: ['webmotors.com.br', 'cockpit.com.br'] },
  { code: 'ICARROS', label: 'iCarros', domains: ['icarros.com.br'] },
  { code: 'MOBIAUTO', label: 'Mobiauto', domains: ['mobiauto.com.br'] },
  { code: 'OLX', label: 'OLX', domains: ['olx.com.br'] },
  { code: 'MERCADO_LIVRE', label: 'Mercado Livre', domains: ['mercadolivre.com.br', 'mercadolibre.com'] },
  { code: 'NAPISTA', label: 'NaPista', domains: ['napista.com.br'] },
  { code: 'USADOSBR', label: 'UsadosBR', domains: ['usadosbr.com'] },
  { code: 'CHAVES_NA_MAO', label: 'Chaves na Mão', domains: ['chavesnamao.com.br'] },
  { code: 'SOCARRAO', label: 'SóCarrão', domains: ['socarrao.com.br'] },
  { code: 'AUTOLINE', label: 'Autoline', domains: ['autoline.com.br'] },
  { code: 'CARROSP', label: 'CarroSP', domains: ['carrosp.com.br'] },
  { code: 'SEMINOVOSBH', label: 'SeminovosBH', domains: ['seminovosbh.com.br'] },
  { code: 'VRUM', label: 'Vrum', domains: ['vrum.com.br'] },
  { code: 'MEUCARRONOVO', label: 'Meu Carro Novo', domains: ['meucarronovo.com.br'] },
  { code: 'COMPRECAR', label: 'CompreCar', domains: ['comprecar.com.br'] },
]

export function detectPortal(from: string, text: string): { code: string; label: string } | null {
  const f = from.toLowerCase()
  const byFrom = PORTALS.find((p) => p.domains.some((d) => f.endsWith(`@${d}`) || f.endsWith(`.${d}`)))
  if (byFrom) return { code: byFrom.code, label: byFrom.label }
  const t = text.toLowerCase()
  const byLink = PORTALS.find((p) => p.domains.some((d) => t.includes(d)))
  return byLink ? { code: byLink.code, label: byLink.label } : null
}

const LABELS = {
  name: ['nome do cliente', 'nome do interessado', 'nome completo', 'nome', 'cliente', 'interessado', 'name', 'comprador'],
  phone: ['telefone celular', 'telefone', 'celular', 'whatsapp', 'fone', 'tel', 'phone', 'contato'],
  email: ['e-mail', 'email', 'e mail'],
  vehicle: ['veículo de interesse', 'veiculo de interesse', 'veículo', 'veiculo', 'anúncio', 'anuncio', 'carro', 'modelo', 'interesse'],
  message: ['mensagem', 'comentário', 'comentario', 'comentários', 'pergunta', 'observação', 'observacao', 'texto'],
  plate: ['placa'],
} as const

const fold = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const ALL_LABELS = Object.values(LABELS).flat().map(fold)

/** Lê "Rótulo: valor" (também "Rótulo - valor"); mensagem pode ocupar várias linhas. */
function labeled(lines: string[], labels: readonly string[], multiline = false): string {
  const want = labels.map(fold)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([^:\-–]{2,40}?)\s*[:\-–]\s*(.*)$/)
    if (!m) continue
    if (!want.includes(fold(m[1]).trim())) continue
    let value = m[2].trim()
    if (!value && i + 1 < lines.length) { value = lines[i + 1].trim(); i++ }
    if (multiline) {
      for (let j = i + 1; j < lines.length && j < i + 15; j++) {
        const next = lines[j].trim()
        if (!next) break
        const lm = next.match(/^([^:\-–]{2,40}?)\s*[:\-–]/)
        if (lm && ALL_LABELS.includes(fold(lm[1]).trim())) break
        value += `\n${next}`
      }
    }
    if (value) return value
  }
  return ''
}

const PHONE_RE = /(?:\+?55\s*)?\(?\b([1-9]\d)\)?\s*(9?\d{4})[\s.-]?(\d{4})\b/

export interface ParsedEmailLead {
  name: string
  phone: string
  email: string
  vehicle: string
  message: string
  plate: string
  listingUrl: string
  listingId: string
  portal: { code: string; label: string } | null
}

export function parseLeadEmail(mail: InboundEmail, ownAddresses: string[] = []): ParsedEmailLead {
  const lines = mail.text.split(/\r?\n/)
  const portal = detectPortal(mail.from, mail.text)
  const portalDomains = new Set(PORTALS.flatMap((p) => p.domains))
  const skip = new Set([mail.from, ...mail.to, ...ownAddresses].map((x) => x.toLowerCase()))

  const labeledPhone = labeled(lines, LABELS.phone)
  const phoneMatch = (labeledPhone.match(PHONE_RE) ?? mail.text.match(PHONE_RE))
  const phone = phoneMatch ? `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}` : ''

  const isCustomerEmail = (e: string) => !skip.has(e) && !/^(no-?reply|nao-?responda|naoresponda|contato|leads?|notifica)/.test(e) && ![...portalDomains].some((d) => e.endsWith(`@${d}`) || e.endsWith(`.${d}`))
  const labeledEmail = emailsIn(labeled(lines, LABELS.email)).find(isCustomerEmail)
  const email = labeledEmail ?? emailsIn(mail.text).find(isCustomerEmail) ?? ''

  const urls = mail.text.match(/https?:\/\/[^\s<>"')]+/g) ?? []
  const listingUrl = urls.find((u) => [...portalDomains].some((d) => u.includes(d)) && /\d{5,}/.test(u)) ?? ''
  const idMatch = listingUrl ? listingUrl.replace(/[?#].*$/, '').match(/(\d{5,})(?!.*\d{5,})/) : null

  const plateRaw = labeled(lines, LABELS.plate) || ''
  const plate = (plateRaw.toUpperCase().match(/[A-Z]{3}-?\d[A-Z0-9]\d{2}/) ?? [''])[0].replace('-', '')

  return {
    name: labeled(lines, LABELS.name).replace(/\s+/g, ' ').slice(0, 120),
    phone, email,
    vehicle: (labeled(lines, LABELS.vehicle) || '').slice(0, 160),
    message: labeled(lines, LABELS.message, true).slice(0, 2000),
    plate, listingUrl: listingUrl.slice(0, 500), listingId: idMatch ? idMatch[1] : '',
    portal,
  }
}
