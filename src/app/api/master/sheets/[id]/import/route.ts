// =============================================================================
// POST /api/master/sheets/[id]/import
// Importação real: lê abas ativas, deduplica por negociação, cria pendências.
// Registra ImportJob para rastreamento.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }     from '@/lib/master-guards'
import { prisma }            from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { google }            from 'googleapis'
import { buildGoogleAuth }   from '@/lib/google-auth'

// Classificação de tipo de pendência conforme planilha EasyCar
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
  const lower = (status ?? '').toLowerCase().trim()
  return TYPE_MAP[lower] ?? 'OUTRAS'
}

function buildDescription(row: Record<string, string>, tab: { sheetName: string; monthReference?: string | null }): string {
  const parts = [
    `Pendência importada da aba ${tab.monthReference ?? tab.sheetName}`,
    row.statusMain    ? `Status na origem: ${row.statusMain}`       : null,
    row.statusDetail  ? `Detalhe: ${row.statusDetail}`              : null,
    row.saleDate      ? `Data da venda: ${row.saleDate}`            : null,
    row.timeInStock   ? `TV: ${row.timeInStock}`                    : null,
    row.negotiation   ? `Negociação: #${row.negotiation}`           : null,
  ].filter(Boolean)
  return parts.join(' | ')
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error

  const startedAt = new Date()

  try {
    const config = await prisma.googleSheetConfig.findUnique({
      where:   { id: params.id },
      include: { tabs: { where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    })
    if (!config) return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })
    if (!config.tenantId) return NextResponse.json({ success: false, error: 'Tenant vinculado não configurado.' }, { status: 400 })
    if (!config.unitId)   return NextResponse.json({ success: false, error: 'Unidade vinculada não configurada.' }, { status: 400 })
    if (config.tabs.length === 0) return NextResponse.json({ success: false, error: 'Nenhuma aba ativa cadastrada.' }, { status: 400 })

    const body    = await req.json().catch(() => ({}))
    const tabId   = body.tabId as string | undefined   // se informado, importa só essa aba
    const dryRun  = body.dryRun === true               // true = não grava no banco

    const activeTabs = tabId
      ? config.tabs.filter(t => t.id === tabId)
      : config.tabs

    // Cria job de importação
    const job = await prisma.importJob.create({
      data: {
        configId:      config.id,
        triggeredById: session.id,
        status:        'PROCESSANDO',
        startedAt,
      },
    })

    const mapping = (config.columnMapping ?? {}) as Record<string, string>
    const auth    = buildGoogleAuth()
    const sheets  = google.sheets({ version: 'v4', auth })

    let totalRows     = 0
    let newRecords    = 0
    let updatedRecords = 0
    let errorRows     = 0
    const errors: string[] = []
    const sheetsRead: string[] = []
    const sheetsNotFound: string[] = []

    for (const tab of activeTabs) {
      try {
        const range    = `${tab.sheetName}!A1:Z`
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: config.spreadsheetId,
          range,
        })

        sheetsRead.push(tab.sheetName)
        const rows = response.data.values ?? []
        if (rows.length < 2) continue

        const dataRows = rows.slice(tab.headerRow ?? 1)

        for (const rawRow of dataRows) {
          totalRows++

          // Aplica mapeamento de colunas
          const row: Record<string, string> = {}
          Object.entries(mapping).forEach(([idx, field]) => {
            row[field] = String(rawRow[Number(idx)] ?? '').trim()
          })

          // Ignora linha sem negociação
          if (!row.negotiation) { errorRows++; continue }
          // Ignora linha sem cliente
          if (!row.customerName && !row.unit) { errorRows++; continue }

          const dedupeField = (config.dedupeField ?? 'negotiation') as keyof typeof row
          const dedupeValue = row[dedupeField]
          if (!dedupeValue) { errorRows++; continue }

          if (dryRun) { newRecords++; continue }

          try {
            // Busca responsável pelo nome
            let responsibleId: string | null = null
            if (row.sellerName) {
              const seller = await prisma.seller.findFirst({
                where: { fullName: { contains: row.sellerName, mode: 'insensitive' } },
              })
              responsibleId = seller?.id ?? null
            }

            // Deduplicação por chave configurada dentro do tenant
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
                  vehicle:      row.vehicle   || existing.vehicle,
                  description:  buildDescription(row, tab),
                  source:       'SHEETS',
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

        // Atualiza lastSync da aba
        if (!dryRun) {
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

    const finishedAt = new Date()

    // Atualiza job
    await prisma.importJob.update({
      where: { id: job.id },
      data:  {
        status:         errors.length > 0 || sheetsNotFound.length > 0 ? 'CONCLUIDO_COM_ERROS' : 'CONCLUIDO',
        totalRows,
        newRecords,
        updatedRecords,
        errorRows,
        errors:         errors.length > 0 ? errors : undefined,
        finishedAt,
      },
    })

    // Atualiza lastSyncAt do config
    if (!dryRun) {
      await prisma.googleSheetConfig.update({
        where: { id: config.id },
        data:  { lastSyncAt: new Date(), syncStatus: 'SUCCESS' },
      }).catch(() => {})
    }

    return NextResponse.json({
      success:        true,
      dryRun,
      message:        dryRun ? `Simulação concluída.` : `Importação concluída.`,
      jobId:          job.id,
      totalRows,
      newRecords,
      updatedRecords,
      errorRows,
      sheetsRead,
      sheetsNotFound,
      errors:         errors.slice(0, 20),
      startedAt:      startedAt.toISOString(),
      finishedAt:     finishedAt.toISOString(),
      durationMs:     finishedAt.getTime() - startedAt.getTime(),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
