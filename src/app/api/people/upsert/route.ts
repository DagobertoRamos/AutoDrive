// =============================================================================
// POST /api/people/upsert — grava o cliente ao avançar da etapa Cliente no
// assistente de negociação. Body: { personId?, person: {...} } → { id, created }
// Cria ou atualiza pelo CPF/CNPJ dentro da loja; fica disponível para as
// próximas negociações (busca por documento).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { upsertPerson, type PersonInput } from '@/lib/people/upsert-person'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') } catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }
  if (!session.user.tenantId) return NextResponse.json({ error: 'Entre na loja para cadastrar clientes.' }, { status: 400 })

  try {
    const body = await req.json().catch(() => null) as { personId?: string | null; person?: PersonInput } | null
    if (!body?.person) return NextResponse.json({ error: 'Dados do cliente ausentes.' }, { status: 400 })
    const r = await upsertPerson(prisma, session.user.tenantId, body.person, body.personId ?? null)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
    await prisma.auditLog.create({
      data: {
        userId: session.user.id, tenantId: session.user.tenantId, action: r.created ? 'PERSON_CREATED' : 'PERSON_UPDATED',
        entity: 'Person', entityId: r.id, userName: session.user.name ?? null, userRole: session.user.role, status: 'SUCCESS',
        afterData: { origem: 'assistente de negociação' } as never,
      },
    }).catch(() => {})
    return NextResponse.json({ data: r }, { status: r.created ? 201 : 200 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
