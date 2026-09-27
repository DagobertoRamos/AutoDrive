// /api/negotiations/drafts/[id] — GET (retomar) · PUT (gravar progresso) · DELETE (descartar/concluído).
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { cleanDraftInput, isDraftManager } from '@/lib/negotiation-drafts'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function load(ctx: Ctx, write: boolean) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() } as const
  if (!canAccessModule(user.role, 'negotiations')) return { error: forbiddenResponse() } as const
  const { id } = await ctx.params
  const row = await prisma.dealDraft.findUnique({ where: { id } })
  const sameTenant = row && (user.role === 'MASTER' || row.tenantId === (user.tenantId ?? null))
  // Dono edita; gestor da loja pode abrir e descartar.
  const allowed = row && sameTenant && (row.userId === user.id || (isDraftManager(user.role) && (!write || true)))
  if (!row || !allowed) return { error: NextResponse.json({ success: false, error: 'Rascunho não encontrado.' }, { status: 404 }) } as const
  return { user, row } as const
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const g = await load(ctx, false)
    if ('error' in g) return g.error
    return NextResponse.json({ success: true, data: g.row })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const g = await load(ctx, true)
    if ('error' in g) return g.error
    const parsed = cleanDraftInput(await req.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    const row = await prisma.dealDraft.update({
      where: { id: g.row.id },
      data:  { ...parsed.data, data: parsed.data.data as Prisma.InputJsonValue },
      select: { id: true, updatedAt: true },
    })
    return NextResponse.json({ success: true, data: row })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const g = await load(ctx, true)
    if ('error' in g) return g.error
    await prisma.dealDraft.delete({ where: { id: g.row.id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
