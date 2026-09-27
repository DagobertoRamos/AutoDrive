// =============================================================================
// /api/negotiations/drafts — rascunhos do assistente Nova Negociação.
//   GET   → rascunhos do usuário (gestores veem os da loja toda)
//   POST  { data, step, type?, title? } → cria
// O rascunho guarda o formulário e a etapa onde parou; não é uma negociação.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { cleanDraftInput, isDraftManager } from '@/lib/negotiation-drafts'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'negotiations')) return forbiddenResponse()
  try {
    const rows = await prisma.dealDraft.findMany({
      where:   isDraftManager(user.role) ? { tenantId: user.tenantId ?? null } : { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take:    50,
      select:  { id: true, userId: true, userName: true, type: true, step: true, title: true, createdAt: true, updatedAt: true },
    })
    return NextResponse.json({ success: true, data: rows.map((r) => ({ ...r, mine: r.userId === user.id })) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'negotiations')) return forbiddenResponse()
  try {
    const parsed = cleanDraftInput(await req.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    const row = await prisma.dealDraft.create({
      data: { tenantId: user.tenantId ?? null, userId: user.id, userName: user.name ?? null, ...parsed.data, data: parsed.data.data as Prisma.InputJsonValue },
      select: { id: true, updatedAt: true },
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
