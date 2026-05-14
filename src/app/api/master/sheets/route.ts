// =============================================================================
// /api/master/sheets
// GET  — lista configurações de importadores Google Sheets (MASTER only)
// POST — cria novo importador
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z }             from 'zod'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { prisma }        from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

const createSchema = z.object({
  name:          z.string().min(1, 'Nome obrigatório').max(100),
  spreadsheetId: z.string().min(1, 'Spreadsheet ID obrigatório'),
  description:   z.string().optional(),
  tenantId:      z.string().optional(),
  unitId:        z.string().optional(),
  dedupeField:   z.string().optional().default('negotiation'),
  columnMapping: z.record(z.unknown()).optional(),
  active:        z.boolean().default(true),
})

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const configs = await prisma.googleSheetConfig.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        tabs: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        importJobs: {
          orderBy:  { createdAt: 'desc' },
          take:     1,
          select:   { id: true, status: true, totalRows: true, newRecords: true, updatedRecords: true, errorRows: true, finishedAt: true },
        },
        autoSync: {
          include: {
            jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    })
    return NextResponse.json({ success: true, data: configs })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { columnMapping, ...rest } = parsed.data

    const config = await prisma.googleSheetConfig.create({
      data: {
        ...rest,
        columnMapping: columnMapping ? JSON.parse(JSON.stringify(columnMapping)) : DEFAULT_COLUMN_MAPPING,
      },
      include: { tabs: true },
    })

    await logMasterAction(session, 'CREATE_SHEETS_CONFIG', 'GoogleSheetConfig', config.id, {
      afterData: { name: config.name, spreadsheetId: config.spreadsheetId },
      req,
    })

    return NextResponse.json({ success: true, data: config }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// Mapeamento padrão de colunas conforme script EasyCar Matriz
export const DEFAULT_COLUMN_MAPPING = {
  0:  'unit',           // Loja
  1:  'saleDate',       // Data da venda
  2:  'sellerName',     // Vendedor
  3:  'plate',          // Placa
  4:  'vehicle',        // Modelo/Veículo
  5:  'timeInStock',    // TV / Tempo vendido
  6:  'statusMain',     // Status/Pendência principal
  7:  'statusDetail',   // Detalhe da pendência
  8:  'negotiation',    // Negociação
  10: 'customerName',   // Cliente (coluna 10, pula 9)
}
