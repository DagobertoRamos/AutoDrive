// =============================================================================
// API: /api/settings/identity — AutoDrive
// Identidade do sistema (nome, logo, cores, dados da empresa)
//
// Chave de armazenamento: `t:{tenantId}:{group}.{field}`
// Isso garante isolamento por tenant dentro da constraint @unique global.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

const GROUP = 'identity'

const ALLOWED_KEYS = [
  'appName', 'appTagline', 'companyName', 'companyEmail', 'companyPhone',
  'companyAddress', 'primaryColor', 'logoUrl', 'faviconUrl',
  'supportEmail', 'supportPhone', 'timezone', 'locale',
]

/** Prefixo de chave para o tenant — garante unicidade global com @unique */
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

    const tid    = session.user.tenantId
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Tenant não identificado na sessão.' }, { status: 400 })
    }

    // Busca apenas as chaves deste tenant
    const prefix   = `t:${tid}:${GROUP}.`
    const settings = await prisma.systemSetting.findMany({
      where: { key: { startsWith: prefix } },
    })

    const data: Record<string, string> = {}
    for (const s of settings) {
      const field = s.key.replace(prefix, '')
      data[field]  = s.value
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/settings/identity]', err)
    return NextResponse.json({ success: false, error: 'Erro interno ao carregar configurações.' }, { status: 500 })
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
      if (body[field] === undefined) continue
      const key   = tenantKey(tid, field)
      const value = String(body[field] ?? '')

      // findFirst + update/create evita depender de key @unique global
      // e também elimina o bug do campo inexistente `label`
      const existing = await prisma.systemSetting.findFirst({
        where: { key },
      })

      if (existing) {
        await prisma.systemSetting.update({
          where: { id: existing.id },
          data:  { value, group: GROUP, tenantId: tid },
        })
      } else {
        await prisma.systemSetting.create({
          data: {
            key,
            value,
            group:       GROUP,
            tenantId:    tid,
            description: field,
          },
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
        afterData: { group: GROUP, keys: Object.keys(body).filter(k => ALLOWED_KEYS.includes(k)) },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, message: 'Identidade do sistema atualizada com sucesso.' })
  } catch (err) {
    console.error('[POST /api/settings/identity]', err)
    return NextResponse.json({ success: false, error: 'Erro interno ao salvar configurações.' }, { status: 500 })
  }
}
