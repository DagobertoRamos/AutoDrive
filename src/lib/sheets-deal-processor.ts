// =============================================================================
// src/lib/sheets-deal-processor.ts
// Converte SheetImportRow (staging) em Negociações reais (Deal) do AutoDrive.
//
// Fluxo por linha:
//   1. Resolve vendedor (com fallback provisório)
//   2. Upsert Customer
//   3. Upsert Vehicle
//   4. Upsert Deal  (dedup por tenantId + externalId)
//   5. Cria/atualiza DealVehicle
//   6. Cria/atualiza Contract (financeiro)
//   7. Cria Pendências de status e de vendedor provisório
//   8. Registra AuditLog
// =============================================================================

import { prisma }          from '@/lib/prisma'
import { google }          from 'googleapis'
import { buildGoogleAuth } from '@/lib/google-auth'

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface DealProcessorOptions {
  configId:        string
  dryRun?:         boolean
  triggeredById?:  string   // userId de quem disparou
  limitRows?:      number   // 0 = sem limite
  resetPending?:   boolean  // true = resetar ERRO/AGUARDANDO para PENDENTE antes de rodar
}

export interface DealProcessorSummary {
  totalRows:          number
  skipped:            number
  dealsCreated:       number
  dealsUpdated:       number
  provisionalSellers: number
  pendenciesCreated:  number
  errors:             number
  errorDetails:       string[]
  durationMs:         number
  dryRun:             boolean
}

export interface SheetRowStats {
  total:                number
  pending:              number
  dealCreated:          number
  dealUpdated:          number
  waitingReview:        number
  error:                number
  ignored:              number
  lastProcessedAt:      string | null
}

// ── Mapeamento de tipo de negociação ─────────────────────────────────────────

const DEAL_TYPE_MAP: Record<string, 'VENDA' | 'TROCA' | 'COMPRA' | 'CONSIGNACAO'> = {
  'venda':          'VENDA',
  'troca':          'TROCA',
  'compra':         'COMPRA',
  'consignacao':    'CONSIGNACAO',
  'consignação':    'CONSIGNACAO',
  'saída':          'VENDA',
  'saida':          'VENDA',
  'v':              'VENDA',
  't':              'TROCA',
  'c':              'COMPRA',
}

function mapDealType(raw: string | undefined): 'VENDA' | 'TROCA' | 'COMPRA' | 'CONSIGNACAO' {
  const lower = (raw ?? '').toLowerCase().trim()
  for (const [key, val] of Object.entries(DEAL_TYPE_MAP)) {
    if (lower.includes(key)) return val
  }
  return 'VENDA'
}

// ── Mapeamento de status da negociação ───────────────────────────────────────

const CANCELLED_KEYWORDS = ['cancelad', 'cancel']
const FINISHED_KEYWORDS  = ['finaliz', 'concluíd', 'concluid', 'entregue']

function mapDealStatus(statusMain: string | undefined): 'EM_ANDAMENTO' | 'FINALIZADA' | 'CANCELADA' {
  const lower = (statusMain ?? '').toLowerCase()
  if (CANCELLED_KEYWORDS.some(k => lower.includes(k))) return 'CANCELADA'
  if (FINISHED_KEYWORDS.some(k => lower.includes(k)))  return 'FINALIZADA'
  return 'EM_ANDAMENTO'
}

// ── Status que indicam pendência ativa na planilha ───────────────────────────

const PENDENCY_KEYWORDS = [
  'pendência', 'pendencia', 'pendente', 'aguardando', 'não entregue',
  'nao entregue', 'processo com', 'entregue com pendência', 'entregue com pendencia',
  'contrato pendente', 'laudo pendente', 'preparação pendente', 'preparacao pendente',
  'pós-venda pendente', 'pos-venda pendente', 'financeira', 'renave', 'interna',
]

function hasPendencyKeyword(status: string | undefined): boolean {
  const lower = (status ?? '').toLowerCase()
  return PENDENCY_KEYWORDS.some(k => lower.includes(k))
}

const PENDENCY_TYPE_MAP: Record<string, string> = {
  'pendência vendedor':                            'PENDENCIA_VENDEDOR',
  'pendência gerência':                            'PENDENCIA_GERENCIA',
  'outras pendências':                             'OUTRAS',
  'processo entregue com pendência vendedor':      'ENTREGUE_PENDENCIA_VENDEDOR',
  'processo entregue com pendência gerência':      'ENTREGUE_PENDENCIA_GERENCIA',
  'processo com o vendedor':                       'COM_VENDEDOR',
  'processo com a gerência':                       'COM_GERENCIA',
  'veículo não entregue':                          'VEICULO_NAO_ENTREGUE',
  'contrato pendente':                             'CONTRATO_PENDENTE',
  'pendência financeira':                          'PENDENCIA_FINANCEIRA',
  'documentação interna':                          'DOCUMENTACAO_INTERNA',
  'pendência renave':                              'PENDENCIA_RENAVE',
  'laudo pendente':                                'LAUDO_PENDENTE',
  'preparação pendente':                           'PREPARACAO_PENDENTE',
  'pós-venda pendente':                            'POS_VENDA_PENDENTE',
  'processo de compra pendente':                   'PROCESSO_COMPRA_PENDENTE',
  'processo de venda pendente':                    'PROCESSO_VENDA_PENDENTE',
}

