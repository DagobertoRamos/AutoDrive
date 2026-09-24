// =============================================================================
// POST /api/crm/channels/[id]/test — "Enviar lead de teste": passa um lead
// fictício (marcado TESTE) pelo mesmo caminho da URL de entrada do canal.
// Gate: crm.settings.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadChannels } from '@/lib/crm/channels'
import { intakeChannelLead } from '@/lib/crm/channel-intake'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return forbiddenResponse('Sem permissão para configurar o CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const { id } = await params
  const channel = (await loadChannels(tenantId)).find((c) => c.id === id)
  if (!channel) return NextResponse.json({ success: false, error: 'Canal não encontrado.' }, { status: 404 })

  const stamp = Date.now().toString().slice(-6)
  const r = await intakeChannelLead(tenantId, channel, {
    lead_id: `teste-${stamp}`, is_test: true, secret: channel.secret,
    nome: 'Cliente de teste', telefone: `1190000${stamp.slice(-4)}`,
    mensagem: 'Lead de teste enviado pela tela de Canais de captação. Pode descartar.',
    veiculo: 'Veículo de exemplo', campanha: 'Teste de integração',
  }, null)
  return NextResponse.json(r.body, { status: r.status })
}
