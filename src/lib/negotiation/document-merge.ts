// =============================================================================
// Merge engine para templates de documento.
// Substitui `{{path.to.field}}` no HTML pelo valor correspondente do contexto.
// Suporta formatadores opcionais: `{{valor|brl}}`, `{{data|date}}`.
// =============================================================================

type AnyRecord = Record<string, unknown>

function get(obj: AnyRecord | null | undefined, path: string): unknown {
  if (!obj) return undefined
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined
    return (acc as AnyRecord)[key]
  }, obj)
}

function fmtBRL(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(v: unknown): string {
  if (!v) return ''
  const d = new Date(v as string)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR')
}

const FORMATTERS: Record<string, (v: unknown) => string> = {
  brl:  fmtBRL,
  date: fmtDate,
  upper: (v) => String(v ?? '').toUpperCase(),
  lower: (v) => String(v ?? '').toLowerCase(),
}

/**
 * Renderiza um template substituindo merge fields. Tokens não resolvidos viram
 * string vazia para não vazar `{{...}}` no documento final.
 */
export function renderTemplate(html: string, ctx: AnyRecord): string {
  return html.replace(/\{\{\s*([^}|\s]+)\s*(?:\|\s*([a-zA-Z]+)\s*)?\}\}/g, (_, path: string, fmt?: string) => {
    const raw = get(ctx, path)
    if (raw == null) return ''
    if (fmt && FORMATTERS[fmt]) return FORMATTERS[fmt](raw)
    return String(raw)
  })
}

/**
 * Constrói o contexto-padrão a partir de um deal carregado com relations
 * (person/customer/vehicles/payments/etc).
 */
export function buildDealContext(deal: AnyRecord): AnyRecord {
  const person   = (deal.person as AnyRecord) ?? (deal.customer as AnyRecord) ?? {}
  const vehicles = (deal.vehicles as AnyRecord[]) ?? []
  const compraVeh = vehicles.find((v) => v.role === 'COMPRADO') ?? vehicles[0] ?? {}
  const vendaVeh  = vehicles.find((v) => v.role === 'VENDIDO')  ?? compraVeh

  return {
    deal: {
      id:         deal.id,
      number:     deal.dealNumber,
      type:       deal.type,
      status:     deal.status,
      createdAt:  deal.createdAt,
      saleDate:   deal.saleDate,
      saleAmount:     deal.saleAmount,
      purchaseAmount: deal.purchaseAmount,
      payoffAmount:   deal.payoffAmount,
      vehicleValue:   deal.vehicleValue,
      notes:          deal.notes,
    },
    cliente: {
      nome:     person.nomeCompleto ?? person.name,
      cpf:      person.cpf,
      cnpj:     person.cnpj,
      email:    person.email,
      telefone: person.phone,
    },
    veiculo: {
      placa:  compraVeh.plate,
      marca:  compraVeh.brand,
      modelo: compraVeh.model,
      ano:    compraVeh.year,
      cor:    compraVeh.color,
      km:     compraVeh.km,
      valor:  compraVeh.agreedValue,
    },
    veiculo_vendido: {
      placa:  vendaVeh.plate,
      marca:  vendaVeh.brand,
      modelo: vendaVeh.model,
      ano:    vendaVeh.year,
      cor:    vendaVeh.color,
      valor:  vendaVeh.agreedValue,
    },
    pagamento: {
      banco:        deal.paymentBank,
      tipo:         deal.paymentType,
    },
    quitacao: {
      banco: deal.payoffBank,
      valor: deal.payoffAmount,
    },
  }
}

/** Lista de variáveis sugeridas para a UI de cadastro de template. */
export const TEMPLATE_VARIABLES: Array<{ key: string; label: string }> = [
  { key: 'cliente.nome',          label: 'Nome do cliente' },
  { key: 'cliente.cpf',           label: 'CPF do cliente' },
  { key: 'cliente.cnpj',          label: 'CNPJ do cliente' },
  { key: 'cliente.email',         label: 'E-mail' },
  { key: 'cliente.telefone',      label: 'Telefone' },
  { key: 'veiculo.placa',         label: 'Placa' },
  { key: 'veiculo.marca',         label: 'Marca' },
  { key: 'veiculo.modelo',        label: 'Modelo' },
  { key: 'veiculo.ano',           label: 'Ano' },
  { key: 'veiculo.cor',           label: 'Cor' },
  { key: 'veiculo.km',            label: 'KM' },
  { key: 'veiculo.valor|brl',     label: 'Valor do veículo (BRL)' },
  { key: 'deal.number',           label: 'Nº da negociação' },
  { key: 'deal.saleDate|date',    label: 'Data da venda' },
  { key: 'deal.purchaseAmount|brl', label: 'Valor de compra (BRL)' },
  { key: 'deal.saleAmount|brl',   label: 'Valor de venda (BRL)' },
  { key: 'quitacao.banco',        label: 'Banco da quitação' },
  { key: 'quitacao.valor|brl',    label: 'Valor da quitação (BRL)' },
]
