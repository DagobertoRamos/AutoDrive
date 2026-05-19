// GET  /api/master/sheets/[id]/tabs/[tabId]/column-maps — lista mapeamentos
// PUT  /api/master/sheets/[id]/tabs/[tabId]/column-maps — substitui todos os mapeamentos da aba

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }          from '@/lib/master-guards'
import { handlePrismaError }      from '@/lib/prisma-errors'
import { prisma }                 from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; tabId: string } },
) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const maps = await prisma.googleSheetColumnMap.findMany({
      where:   { tabId: params.tabId, tab: { configId: params.id } },
      orderBy: { columnLetter: 'asc' },
    })
    return NextResponse.json({ success: true, data: maps })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; tabId: string } },
) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    // Valida que a aba pertence ao importer
    const tab = await prisma.googleSheetTab.findFirst({
      where: { id: params.tabId, configId: params.id },
    })
    if (!tab) {
      return NextResponse.json({ success: false, error: 'Aba não encontrada.' }, { status: 404 })
    }

    const body: {
      maps: {
        columnLetter: string
        columnHeader?: string | null
        fieldName:    string
        fieldLabel?:  string | null
        required?:    boolean
        transform?:   string | null
        defaultValue?: string | null
        active?:      boolean
      }[]
    } = await req.json()

    if (!Array.isArray(body.maps)) {
      return NextResponse.json({ success: false, error: 'Campo "maps" deve ser um array.' }, { status: 400 })
    }

    // Substitui todos os mapeamentos num único transaction
    const [, maps] = await prisma.$transaction([
      prisma.googleSheetColumnMap.deleteMany({ where: { tabId: params.tabId } }),
      prisma.googleSheetColumnMap.createMany({
        data: body.maps
          .filter(m => m.columnLetter && m.fieldName)
          .map(m => ({
            tabId:        params.tabId,
            columnLetter: m.columnLetter,
            columnHeader: m.columnHeader ?? null,
            fieldName:    m.fieldName,
            fieldLabel:   m.fieldLabel ?? null,
            required:     m.required     ?? false,
            transform:    m.transform    ?? null,
            defaultValue: m.defaultValue ?? null,
            active:       m.active       ?? true,
          })),
        skipDuplicates: true,
      }),
    ])

    const saved = await prisma.googleSheetColumnMap.findMany({
      where:   { tabId: params.tabId },
      orderBy: { columnLetter: 'asc' },
    })

    return NextResponse.json({ success: true, data: saved, count: maps.count })
  } catch (err) {
    return handlePrismaError(err)
  }
}
