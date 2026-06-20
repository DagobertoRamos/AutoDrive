// =============================================================================
// API: /api/settings/whatsapp — AutoDrive
// Configuração da integração WhatsApp (Meta Cloud API)
//
// Chave de armazenamento: `t:{tenantId}:whatsapp.{field}`
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

const GROUP = 'whatsapp'

const ALLOWED_KEYS = [
  'active', 'provider', 'phoneNumberId', 'businessAccountId', 'accessToken',
  'webhookVerifyToken', 'apiVersion', 'defaultMessage',
]

const SENSITIVE_KEYS = ['accessToken', 'webhookVerifyToken']

function tenantKey(tenantId: string, field: string) {
  return `t:${tenantId}:${GROUP}.${field}`
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'settings')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const tid = session.user.tenantId
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Tenant não identificado na sessão.' }, { status: 400 })
    }

    const prefix   = `t:${tid}:${GROUP}.`
    const settings = await prisma.systemSetting.findMany({
      where: { key: { startsWith: prefix } },
    })

    const config: Record<string, unknown> = {}
    for (const s of settings) {
      const field = s.key.replace(prefix, '')
      if (SENSITIVE_KEYS.includes(field)) {
        config[field] = s.value ? '••••••••' : ''
      } else {
        try { config[field] = JSON.parse(s.value) } catch { config[field] = s.value }
      }
    }

    if (Object.keys(config).length > 0) config.id = GROUP

    return NextResponse.json({
      success: true,
      data: Object.keys(config).length > 0 ? config : null,
    })
  } catch (err) {
    console.error('[GET /api/settings/whatsapp]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'settings')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const tid = session.user.tenantId
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Tenant não identificado na sessão.' }, { status: 400 })
    }

    const body = await req.json()

    for (const field of ALLOWED_KEYS) {
      if (body[field] === undefined || field === 'id') continue
      // Não sobrescreve campo sensível (token) se veio mascarado ou em branco —
      // a tela limpa o campo ao carregar; salvar vazio apagaria a credencial.
      if (SENSITIVE_KEYS.includes(field) && (body[field] === '••••••••' || body[field] === '')) continue

      const key   = tenantKey(tid, field)
      const value = String(body[field] ?? '')

      const existing = await prisma.systemSetting.findFirst({ where: { key } })

      if (existing) {
        await prisma.systemSetting.update({
          where: { id: existing.id },
          data:  { value, group: GROUP, tenantId: tid },
        })
      } else {
        await prisma.systemSetting.create({
          data: { key, value, group: GROUP, tenantId: tid, description: field },
        })
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: tid,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'UPDATE',
        entity:   'SystemSetting',
        entityId: GROUP,
        afterData: { group: GROUP },
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: 'Configuração WhatsApp salva.',
      data: { id: GROUP },
    })
  } catch (err) {
    console.error('[POST /api/settings/whatsapp]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export { POST as PATCH }
