// =============================================================================
// API: /api/settings/commissions — AutoDrive
// Configurações avançadas de comissões — persiste como JSON em SystemSetting
//
// Chave: `t:{tenantId}:commission_settings`
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'

const KEY_BASE  = 'commission_settings'
const GROUP     = 'commission'

function tenantKey(tenantId: string) {
  return `t:${tenantId}:${KEY_BASE}`
}

const EMPTY_DEFAULTS = {
  saleRanges:          [],
  purchaseCommission:  0,
  documentCommission:  0,
  serviceCommissions:  [],
  warrantyCommissions: [],
  returnCommissions:   [],
}

// ── GET — retorna configuração atual ─────────────────────────────────────────
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'settings.commission')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const tid = session.user.tenantId
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Tenant não identificado na sessão.' }, { status: 400 })
    }

    const setting = await prisma.systemSetting.findFirst({
      where: { key: tenantKey(tid) },
    })

    const data = setting?.value ? JSON.parse(setting.value) : EMPTY_DEFAULTS

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/settings/commissions]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

// ── PUT — salva configuração ──────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'settings.commission')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const tid = session.user.tenantId
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Tenant não identificado na sessão.' }, { status: 400 })
    }

    const body  = await req.json()
    const key   = tenantKey(tid)
    const value = JSON.stringify(body)

    const existing = await prisma.systemSetting.findFirst({ where: { key } })

    if (existing) {
      await prisma.systemSetting.update({
        where: { id: existing.id },
        data:  { value, updatedByUserId: session.user.id, tenantId: tid },
      })
    } else {
      await prisma.systemSetting.create({
        data: {
          key,
          value,
          description:     'Configurações de regras de comissão',
          group:           GROUP,
          tenantId:        tid,
          updatedByUserId: session.user.id,
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        tenantId: tid,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'UPDATE',
        entity:   'SystemSetting',
        entityId: KEY_BASE,
        afterData: { key: KEY_BASE },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/settings/commissions]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
