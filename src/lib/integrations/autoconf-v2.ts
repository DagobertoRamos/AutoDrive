// =============================================================================
// autoconf-v2.ts — Pipeline V2 do importador AutoConf (Fase 2).
// Consome o v2Snapshot vindo da extensão e faz upsert POR-FILHO por externalId
// + sourceHash por seção. Se a seção não mudou entre imports, PULA — nada de
// deleteMany+createMany, nada de recálculo de comissão. Elimina churn/ruído.
// Aditivo: se o v2Snapshot for ausente, se a migration V2 não foi aplicada
// (colunas externalId/sourceSectionHashes ainda não existem), OU se qualquer
// operação falhar, retorna null e o caller usa o pipeline legado.
// =============================================================================

import { createHash } from 'crypto'
import type { Prisma, PrismaClient } from '@prisma/client'

type Tx = Prisma.TransactionClient

// ── Tipos do snapshot (espelham autoconf-extension/snapshot.js) ─────────────
export interface V2VehicleSnap {
  externalId?: string | null
  papel?: string | null            // SAIDA | ENTRADA | DESCONHECIDO
  origem?: string | null           // ESTOQUE | AVALIACAO
  placa?: string | null
  ano?: number | null
  valor?: number | null
  photos?: Array<{ uuid: string; urls: Record<string, string> }> | null
  partial?: boolean
}
export interface V2DebtSnap {
  externalId?: string | null
  vehicleExternalId?: string | null
  externalTipoDebitoId?: string | null
  tipoLabel?: string | null
  externalFornecedorId?: string | null
  fornecedorLabel?: string | null
  externalProdutoId?: string | null
  produtoLabel?: string | null
  valor?: number | null
  desconto?: number | null
  quemPaga?: string | null // LOJA | CLIENTE
  observacao?: string | null
  partial?: boolean
}
export interface V2PaymentSnap {
  externalId?: string | null
  tipo?: string | null // PIX | FINANCIAMENTO | DINHEIRO | …
  valor?: number | null
  bancoLabel?: string | null
  bancoExternalId?: string | null
  chavePix?: string | null
  qtdeParcelas?: number | null
  valorParcela?: number | null
  prazoEntreParcelas?: number | null
  ila?: number | null
  irrf?: number | null
  valorRetorno?: number | null
  sinal?: boolean
  dataBaseIso?: string | null
  dataLimiteReserva?: string | null
  vehicleExternalId?: string | null
  partial?: boolean
}
export interface V2Snapshot {
  schemaVersion?: number
  sourceSystem?: string
  externalNegotiationId?: string
  fetchedAt?: string
  partial?: boolean
  vehicles?: V2VehicleSnap[]
  debits?: V2DebtSnap[]
  payments?: V2PaymentSnap[]
  history?: Array<{ externalId?: string; usuarioNome?: string | null; dataLabel?: string | null; resumo?: string | null }>
  catalogos?: {
    tiposDebito?: Array<{ value?: string; label?: string }> | null
    fornecedores?: Array<{ value?: string; label?: string }> | null
    produtosGestauto?: Array<{ value?: string; label?: string }> | null
  }
}

// ── Hash determinístico por seção ────────────────────────────────────────────
// Ignora metadados voláteis (fetchedAt, source, actionUrls, previews) para não
// invalidar a seção quando NADA de fato mudou no conteúdo.
const _VOLATILE_KEYS = new Set(['fetchedAt', 'source', 'sourceSystem', 'partial', 'actionUrls', '_cardTextPreview', 'papelSource', 'fotosThumb'])

function _stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(_stableStringify).join(',') + ']'
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).filter((k) => !_VOLATILE_KEYS.has(k)).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + _stableStringify((v as Record<string, unknown>)[k])).join(',') + '}'
  }
  return 'null'
}

export function sectionHash(section: unknown): string {
  return createHash('sha256').update(_stableStringify(section)).digest('hex').slice(0, 32)
}

// ── Categoria canônica a partir do rótulo do AutoConf ────────────────────────
function _guessCanonicalCategory(tipoLabel: string | null | undefined): string {
  const s = (tipoLabel || '').toLowerCase()
  if (!s) return 'OTHER'
  if (/gestauto|garantia|seguro/.test(s)) return 'WARRANTY'
  if (/document|dut|crlv|atpv|despach|cart[oó]rio/.test(s)) return 'DOCUMENTATION'
  if (/quita[cç][aã]o|financi|alien/.test(s)) return 'FINANCING_PAYOFF'
  if (/per[ií]cia|laudo|ecv/.test(s)) return 'INSPECTION'
  if (/licenc/.test(s)) return 'LICENSING'
  if (/ipva|imposto/.test(s)) return 'TAX'
  if (/multa/.test(s)) return 'FINE'
  if (/acess[oó]rio|instala[cç]/.test(s)) return 'ACCESSORY'
  if (/servi[cç]o|taxa|combust|corre|placa|chave/.test(s)) return 'SERVICE'
  return 'OTHER'
}

