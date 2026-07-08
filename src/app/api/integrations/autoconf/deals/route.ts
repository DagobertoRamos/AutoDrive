// =============================================================================
// POST /api/integrations/autoconf/deals — recebe negociações do AutoConf (da
// extensão do Chrome) e cria/atualiza Deals no AutoDrive.
// Auth: header `x-autoconf-token` (token de integração por tenant).
// Body: { rows: AutoconfRow[], dryRun?: boolean }
// dryRun (padrão TRUE): não grava; só devolve o que FARIA (unidade/vendedor
// resolvidos). Passe dryRun:false para gravar de verdade.
// Dedup: Deal.dealNumber = "AC-<externalId>" dentro do tenant.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  resolveTenantByToken, resolveUnitId, resolveSellerId, mapType, mapStatus,
  type AutoconfDebt, type AutoconfPayment, type AutoconfRow, type AutoconfVehicle, type ProcessRowResult,
} from '@/lib/integrations/autoconf'
import { recalculateNegotiationCommissions } from '@/lib/commission-generator'
import { isCommissionEligibleStatus } from '@/lib/commission/status'
import { getRetornoConfig, computeReturnFromAutoconf, type RetornoConfig } from '@/lib/finance/retorno-config'
import { normalizePhone } from '@/lib/crm/shared'
import type { LeadStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function vFrom(v: AutoconfVehicle) {
  const plate = v.placa && !/zero\s*km/i.test(v.placa) ? v.placa : null
  return { plate, model: v.modelo ?? null, agreedValue: typeof v.valor === 'number' ? v.valor : null }
}

function vehiclesFor(row: AutoconfRow): Array<{ role: string; plate: string | null; model: string | null; agreedValue: number | null }> {
  const t = mapType(row.tipo)
  const saida = (row.veiculosSaida ?? [])[0]
  const entrada = (row.veiculosEntrada ?? [])[0]
  const out: Array<{ role: string; plate: string | null; model: string | null; agreedValue: number | null }> = []
  if (t === 'VENDA' && saida) out.push({ role: 'VENDIDO', ...vFrom(saida) })
  else if (t === 'COMPRA' && entrada) out.push({ role: 'COMPRADO', ...vFrom(entrada) })
  else if (t === 'TROCA') { if (saida) out.push({ role: 'VENDIDO', ...vFrom(saida) }); if (entrada) out.push({ role: 'TROCA', ...vFrom(entrada) }) }
  else if (t === 'CONSIGNACAO' && (saida ?? entrada)) out.push({ role: 'CONSIGNADO', ...vFrom((saida ?? entrada)!) })
  else { const v = saida ?? entrada; if (v) out.push({ role: t === 'COMPRA' ? 'COMPRADO' : 'VENDIDO', ...vFrom(v) }) }
  return out
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseDateValue(v: unknown): Date | null {
  if (!v || typeof v !== 'string') return null
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const br = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/)
  if (br) {
    const year = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3])
    const d = new Date(year, Number(br[2]) - 1, Number(br[1]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function normalizePaymentType(v: unknown): string {
  const s = String(v ?? '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (s.includes('PIX')) return 'PIX'
  if (s.includes('DINHEIRO') || s.includes('ESPECIE')) return 'DINHEIRO'
  if (s.includes('DEBITO')) return 'CARTAO_DEBITO'
  if (s.includes('CREDITO') || s.includes('CARTAO')) return 'CARTAO_CREDITO'
  if (s.includes('FINANCI')) return 'FINANCIAMENTO'
  if (s.includes('BOLETO')) return 'BOLETO'
  if (s.includes('TRANSFER') || s.includes('TED') || s.includes('DOC')) return 'TRANSFERENCIA'
  if (s.includes('SINAL') || s.includes('ENTRADA')) return 'SINAL'
  if (s.includes('DUPLICATA')) return 'DUPLICATA'
  return 'OUTROS'
}

function normalizePaymentStatus(v: unknown): string {
  const s = String(v ?? '').toUpperCase()
  if (s.includes('CONFIRM') || s.includes('PAGO') || s.includes('BAIX')) return 'CONFIRMADO'
  if (s.includes('CANCEL')) return 'CANCELADO'
  return 'PENDENTE'
}

function normalizeDebtType(v: unknown): string {
  const s = String(v ?? '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (s.includes('MULTA')) return 'MULTA'
  if (s.includes('IPVA')) return 'IPVA'
  if (s.includes('LICENC')) return 'LICENCIAMENTO'
  if (s.includes('FINANCI') || s.includes('QUITAC') || s.includes('ALIENAC')) return 'FINANCIAMENTO'
  if (s.includes('DOC')) return 'DOCUMENTACAO'
  return 'OUTROS'
}

function safeText(v: unknown, max = 500): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

function paymentsFor(row: AutoconfRow, tenantId: string, dealId: string) {
  return (row.pagamentos ?? [])
    .map((p: AutoconfPayment) => {
      const value = num(p.value)
      if (!value || value <= 0) return null
      return {
        dealId,
        tenantId,
        type: normalizePaymentType(p.type ?? p.notes),
        status: normalizePaymentStatus(p.status ?? p.notes),
        value,
        bank: safeText(p.bank, 120),
        cardBrand: safeText(p.cardBrand, 80),
        pixKey: safeText(p.pixKey, 160),
        agency: safeText(p.agency, 40),
        account: safeText(p.account, 80),
        installments: p.installments ? Number(p.installments) : null,
        installmentValue: num(p.installmentValue),
        returnPct: num(p.returnPct),
        vehiclePlate: safeText(p.vehiclePlate, 16),
        firstDueDate: parseDateValue(p.firstDueDate),
        dueDate: parseDateValue(p.dueDate),
        paidAt: parseDateValue(p.paidAt),
        notes: safeText(p.notes ?? JSON.stringify(p.raw ?? null), 800),
      }
    })
    .filter(Boolean)
}

function debtsFor(row: AutoconfRow, dealId: string) {
  return (row.debitos ?? [])
    .map((d: AutoconfDebt) => {
      const value = num(d.value)
      if (!value || value <= 0) return null
      return {
        dealId,
        vehicleRole: safeText(d.vehicleRole, 40),
        type: normalizeDebtType(d.type ?? d.description ?? d.notes),
        description: safeText(d.description ?? d.notes, 180),
        value,
        dueDate: parseDateValue(d.dueDate),
        responsavel: safeText(d.responsavel, 40) ?? 'LOJA',
        notes: safeText(d.notes ?? JSON.stringify(d.raw ?? null), 800),
      }
    })
    .filter(Boolean)
}

// Garantias/seguros (dos títulos) → DealService marcado como "Garantia: …".
// O gerador roteia serviços de garantia para o tipo GARANTIA (regra por %/fixo).
function warrantyServicesFor(row: AutoconfRow, dealId: string) {
  const gs = row.financeiro?.garantias ?? []
  return gs
    .map((g) => {
      const value = num(g.value)
      if (!value || value <= 0) return null
      const produto = safeText(g.produto, 140) || 'Garantia'
      const custo = num(g.custo ?? g.value) ?? 0
      return {
        dealId,
        name: `Garantia: ${produto}`.slice(0, 180),
        // value = custo da loja (AutoConf não expõe o valor cobrado). A comissão
        // sai da config por produto; value serve só de referência/registro.
        value,
        cost: custo > 0 ? custo : null,
        supplier: safeText(g.fornecedor, 120),
        notes: 'Importado do AutoConf — Garantias/Seguros.',
      }
    })
    .filter(Boolean)
}

async function resolveCustomerId(tenantId: string, row: AutoconfRow): Promise<string | null> {
  const details = row.clienteDetalhes ?? {}
  const name = safeText(details.nome ?? row.cliente, 180)
  if (!name) return null
  const doc = safeText(String(details.cpfCnpj ?? '').replace(/\D/g, ''), 20)
  const phone = safeText(String(details.telefone ?? row.clienteContato ?? '').replace(/\D/g, ''), 20)
  const email = safeText(details.email ?? row.clienteEmail, 180)
  const address = safeText(details.endereco, 240)
  const city = safeText(details.cidade, 120)
  const state = safeText(details.estado, 2)

  const or: Array<Record<string, unknown>> = []
  if (doc) or.push({ cpf: doc })
  if (email) or.push({ email })
  if (phone) or.push({ phone })
  if (!or.length) or.push({ name })

  const existing = await prisma.customer.findFirst({ where: { tenantId, OR: or as never }, select: { id: true } }).catch(() => null)
  if (existing) {
    await prisma.customer.update({
      where: { id: existing.id },
      data: { name, cpf: doc, phone, email, address, city, state },
    }).catch(() => null)
    return existing.id
  }

  const created = await prisma.customer.create({
    data: {
      tenantId,
      name,
      cpf: doc,
      phone,
      email,
      address,
      city,
      state,
      notes: 'Criado automaticamente pela integração AutoConf.',
    },
    select: { id: true },
  }).catch(() => null)
  return created?.id ?? null
}

async function resolveAssignedUserId(sellerId: string | null): Promise<string | null> {
  if (!sellerId) return null
  const seller = await prisma.seller.findFirst({ where: { id: sellerId }, select: { userId: true } }).catch(() => null)
  return seller?.userId ?? null
}

async function syncCrmLeadForAutoconf(args: {
  tenantId: string
  unitId: string
  sellerUserId: string | null
  customerId: string | null
  dealId: string
  row: AutoconfRow
  dealStatus: string
  notes: string
}): Promise<string | null> {
  const { tenantId, unitId, sellerUserId, customerId, dealId, row, dealStatus, notes } = args
  const details = row.clienteDetalhes ?? {}
  const name = safeText(details.nome ?? row.cliente, 180)
  const rawPhone = safeText(details.telefone ?? row.clienteContato, 30)
  const phoneDigits = normalizePhone(rawPhone)
  const email = safeText(details.email ?? row.clienteEmail, 180)
  const externalId = String(row.externalId)
  const status: LeadStatus = (() => {
    if (dealStatus === 'FINALIZADA') return 'CONVERTED'
    if (dealStatus === 'CANCELADA') return 'LOST'
    if (dealStatus === 'AGUARDANDO_APROVACAO' || dealStatus === 'AGUARDANDO_CONTRATO' || dealStatus === 'AGUARDANDO_DOCUMENTACAO') return 'QUALIFIED'
    return sellerUserId ? 'WORKING' : 'ASSIGNED'
  })()

  const existing = await prisma.marketingLead.findFirst({
    where: {
      tenantId,
      OR: [
        ...(customerId ? [{ customerId }] : []),
        ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
      ],
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: { id: true, metadata: true },
  }).catch(() => null)

  const metadata = {
    origin: 'AUTOCONF',
    externalId,
    sourceUrl: row.sourceUrl ?? null,
    importedAt: new Date().toISOString(),
  }

  const payload = {
    unitId,
    assignedToUserId: sellerUserId,
    customerId,
    name,
    phone: rawPhone,
    email,
    source: 'AUTOCONF',
    status,
    lastContactAt: new Date(),
    convertedDealId: dealStatus === 'FINALIZADA' ? dealId : null,
    convertedAt: dealStatus === 'FINALIZADA' ? new Date() : null,
    lostReason: dealStatus === 'CANCELADA' ? 'Negociação cancelada no AutoConf' : null,
    notes,
  }

  if (existing) {
    const mergedMetadata =
      existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? { ...(existing.metadata as Record<string, unknown>), ...metadata }
        : metadata
    const updated = await prisma.marketingLead.update({
      where: { id: existing.id },
      data: { ...payload, metadata: mergedMetadata },
      select: { id: true },
    }).catch(() => null)
    return updated?.id ?? existing.id
  }

  const created = await prisma.marketingLead.create({
    data: {
      tenantId,
      createdById: sellerUserId,
      metadata,
      ...payload,
    },
    select: { id: true },
  }).catch(() => null)
  return created?.id ?? null
}

// Campos financeiros derivados dos títulos classificados (financiamento/retorno/
// despachante) do AutoConf, aplicando o cadastro global de retorno.
function financeFieldsFor(row: AutoconfRow, config: RetornoConfig): Record<string, unknown> {
  const f = row.financeiro ?? {}
  const financed = num(f.financiamentoValue) ?? 0
  const retornoValue = num(f.retornoValue) ?? 0
  const despachante = num(f.despachanteValue) ?? 0
  const out: Record<string, unknown> = {}

  const ret = computeReturnFromAutoconf({ config, financedAmount: financed, retornoValue })
  if (ret) {
    out.returnRatePercent = financed && financed > 0 ? Number(((ret.returnGrossValue / financed) * 100).toFixed(2)) : null
    out.returnGrossValue = ret.returnGrossValue
    out.ilaPercent = config.ilaPercent || null
    out.ilaValue = ret.ilaValue
    out.iofPercent = config.iofPercent || null
    out.iofValue = ret.iofValue
    out.returnNetValue = ret.returnNetValue
  }
  if (f.retornoBank) out.paymentBank = safeText(f.retornoBank, 120)
  else if (f.financiamentoBank) out.paymentBank = safeText(f.financiamentoBank, 120)
  if (despachante > 0) out.documentationFee = despachante
  const payer = String(f.documentationPaidBy ?? '').toUpperCase()
  if (payer === 'LOJA' || payer === 'CLIENTE') out.documentationPaidBy = payer
  const gpayer = String(f.garantiaPaidBy ?? '').toUpperCase()
  if (gpayer === 'LOJA' || gpayer === 'CLIENTE') out.warrantyPaidBy = gpayer
  return out
}

function autoconfNotes(row: AutoconfRow): string {
  const details = row.clienteDetalhes ?? {}
  const lines = [
    'Importado do AutoConf.',
    `AutoConf ID: ${row.externalId}`,
    row.dataNegociacao ? `Data real da negociação: ${row.dataNegociacao}` : null,
    details.nome ? `Cliente: ${details.nome}` : (row.cliente ? `Cliente: ${row.cliente}` : null),
    details.cpfCnpj ? `Documento cliente: ${details.cpfCnpj}` : null,
    details.telefone ? `Telefone cliente: ${details.telefone}` : null,
    details.email ? `E-mail cliente: ${details.email}` : null,
    row.totalPagamentosDetalhe ? `Total pagamentos AutoConf: ${row.totalPagamentosDetalhe}` : null,
    row.totalDebitosDetalhe ? `Total débitos AutoConf: ${row.totalDebitosDetalhe}` : null,
    row.sourceUrl ? `Origem: ${row.sourceUrl}` : null,
  ].filter(Boolean)
  return lines.join('\n')
}

function auditMetadata(row: AutoconfRow) {
  return {
    externalId: row.externalId,
    sourceUrl: row.sourceUrl,
    dataNegociacao: row.dataNegociacao,
    dataNegociacaoIso: row.dataNegociacaoIso,
    clienteDetalhes: row.clienteDetalhes,
    pagamentos: row.pagamentos,
    debitos: row.debitos,
    autoconfDetalhes: row.autoconfDetalhes,
    autoconfListaRaw: row.autoconfListaRaw,
  }
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get('x-autoconf-token') ?? ''
    const tenantId = await resolveTenantByToken(token)
    if (!tenantId) return NextResponse.json({ success: false, error: 'Token inválido.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const rows: AutoconfRow[] = Array.isArray(body?.rows) ? body.rows : []
    const dryRun = body?.dryRun !== false // padrão TRUE
    if (!rows.length) return NextResponse.json({ success: false, error: 'Nenhuma linha recebida.' }, { status: 400 })

    // Cadastro global de retorno (faixa + ILA + IOF) — aplica a todos financiamentos.
    const retornoConfig = await getRetornoConfig(tenantId)

    // Caches por unidade (nome + gerente).
    const unitCache = new Map<string, string | null>()
    const unitName = new Map<string, string>()
    const unitManager = new Map<string, string | null>()
    async function unitInfo(loja: string | null | undefined) {
      const k = loja ?? ''
      if (!unitCache.has(k)) unitCache.set(k, await resolveUnitId(tenantId!, loja))
      const uid = unitCache.get(k) ?? null
      if (uid && !unitName.has(uid)) {
        const u = await prisma.unit.findUnique({ where: { id: uid }, select: { name: true } })
        unitName.set(uid, u?.name ?? uid)
        const mgr = await prisma.manager.findFirst({ where: { unitId: uid, active: true }, select: { userId: true } })
        unitManager.set(uid, mgr?.userId ?? null)
      }
      return uid
    }

    const results: ProcessRowResult[] = []
    let created = 0, updated = 0, skipped = 0
    let commissionGenerated = 0, commissionErrors = 0

    for (const row of rows) {
      const ext = String(row.externalId)
      const unitId = await unitInfo(row.loja)
      if (!unitId) { skipped++; results.push({ externalId: ext, action: 'skipped', reason: `Loja não mapeada: "${row.loja ?? ''}"` }); continue }
      const sellerId = await resolveSellerId(unitId, row.vendedor, tenantId)
      const dealNumber = `AC-${ext}`
      const type = mapType(row.tipo)
      const status = mapStatus(row.status)
      const managerId = unitManager.get(unitId) ?? null
      const saleDate = parseDateValue(row.dataNegociacaoIso ?? row.dataNegociacao ?? row.aprovadoEmIso ?? row.aprovadoEm ?? row.criadoEmIso ?? row.criadoEm)
      const approvedAt = parseDateValue(row.aprovadoEmIso ?? row.aprovadoEm ?? row.dataNegociacaoIso ?? row.dataNegociacao)
      const finalizedAt = status === 'FINALIZADA'
        ? (parseDateValue(row.finalizadoEmIso ?? row.finalizadoEm ?? row.dataNegociacaoIso ?? row.dataNegociacao ?? row.aprovadoEmIso ?? row.aprovadoEm) ?? new Date())
        : null
      const paymentRowsTotal = (row.pagamentos ?? []).reduce((s, p) => s + (num(p.value) ?? 0), 0)
      const debtRowsTotal = (row.debitos ?? []).reduce((s, d) => s + (num(d.value) ?? 0), 0)
      const firstPayment = (row.pagamentos ?? []).find((p) => (num(p.value) ?? 0) > 0)
      const customerId = dryRun ? null : await resolveCustomerId(tenantId, row)
      const sellerUserId = dryRun ? null : await resolveAssignedUserId(sellerId)
      const importedNotes = autoconfNotes(row)

      const dealData = {
        tenantId, unitId, sellerId, managerId,
        ...(customerId ? { customerId } : {}),
        type: type as never, status: status as never,
        saleAmount: typeof row.saleAmount === 'number' ? row.saleAmount : null,
        purchaseAmount: typeof row.purchaseAmount === 'number' ? row.purchaseAmount : null,
        totalPayments: paymentRowsTotal || row.totalPagamentosDetalhe || null,
        totalDebts: debtRowsTotal || row.totalDebitosDetalhe || null,
        paymentType: firstPayment ? normalizePaymentType(firstPayment.type ?? firstPayment.notes) : null,
        paymentBank: firstPayment?.bank ?? null,
        saleDate,
        approvedAt,
        finalizedAt,
        externalId: ext,
        sellerNameFromSheet: row.vendedor ?? null,
        notes: importedNotes,
        source: 'AUTOCONF',
        dealNumber,
        // retorno (bruto/ILA/IOF/líquido) + banco + documentação, dos títulos.
        ...financeFieldsFor(row, retornoConfig),
      }
      const vehicles = vehiclesFor(row)
      const paymentCreates = (savedDealId: string) => paymentsFor(row, tenantId, savedDealId)
      const debtCreates = (savedDealId: string) => debtsFor(row, savedDealId)
      const warrantyServiceCreates = (savedDealId: string) => warrantyServicesFor(row, savedDealId)
      const existing = await prisma.deal.findFirst({ where: { tenantId, dealNumber }, select: { id: true } })

      if (dryRun) {
        results.push({
          externalId: ext,
          action: existing ? 'updated' : 'created',
          unit: unitName.get(unitId),
          seller: sellerId ? row.vendedor : `(NÃO ACHADO: ${row.vendedor ?? '—'})`,
          dealNumber,
        })
        if (existing) updated++
        else created++
        continue
      }

      if (existing) {
        const savedDealId = existing.id
        await prisma.$transaction(async (tx) => {
          await tx.deal.update({ where: { id: savedDealId }, data: dealData })
          await tx.dealVehicle.deleteMany({ where: { dealId: savedDealId } })
          if (vehicles.length) await tx.dealVehicle.createMany({ data: vehicles.map((v) => ({ dealId: savedDealId, ...v })) })
          const payments = paymentCreates(savedDealId)
          if (payments.length) {
            await tx.dealPayment.deleteMany({ where: { dealId: savedDealId } })
            await tx.dealPayment.createMany({ data: payments as never })
          }
          const debts = debtCreates(savedDealId)
          if (debts.length) {
            await tx.dealDebt.deleteMany({ where: { dealId: savedDealId } })
            await tx.dealDebt.createMany({ data: debts as never })
          }
          // Garantias importadas: recria só as marcadas "Garantia:" (preserva serviços manuais).
          const warrantyServices = warrantyServiceCreates(savedDealId)
          await tx.dealService.deleteMany({ where: { dealId: savedDealId, name: { startsWith: 'Garantia:' } } })
          if (warrantyServices.length) await tx.dealService.createMany({ data: warrantyServices as never })
          await tx.dealAuditLog.create({
            data: {
              dealId: savedDealId,
              tenantId,
              unitId,
              action: 'AUTOCONF_IMPORT',
              field: 'autoconf',
              newValue: `AutoConf ${ext}`,
              metadata: auditMetadata(row) as never,
            },
          })
        })
        await syncCrmLeadForAutoconf({
          tenantId,
          unitId,
          sellerUserId,
          customerId,
          dealId: savedDealId,
          row,
          dealStatus: status,
          notes: importedNotes,
        }).catch(() => null)
        if (isCommissionEligibleStatus(status)) {
          try {
            const commission = await recalculateNegotiationCommissions({
              dealId: savedDealId,
              tenantId,
              triggeredBy: 'autoconf',
            })
            commissionGenerated += commission.created
          } catch (err) {
            commissionErrors++
            console.error('[autoconf deals] commission generation failed', {
              tenantId, dealId: savedDealId, dealNumber, status, unitId, sellerId,
              message: err instanceof Error ? err.message : 'Erro desconhecido',
            })
          }
        }
        updated++
        results.push({ externalId: ext, action: 'updated', unit: unitName.get(unitId), seller: row.vendedor ?? null, dealNumber })
      } else {
        const savedDealId = await prisma.$transaction(async (tx) => {
          const deal = await tx.deal.create({ data: dealData })
          if (vehicles.length) await tx.dealVehicle.createMany({ data: vehicles.map((v) => ({ dealId: deal.id, ...v })) })
          const payments = paymentCreates(deal.id)
          if (payments.length) await tx.dealPayment.createMany({ data: payments as never })
          const debts = debtCreates(deal.id)
          if (debts.length) await tx.dealDebt.createMany({ data: debts as never })
          const warrantyServices = warrantyServiceCreates(deal.id)
          if (warrantyServices.length) await tx.dealService.createMany({ data: warrantyServices as never })
          await tx.dealAuditLog.create({
            data: {
              dealId: deal.id,
              tenantId,
              unitId,
              action: 'AUTOCONF_IMPORT',
              field: 'autoconf',
              newValue: `AutoConf ${ext}`,
              metadata: auditMetadata(row) as never,
            },
          })
          return deal.id
        })
        await syncCrmLeadForAutoconf({
          tenantId,
          unitId,
          sellerUserId,
          customerId,
          dealId: savedDealId,
          row,
          dealStatus: status,
          notes: importedNotes,
        }).catch(() => null)
        if (isCommissionEligibleStatus(status)) {
          try {
            const commission = await recalculateNegotiationCommissions({
              dealId: savedDealId,
              tenantId,
              triggeredBy: 'autoconf',
            })
            commissionGenerated += commission.created
          } catch (err) {
            commissionErrors++
            console.error('[autoconf deals] commission generation failed', {
              tenantId, dealId: savedDealId, dealNumber, status, unitId, sellerId,
              message: err instanceof Error ? err.message : 'Erro desconhecido',
            })
          }
        }
        created++
        results.push({ externalId: ext, action: 'created', unit: unitName.get(unitId), seller: row.vendedor ?? null, dealNumber })
      }
    }

    return NextResponse.json({
      success: true, dryRun, total: rows.length,
      created, updated, skipped,
      commissionGenerated,
      commissionErrors,
      unmatchedSeller: results.filter((r) => typeof r.seller === 'string' && r.seller.startsWith('(NÃO')).length,
      results,
    })
  } catch (err) {
    console.error('[POST /api/integrations/autoconf/deals]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
