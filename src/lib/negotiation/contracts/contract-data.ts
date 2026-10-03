// =============================================================================
// Dados dos contratos da venda, lidos do banco: loja (Tenant + sócio principal
// + logo), comprador (Person/Customer), proprietário quando a loja intermedeia
// (veículo de lojista parceiro, particular ou consignado), veículo vendido,
// veículos da troca, débitos, pagamentos, garantias, descontos e sinal.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { loadSiteConfig } from '@/lib/site/config'
import type { ContractData, DocKind, Party, VehicleData } from './documents-core'
import { buildStatement, num, parseVehicleText, renavamFromDebts } from './statement-core'

const digits = (s?: string | null) => String(s ?? '').replace(/\D/g, '')
export function fmtDoc(s?: string | null): string | null {
  const d = digits(s)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return s?.trim() || null
}
const fmtCep = (s?: string | null) => { const d = digits(s); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : s || '' }
const join = (parts: Array<string | null | undefined>, sep = ', ') => parts.map((p) => String(p ?? '').trim()).filter(Boolean).join(sep) || null

function address(a: { logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null; cep?: string | null }): string | null {
  const city = join([a.cidade, a.estado], '/')
  return join([join([a.logradouro, a.numero]), a.complemento, a.bairro, city, a.cep ? `CEP ${fmtCep(a.cep)}` : null])
}

type PersonLike = { type?: string | null; nomeCompleto?: string | null; razaoSocial?: string | null; cpf?: string | null; cnpj?: string | null; rg?: string | null; inscricaoEstadual?: string | null; email?: string | null; phone?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null; cep?: string | null; socioAdmNome?: string | null; socioAdmCpf?: string | null }
type CustomerLike = { name: string; cpf?: string | null; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; state?: string | null; person?: PersonLike | null }

function partyFromPerson(p: PersonLike): Party {
  const pj = p.type === 'JURIDICA' || digits(p.cnpj).length === 14
  return {
    tipo: pj ? 'PJ' : 'PF',
    nome: (pj ? p.razaoSocial || p.nomeCompleto : p.nomeCompleto) || '',
    documento: fmtDoc(pj ? p.cnpj : p.cpf),
    rg: p.rg ?? null, ie: p.inscricaoEstadual ?? null,
    endereco: address({ logradouro: p.logradouro, numero: p.numero, complemento: p.complemento, bairro: p.bairro, cidade: p.cidade, estado: p.estado, cep: p.cep }),
    email: p.email ?? null, telefone: p.phone ?? null,
    representante: pj && p.socioAdmNome ? { nome: p.socioAdmNome, cpf: fmtDoc(p.socioAdmCpf) } : null,
  }
}

function partyFromCustomer(c: CustomerLike): Party {
  if (c.person) {
    const p = partyFromPerson(c.person)
    return { ...p, nome: p.nome || c.name, documento: p.documento || fmtDoc(c.cpf), telefone: p.telefone || c.phone || null, email: p.email || c.email || null, endereco: p.endereco || join([c.address, join([c.city, c.state], '/')]) }
  }
  return { tipo: digits(c.cpf).length === 14 ? 'PJ' : 'PF', nome: c.name, documento: fmtDoc(c.cpf), endereco: join([c.address, join([c.city, c.state], '/')]), telefone: c.phone ?? null, email: c.email ?? null }
}

type VehRow = { brand?: string | null; model?: string | null; version?: string | null; year?: number | null; modelYear?: number | null; color?: string | null; fuel?: string | null; transmission?: string | null; plate?: string | null; renavam?: string | null; chassi?: string | null; km?: number | null }
type DealVehRow = { role: string; plate?: string | null; brand?: string | null; model?: string | null; year?: number | null; color?: string | null; chassi?: string | null; renavam?: string | null; km?: number | null; agreedValue?: unknown; evaluatedValue?: unknown; payoffValue?: unknown; payoffBank?: string | null; vehicle?: (VehRow & { originType?: string | null; partnerStore?: unknown; customer?: unknown; originEvaluationId?: string | null }) | null }

const FUEL: Record<string, string> = { GASOLINA: 'Gasolina', ETANOL: 'Etanol', FLEX: 'Flex', DIESEL: 'Diesel', ELETRICO: 'Elétrico', HIBRIDO: 'Híbrido' }

function vehicleData(dv: DealVehRow, valor?: number | null): VehicleData {
  const v = dv.vehicle
  // Sem cadastro no estoque e sem marca: separa da descrição única do AutoConf.
  const parsed = !v && !dv.brand ? parseVehicleText(dv.model) : {}
  return {
    marca: v?.brand || dv.brand || parsed.marca || null,
    modelo: v?.model || (parsed.marca ? parsed.modelo : dv.model) || null,
    versao: v?.version || null,
    anoFab: v?.year ?? dv.year ?? null, anoModelo: v?.modelYear ?? parsed.anoModelo ?? null,
    cor: v?.color || dv.color || null,
    combustivel: v?.fuel ? FUEL[v.fuel.toUpperCase()] ?? v.fuel : parsed.combustivel ?? null,
    cambio: v?.transmission ?? null,
    placa: (v?.plate || dv.plate || '').toUpperCase() || null,
    renavam: v?.renavam || dv.renavam || null,
    chassi: v?.chassi || dv.chassi || null,
    km: v?.km ?? dv.km ?? null,
    valor: valor ?? null,
    quitacao: num(dv.payoffValue) > 0 ? { banco: dv.payoffBank ?? null, valor: num(dv.payoffValue) } : null,
  }
}

