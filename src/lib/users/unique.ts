// =============================================================================
// E-mail e CPF são únicos em TODO o sistema (o login é por e-mail). Antes de
// gravar, diz qual campo repetiu e com quem — em vez do erro genérico do banco.
// =============================================================================

import { prisma } from '@/lib/prisma'

export interface UserIdentity { email?: string | null; cpf?: string | null }

export const normEmail = (v: unknown) => String(v ?? '').trim().toLowerCase()
export const normCpf = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/** Mensagem do conflito (null = livre). `excludeId` = o próprio usuário em edição. */
export async function userIdentityConflict(data: UserIdentity, excludeId?: string): Promise<string | null> {
  const email = data.email != null ? normEmail(data.email) : ''
  const cpf = data.cpf != null ? normCpf(data.cpf) : ''
  if (!email && !cpf) return null
  const others = await prisma.user.findMany({
    where: { ...(excludeId ? { id: { not: excludeId } } : {}), OR: [...(email ? [{ email }] : []), ...(cpf ? [{ cpf }] : [])] },
    select: { name: true, email: true, cpf: true, role: true, tenant: { select: { name: true } } },
    take: 2,
  })
  const owner = (u: (typeof others)[number]) => `${u.name} (${u.role === 'MASTER' ? 'Plataforma · MASTER' : u.tenant?.name ?? 'sem loja'})`
  const byEmail = email ? others.find((u) => u.email === email) : undefined
  if (byEmail) return `O e-mail ${email} já é usado por ${owner(byEmail)}. Cada usuário precisa de um e-mail próprio, porque ele é o login.`
  const byCpf = cpf ? others.find((u) => u.cpf === cpf) : undefined
  if (byCpf) return `O CPF informado já está no cadastro de ${owner(byCpf)}.`
  return null
}
