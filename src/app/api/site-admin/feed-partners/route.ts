// =============================================================================
// Painel do Site — parceiros que chegam pelo feed do site antigo.
// Só existe para a loja com importação de estoque (SITE_FEED_IMPORT — hoje só a
// AutoDrive Veículos); nas demais responde enabled: false.
//   GET  : parceiros + carros no site. Gate: site.
//   POST : { ref, blocked } pausa/reativa o parceiro. Gate: site.manage.
//          Pausar tira os carros do site e dos anúncios na hora; reativar roda a
//          importação em seguida para trazê-los de volta.
// =============================================================================

import { NextResponse, after } from 'next/server'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { feedImportSourceFor, listFeedPartners, runFeedImport, setFeedPartnerBlocked } from '@/lib/site/feed-import'
import { notifyStockChanged } from '@/lib/publications/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site')) return forbiddenResponse('Sem acesso ao site da loja.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  if (!feedImportSourceFor(tenantId)) return NextResponse.json({ success: true, data: { enabled: false, partners: [] } })
  return NextResponse.json({ success: true, data: { enabled: true, partners: await listFeedPartners(tenantId) } })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site.manage')) return forbiddenResponse('Sem permissão para configurar o site.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const src = feedImportSourceFor(tenantId)
  if (!src) return NextResponse.json({ success: false, error: 'Esta loja não importa estoque de parceiros.' }, { status: 404 })
  const body = await req.json().catch(() => ({})) as { ref?: unknown; blocked?: unknown }
  const ref = typeof body.ref === 'string' ? body.ref.trim() : ''
  if (!ref || typeof body.blocked !== 'boolean') return NextResponse.json({ success: false, error: 'Dados inválidos.' }, { status: 400 })
  try {
    const { deactivated } = await setFeedPartnerBlocked(tenantId, ref, body.blocked)
    if (deactivated.length) notifyStockChanged(tenantId, deactivated)
    if (!body.blocked) after(() => runFeedImport(src).then(() => undefined).catch((e) => console.error('[feed-partners] importação após reativar', e instanceof Error ? e.message : e)))
    await createSafeAuditLog({
      userId: user.id, tenantId, action: body.blocked ? 'SITE_FEED_PARTNER_PAUSED' : 'SITE_FEED_PARTNER_RESUMED',
      entity: 'SiteFeedPartner', entityId: ref, userName: user.name, userRole: user.role,
      afterData: { blocked: body.blocked, deactivated: deactivated.length },
    })
    return NextResponse.json({ success: true, data: { deactivated: deactivated.length, partners: await listFeedPartners(tenantId) } })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Falha ao atualizar o parceiro.' }, { status: 400 })
  }
}
