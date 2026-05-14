// =============================================================================
// API: /api/settings/email/test — AutoDrive
// Envia e-mail de teste com configurações SMTP atuais
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'

const schema = z.object({ to: z.string().email('E-mail inválido') })

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'settings')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    const body   = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message }, { status: 400 })
    }

    // TODO: implementar envio real via Nodemailer com as configurações SMTP salvas
    // Por ora, simula sucesso
    return NextResponse.json({
      success: true,
      message: `E-mail de teste enviado para ${parsed.data.to} (simulado).`,
    })
  } catch (err) {
    console.error('[POST /api/settings/email/test]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