function classifyPendencyType(status: string): string {
  const lower = (status ?? '').toLowerCase().trim()
  return PENDENCY_TYPE_MAP[lower] ?? 'OUTRAS'
}

// ── Helpers de parsing ────────────────────────────────────────────────────────

/** Remove acentos e normaliza para comparação fuzzy */
function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parseia valor monetário da planilha (ex: "R$ 45.000,00" → 45000.00) */
function parseDecimalValue(raw: string | undefined): number | null {
  if (!raw) return null
  const cleaned = raw
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/** Parseia data no formato dd/mm/yyyy ou yyyy-mm-dd */
function parseDateValue(raw: string | undefined): Date | null {
  if (!raw) return null
  const s = raw.trim()

  // dd/mm/yyyy
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (brMatch) {
    const d = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]))
    return isNaN(d.getTime()) ? null : d
  }

  // yyyy-mm-dd
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }

  // Fallback
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/** Normaliza placa: remove hífen, maiúsculo */
function normalizePlate(raw: string | undefined): string | null {
  if (!raw) return null
  const p = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return p.length >= 6 ? p : null
}

// ── Resolução de vendedor com fallback provisório ─────────────────────────────

interface SellerResolution {
  sellerId:      string | null
  isProvisional: boolean
  warning?:      string
}

async function resolveSellerWithFallback(
  sellerName: string | undefined,
  unitId:     string,
): Promise<SellerResolution> {
  const normName = sellerName ? normalizeText(sellerName) : ''

  // 1 — Busca exata por nome no banco (case-insensitive com contains)
  if (sellerName) {
    const candidates = await prisma.seller.findMany({
      where: { unitId, active: true, fullName: { contains: sellerName, mode: 'insensitive' } },
    })

    if (candidates.length === 1) {
      return { sellerId: candidates[0].id, isProvisional: false }
    }

    if (candidates.length > 1) {
      // Preferência para match normalizado exato
      const exact = candidates.find(s => normalizeText(s.fullName) === normName)
      return { sellerId: (exact ?? candidates[0]).id, isProvisional: false }
    }

    // 2 — Busca todos os vendedores da unidade e tenta match normalizado parcial
    const allSellers = await prisma.seller.findMany({ where: { unitId, active: true } })
    const partial = allSellers.find(s => normalizeText(s.fullName).includes(normName) || normName.includes(normalizeText(s.fullName)))
    if (partial) return { sellerId: partial.id, isProvisional: false }
  }

  // 3 — Fallback: vendedor(es) ativo(s) na unidade
  const unitSellers = await prisma.seller.findMany({
    where:   { unitId, active: true },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  })

  if (unitSellers.length === 0) {
    return {
      sellerId:      null,
      isProvisional: false,
      warning: sellerName
        ? `Vendedor "${sellerName}" não localizado e nenhum vendedor ativo encontrado na unidade.`
        : 'Nenhum vendedor ativo encontrado na unidade.',
    }
  }

  if (unitSellers.length === 1) {
    return {
      sellerId:      unitSellers[0].id,
      isProvisional: true,
      warning: `Vendedor "${sellerName ?? '(não informado)'}" não localizado. Vinculado provisoriamente ao único vendedor ativo da unidade: ${unitSellers[0].fullName}.`,
    }
  }

  // Múltiplos: preferência por GERENTE/ADM
  const managerRoles = ['ADM', 'GERENTE', 'GERENTE_GERAL', 'MASTER']
  const mgr = unitSellers.find(s => managerRoles.includes(s.user.role))
  const chosen = mgr ?? unitSellers[0]

  return {
    sellerId:      chosen.id,
    isProvisional: true,
    warning: `Vendedor "${sellerName ?? '(não informado)'}" não localizado. Negociação vinculada provisoriamente a: ${chosen.fullName} (${unitSellers.length} vendedores ativos na unidade — ajuste manual necessário).`,
  }
}

// ── Upsert de cliente ─────────────────────────────────────────────────────────

async function upsertCustomer(tenantId: string, name: string): Promise<string | null> {
  if (!name || name === '(não informado)') return null

  const existing = await prisma.customer.findFirst({
    where: { tenantId, name: { contains: name, mode: 'insensitive' } },
  })
  if (existing) return existing.id

  const created = await prisma.customer.create({ data: { tenantId, name } })
  return created.id
}

// ── Upsert de veículo ─────────────────────────────────────────────────────────

async function upsertVehicle(
  tenantId:   string,
  unitId:     string,
  plate:      string | null,
  model:      string | undefined,
  customerId: string | null,
): Promise<string | null> {
  if (!plate && !model) return null

  if (plate) {
    const existing = await prisma.vehicle.findFirst({
      where: { tenantId, plate },
    })
    if (existing) {
      // Atualiza modelo se estava vazio
      if (model && !existing.model) {
        await prisma.vehicle.update({ where: { id: existing.id }, data: { model } }).catch(() => {})
      }
      return existing.id
    }
  }

  // Cria novo veículo
  const created = await prisma.vehicle.create({
    data: {
      tenantId,
      unitId,
      plate:       plate ?? undefined,
      model:       model ?? undefined,
      customerId:  customerId ?? undefined,
      stockStatus: 'VENDIDO',
      active:      true,
    },
  })
  return created.id
}

// ── Cria DealVehicle se ainda não existir ─────────────────────────────────────