const label = (v: VehicleData) => [[v.marca, v.modelo, v.versao].filter(Boolean).join(' ').replace(/\s+/g, ' '), v.anoModelo || v.anoFab, v.placa ? `placa ${v.placa}` : null].filter(Boolean).join(' — ')

export interface LoadedContract { data: ContractData; intermediated: boolean; suggested: DocKind[]; dealStatus: string }

export async function loadContractData(dealId: string, tenantWhere: Record<string, unknown> = {}): Promise<LoadedContract | null> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, ...tenantWhere },
    include: {
      tenant: true,
      seller: { select: { fullName: true } },
      person: true,
      customer: { include: { person: true } },
      vehicles: { include: { vehicle: { include: { partnerStore: true, customer: { include: { person: true } } } } } },
      debts: true, payments: true, services: true, discountRequests: true,
      warrantySales: { include: { warranty: { select: { name: true, coverageType: true, durationYears: true, provider: true } } } },
    },
  })
  if (!deal) return null
  const t = deal.tenant
  // Loja: Tenant + sócio principal + logo (site da loja, se o cadastro não tiver).
  const principal = t ? await prisma.tenantPartner.findFirst({ where: { tenantId: t.id }, orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }], select: { nomeCompleto: true, cpf: true } }).catch(() => null) : null
  const site = t ? await loadSiteConfig(t.id).catch(() => null) : null
  const loja: Party = {
    tipo: 'PJ',
    nome: t?.razaoSocial || t?.nomeFantasia || t?.name || 'Loja',
    documento: fmtDoc(t?.cnpj),
    ie: t?.isentoInscricaoEstadual ? 'isento' : t?.inscricaoEstadual ?? null,
    endereco: address({ logradouro: t?.logradouro ?? t?.address, numero: t?.numero, complemento: t?.complemento, bairro: t?.bairro, cidade: t?.city, estado: t?.state, cep: t?.zipCode }),
    email: t?.email ?? null, telefone: t?.phone ?? null,
    representante: principal ? { nome: principal.nomeCompleto, cpf: fmtDoc(principal.cpf) } : t?.responsavel ? { nome: t.responsavel } : null,
  }
  if (t?.nomeFantasia && t.razaoSocial && t.nomeFantasia !== t.razaoSocial) loja.nome = `${t.razaoSocial} (${t.nomeFantasia})`

  const fromPerson = deal.person ? partyFromPerson(deal.person) : null
  const fromCustomer = deal.customer ? partyFromCustomer(deal.customer) : null
  const comprador: Party = fromPerson && fromCustomer
    ? { ...fromPerson, documento: fromPerson.documento || fromCustomer.documento, rg: fromPerson.rg || fromCustomer.rg, endereco: fromPerson.endereco || fromCustomer.endereco, telefone: fromPerson.telefone || fromCustomer.telefone, email: fromPerson.email || fromCustomer.email }
    : fromPerson ?? fromCustomer ?? { tipo: 'PF', nome: '' }

  // Veículo da negociação sem vínculo com o estoque: procura pela placa na loja.
  for (const dv of deal.vehicles) {
    if (dv.vehicle || !dv.plate || !deal.tenantId) continue
    const plate = dv.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const found = await prisma.vehicle.findFirst({ where: { tenantId: deal.tenantId, OR: [{ plate }, { plate: `${plate.slice(0, 3)}-${plate.slice(3)}` }] }, include: { partnerStore: true, customer: { include: { person: true } } } }).catch(() => null)
    if (found) (dv as { vehicle: unknown }).vehicle = found
  }
  const sold = deal.vehicles.find((v) => v.role === 'VENDIDO' || v.role === 'CONSIGNADO') ?? deal.vehicles.find((v) => v.role !== 'TROCA')
  const saleValue = num(deal.saleAmount) || num(deal.vehicleValue) || num(sold?.agreedValue)
  const veiculo: VehicleData = sold ? vehicleData(sold as DealVehRow, saleValue) : { valor: saleValue }
  if (!veiculo.renavam) veiculo.renavam = renavamFromDebts(veiculo.placa, deal.debts)

  // Intermediação: veículo de lojista parceiro, particular intermediado ou consignação.
  const sv = sold?.vehicle
  let proprietario: Party | null = null
  if (sv?.originType === 'PARTNER' && sv.partnerStore) {
    const p = sv.partnerStore
    proprietario = { tipo: digits(p.cnpj).length === 14 ? 'PJ' : 'PF', nome: p.legalName || p.name, documento: fmtDoc(p.cnpj), endereco: join([p.address, join([p.city, p.state], '/')]), telefone: p.whatsapp ?? null, email: p.email ?? null, representante: p.responsibleName ? { nome: p.responsibleName } : null }
  } else if (sv?.originType === 'PRIVATE' || deal.type === 'CONSIGNACAO') {
    if (sv?.customer) proprietario = partyFromCustomer(sv.customer as CustomerLike)
    else if (sv?.originEvaluationId) {
      const ev = await prisma.vehicleEvaluation.findUnique({ where: { id: sv.originEvaluationId }, select: { ownerName: true, ownerCpf: true, ownerPhone: true, ownerEmail: true } }).catch(() => null)
      if (ev?.ownerName) proprietario = { tipo: digits(ev.ownerCpf).length === 14 ? 'PJ' : 'PF', nome: ev.ownerName, documento: fmtDoc(ev.ownerCpf), telefone: ev.ownerPhone ?? null, email: ev.ownerEmail ?? null }
    }
    if (!proprietario) proprietario = { tipo: 'PF', nome: '' }
  }

  const trocasRows = deal.vehicles.filter((v) => v.role === 'TROCA')
  const trocas = trocasRows.map((v) => { const t = vehicleData(v as DealVehRow, num(v.agreedValue) || num(v.evaluatedValue)); if (!t.renavam) t.renavam = renavamFromDebts(t.placa, deal.debts); return t })

  const extrato = buildStatement({
    vehicleLabel: `Veículo: ${label(veiculo) || 'objeto deste contrato'}`,
    vehicleValue: saleValue,
    documentationFee: num(deal.documentationFee),
    documentationPaidBy: deal.documentationPaidBy,
    debts: deal.debts,
    services: deal.services,
    warranties: deal.warrantySales.map((w) => ({ name: w.warranty?.name ?? 'Garantia', value: w.finalPrice, status: w.status })),
    warrantyPaidBy: deal.warrantyPaidBy,
    flatDiscount: num(deal.discountAmount),
    discountRequests: deal.discountRequests.map((r) => ({ status: String(r.status), approvedValue: r.approvedValue, requestedValue: r.requestedValue, reason: r.reason })),
    payments: deal.payments,
    tradeIns: trocas.map((v) => ({ label: label(v), value: num(v.valor) })),
  })

  // Sinal = só os pagamentos lançados como Sinal/Entrada. O campo antigo
  // deal.signalAmount soma também Pix e dinheiro — vale só sem pagamentos.
  const sinalPay = deal.payments.filter((p) => ['SINAL', 'ENTRADA'].includes(String(p.type).toUpperCase()) && String(p.status).toUpperCase() !== 'CANCELADO')
  const sinalValor = sinalPay.length ? sinalPay.reduce((s, p) => s + num(p.value), 0) : deal.payments.length ? 0 : num(deal.signalAmount)
  const SIG: Record<string, string> = { PIX: 'Pix', DINHEIRO: 'dinheiro', CARTAO_CREDITO: 'cartão de crédito', CARTAO_DEBITO: 'cartão de débito', TRANSFERENCIA: 'transferência', BOLETO: 'boleto' }
  const sinalFormas = [...new Set(sinalPay.map((p) => SIG[String(p.method ?? '').toUpperCase()]).filter(Boolean))]
  const now = new Date()
  const data: ContractData = {
    numero: deal.dealNumber ?? deal.id.slice(-8).toUpperCase(),
    data: deal.finalizedAt ?? deal.saleDate ?? now,
    cidade: t?.city ?? null, uf: t?.state ?? null,
    logoUrl: t?.logoUrl || site?.identity?.logoUrl || null,
    loja, comprador, proprietario,
    vendedorNome: deal.seller?.fullName ?? null,
    veiculo, trocas, extrato,
    garantias: deal.warrantySales.filter((w) => String(w.status) === 'ATIVA').map((w) => ({ nome: w.warranty?.name ?? 'Garantia', cobertura: w.warranty?.coverageType ?? null, anos: w.warranty?.durationYears ?? null, fornecedor: w.warranty?.provider ?? null })),
    sinal: sinalValor > 0 ? { valor: sinalValor, data: sinalPay[0]?.paidAt ?? sinalPay[0]?.dueDate ?? sinalPay[0]?.createdAt ?? null, forma: sinalFormas.join(' e ') || null } : null,
    reservaAte: deal.deliveryDate ?? new Date(now.getTime() + 7 * 86_400_000),
    entregaPrevista: deal.deliveryDate ?? null,
    comissao: num(deal.consignCommPct) > 0 ? `${(num(deal.consignCommPct) * (num(deal.consignCommPct) <= 1 ? 100 : 1)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% do valor da venda` : sv?.partnerStore?.commission ?? null,
    financiado: extrato.pagamentos.some((p) => p.forma === 'Financiamento'),
  }
  const suggested: DocKind[] = ['VENDA', ...(sinalValor > 0 ? ['SINAL' as const] : []), ...(proprietario ? ['INTERMEDIACAO' as const] : [])]
  return { data, intermediated: !!proprietario, suggested, dealStatus: String(deal.status) }
}
