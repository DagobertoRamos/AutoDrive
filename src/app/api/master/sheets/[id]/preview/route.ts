// =============================================================================
// POST /api/master/sheets/[id]/preview
// Lê as primeiras linhas de uma aba e mostra como seriam mapeadas.
// Não grava nada no banco — apenas visualização.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { prisma }          from '@/lib/prisma'
import { google }          from 'googleapis'
import { buildGoogleAuth } from '@/lib/google-auth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const body  = await req.json().catch(() => ({}))
    const tabId = body.tabId as string | undefined
    const limit = Math.min(Number(body.limit ?? 10), 50)

    const config = await prisma.googleSheetConfig.findUnique({
      where:   { id: params.id },
      include: { tabs: true },
    })
    if (!config) return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })

    const tab = tabId
      ? config.tabs.find(t => t.id === tabId)
      : config.tabs.find(t => t.active)

    if (!tab) return NextResponse.json({ success: false, error: 'Nenhuma aba selecionada ou ativa.' }, { status: 400 })

    const auth   = buildGoogleAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Tenta pelo nome da aba
    const range    = `${tab.sheetName}!A1:Z${(tab.headerRow ?? 1) + limit}`
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range,
    })

    const rows    = response.data.values ?? []
    const headers = rows[tab.headerRow - 1] ?? []
    const data    = rows.slice(tab.headerRow)

    // Aplica mapeamento de colunas
    const mapping     = (config.columnMapping ?? {}) as Record<string, string>
    const FIELD_LABELS: Record<string, string> = {
      unit:         'Loja',
      saleDate:     'Data da Venda',
      sellerName:   'Vendedor',
      plate:        'Placa',
      vehicle:      'Veículo',
      timeInStock:  'Tempo em Estoque',
      statusMain:   'Status/Pendência',
      statusDetail: 'Detalhe',
      negotiation:  'Negociação',
      customerName: 'Cliente',
    }

    const columnDefs = Object.entries(mapping).map(([idx, field]) => ({
      index:       Number(idx),
      field:       field as string,
      label:       FIELD_LABELS[field as string] ?? field,
      headerValue: headers[Number(idx)] ?? `Col ${idx}`,
    }))

    const preview = data.slice(0, limit).map((row, rowIdx) => {
      const mapped: Record<string, string> = { _row: String(rowIdx + tab.headerRow + 1) }
      columnDefs.forEach(({ index, field }) => {
        mapped[field] = String(row[index] ?? '').trim()
      })
      return mapped
    })

    return NextResponse.json({
      success:    true,
      tab:        { id: tab.id, sheetName: tab.sheetName, gid: tab.gid },
      columnDefs,
      preview,
      totalRowsShown: data.length,
      headers,
    })
  } catch (err) {
    const e = err as { message?: string; code?: string | number }
    return NextResponse.json(
      { success: false, error: e.message ?? 'Erro ao ler planilha.', errorCode: String(e.code ?? 'ERROR') },
      { status: 502 },
    )
  }
}