async function ensureDealVehicle(dealId: string, vehicleId: string): Promise<void> {
  const existing = await prisma.dealVehicle.findFirst({ where: { dealId, vehicleId } })
  if (!existing) {
    await prisma.dealVehicle.create({
      data: { dealId, vehicleId, role: 'VENDIDO' },
    })
  }
}

// ── Upsert de contrato financeiro ─────────────────────────────────────────────

async function upsertContract(opts: {
  tenantId:       string
  unitId:         string
  dealId:         string
  customerId:     string | null
  vehicleId:      string | null
  sellerId:       string | null
  saleValue:      number | null
  docValue:       number | null
  financedValue:  number | null
  bank:           string | undefined
  saleDate:       Date | null
  dealType:       string
}): Promise<void> {
  const contractType =
    opts.dealType === 'TROCA'      ? 'TROCA'  :
    opts.dealType === 'COMPRA'     ? 'COMPRA' :
    opts.dealType === 'CONSIGNACAO'? 'CONSIGNACAO' : 'VENDA'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (prisma.contract as any).findFirst({ where: { dealId: opts.dealId } })

  const data = {
    tenantId:      opts.tenantId,
    unitId:        opts.unitId,
    dealId:        opts.dealId,
    customerId:    opts.customerId ?? undefined,
    vehicleId:     opts.vehicleId ?? undefined,
    sellerId:      opts.sellerId ?? undefined,
    type:          contractType as 'VENDA' | 'TROCA' | 'COMPRA' | 'CONSIGNACAO',
    saleValue:     opts.saleValue   !== null ? opts.saleValue   : undefined,
    docValue:      opts.docValue    !== null ? opts.docValue    : undefined,
    financedValue: opts.financedValue !== null ? opts.financedValue : undefined,
    bank:          opts.bank ?? undefined,
    saleDate:      opts.saleDate ?? undefined,
    status:        'ATIVO',
  }

  if (existing) {
    await prisma.contract.update({ where: { id: existing.id }, data })
  } else {
    await prisma.contract.create({ data })
  }
}

// ── Cria pendência de status (se linha tem pendência ativa) ───────────────────

