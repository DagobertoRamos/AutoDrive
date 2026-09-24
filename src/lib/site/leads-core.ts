// =============================================================================
// Site da loja — lead recebido pelos formulários do site. PURO (testado).
// Valida, descarta spam (campo-isca) e monta o texto que vai para o CRM.
// Tipos (porta do site dagobertoeasycar): contato, financiamento e interesse
// no veículo (intenções: simulação, interesse, visita); serviços opcionais:
// venda seu carro (pré-avaliação) e encontre seu carro (busca).
// =============================================================================

export const SITE_LEAD_KINDS = ['contact', 'financing', 'vehicle_interest', 'sell_car', 'find_car', 'private_financing', 'wholesale'] as const
export type SiteLeadKind = (typeof SITE_LEAD_KINDS)[number]
export const VEHICLE_INTENTS = { simulacao: 'Simulação de financiamento', interesse: 'Interesse no veículo', visita: 'Agendamento de visita' } as const
export type VehicleIntent = keyof typeof VEHICLE_INTENTS

export const KIND_LABEL: Record<SiteLeadKind, string> = {
  contact: 'Contato pelo site', financing: 'Financiamento pelo site', vehicle_interest: 'Interesse em veículo pelo site',
  sell_car: 'Venda seu carro (pré-avaliação)', find_car: 'Encontre seu carro (busca)',
  private_financing: 'Financia Fácil (carro de particular)', wholesale: 'Atacado (lojista)',
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

const DETAIL_KEYS = [
  'paymentMethod', 'downPayment', 'installments', 'installmentGoal', 'hasTrade', 'tradeVehicle', 'tradeYear', 'tradeMileage', 'visitDate', 'visitPeriod', 'desiredVehicle',
  // venda seu carro / encontre seu carro
  'city', 'brand', 'model', 'version', 'year', 'mileage', 'transmission', 'fuel', 'plate', 'color', 'targetPrice', 'vehicleStatus', 'yearMin', 'budget', 'wantsFinancing',
  // financia fácil / atacado
  'vehicleValue', 'companyName', 'cnpj', 'interest',
] as const

/** Campos obrigatórios por serviço (além de nome, telefone e consentimento). */
const REQUIRED: Partial<Record<SiteLeadKind, [string, string][]>> = {
  sell_car: [['city', 'a cidade'], ['brand', 'a marca'], ['model', 'o modelo'], ['year', 'o ano'], ['mileage', 'a quilometragem'], ['targetPrice', 'o valor pretendido']],
  find_car: [['brand', 'a marca'], ['model', 'o modelo'], ['budget', 'o orçamento']],
  private_financing: [['brand', 'a marca do carro'], ['model', 'o modelo do carro'], ['year', 'o ano do carro'], ['vehicleValue', 'o valor combinado']],
  wholesale: [['companyName', 'a razão social'], ['cnpj', 'o CNPJ']],
}

/** CNPJ com dígitos verificadores válidos. */
export function isValidCnpj(v: string): boolean {
  const d = v.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)+$/.test(d)) return false
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = w.reduce((acc, wi, i) => acc + wi * Number(d[i]), 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export function formatCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}
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
  for (const k of DETAIL_KEYS) {
    // Checkboxes múltiplos (situação do veículo) chegam como lista.
    const v = Array.isArray(b[k]) ? (b[k] as unknown[]).map((x) => str(x, 60)).filter(Boolean).join(', ').slice(0, 200) : str(b[k], 200)
    if (v) details[k] = v
  }
  for (const [k, label] of REQUIRED[kind] ?? []) if (!details[k]) return { ok: false, status: 400, error: `Informe ${label}.` }
  if (details.plate) details.plate = details.plate.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
  if (kind === 'wholesale') {
    if (!isValidCnpj(details.cnpj)) return { ok: false, status: 400, error: 'CNPJ inválido.' }
    details.cnpj = formatCnpj(details.cnpj)
  }
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
    input.kind === 'private_financing' ? line('Carro negociado (particular)', [d.brand, d.model, d.version, d.year, d.mileage && `${d.mileage} km`].filter(Boolean).join(' · ')) : '',
    line('Valor combinado', d.vehicleValue),
    input.kind === 'wholesale' ? line('Empresa', [d.companyName, d.cnpj].filter(Boolean).join(' · ')) : '',
    line('Interesse', d.interest),
    input.kind === 'sell_car' ? line('Veículo do cliente', [d.brand, d.model, d.version, d.year, d.mileage && `${d.mileage} km`, d.transmission, d.fuel, d.color].filter(Boolean).join(' · ')) : '',
    input.kind === 'sell_car' ? line('Placa', d.plate) : '',
    input.kind === 'sell_car' ? line('Situação', d.vehicleStatus) : '',
    input.kind === 'sell_car' ? line('Valor pretendido', d.targetPrice) : '',
    input.kind === 'find_car' ? line('Procura', [d.brand, d.model, d.yearMin && `a partir de ${d.yearMin}`].filter(Boolean).join(' · ')) : '',
    line('Orçamento', d.budget),
    line('Pretende financiar', d.wantsFinancing),
    line('Cidade', d.city),
    line('Mensagem', input.message),
  ].filter(Boolean).join('\n')
}