// ── Detecção de suporte à V2 no banco (migration aplicada?) ─────────────────
// Fazemos uma leitura ultra-barata em uma linha existente para verificar que a
// coluna sourceSectionHashes existe. Se falhar, retornamos false e o caller
// usa o pipeline legado. Isso desacopla o deploy do código do apply da migration.
let _v2SchemaSupported: boolean | null = null
async function _isV2SchemaSupported(prisma: PrismaClient): Promise<boolean> {
  if (_v2SchemaSupported !== null) return _v2SchemaSupported
  try {
    await prisma.$queryRaw`SELECT "sourceSectionHashes" FROM "deals" LIMIT 1`
    _v2SchemaSupported = true
  } catch {
    _v2SchemaSupported = false
  }
  return _v2SchemaSupported
}

// ── Upsert de veículo por externalId ─────────────────────────────────────────
async function _upsertVehicle(tx: Tx, dealId: string, source: string, v: V2VehicleSnap, roleFallback: string): Promise<'created' | 'updated'> {
  const role = v.papel === 'SAIDA' ? 'VENDIDO' : v.papel === 'ENTRADA' ? 'TROCA' : roleFallback
  const photos = Array.isArray(v.photos) && v.photos.length ? v.photos : undefined
  const data = {
    role,
    plate: v.placa ?? null,
    agreedValue: typeof v.valor === 'number' ? v.valor : null,
    year: typeof v.ano === 'number' ? v.ano : null,
    ...(photos ? { photos } : {}),
  }
  const existing = v.externalId
    ? await tx.dealVehicle.findFirst({ where: { dealId, source, externalId: v.externalId }, select: { id: true } })
    : null
  if (existing) {
    await tx.dealVehicle.update({ where: { id: existing.id }, data })
    return 'updated'
  }
  await tx.dealVehicle.create({ data: { dealId, source, externalId: v.externalId ?? null, ...data } })
  return 'created'
}

// ── Upsert de débito por externalId ──────────────────────────────────────────
function _normalizeDebtType(label: string | null | undefined): string {
  const s = (label || '').toUpperCase()
  if (s.includes('MULTA')) return 'MULTA'
  if (s.includes('IPVA')) return 'IPVA'
  if (s.includes('LICENC')) return 'LICENCIAMENTO'
  if (/FINANCI|QUITAC|ALIENAC/.test(s)) return 'FINANCIAMENTO'
  if (/DOC|GESTAUTO/.test(s)) return s.includes('GESTAUTO') ? 'GARANTIA' : 'DOCUMENTACAO'
  return 'OUTROS'
}

async function _upsertDebt(tx: Tx, dealId: string, source: string, d: V2DebtSnap): Promise<'created' | 'updated' | 'skipped'> {
  const value = typeof d.valor === 'number' ? d.valor : null
  if (!value || value <= 0) return 'skipped'
  const data = {
    type: _normalizeDebtType(d.tipoLabel),
    description: (d.tipoLabel ?? '').slice(0, 180) || null,
    value,
    responsavel: d.quemPaga === 'CLIENTE' ? 'COMPRADOR' : (d.quemPaga === 'LOJA' ? 'LOJA' : 'LOJA'),
    notes: [d.fornecedorLabel ? `Fornecedor: ${d.fornecedorLabel}` : null, d.produtoLabel ? `Produto: ${d.produtoLabel}` : null, d.observacao].filter(Boolean).join(' | ').slice(0, 800) || null,
  }
  const existing = d.externalId
    ? await tx.dealDebt.findFirst({ where: { dealId, source, externalId: d.externalId }, select: { id: true } })
    : null
  if (existing) {
    await tx.dealDebt.update({ where: { id: existing.id }, data })
    return 'updated'
  }
  await tx.dealDebt.create({ data: { dealId, source, externalId: d.externalId ?? null, ...data } })
  return 'created'
}