async function createStatusPendency(opts: {
  tenantId:    string
  unitId:      string
  dealId:      string
  sellerId:    string
  customerId:  string | null
  vehicleId:   string | null
  customerName:string
  plate:       string | null
  negotiation: string | undefined
  statusMain:  string | undefined
  statusDetail:string | undefined
  sheetName:   string
}): Promise<boolean> {
  const { tenantId, unitId, dealId, sellerId, negotiation, statusMain } = opts

  // Verifica se já existe pendência ativa para esta negociação
  const existing = await prisma.pendency.findFirst({
    where: {
      tenantId,
      negotiation: negotiation ?? undefined,
      status: { notIn: ['FINALIZADA', 'CANCELADA'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(dealId ? { dealId } : {}) as any,
    },
  })
  if (existing) return false

  const description = [
    `Pendência identificada na aba ${opts.sheetName}`,
    statusMain    ? `Status: ${statusMain}`        : null,
    opts.statusDetail ? `Detalhe: ${opts.statusDetail}` : null,
    negotiation   ? `Negociação: #${negotiation}`  : null,
  ].filter(Boolean).join(' | ')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.pendency as any).create({
    data: {
      tenantId,
      unitId,
      dealId,
      responsibleId: sellerId,
      customerId:    opts.customerId ?? undefined,
      vehicleId:     opts.vehicleId  ?? undefined,
      customerName:  opts.customerName,
      plate:         opts.plate ?? undefined,
      negotiation:   negotiation ?? undefined,
      description,
      type:          classifyPendencyType(statusMain ?? ''),
      priority:      'MEDIA',
      status:        'ABERTA',
      source:        'SHEETS',
      originModule:  'SHEETS',
      originRecordId:`${opts.sheetName}:${negotiation ?? ''}`,
      allowedDays:   [],
    },
  })
  return true
}

// ── Cria pendência de vendedor provisório ─────────────────────────────────────

async function createProvisionalSellerPendency(opts: {
  tenantId:     string
  unitId:       string
  dealId:       string
  sellerId:     string
  customerName: string
  plate:        string | null
  negotiation:  string | undefined
  warning:      string
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.pendency as any).create({
    data: {
      tenantId:      opts.tenantId,
      unitId:        opts.unitId,
      dealId:        opts.dealId,
      responsibleId: opts.sellerId,
      customerName:  opts.customerName,
      plate:         opts.plate ?? undefined,
      negotiation:   opts.negotiation ?? undefined,
      description:   opts.warning,
      type:          'REVISAO_VENDEDOR',
      priority:      'ALTA',
      status:        'ABERTA',
      source:        'SHEETS',
      originModule:  'SHEETS',
      notes:         'Pendência administrativa — revisar e corrigir o vendedor da negociação manualmente.',
      allowedDays:   [],
    },
  })
}

// ── Função principal ──────────────────────────────────────────────────────────

export async function runDealProcessor(opts: DealProcessorOptions): Promise<DealProcessorSummary> {
  const startedAt = Date.now()
  const summary: DealProcessorSummary = {
    totalRows:          0,
    skipped:            0,
    dealsCreated:       0,
    dealsUpdated:       0,
    provisionalSellers: 0,
    pendenciesCreated:  0,
    errors:             0,
    errorDetails:       [],
    durationMs:         0,
    dryRun:             opts.dryRun ?? false,
  }

  // Carrega configuração
  const config = await prisma.googleSheetConfig.findUnique({
    where: { id: opts.configId },
  })
  if (!config)          throw new Error('Importador não encontrado.')
  if (!config.tenantId) throw new Error('Tenant não configurado no importador.')
  if (!config.unitId)   throw new Error('Unidade não configurada no importador.')

  const resolvedIds = await resolveConfigIds(config.tenantId!, config.unitId!)
  const tenantId    = resolvedIds.tenantId
  const unitId      = resolvedIds.unitId

  // Opcional: resetar linhas com ERRO/AGUARDANDO_CONFERENCIA/PROCESSANDO para PENDENTE
  if (opts.resetPending) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.sheetImportRow as any).updateMany({
      where: { configId: opts.configId, status: { in: ['ERRO', 'AGUARDANDO_CONFERENCIA', 'PROCESSANDO'] } },
      data:  { status: 'PENDENTE', errorMessage: null, processedAt: null },
    })
  }

  // Carrega linhas PENDENTES
  const limit = opts.limitRows && opts.limitRows > 0 ? opts.limitRows : undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await (prisma.sheetImportRow as any).findMany({
    where:   { configId: opts.configId, status: 'PENDENTE' },
    orderBy: { createdAt: 'asc' },
    take:    limit,
  })

  summary.totalRows = rows.length

  for (const row of rows) {
    const raw: Record<string, string> = (row.rawData as Record<string, string>) ?? {}

    // Campos da linha (denormalizados primeiro, rawData como fallback)
    const externalId   = row.externalId    ?? raw.negotiation ?? raw.externalId ?? ''
    const customerName = (row.customerName ?? raw.customerName ?? raw.unit ?? '').trim() || '(não informado)'
    const sellerName   = (row.sellerName   ?? raw.sellerName   ?? '').trim() || undefined
    const plate        = normalizePlate(row.plate ?? raw.plate)
    const vehicleModel = (row.vehicleModel ?? raw.vehicle ?? '').trim() || undefined
    const statusMain   = (row.statusMain   ?? raw.statusMain   ?? '').trim()
    const statusDetail = (row.statusDetail ?? raw.statusDetail ?? '').trim() || undefined
    const saleDateRaw  = row.saleDate      ?? raw.saleDate
    const saleValue    = parseDecimalValue(row.saleValue    ?? raw.saleValue)
    const docValue     = parseDecimalValue(row.docValue     ?? raw.docValue)
    const financedValue= parseDecimalValue(row.financedValue?? raw.financedValue)
    const bank         = (row.bank         ?? raw.bank ?? '').trim() || undefined
    const returnType   = (row.returnType   ?? raw.returnType  ?? '').trim() || undefined
    const dealTypeRaw  = (row.dealType     ?? raw.dealType    ?? '').trim()
    const saleDate     = parseDateValue(saleDateRaw)
    const dealType     = mapDealType(dealTypeRaw || statusMain)
    const dealStatus   = mapDealStatus(statusMain)
    const sheetName    = row.sheetName ?? ''
    const negotiation  = externalId || undefined

    // Marca como PROCESSANDO
    if (!opts.dryRun) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.sheetImportRow as any).update({
        where: { id: row.id },
        data:  { status: 'PROCESSANDO' },
      })
    }

    try {
      // ── 1. Resolve vendedor ─────────────────────────────────────────────────
      const sellerRes = await resolveSellerWithFallback(sellerName, unitId)

      if (opts.dryRun) {
        summary.skipped++
        if (sellerRes.isProvisional) summary.provisionalSellers++
        continue
      }

      // ── 2. Upsert Customer ──────────────────────────────────────────────────
      const customerId = await upsertCustomer(tenantId, customerName)

      // ── 3. Upsert Vehicle ───────────────────────────────────────────────────
      const vehicleId = await upsertVehicle(tenantId, unitId, plate, vehicleModel, customerId)

      // ── 4. Upsert Deal ──────────────────────────────────────────────────────
      const dedupeWhere = externalId
        ? { tenantId, externalId }
        : null

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingDeal = dedupeWhere
        ? await (prisma.deal as any).findFirst({ where: dedupeWhere })
        : null

      const dealNotes = [
        `Negociação importada da planilha. Origem: ${row.referenceMonth ?? sheetName}.`,
        externalId              ? `ID externo: ${externalId}.`                         : null,
        sellerRes.isProvisional ? sellerRes.warning ?? 'Vendedor vinculado provisoriamente.' : null,
        returnType              ? `Tipo de retorno: ${returnType}.`                    : null,
      ].filter(Boolean).join('\n')

      // Gera dealNumber único para novas negociações
      const dealYear  = new Date().getFullYear()
      const dealCount = await prisma.deal.count({ where: { tenantId } }).catch(() => 0)
      const dealNumber = `NEG-${dealYear}-${String(dealCount + 1).padStart(4, '0')}`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dealData: any = {
        tenantId,
        unitId,
        sellerId:           sellerRes.sellerId ?? undefined,
        customerId:         customerId         ?? undefined,
        type:               dealType,
        status:             dealStatus,
        source:             'PLANILHA',
        saleDate:           saleDate           ?? undefined,
        vehicleValue:       saleValue          !== null ? saleValue : undefined,
        externalId:         externalId         || undefined,
        sellerNameFromSheet:sellerName         ?? undefined,
        isSellerProvisional:sellerRes.isProvisional,
        notes:              dealNotes,
      }

      let dealId: string
      let isUpdate = false

      if (existingDeal) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.deal as any).update({ where: { id: existingDeal.id }, data: dealData })
        dealId   = existingDeal.id
        isUpdate = true

        await prisma.dealStatusHistory.create({
          data: {
            dealId,
            previousStatus: existingDeal.status,
            newStatus:      dealStatus,
            reason:         `Atualizado por reprocessamento de planilha. Aba: ${sheetName}. ID externo: ${externalId || '—'}.`,
          },
        }).catch(() => {})
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await (prisma.deal as any).create({ data: { ...dealData, dealNumber } })
        dealId = created.id

        await prisma.dealStatusHistory.create({
          data: {
            dealId,
            newStatus: dealStatus,
            reason: `Negociação criada automaticamente a partir de dados importados da planilha. Origem: ${row.referenceMonth ?? sheetName}. ID externo: ${externalId || '—'}.`,
          },
        }).catch(() => {})
      }

      // ── 5. DealVehicle ──────────────────────────────────────────────────────
      if (vehicleId) {
        await ensureDealVehicle(dealId, vehicleId).catch(() => {})
      }

      // ── 6. Contract (financeiro) ────────────────────────────────────────────
      await upsertContract({
        tenantId,
        unitId,
        dealId,
        customerId,
        vehicleId,
        sellerId:      sellerRes.sellerId,
        saleValue,
        docValue,
        financedValue,
        bank,
        saleDate,
        dealType,
      }).catch(() => {})

      // ── 7. Pendências ───────────────────────────────────────────────────────
      let pendencyCount = 0

      // Pendência de status (veículo não entregue, aguardando doc, etc.)
      if (sellerRes.sellerId && hasPendencyKeyword(statusMain)) {
        const created = await createStatusPendency({
          tenantId,
          unitId,
          dealId,
          sellerId:     sellerRes.sellerId,
          customerId,
          vehicleId,
          customerName,
          plate,
          negotiation,
          statusMain,
          statusDetail,
          sheetName,
        }).catch(() => false)
        if (created) pendencyCount++
      }

      // Pendência administrativa de vendedor provisório
      if (sellerRes.isProvisional && sellerRes.sellerId) {
        await createProvisionalSellerPendency({
          tenantId,
          unitId,
          dealId,
          sellerId:     sellerRes.sellerId,
          customerName,
          plate,
          negotiation,
          warning:      sellerRes.warning ?? 'Vendedor vinculado provisoriamente.',
        }).catch(() => {})
        pendencyCount++
      }

      summary.pendenciesCreated += pendencyCount

      // ── 8. AuditLog ─────────────────────────────────────────────────────────
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId:   opts.triggeredById ?? undefined,
          action:   isUpdate ? 'UPDATE' : 'CREATE',
          entity:   'Deal',
          entityId: dealId,
          afterData: {
            externalId,
            customerName,
            sellerName:       sellerName ?? null,
            isSellerProvisional: sellerRes.isProvisional,
            source: 'SHEETS',
            sheetName,
          },
          status: 'SUCCESS',
        },
      }).catch(() => {})

      // ── Atualiza SheetImportRow ─────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.sheetImportRow as any).update({
        where: { id: row.id },
        data:  {
          status:         isUpdate ? 'NEGOCIACAO_ATUALIZADA' : 'NEGOCIACAO_CRIADA',
          dealId,
          warningMessage: sellerRes.warning ?? undefined,
          processedAt:    new Date(),
        },
      })

      if (isUpdate) summary.dealsUpdated++
      else          summary.dealsCreated++
      if (sellerRes.isProvisional) summary.provisionalSellers++

    } catch (err) {
      summary.errors++
      const msg = err instanceof Error ? err.message : String(err)
      summary.errorDetails.push(`[${externalId || row.id}] ${msg}`)

      if (!opts.dryRun) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.sheetImportRow as any).update({
          where: { id: row.id },
          data:  {
            status:       'ERRO',
            errorMessage: msg.slice(0, 500),
            processedAt:  new Date(),
          },
        }).catch(() => {})
      }
    }
  }

  summary.durationMs = Date.now() - startedAt
  return summary
}

