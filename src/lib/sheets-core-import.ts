// =============================================================================
// src/lib/sheets-core-import.ts
// Lógica central de importação do Google Sheets.
// Usada tanto pelo endpoint manual (/api/master/sheets/[id]/import)
// quanto pelo auto-sync (/api/master/sheets/[id]/auto-sync/run e cron).
// =============================================================================

import { prisma }          from '@/lib/prisma'
import { google }          from 'googleapis'
import { buildGoogleAuth } from '@/lib/google-auth'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface CoreImportOptions {
  configId:        string
  tabId?:          string    // undefined = todas as abas ativas
  dryRun?:         boolean
  maxRows?:        number    // 0 = sem limite
  triggeredById?:  string    // userId (para ImportJob)
}

export interface CoreImportSummary {
  totalRows:      number
  newRecords:     number
  updatedRecords: number
  errorRows:      number
  sheetsRead:     string[]
  sheetsNotFound: string[]
  errors:         string[]
  durationMs:     number
}

// ── Mapeamento de tipos de pendência ──────────────────────────────────────────

const TYPE_MAP: Record<string, string> = {
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

function classifyType(status: string): string {
  return TYPE_MAP[(status ?? '').toLowerCase().trim()] ?? 'OUTRAS'
}

function buildDescription(
  row: Record<string, string>,
  tab: { sheetName: string; monthReference?: string | null },
): string {
  return [
    `Pendência importada da aba ${tab.monthReference ?? tab.sheetName}`,
    row.statusMain   ? `Status na origem: ${row.statusMain}`   : null,
    row.statusDetail ? `Detalhe: ${row.statusDetail}`          : null,
    row.saleDate     ? `Data da venda: ${row.saleDate}`        : null,
    row.timeInStock  ? `TV: ${row.timeInStock}`                : null,
    row.negotiation  ? `Negociação: #${row.negotiation}`       : null,
  ].filter(Boolean).join(' | ')
}

// ── Função principal ──────────────────────────────────────────────────────────

export async function runCoreImport(opts: CoreImportOptions): Promise<CoreImportSummary> {
  const startedAt = new Date()

  const config = await prisma.googleSheetConfig.findUnique({
    where:   { id: opts.configId },
    include: {
      tabs: {
        where:   { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  if (!config)           throw new Error('Importador não encontrado.')
  if (!config.tenantId)  throw new Error('Tenant vinculado não configurado.')
  if (!config.unitId)    throw new Error('Unidade vinculada não configurada.')
  if (config.tabs.length === 0) throw new Error('Nenhuma aba ativa cadastrada.')

  const activeTabs = opts.tabId
    ? config.tabs.filter(t => t.id === opts.tabId)
    : config.tabs

  const mapping    = (config.columnMapping ?? {}) as Record<string, string>
  const auth       = buildGoogleAuth()
  const sheets     = google.sheets({ version: 'v4', auth })
  const maxRows    = opts.maxRows && opts.maxRows > 0 ? opts.maxRows : Infinity

  let totalRows      = 0
  let newRecords     = 0
  let updatedRecords = 0
  let errorRows      = 0
  const errors:         string[] = []
  const sheetsRead:     string[] = []
  const sheetsNotFound: string[] = []

  for (const tab of activeTabs) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range:         `${tab.sheetName}!A1:Z`,
      })

      sheetsRead.push(tab.sheetName)
      const rows     = response.data.values ?? []
      if (rows.length < 2) continue

      const dataRows = rows.slice(tab.headerRow ?? 1)

      for (const rawRow of dataRows) {
        if (totalRows >= maxRows) break
        totalRows++

        const row: Record<string, string> = {}
        Object.entries(mapping).forEach(([idx, field]) => {
          row[field] = String(rawRow[Number(idx)] ?? '').trim()
        })

        if (!row.negotiation) { errorRows++; continue }
        if (!row.customerName && !row.unit) { errorRows++; continue }

        const dedupeField = (config.dedupeField ?? 'negotiation') as keyof typeof row
        const dedupeValue = row[dedupeField]
        if (!dedupeValue) { errorRows++; continue }

        if (opts.dryRun) { newRecords++; continue }

        try {
          let responsibleId: string | null = null
          if (row.sellerName) {
            const seller = await prisma.seller.findFirst({
              where: { fullName: { contains: row.sellerName, mode: 'insensitive' } },
            })
            responsibleId = seller?.id ?? null
          }

          const existing = await prisma.pendency.findFirst({
            where: {
              tenantId:    config.tenantId,
              negotiation: row.negotiation,
              status:      { notIn: ['FINALIZADA', 'CANCELADA'] },
            },
          })

          if (existing) {
            await prisma.pendency.update({
              where: { id: existing.id },
              data:  {
                vehicle:     row.vehicle || existing.vehicle,
                description: buildDescription(row, tab),
                source:      'SHEETS',
              },
            })
            updatedRecords++
          } else {
            await prisma.pendency.create({
              data: {
                tenantId:       config.tenantId,
                unitId:         config.unitId!,
                customerName:   row.customerName || row.unit || '(não informado)',
                plate:          row.plate || null,
                vehicle:        row.vehicle || null,
                negotiation:    row.negotiation,
                responsibleId:  responsibleId ?? undefined,
                description:    buildDescription(row, tab),
                type:           classifyType(row.statusMain),
                priority:       'MEDIA',
                status:         'ABERTA',
                source:         'SHEETS',
                referenceMonth: tab.monthReference ?? null,
                allowedDays:    [],
                originModule:   'SHEETS',
                originRecordId: `${tab.sheetName}:${row.negotiation}`,
              },
            })
            newRecords++
          }
        } catch (rowErr) {
          errorRows++
          errors.push(`Linha (neg: ${row.negotiation}): ${String(rowErr)}`)
        }
      }

      if (!opts.dryRun) {
        await prisma.googleSheetTab.update({
          where: { id: tab.id },
          data:  { lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', totalRowsLast: dataRows.length },
        }).catch(() => {})
      }
    } catch (tabErr) {
      const msg = tabErr instanceof Error ? tabErr.message : String(tabErr)
      if (msg.includes('Unable to parse range') || msg.includes('not found')) {
        sheetsNotFound.push(tab.sheetName)
      } else {
        errors.push(`Aba ${tab.sheetName}: ${msg}`)
      }
      await prisma.googleSheetTab.update({
        where: { id: tab.id },
        data:  { lastSyncAt: new Date(), lastSyncStatus: 'ERROR', lastSyncError: msg },
      }).catch(() => {})
    }
  }

  if (!opts.dryRun) {
    await prisma.googleSheetConfig.update({
      where: { id: config.id },
      data:  { lastSyncAt: new Date(), syncStatus: errors.length > 0 ? 'ERROR' : 'SUCCESS' },
    }).catch(() => {})
  }

  return {
    totalRows,
    newRecords,
    updatedRecords,
    errorRows,
    sheetsRead,
    sheetsNotFound,
    errors:     errors.slice(0, 50),
    durationMs: Date.now() - startedAt.getTime(),
  }
}

// ── Helper: calcula próxima execução ─────────────────────────────────────────

export function computeNextRunAt(
  frequencyMinutes: number,
  allowedDays: number[],
  startTime: string,
  endTime: string,
  fromNow: Date = new Date(),
): Date | null {
  if (!allowedDays.length) return null

  const [startH, startM] = startTime.split(':').map(Number)
  const [endH,   endM  ] = endTime.split(':').map(Number)

  // Tenta até 7 dias à frente
  for (let d = 0; d < 7 * 24 * 60; d += frequencyMinutes) {
    const candidate = new Date(fromNow.getTime() + d * 60_000)
    const dayOfWeek = candidate.getDay()
    const h = candidate.getHours()
    const m = candidate.getMinutes()
    const minOfDay = h * 60 + m

    if (!allowedDays.includes(dayOfWeek)) continue
    if (minOfDay < startH * 60 + startM)  continue
    if (minOfDay > endH * 60 + endM)       continue

    return candidate
  }

  return null
}
