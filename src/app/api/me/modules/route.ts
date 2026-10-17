// =============================================================================
// GET /api/me/modules — funcionalidades DESABILITADAS para a loja do usuário.
// Usado pelo menu (Sidebar) para esconder itens que o MASTER desligou.
// MASTER vê tudo (lista vazia).
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { getCrmRoleDiff, getDisabledModules, getUserDeniedModules, getOpenModules, getUserAllowedModules } from '@/lib/tenant-modules'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ancestorsOf, effectiveDisabled } from '@/lib/modules-catalog'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (user.role === 'MASTER' || !user.tenantId) return NextResponse.json({ success: true, disabled: [], open: [] })
  try {
    // Esconde do menu: módulos desligados p/ a loja UNIÃO removidos do colaborador.
    // `open` = módulos LIBERADOS p/ todos (chavinha), mesmo sem o papel.
    const [tenantDisabled, userDenied, open, userAllowed, crmRole] = await Promise.all([
      getDisabledModules(user.tenantId),
      getUserDeniedModules(user.id),
      getOpenModules(user.tenantId),
      getUserAllowedModules(user.id),
      getCrmRoleDiff(user.tenantId, user.role),
    ])
    // Regras de permissão do CRM da loja por perfil; a exceção do colaborador vence.
    const crmDeny = crmRole.deny.filter((m) => !userAllowed.includes(m))
    const crmAllow = crmRole.allow.filter((m) => !userDenied.includes(m))
    // Bloquear o pai bloqueia os filhos (mesma hierarquia do catálogo).
    const disabled = new Set([...tenantDisabled, ...effectiveDisabled(userDenied), ...crmDeny])
    const openSet = new Set([...open, ...userAllowed, ...crmAllow])
    // Ferramenta LIBERADA explicitamente => o grupo-pai do menu aparece (ex.:
    // Publicações liberada para um vendedor cujo cargo não tem "Marketing").
    // O padrão de cada cargo não muda.
    for (const k of [...openSet]) {
      if (disabled.has(k)) continue
      for (const a of ancestorsOf(k)) if (!disabled.has(a)) openSet.add(a)
    }
    return NextResponse.json({ success: true, disabled: [...disabled], open: [...openSet] })
  } catch (err) {
    return handlePrismaError(err)
  }
}
