// =============================================================================
// /api/negotiations/[id]/notes — anotações internas (MVP via AuditLog)
//
// Enquanto não existir tabela `DealNote` dedicada, persistimos anotações no
// AuditLog com `action='NOTE'` e `afterData={ category, text }`. Quando a
// tabela for criada, basta substituir o storage; o contrato HTTP fica igual.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

export const dynamic = 'force-dynamic'

const ALLOWED_CATEGORIES = new Set([
  'ATENDIMENTO', 'FINANCEIRO', 'DOCUMENTACAO',
  'APROVACAO', 'ENTREGA', 'POS_VENDA', 'OUTRO',
])

async function resolveDealId(
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
): Promise<string | null> {
  const params = await Promise.resolve(ctxArg.params)
  return params?.id ?? null
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const dealId = await resolveDealId(ctxArg)
  if (!dealId) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })

  try {
    const deal = await prisma.deal.findFirst({
      where:  await buildNegotiationAccessWhere(session.user, { id: dealId }),
      select: { id: true },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    const rows = await prisma.auditLog.findMany({
      where:   { entity: 'Deal', entityId: dealId, action: 'NOTE' },
      orderBy: { createdAt: 'desc' },
      select:  {
        id: true, createdAt: true, userName: true,
        afterData: true,
      },
    })

    const notes = rows.map((r) => {
      const after = (r.afterData ?? {}) as { category?: string; text?: string; pinned?: boolean }
      return {
        id:        r.id,
        category:  after.category ?? 'OUTRO',
        text:      after.text ?? '',
        author:    r.userName ?? 'Sistema',
        createdAt: r.createdAt,
        pinned:    after.pinned === true,
      }
    })

    return NextResponse.json({ data: notes })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const dealId = await resolveDealId(ctxArg)
  if (!dealId) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })

  let body: { category?: string; text?: string; pinned?: boolean } = {}
  try { body = await req.json() } catch { /* sem body */ }

  const category = String(body?.category ?? 'OUTRO').toUpperCase()
  const text     = String(body?.text ?? '').trim()
  if (!text)                              return NextResponse.json({ error: 'Texto da anotação é obrigatório.' }, { status: 400 })
  if (!ALLOWED_CATEGORIES.has(category))  return NextResponse.json({ error: 'Categoria inválida.' }, { status: 400 })

  try {
    const deal = await prisma.deal.findFirst({
      where:  await buildNegotiationAccessWhere(session.user, { id: dealId }),
      select: { id: true, tenantId: true },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    const row = await prisma.auditLog.create({
      data: {
        userId:    session.user.id,
        tenantId:  deal.tenantId ?? null,
        action:    'NOTE',
        entity:    'Deal',
        entityId:  dealId,
        userName:  session.user.name ?? null,
        userRole:  session.user.role,
        status:    'SUCCESS',
        afterData: { category, text, pinned: body?.pinned === true } as never,
      },
    })

    return NextResponse.json({
      data: {
        id:        row.id,
        category,
        text,
        author:    session.user.name ?? 'Sistema',
        createdAt: row.createdAt,
        pinned:    body?.pinned === true,
      },
    }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
