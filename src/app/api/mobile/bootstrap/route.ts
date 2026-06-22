// =============================================================================
// GET /api/mobile/bootstrap — contexto inicial do app mobile (autenticado).
// Retorna SOMENTE dados não sensíveis: identidade do usuário, info do cliente
// mobile, módulos acessíveis, entrypoints e flags de segurança. NUNCA expõe
// segredos (DATABASE_URL, tokens, API keys, credenciais de IA/banco/integração).
// Se vier de app nativo (headers mobile), registra auditoria MOBILE_BOOTSTRAP
// best-effort (não bloqueante). Sem sessão → padrão unauthorized do projeto.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule, type Module } from '@/lib/permissions'
import { ALL_FEATURE_KEYS } from '@/lib/modules-catalog'
import { getDisabledModules } from '@/lib/tenant-modules'
import { readMobileClient, isMobileClient } from '@/lib/mobile/client'

// Entrypoints sugeridos para o app (rotas internas; sem módulo = sempre visível).
const ENTRYPOINTS: { key: string; label: string; path: string; module?: string }[] = [
  { key: 'inicio',      label: 'Início',              path: '/inicio' },
  { key: 'negociacoes', label: 'Negociações',         path: '/negociacoes',                 module: 'negotiations' },
  { key: 'estoque',     label: 'Estoque',             path: '/estoque',                     module: 'stock.view' },
  { key: 'fila',        label: 'Fila de Atendimento', path: '/vendedor-da-vez/minha-fila',  module: 'sellerQueue.view' },
  { key: 'comissoes',   label: 'Comissões',           path: '/comissoes',                   module: 'commissions' },
  { key: 'perfil',      label: 'Perfil',              path: '/configuracoes/perfil' },
]

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  const client = readMobileClient(req.headers)

  // Módulos efetivamente acessíveis: papel (canAccessModule) E habilitação da
  // loja (TenantModule). MASTER vê tudo do papel; tenant respeita o que o
  // MASTER liberou. Sem expor regras internas — só as chaves.
  const disabled = user.role !== 'MASTER' && user.tenantId ? await getDisabledModules(user.tenantId) : []
  const disabledSet = new Set(disabled)
  const modules = ALL_FEATURE_KEYS.filter(
    (key) => canAccessModule(user.role, key as Module) && !disabledSet.has(key),
  )

  const entrypoints = ENTRYPOINTS.filter((e) => !e.module || modules.includes(e.module))

  // Flags de postura de segurança do app (documentais, sem segredos).
  const security = {
    transport: 'https-only',
    tokenStorage: 'none',
    neverStoreSecrets: true,
    apiOnly: true,
    externalCallsBlocked: true,
  }

  // Auditoria best-effort apenas quando vem do app nativo (não bloqueia).
  if (isMobileClient(client)) {
    await createSafeAuditLog({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'MOBILE_BOOTSTRAP',
      entity: 'MobileSession',
      entityId: client.deviceId || null,
      userName: user.name,
      userRole: user.role,
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        tenantId: user.tenantId,
        unitId: user.unitId,
      },
      client: {
        deviceId: client.deviceId,
        platform: client.platform,
        appVersion: client.appVersion,
      },
      modules,
      entrypoints,
      security,
    },
  })
}
