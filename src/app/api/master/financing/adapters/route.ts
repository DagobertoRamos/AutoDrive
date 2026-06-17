// =============================================================================
// /api/master/financing/adapters — diagnóstico dos adapters por provedor (Master).
// Cruza os provedores cadastrados com a camada de adapters (registry): tipo,
// capacidades declaradas pelo adapter, flags do provedor, se há baseUrl e o
// estado (operante/preparado/não configurado). Read-only. MASTER-only.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { getAdapter } from '@/lib/finance/adapters'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const providers = await prisma.financeProvider.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] })
    const data = providers.map((p) => {
      const adapter = getAdapter(p.kind)
      const ready = adapter.isReady({ tenantId: '', environment: 'HOMOLOGACAO', baseUrl: p.baseUrlHomolog })
      const hasUrl = !!(p.baseUrlHomolog?.trim() || p.baseUrlProd?.trim())
      const state = p.kind === 'MANUAL' || p.kind === 'OUTRO' ? 'OPERANTE' : ready ? 'OPERANTE' : hasUrl ? 'PREPARADO' : 'NAO_CONFIGURADO'
      return {
        id: p.id, name: p.name, kind: p.kind, active: p.active, hasUrl, state,
        adapterCapabilities: adapter.capabilities,
        providerFlags: { simulate: p.supportsSimulate, submit: p.supportsSubmit, webhook: p.supportsWebhook, status: p.supportsStatus },
      }
    })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