// ── Upsert de pagamento por externalId ───────────────────────────────────────
async function _upsertPayment(tx: Tx, tenantId: string, dealId: string, source: string, p: V2PaymentSnap): Promise<'created' | 'updated' | 'skipped'> {
  const value = typeof p.valor === 'number' ? p.valor : null
  if (!value || value <= 0) return 'skipped'
  const status = p.tipo === 'PIX' && p.dataBaseIso ? 'CONFIRMADO' : 'PENDENTE'
  const notes = [
    p.tipo === 'PIX' && p.sinal ? 'Sinal de negócio' : null,
    p.dataLimiteReserva ? `Limite reserva: ${p.dataLimiteReserva}` : null,
    p.tipo === 'FINANCIAMENTO' && p.ila ? `ILA=${p.ila}` : null,
    p.tipo === 'FINANCIAMENTO' && p.irrf ? `IRRF=${p.irrf}` : null,
    p.tipo === 'FINANCIAMENTO' && p.valorRetorno ? `Retorno bruto=${p.valorRetorno}` : null,
  ].filter(Boolean).join(' | ').slice(0, 800) || null
  const data = {
    tenantId,
    type: p.tipo || 'OUTROS',
    status,
    value,
    bank: p.bancoLabel ?? null,
    pixKey: p.chavePix ?? null,
    installments: typeof p.qtdeParcelas === 'number' ? p.qtdeParcelas : null,
    installmentValue: typeof p.valorParcela === 'number' ? p.valorParcela : null,
    installmentIntervalDays: typeof p.prazoEntreParcelas === 'number' ? p.prazoEntreParcelas : null,
    paidAt: p.dataBaseIso ? new Date(p.dataBaseIso) : null,
    notes,
  }
  const existing = p.externalId
    ? await tx.dealPayment.findFirst({ where: { dealId, source, externalId: p.externalId }, select: { id: true } })
    : null
  if (existing) {
    await tx.dealPayment.update({ where: { id: existing.id }, data })
    return 'updated'
  }
  await tx.dealPayment.create({ data: { dealId, source, externalId: p.externalId ?? null, ...data } })
  return 'created'
}

