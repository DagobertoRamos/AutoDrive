// =============================================================================
// POST /api/master/sheets/[id]/test
// Testa acesso à planilha principal + aba específica (por GID ou nome).
// Não importa dados. Apenas verifica conectividade.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { prisma }          from '@/lib/prisma'
import { google }          from 'googleapis'
import { buildGoogleAuth } from '@/lib/google-auth'

export async function POST(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { error } = await requireMaster()
  if (error) return error

  const start = Date.now()

  try {
    const config = await prisma.googleSheetConfig.findUnique({
      where:   { id: params.id },
      include: { tabs: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
    })
    if (!config) return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })

    const body      = await req.json().catch(() => ({}))
    const tabId     = body.tabId as string | undefined
    const targetTab = tabId ? config.tabs.find(t => t.id === tabId) : null

    const auth   = await buildGoogleAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Testa acesso à planilha principal
    const spreadsheetMeta = await sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
    })

    const spreadsheetTitle  = spreadsheetMeta.data.properties?.title ?? '(sem título)'
    const availableSheets   = spreadsheetMeta.data.sheets?.map(s => ({
      title: s.properties?.title,
      gid:   String(s.properties?.sheetId ?? ''),
    })) ?? []

    const responseMs = Date.now() - start

    if (!targetTab) {
      // Apenas testou a planilha principal
      return NextResponse.json({
        success:    true,
        message:    `Acesso à planilha confirmado.`,
        spreadsheetTitle,
        totalSheets:   availableSheets.length,
        availableSheets,
        responseMs,
      })
    }

    // Testa aba específica — primeiro por GID, depois por nome
    const matchByGid  = availableSheets.find(s => s.gid === targetTab.gid)
    const matchByName = availableSheets.find(s => s.title === targetTab.sheetName)
    const match       = matchByGid ?? matchByName

    if (!match) {
      return NextResponse.json({
        success:    false,
        error:      `Aba "${targetTab.sheetName}" (GID: ${targetTab.gid ?? '—'}) não encontrada na planilha.`,
        errorCode:  'TAB_NOT_FOUND',
        availableSheets,
        responseMs: Date.now() - start,
      })
    }

    // Lê as primeiras 3 linhas para confirmar acesso
    const range   = `${match.title}!A1:Z3`
    const preview = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range,
    })
    const rows = preview.data.values ?? []

    return NextResponse.json({
      success:    true,
      message:    `Aba "${match.title}" acessada com sucesso.`,
      tab:        { name: match.title, gid: match.gid },
      headerRow:  rows[0] ?? [],
      sampleRows: rows.slice(1),
      responseMs: Date.now() - start,
    })
  } catch (err) {
    const e = err as { message?: string; code?: string | number; status?: number }
    return NextResponse.json(
      {
        success:      false,
        error:        e.message ?? 'Erro ao acessar a planilha.',
        errorCode:    String(e.code ?? 'GOOGLE_API_ERROR'),
        responseMs:   Date.now() - start,
      },
      { status: 502 },
    )
  }
}