// ── Processa uma linha de dados mapeados diretamente em Deal ─────────────────
// Reutilizado tanto por runDealProcessor (staging) quanto por
// runDealProcessorFromSheet (leitura direta da planilha).

interface RowData {
  externalId:    string
  customerName:  string
  sellerName:    string | undefined
  plate:         string | null
  vehicleModel:  string | undefined
  statusMain:    string
  statusDetail:  string | undefined
  saleDate:      Date | null
  saleValue:     number | null
  docValue:      number | null
  financedValue: number | null
  bank:          string | undefined
  returnType:    string | undefined
  dealType:      string
  sheetName:     string
  referenceMonth:string | undefined
  negotiation:   string | undefined
}

async function processRowIntoDeals(
  row:         RowData,
  tenantId:    string,
  unitId:      string,
  opts:        { dryRun?: boolean; triggeredById?: string },
  summary:     DealProcessorSummary,
  stagingId?:  string,   // SheetImportRow.id se existir
): Promise<void> {
  const dealType   = mapDealType(row.dealType || row.statusMain)
  const dealStatus = mapDealStatus(row.statusMain)

  // 1. Resolve vendedor
  const sellerRes = await resolveSellerWithFallback(row.sellerName, unitId)

  if (opts.dryRun) {
    summary.skipped++
    if (sellerRes.isProvisional) summary.provisionalSellers++
    return
  }

  // 2. Upsert Customer
  const customerId = await upsertCustomer(tenantId, row.customerName)

  // 3. Upsert Vehicle
  const vehicleId = await upsertVehicle(tenantId, unitId, row.plate, row.vehicleModel, customerId)

  // 4. Upsert Deal
  // Dedup primário: por externalId (funciona após migração).
  // Dedup secundário: por nota "ID externo: X" nas notas (funciona antes da migração).
  let existingDeal: { id: string; status: string } | null = null

  if (row.externalId) {
    // Tenta dedup via coluna externalId (pós-migração)
    existingDeal = await (prisma.deal as any)
      .findFirst({ where: { tenantId, externalId: row.externalId } })
      .catch(() => null)

    // Fallback: dedup via campo notes (pré-migração — evita duplicação ao reprocessar)
    if (!existingDeal) {
      existingDeal = await prisma.deal.findFirst({
        where: { tenantId, notes: { contains: `ID externo: ${row.externalId}` } },
      }).catch(() => null)
    }
  }

  const dealNotes = [
    `Negociação importada da planilha. Origem: ${row.referenceMonth ?? row.sheetName}.`,
    row.externalId          ? `ID externo: ${row.externalId}.`                          : null,
    sellerRes.isProvisional ? sellerRes.warning ?? 'Vendedor vinculado provisoriamente.' : null,
    row.returnType          ? `Tipo de retorno: ${row.returnType}.`                      : null,
  ].filter(Boolean).join('\n')

  // Campos base — sempre existem no schema original
  const baseDealData = {
    tenantId,
    unitId,
    sellerId:     sellerRes.sellerId ?? undefined,
    customerId:   customerId         ?? undefined,
    type:         dealType           as 'VENDA' | 'TROCA' | 'COMPRA' | 'CONSIGNACAO',
    status:       dealStatus         as 'EM_ANDAMENTO' | 'FINALIZADA' | 'CANCELADA',
    vehicleValue: row.saleValue !== null ? row.saleValue : undefined,
    notes:        dealNotes,
  }

  // Gera dealNumber único (campo adicionado pela migração)
  const dealYear  = new Date().getFullYear()
  const dealCount = await prisma.deal.count({ where: { tenantId } }).catch(() => 0)
  const dealNumber = `NEG-${dealYear}-${String(dealCount + 1).padStart(4, '0')}`

  // Campos extras (adicionados pela migração) — tentados mas não obrigatórios
  const extraDealFields = {
    saleDate:           row.saleDate      ?? undefined,
    externalId:         row.externalId    || undefined,
    sellerNameFromSheet:row.sellerName    ?? undefined,
    isSellerProvisional:sellerRes.isProvisional,
    source:             'PLANILHA',
    dealNumber:         existingDeal ? undefined : dealNumber,
  }

  let dealId: string
  let isUpdate = false

  if (existingDeal) {
    // Tenta atualizar com todos os campos; se falhar (pré-migração), usa só os base
    await (prisma.deal as any).update({
      where: { id: existingDeal.id },
      data:  { ...baseDealData, ...extraDealFields },
    }).catch(async () => {
      await prisma.deal.update({ where: { id: existingDeal!.id }, data: baseDealData })
    })

    dealId   = existingDeal.id
    isUpdate = true
    await prisma.dealStatusHistory.create({
      data: {
        dealId,
        previousStatus: existingDeal.status,
        newStatus:      dealStatus,
        reason: `Atualizado por reprocessamento de planilha. Aba: ${row.sheetName}. ID: ${row.externalId || '—'}.`,
      },
    }).catch(() => {})
  } else {
    // Tenta criar com todos os campos; se falhar (pré-migração), usa só os base
    const created: { id: string } = await (prisma.deal as any)
      .create({ data: { ...baseDealData, ...extraDealFields } })
      .catch(async () => prisma.deal.create({ data: baseDealData }))

    dealId = created.id
    await prisma.dealStatusHistory.create({
      data: {
        dealId,
        newStatus: dealStatus,
        reason: `Negociação criada automaticamente a partir de dados importados da planilha. Origem: ${row.referenceMonth ?? row.sheetName}. ID externo: ${row.externalId || '—'}.`,
      },
    }).catch(() => {})
  }

  // 5. DealVehicle
  if (vehicleId) await ensureDealVehicle(dealId, vehicleId).catch(() => {})

  // 6. Contract
  await upsertContract({
    tenantId, unitId, dealId, customerId, vehicleId,
    sellerId:      sellerRes.sellerId,
    saleValue:     row.saleValue,
    docValue:      row.docValue,
    financedValue: row.financedValue,
    bank:          row.bank,
    saleDate:      row.saleDate,
    dealType,
  }).catch(() => {})

  // 7. Pendências
  let pendencyCount = 0
  if (sellerRes.sellerId && hasPendencyKeyword(row.statusMain)) {
    const ok = await createStatusPendency({
      tenantId, unitId, dealId,
      sellerId:     sellerRes.sellerId,
      customerId, vehicleId,
      customerName: row.customerName,
      plate:        row.plate,
      negotiation:  row.negotiation,
      statusMain:   row.statusMain,
      statusDetail: row.statusDetail,
      sheetName:    row.sheetName,
    }).catch(() => false)
    if (ok) pendencyCount++
  }
  if (sellerRes.isProvisional && sellerRes.sellerId) {
    await createProvisionalSellerPendency({
      tenantId, unitId, dealId,
      sellerId:     sellerRes.sellerId,
      customerName: row.customerName,
      plate:        row.plate,
      negotiation:  row.negotiation,
      warning:      sellerRes.warning ?? 'Vendedor vinculado provisoriamente.',
    }).catch(() => {})
    pendencyCount++
  }
  summary.pendenciesCreated += pendencyCount

  // 8. AuditLog
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId:    opts.triggeredById ?? undefined,
      action:    isUpdate ? 'UPDATE' : 'CREATE',
      entity:    'Deal',
      entityId:  dealId,
      afterData: { externalId: row.externalId, customerName: row.customerName, source: 'SHEETS' },
      status:    'SUCCESS',
    },
  }).catch(() => {})

  // 9. Atualiza staging se existir
  if (stagingId) {
    await (prisma.sheetImportRow as any).update({
      where: { id: stagingId },
      data:  {
        status:         isUpdate ? 'NEGOCIACAO_ATUALIZADA' : 'NEGOCIACAO_CRIADA',
        dealId,
        warningMessage: sellerRes.warning ?? undefined,
        processedAt:    new Date(),
      },
    }).catch(() => {})
  }

  if (isUpdate) summary.dealsUpdated++
  else          summary.dealsCreated++
  if (sellerRes.isProvisional) summary.provisionalSellers++
}