// ── Catálogo canônico (AutoconfProductMap) ───────────────────────────────────
// Popula na primeira aparição de cada par (externalTipoDebitoId, externalProdutoId).
// Nunca sobrescreve mapeamento confirmado pelo admin (autoMapped=false + canonicalCategory
// já ajustado); só atualiza lastSeenAt e o rótulo se mudou.
async function _upsertCatalogEntry(tx: Tx, tenantId: string, tipoId: string | null | undefined, produtoId: string | null | undefined, label: string): Promise<void> {
  if (!tipoId && !produtoId) return
  const cat = _guessCanonicalCategory(label)
  const now = new Date()
  const existing = await tx.autoconfProductMap.findFirst({
    where: {
      tenantId,
      sourceSystem: 'AUTOCONF',
      externalTipoDebitoId: tipoId ?? null,
      externalProdutoId: produtoId ?? null,
    },
    select: { id: true, autoMapped: true, canonicalCategory: true },
  })
  if (existing) {
    // Só atualiza campos "informativos"; não sobrescreve mapeamento confirmado.
    await tx.autoconfProductMap.update({
      where: { id: existing.id },
      data: {
        externalLabel: label.slice(0, 200),
        lastSeenAt: now,
        // Só re-aplica canonicalCategory se o mapeamento é automático (nunca confirmado pelo admin)
        ...(existing.autoMapped ? { canonicalCategory: cat } : {}),
      },
    })
    return
  }
  await tx.autoconfProductMap.create({
    data: {
      tenantId,
      sourceSystem: 'AUTOCONF',
      externalTipoDebitoId: tipoId ?? null,
      externalProdutoId: produtoId ?? null,
      externalLabel: label.slice(0, 200),
      canonicalCategory: cat,
      autoMapped: true,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  })
}

// ── Orquestrador: aplica v2Snapshot com upsert por-filho + sourceHash ────────
export interface V2ApplyResult {
  ok: true
  sectionsChanged: string[]
  sectionsSkipped: string[]
  commissionShouldRecalculate: boolean
  hashes: Record<string, string>
  counts: { vehiclesCreated: number; vehiclesUpdated: number; vehiclesWithPhotos: number; paymentsCreated: number; paymentsUpdated: number; debitsCreated: number; debitsUpdated: number; catalogEntries: number }
}

export async function applyV2Snapshot(
  prisma: PrismaClient,
  tx: Tx,
  args: {
    dealId: string
    tenantId: string
    snapshot: V2Snapshot
    existingHashes: Record<string, string> | null
    dealType: 'VENDA' | 'COMPRA' | 'TROCA' | 'CONSIGNACAO' | string
  },
): Promise<V2ApplyResult | null> {
  // Se o schema não suporta ainda, deixamos o legado assumir.
  if (!(await _isV2SchemaSupported(prisma))) return null

  const { dealId, tenantId, snapshot, existingHashes, dealType } = args
  const source = 'AUTOCONF'

  const vehiclesHash = sectionHash(snapshot.vehicles ?? [])
  const debitsHash = sectionHash(snapshot.debits ?? [])
  const paymentsHash = sectionHash(snapshot.payments ?? [])
  const historyHash = sectionHash(snapshot.history ?? [])
  const newHashes = {
    vehicles: vehiclesHash,
    debits: debitsHash,
    payments: paymentsHash,
    history: historyHash,
  }

  const sectionsChanged: string[] = []
  const sectionsSkipped: string[] = []
  const counts = { vehiclesCreated: 0, vehiclesUpdated: 0, vehiclesWithPhotos: 0, paymentsCreated: 0, paymentsUpdated: 0, debitsCreated: 0, debitsUpdated: 0, catalogEntries: 0 }

  const roleFallback = dealType === 'COMPRA' ? 'COMPRADO' : dealType === 'CONSIGNACAO' ? 'CONSIGNADO' : 'VENDIDO'

  // ── Veículos ────────────────────────────────────────────────────────────
  if (existingHashes?.vehicles === vehiclesHash) {
    sectionsSkipped.push('vehicles')
  } else if (Array.isArray(snapshot.vehicles) && snapshot.vehicles.some((v) => v?.externalId)) {
    for (const v of snapshot.vehicles) {
      if (v?.partial || !v?.externalId) continue
      const r = await _upsertVehicle(tx, dealId, source, v, roleFallback)
      if (r === 'created') counts.vehiclesCreated++
      else counts.vehiclesUpdated++
      if (Array.isArray(v.photos) && v.photos.length) counts.vehiclesWithPhotos++
    }
    sectionsChanged.push('vehicles')
  } else {
    // Sem IDs externos ainda (snapshot parcial): deixa o pipeline legado assumir
    // esta seção. Marca skipped p/ o caller decidir.
    sectionsSkipped.push('vehicles')
  }

  // ── Débitos ─────────────────────────────────────────────────────────────
  if (existingHashes?.debits === debitsHash) {
    sectionsSkipped.push('debits')
  } else if (Array.isArray(snapshot.debits) && snapshot.debits.some((d) => d?.externalId)) {
    for (const d of snapshot.debits) {
      if (d?.partial || !d?.externalId) continue
      const r = await _upsertDebt(tx, dealId, source, d)
      if (r === 'created') counts.debitsCreated++
      else if (r === 'updated') counts.debitsUpdated++
      if (d.externalTipoDebitoId || d.externalProdutoId) {
        await _upsertCatalogEntry(tx, tenantId, d.externalTipoDebitoId, d.externalProdutoId, d.tipoLabel || d.produtoLabel || 'OUTROS')
        counts.catalogEntries++
      }
    }
    sectionsChanged.push('debits')
  } else {
    sectionsSkipped.push('debits')
  }

  // ── Pagamentos ──────────────────────────────────────────────────────────
  if (existingHashes?.payments === paymentsHash) {
    sectionsSkipped.push('payments')
  } else if (Array.isArray(snapshot.payments) && snapshot.payments.some((p) => p?.externalId)) {
    for (const p of snapshot.payments) {
      if (p?.partial || !p?.externalId) continue
      const r = await _upsertPayment(tx, tenantId, dealId, source, p)
      if (r === 'created') counts.paymentsCreated++
      else if (r === 'updated') counts.paymentsUpdated++
    }
    sectionsChanged.push('payments')
  } else {
    sectionsSkipped.push('payments')
  }

  // ── Histórico (apenas hash — persistência real fica pra Fase 3+ com tabela dedicada) ──
  if (existingHashes?.history === historyHash) sectionsSkipped.push('history')
  else sectionsChanged.push('history')

  // ── Grava hashes atualizados no Deal ────────────────────────────────────
  await tx.deal.update({ where: { id: dealId }, data: { sourceSectionHashes: newHashes as never } })

  // Comissão só precisa recalcular se veículo/pagamento/débito mudaram
  // (histórico e catálogo são informativos, não afetam cálculo).
  const commissionShouldRecalculate = ['vehicles', 'debits', 'payments'].some((s) => sectionsChanged.includes(s))

  return {
    ok: true,
    sectionsChanged,
    sectionsSkipped,
    commissionShouldRecalculate,
    hashes: newHashes,
    counts,
  }
}
