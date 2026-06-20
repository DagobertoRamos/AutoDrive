// =============================================================================
// GET /api/settings/whatsapp/providers — provedores de WhatsApp disponíveis e
// seus campos (sem segredos). Usado pela tela da loja para montar o formulário
// conforme o provedor escolhido. Gate: settings.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { listWhatsappProviders } from '@/lib/whatsapp/registry'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'settings')) return forbiddenResponse('Acesso negado')
  return NextResponse.json({ success: true, data: listWhatsappProviders() })
}