// ── Resolve IDs reais de Tenant e Unit ───────────────────────────────────────
// O GoogleSheetConfig pode armazenar publicId ("AD-XXXX") ou name ("Loja X")
// em vez do CUID real. Esta função garante que usamos o id correto para FKs.

async function resolveConfigIds(
  rawTenantId: string,
  rawUnitId:   string,
): Promise<{ tenantId: string; unitId: string }> {
  // Detecta se parece um CUID (começa com 'c' e tem 25+ chars) ou não
  const isCuid = (s: string) => /^c[a-z0-9]{20,}$/.test(s)

  // Resolve tenant
  let tenantId = rawTenantId
  if (!isCuid(rawTenantId)) {
    const t = await prisma.tenant.findFirst({
      where: { OR: [{ publicId: rawTenantId }, { slug: rawTenantId }, { name: rawTenantId }] },
      select: { id: true },
    })
    if (t) tenantId = t.id
  }

  // Resolve unit
  let unitId = rawUnitId
  if (!isCuid(rawUnitId)) {
    const u = await prisma.unit.findFirst({
      where: { OR: [{ name: { equals: rawUnitId, mode: 'insensitive' } }, { id: rawUnitId }] },
      select: { id: true },
    })
    if (u) unitId = u.id
  }

  return { tenantId, unitId }
}

