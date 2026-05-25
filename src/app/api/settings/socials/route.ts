// =============================================================================
// API: /api/settings/socials — AutoDrive
// Endpoint público (autenticado) que retorna as URLs de redes sociais do tenant.
// Usado pela Sidebar para todos os roles (não exige permissão de "settings").
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const GROUP = 'identity'
const SOCIAL_FIELDS = [
  'socialInstagram',
  'socialFacebook',
  'socialWhatsapp',
  'socialSite',
  'socialYoutube',
  'socialTiktok',
  'socialLinkedin',
] as const

export async function GET() {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    const tid = session.user.tenantId
    if (!tid) {
      return NextResponse.json({ success: true, data: {} })
    }

    const prefix = `t:${tid}:${GROUP}.`
    const settings = await prisma.systemSetting.findMany({
      where: { key: { startsWith: prefix } },
    })

    const data: Record<string, string> = {}
    for (const s of settings) {
      const field = s.key.replace(prefix, '')
      if ((SOCIAL_FIELDS as readonly string[]).includes(field) && s.value) {
        data[field] = s.value
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/settings/socials]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
