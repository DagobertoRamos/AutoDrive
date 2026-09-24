// =============================================================================
// Site da loja — lead recebido pelos formulários do site. PURO (testado).
// Valida, descarta spam (campo-isca) e monta o texto que vai para o CRM.
// Tipos (porta do site dagobertoeasycar): contato, financiamento e interesse
// no veículo (intenções: simulação, interesse, visita).
// =============================================================================

export const SITE_LEAD_KINDS = ['contact', 'financing', 'vehicle_interest'] as const
export type SiteLeadKind = (typeof SITE_LEAD_KINDS)[number]
export const VEHICLE_INTENTS = { simulacao: 'Simulação de financiamento', interesse: 'Interesse no veículo', visita: 'Agendamento de visita' } as const
export type VehicleIntent = keyof typeof VEHICLE_INTENTS

export const KIND_LABEL: Record<SiteLeadKind, string> = {
  contact: 'Contato pelo site', financing: 'Financiamento pelo site', vehicle_interest: 'Interesse em veículo pelo site',
}

export interface SiteLeadInput {
  kind: SiteLeadKind
  intent: VehicleIntent | null
  name: string; phone: string; email: string
  message: string
  vehicleId: string | null
  details: Record<string, string>   // pagamento, entrada, troca, visita…
  tracking: Record<string, string>  // utm, página
}

const DETAIL_KEYS = ['paymentMethod', 'downPayment', 'installments', 'installmentGoal', 'hasTrade', 'tradeVehicle', 'tradeYear', 'tradeMileage', 'visitDate', 'visitPeriod', 'desiredVehicle'] as const
const TRACK_KEYS = ['pageUrl', 'utmSource', 'utmMedium', 'utmCampaign'] as const
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export type ParseResult = { ok: true; value: SiteLeadInput } | { ok: false; status: number; error: string; spam?: boolean }

export function parseSiteLead(body: unknown): ParseResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  // Campo-isca invisível: robô preenche, gente não. Responde "ok" sem gravar.
  if (str(b.website, 200)) return { ok: false, status: 200, error: 'spam', spam: true }
  const kind = (SITE_LEAD_KINDS as readonly string[]).includes(String(b.kind)) ? (String(b.kind) as SiteLeadKind) : null
  if (!kind) return { ok: false, status: 400, error: 'Tipo de solicitação inválido.' }
  const name = str(b.name, 120)
  const phone = str(b.phone, 30)
  const email = str(b.email, 160)
  if (name.length < 2) return { ok: false, status: 400, error: 'Informe seu nome.' }
  if (phone.replace(/\D/g, '').length < 10) return { ok: false, status: 400, error: 'Informe um telefone com DDD.' }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 400, error: 'E-mail inválido.' }
  if (b.consent !== 'yes' && b.consent !== true) return { ok: false, status: 400, error: 'É preciso autorizar o contato.' }
  const intent = String(b.intent) in VEHICLE_INTENTS ? (String(b.intent) as VehicleIntent) : null
  const vehicleId = /^[a-z0-9]{10,40}$/i.test(str(b.vehicleId, 40)) ? str(b.vehicleId, 40) : null
  if (kind === 'vehicle_interest' && !vehicleId) return { ok: false, status: 400, error: 'Veículo não informado.' }
  const message = str(b.message, 2000)
  if (kind === 'contact' && !message) return { ok: false, status: 400, error: 'Escreva sua mensagem.' }

  const details: Record<string, string> = {}
  for (const k of DETAIL_KEYS) { const v = str(b[k], 200); if (v) details[k] = v }
  const tracking: Record<string, string> = {}
  for (const k of TRACK_KEYS) { const v = str(b[k], 500); if (v) tracking[k] = v }
  return { ok: true, value: { kind, intent, name, phone, email, message, vehicleId, details, tracking } }
}

const line = (label: string, v: string | undefined) => (v ? `${label}: ${v}` : '')

/** Texto legível do pedido (vai para o lead e para a interação no CRM). */
export function buildLeadMessage(input: SiteLeadInput, vehicleTitle: string | null): string {
  const d = input.details
  const head = input.intent ? VEHICLE_INTENTS[input.intent] : KIND_LABEL[input.kind]
  return [
    `${head}.`,
    line('Veículo', vehicleTitle ?? d.desiredVehicle),
    line('Forma de pagamento', d.paymentMethod),
    line('Entrada', d.downPayment),
    line('Prazo desejado', d.installments),
    line('Parcela desejada', d.installmentGoal),
    line('Carro na troca', d.hasTrade),
    d.hasTrade === 'Sim' ? line('Veículo da troca', [d.tradeVehicle, d.tradeYear, d.tradeMileage && `${d.tradeMileage} km`].filter(Boolean).join(' · ')) : '',
    line('Visita', [d.visitDate, d.visitPeriod].filter(Boolean).join(' · ')),
    line('Mensagem', input.message),
  ].filter(Boolean).join('\n')
}
