// GET /api/vehicles/files/[fileId] — serve um arquivo do veículo (com sessão e da mesma loja).
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { readVehicleFile } from '@/lib/stock/vehicle-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock') && !canAccessModule(user.role, 'finance')) return forbiddenResponse()
  try {
    const { fileId } = await ctx.params
    const f = await readVehicleFile(fileId)
    if (!f) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
    if (user.role !== 'MASTER' && f.tenantId && user.tenantId !== f.tenantId) return forbiddenResponse()
    return new NextResponse(new Uint8Array(f.data), {
      headers: {
        'Content-Type': f.mimeType, 'Content-Length': String(f.data.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(f.fileName)}"`,
        'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
