// =============================================================================
// documents/source-loader.ts — carrega da base a ORIGEM dos dados do gerador de
// documentos: negociação (via loadContractData), cliente, veículo do estoque,
// fornecedor e a loja (Tenant + Documentos › Configurações). Servidor.
// O escopo por loja/permissão vem pronto (where) de quem chama.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { Party, VehicleData } from '@/lib/negotiation/contracts/documents-core'
import { loadContractData, loadStoreContext, partyFromCustomer, partyFromSupplier, vehicleFromStock, type CustomerLike, type StoreContext } from '@/lib/negotiation/contracts/contract-data'
import { num } from '@/lib/negotiation/contracts/statement-core'
import { vehicleTitle, type SourceOutorgado } from './source-fields'

export type SourceKind = 'deal' | 'customer' | 'vehicle' | 'supplier'

export interface DocSourcePayload {
  kind: SourceKind | 'store'
  label: string
  loja: Party | null
  cidade: string | null
  uf: string | null
  outorgados: SourceOutorgado[]
  /** Pessoas da origem (comprador, proprietário…), a 1ª é a padrão. */
  partes: Array<{ key: string; label: string; party: Party }>
  /** Veículos da origem (vendido, troca…), o 1º é o padrão. */
  veiculos: Array<{ key: string; label: string; veiculo: VehicleData }>
  valor: number | null
  formaPagamento: string | null
}

const vehLabel = (prefix: string, v: VehicleData) => [prefix, vehicleTitle(v), v.placa].filter(Boolean).join(' · ')

function store(ctx: StoreContext | null): Pick<DocSourcePayload, 'loja' | 'cidade' | 'uf' | 'outorgados'> {
  return {
    loja: ctx?.loja ?? null, cidade: ctx?.cidade ?? null, uf: ctx?.uf ?? null,
    outorgados: (ctx?.outorgados ?? []).map((o) => ({ nome: o.nome, cpf: o.cpf ?? null, rg: o.rg ?? null, endereco: o.endereco ?? null })),
  }
}

const empty = (kind: DocSourcePayload['kind'], label: string, ctx: StoreContext | null): DocSourcePayload =>
  ({ kind, label, ...store(ctx), partes: [], veiculos: [], valor: null, formaPagamento: null })

export async function loadStoreSource(tenantId: string | null): Promise<DocSourcePayload> {
  return empty('store', '', tenantId ? await loadStoreContext(tenantId) : null)
}

export async function loadDealSource(dealId: string, where: Prisma.DealWhereInput): Promise<DocSourcePayload | null> {
  const loaded = await loadContractData(dealId, where as Record<string, unknown>)
  if (!loaded) return null
  const d = loaded.data
  const partes: DocSourcePayload['partes'] = []
  if (d.comprador.nome) partes.push({ key: 'comprador', label: `Cliente · ${d.comprador.nome}`, party: d.comprador })
  if (d.proprietario?.nome) partes.push({ key: 'proprietario', label: `Proprietário · ${d.proprietario.nome}`, party: d.proprietario })
  const veiculos: DocSourcePayload['veiculos'] = []
  if (loaded.hasSold || d.veiculo.placa || d.veiculo.modelo) veiculos.push({ key: 'vendido', label: vehLabel('Vendido', d.veiculo), veiculo: d.veiculo })
  ;(d.entrada ?? []).forEach((v, i) => veiculos.push({ key: `entrada${i}`, label: vehLabel('Troca/compra', v), veiculo: v }))
  const pagos = d.extrato.pagamentos.filter((p) => p.status === 'CONFIRMADO')
  const formas = [...new Set((pagos.length ? pagos : d.extrato.pagamentos).map((p) => p.forma).filter(Boolean))]
  return {
    kind: 'deal',
    label: [d.numero, d.comprador.nome].filter(Boolean).join(' · '),
    loja: d.loja, cidade: d.cidade ?? null, uf: d.uf ?? null,
    outorgados: (d.outorgados ?? []).map((o) => ({ nome: o.nome, cpf: o.cpf ?? null, rg: o.rg ?? null, endereco: o.endereco ?? null })),
    partes, veiculos,
    valor: d.extrato.totalPago > 0 ? d.extrato.totalPago : d.veiculo.valor ?? null,
    formaPagamento: formas.join(', ') || null,
  }
}

export async function loadCustomerSource(id: string, where: Record<string, unknown>): Promise<DocSourcePayload | null> {
  const c = await prisma.customer.findFirst({ where: { id, ...where }, include: { person: true } })
  if (!c) return null
  const party = partyFromCustomer(c as CustomerLike)
  const out = empty('customer', party.nome, c.tenantId ? await loadStoreContext(c.tenantId) : null)
  out.partes = [{ key: 'cliente', label: party.nome, party }]
  return out
}

export async function loadVehicleSource(id: string, where: Record<string, unknown>): Promise<DocSourcePayload | null> {
  const v = await prisma.vehicle.findFirst({ where: { id, ...where } })
  if (!v) return null
  const price = v.isPromo && num(v.promoPrice) > 0 ? num(v.promoPrice) : num(v.salePrice)
  const veiculo = vehicleFromStock(v, price || null)
  const out = empty('vehicle', vehLabel('', veiculo), v.tenantId ? await loadStoreContext(v.tenantId) : null)
  out.veiculos = [{ key: 'estoque', label: vehLabel('', veiculo), veiculo }]
  out.valor = price || null
  return out
}

export async function loadSupplierSource(id: string, where: Record<string, unknown>): Promise<DocSourcePayload | null> {
  const s = await prisma.supplier.findFirst({ where: { id, ...where } })
  if (!s) return null
  const party = partyFromSupplier(s)
  const out = empty('supplier', party.nome, await loadStoreContext(s.tenantId))
  out.partes = [{ key: 'fornecedor', label: party.nome, party }]
  return out
}