// ── Opções para leitura direta da planilha ────────────────────────────────────

export interface DealProcessorFromSheetOptions {
  configId:       string
  tabId?:         string   // undefined = todas as abas ativas
  dryRun?:        boolean
  triggeredById?: string
  maxRows?:       number
}

// ── Lê a planilha e processa cada linha como Deal (sem staging pré-existente) ─

export async function runDealProcessorFromSheet(
  opts: DealProcessorFromSheetOptions,
): Promise<DealProcessorSummary> {
  const startedAt = Date.now()
  const summary: DealProcessorSummary = {
    totalRows: 0, skipped: 0, dealsCreated: 0, dealsUpdated: 0,
    provisionalSellers: 0, pendenciesCreated: 0, errors: 0,
    errorDetails: [], durationMs: 0, dryRun: opts.dryRun ?? false,
  }

  // Carrega configuração
  const config = await prisma.googleSheetConfig.findUnique({
    where:   { id: opts.configId },
    include: {
      tabs: {
        where:   { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })
  if (!config)          throw new Error('Importador não encontrado.')
  if (!config.tenantId) throw new Error('Tenant não configurado no importador.')
  if (!config.unitId)   throw new Error('Unidade não configurada no importador.')
  if (!config.tabs || config.tabs.length === 0) throw new Error('Nenhuma aba ativa cadastrada.')

  // Resolve IDs reais de tenant e unit (o config pode guardar publicId ou name em vez do CUID)
  const resolvedIds = await resolveConfigIds(config.tenantId!, config.unitId!)
  const tenantId = resolvedIds.tenantId
  const unitId   = resolvedIds.unitId

  const mapping = (config.columnMapping ?? {}) as Record<string, string>
  const maxRows = opts.maxRows && opts.maxRows > 0 ? opts.maxRows : Infinity

  const activeTabs = opts.tabId
    ? config.tabs.filter(t => t.id === opts.tabId)
    : config.tabs

  const auth   = await buildGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  for (const tab of activeTabs) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range:         `${tab.sheetName}!A1:ZZ`,
      })

      const allRows  = response.data.values ?? []
      if (allRows.length < 2) continue

      const dataRows = allRows.slice(tab.headerRow ?? 1)
      let rowIndex   = tab.headerRow ?? 1

      for (const rawRow of dataRows) {
        if (summary.totalRows >= maxRows) break
        rowIndex++

        // Aplica mapeamento
        const mapped: Record<string, string> = {}
        Object.entries(mapping).forEach(([idx, field]) => {
          mapped[field] = String(rawRow[Number(idx)] ?? '').trim()
        })

        // Validações mínimas
        const negotiationId = mapped.negotiation || mapped.externalId || ''
        if (!negotiationId) continue
        if (!mapped.customerName && !mapped.unit) continue

        summary.totalRows++

        // Tenta salvar no staging (não bloqueante)
        let stagingId: string | undefined
        try {
          const dedupeKey = `${config.id}:${tab.sheetName}:${negotiationId}`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existingStaging: any = await (prisma.sheetImportRow as any).findFirst({ where: { dedupeKey } }).catch(() => null)

          const stagingData = {
            configId:      config.id,
            tabId:         tab.id,
            sheetName:     tab.sheetName,
            rowIndex,
            referenceMonth:tab.monthReference ?? undefined,
            rawData:       mapped,
            externalId:    negotiationId || undefined,
            dedupeKey,
            customerName:  mapped.customerName || mapped.unit || undefined,
            sellerName:    mapped.sellerName   || undefined,
            plate:         mapped.plate        || undefined,
            vehicleModel:  mapped.vehicle      || undefined,
            saleDate:      mapped.saleDate     || undefined,
            statusMain:    mapped.statusMain   || undefined,
            statusDetail:  mapped.statusDetail || undefined,
            saleValue:     mapped.saleValue    || undefined,
            docValue:      mapped.docValue     || undefined,
            financedValue: mapped.financedValue|| undefined,
            bank:          mapped.bank         || undefined,
            returnType:    mapped.returnType   || undefined,
            dealType:      mapped.dealType     || undefined,
            timeInStock:   mapped.timeInStock  || undefined,
            status:        'PROCESSANDO' as const,
            updatedAt:     new Date(),
          }

          if (existingStaging) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updated: any = await (prisma.sheetImportRow as any).update({
              where: { id: existingStaging.id },
              data:  { ...stagingData, errorMessage: null },
            }).catch(() => null)
            stagingId = updated?.id
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const created: any = await (prisma.sheetImportRow as any).create({ data: stagingData }).catch(() => null)
            stagingId = created?.id
          }
        } catch {
          // Staging opcional — não bloqueia o processamento
        }

        // Processa a linha
        try {
          const rowData: RowData = {
            externalId:    negotiationId,
            customerName:  mapped.customerName || mapped.unit || '(não informado)',
            sellerName:    mapped.sellerName   || undefined,
            plate:         normalizePlate(mapped.plate),
            vehicleModel:  mapped.vehicle      || undefined,
            statusMain:    mapped.statusMain   || '',
            statusDetail:  mapped.statusDetail || undefined,
            saleDate:      parseDateValue(mapped.saleDate),
            saleValue:     parseDecimalValue(mapped.saleValue),
            docValue:      parseDecimalValue(mapped.docValue),
            financedValue: parseDecimalValue(mapped.financedValue),
            bank:          mapped.bank         || undefined,
            returnType:    mapped.returnType   || undefined,
            dealType:      mapped.dealType     || '',
            sheetName:     tab.sheetName,
            referenceMonth:tab.monthReference  ?? undefined,
            negotiation:   negotiationId       || undefined,
          }

          await processRowIntoDeals(rowData, tenantId, unitId, opts, summary, stagingId)
        } catch (err) {
          summary.errors++
          const msg = err instanceof Error ? err.message : String(err)
          summary.errorDetails.push(`[${negotiationId}] ${msg}`)

          if (stagingId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.sheetImportRow as any).update({
              where: { id: stagingId },
              data:  { status: 'ERRO', errorMessage: msg.slice(0, 500), processedAt: new Date() },
            }).catch(() => {})
          }
        }
      }

      // Atualiza lastSync da aba
      if (!opts.dryRun) {
        await prisma.googleSheetTab.update({
          where: { id: tab.id },
          data:  { lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', totalRowsLast: dataRows.length },
        }).catch(() => {})
      }
    } catch (tabErr) {
      const msg = tabErr instanceof Error ? tabErr.message : String(tabErr)
      summary.errors++
      summary.errorDetails.push(`Aba ${tab.sheetName}: ${msg}`)
    }
  }

  summary.durationMs = Date.now() - startedAt
  return summary
}

