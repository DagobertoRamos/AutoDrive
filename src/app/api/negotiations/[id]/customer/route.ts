// =============================================================================
// PATCH /api/negotiations/[id]/customer — edita os dados do cliente pela
// janelinha "Dados do cliente" do resumo da negociação.
//   • Negociação com cadastro (Person) → atualiza o cadastro.
//   • Importada só com Customer (AutoConf/planilha) → cria/acha o cadastro pelo
//     CPF/CNPJ e vincula na negociação (e no Customer), mantendo o Customer
//     legado em dia.
// Contato/endereço não mexem em valores: GERENTE+ corrige até em negociação
// finalizada; os demais seguem a regra de edição da negociação.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { handlePrismaError } from '@/lib/prisma-errors'
import { buildNegotiationAccessWhere, getNegotiationActorIds } from '@/lib/negotiation-access'
import { canEditDeal } from '@/lib/negotiation-rbac'
import { createDealAudit } from '@/lib/negotiation-service'
import { upsertPerson, type PersonInput } from '@/lib/people/upsert-person'
import { isValidCPF } from '@/lib/br-docs/cpf'
import { isValidCNPJ } from '@/lib/br-docs/cnpj'
import { identityLockError } from '@/lib/identity-lock'

export const dynamic = 'force-dynamic'

const MANAGER_PLUS = new Set(['GERENTE', 'GERENTE_GERAL', 'ADM', 'MASTER'])

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') } catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const { id: dealId } = await Promise.resolve(ctxArg.params)
  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(session.user, { id: dealId }),
    select: { id: true, tenantId: true, unitId: true, status: true, sellerId: true, personId: true, customerId: true },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  const actorIds = await getNegotiationActorIds(session.user)
  const actor = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId ?? null, sellerId: actorIds.sellerId }
  const allowed = deal.status !== 'CANCELADA' && (MANAGER_PLUS.has(session.user.role) || canEditDeal(actor, deal))
  if (!allowed) return NextResponse.json({ error: 'Sem permissão para editar o cliente desta negociação.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { person?: PersonInput } | null
  const input = body?.person
  if (!input) return NextResponse.json({ error: 'Dados do cliente ausentes.' }, { status: 400 })

  const isPJ = input.type === 'JURIDICA'
  const name = (isPJ ? input.razaoSocial ?? input.nomeCompleto : input.nomeCompleto)?.trim()
  if (!name) return NextResponse.json({ error: isPJ ? 'Informe a razão social.' : 'Informe o nome do cliente.' }, { status: 400 })
  if (!isPJ && input.cpf && !isValidCPF(input.cpf)) return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 })
  if (isPJ && input.cnpj && !isValidCNPJ(input.cnpj)) return NextResponse.json({ error: 'CNPJ inválido.' }, { status: 400 })
  if (deal.personId) {
    const cur = await prisma.person.findUnique({ where: { id: deal.personId }, select: { cpf: true, cnpj: true, email: true } })
    const lockErr = identityLockError(session.user.role, cur, input as unknown as Record<string, unknown>)
    if (lockErr) return NextResponse.json({ error: lockErr }, { status: 403 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Janela completa: campo esvaziado apaga; troca PF↔PJ apaga o documento antigo.
      const r = await upsertPerson(tx, deal.tenantId, input, deal.personId, { clearEmpty: true })
      if ('error' in r) return r
      if (deal.personId !== r.id) await tx.deal.update({ where: { id: deal.id }, data: { personId: r.id } })
      if (deal.customerId) {
        // Customer legado (listas antigas e importações) acompanha o que foi
        // de fato gravado no cadastro (documento em conflito não é gravado).
        const f = r.fields
        const has = (k: string) => k in f
        const str = (v: unknown) => (v == null || v === '' ? null : String(v))
        const docSaved = has('cpf') || has('cnpj')
        const addressSent = has('logradouro') || has('numero')
        await tx.customer.update({
          where: { id: deal.customerId },
          data: {
            personId: r.id, name,
            ...(docSaved ? { cpf: str(f.cpf ?? f.cnpj) } : {}),
            ...(has('phone') ? { phone: str(f.phone) } : {}),
            ...(has('email') ? { email: str(f.email) } : {}),
            ...(addressSent ? { address: [f.logradouro, f.numero].filter(Boolean).join(', ') || null } : {}),
            ...(has('cidade') ? { city: str(f.cidade) } : {}),
            ...(has('estado') ? { state: str(f.estado) } : {}),
          },
        })
      }
      await createDealAudit(tx as never, {
        dealId: deal.id, tenantId: deal.tenantId, unitId: deal.unitId,
        userId: session.user.id, userName: session.user.name ?? undefined, userRole: session.user.role,
        action: 'CUSTOMER_UPDATED', field: 'person', newValue: name,
      })
      return r
    })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ data: { personId: result.id } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
