// =============================================================================
// GET /api/master/sheets/[id]/process-deals/status
// Retorna estatísticas de SheetImportRow para o importador dado.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }       from '@/lib/master-guards'
import { prisma }              from '@/lib/prisma'
import { handlePrismaError }   from '@/lib/prisma-errors'
import { getSheetRowStats }    from '@/lib/sheets-deal-processor'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const config = await prisma.googleSheetConfig.findUnique({ where: { id: params.id } })
    if (!config) {
      return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })
    }

    const stats = await getSheetRowStats(params.id)

    return NextResponse.json({ success: true, data: stats })
  } catch (err) {
    return handlePrismaError(err)
  }
}