// ── Estatísticas de linhas importadas ─────────────────────────────────────────

export async function getSheetRowStats(configId: string): Promise<SheetRowStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any[] = await (prisma.sheetImportRow as any).groupBy({
    by:    ['status'],
    where: { configId },
    _count:{ _all: true },
  })

  const countByStatus: Record<string, number> = {}
  for (const g of groups) countByStatus[g.status] = g._count._all

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastRow: any = await (prisma.sheetImportRow as any).findFirst({
    where:   { configId, processedAt: { not: null } },
    orderBy: { processedAt: 'desc' },
    select:  { processedAt: true },
  })

  return {
    total:           Object.values(countByStatus).reduce((a, b) => a + b, 0),
    pending:         countByStatus['PENDENTE']              ?? 0,
    dealCreated:     countByStatus['NEGOCIACAO_CRIADA']     ?? 0,
    dealUpdated:     countByStatus['NEGOCIACAO_ATUALIZADA'] ?? 0,
    waitingReview:   countByStatus['AGUARDANDO_CONFERENCIA']?? 0,
    error:           countByStatus['ERRO']                  ?? 0,
    ignored:         countByStatus['IGNORADA']              ?? 0,
    lastProcessedAt: lastRow?.processedAt?.toISOString()    ?? null,
  }
}
