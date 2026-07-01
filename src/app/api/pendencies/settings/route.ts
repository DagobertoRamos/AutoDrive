// =============================================================================
// /api/pendencies/settings — Configurações gerais da Central de Pendências.
// Restrita a GERENTE_GERAL+ (MASTER/ADM/GERENTE_GERAL). Persiste no mesmo
// SystemSetting `t:{tenantId}:pendency_settings`, preservando SLA/lembretes.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import {
  PENDENCY_SETTINGS_KEY_BASE,
  loadPendencySettingsByKey,
  mergePendencySettings,
  pendencySettingsKeyForSession,
  upsertPendencySettings,
} from '@/lib/pendencies/settings'

function forbidden() {
  return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
}

async function requireSettingsAccess() {
  const session = await getServerAuthSession()
  if (!session?.user) {
    return {
      session: null,
      response: NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 }),
    }
  }
  if (!canAccessModule(session.user.role, 'pendencies.settings')) {
    return { session, response: forbidden() }
  }
  const gate = await assertModuleEnabled(session.user, 'pendencies.settings')
  if (gate) return { session, response: gate }
  return { session, response: null }
}

export async function GET() {
  try {
    const { session, response } = await requireSettingsAccess()
    if (response) return response
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })

    const key = pendencySettingsKeyForSession(session.user.role, session.user.tenantId)
    const data = await loadPendencySettingsByKey(key)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/pendencies/settings]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { session, response } = await requireSettingsAccess()
    if (response) return response
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })

    const tenantId = session.user.tenantId ?? null
    const key = pendencySettingsKeyForSession(session.user.role, tenantId)
    const current = await loadPendencySettingsByKey(key)
    const clean = mergePendencySettings(current, await req.json().catch(() => ({})))

    await upsertPendencySettings({
      key,
      tenantId,
      settings: clean,
      updatedByUserId: session.user.id,
      description: 'Configurações gerais da Central de Pendências',
    })

    await prisma.auditLog.create({
      data: {
        tenantId: tenantId ?? 'MASTER',
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action: 'UPDATE',
        entity: 'SystemSetting',
        entityId: PENDENCY_SETTINGS_KEY_BASE,
        beforeData: { autoArchive: { ...current.autoArchive } } as Prisma.InputJsonObject,
        afterData: { autoArchive: { ...clean.autoArchive } } as Prisma.InputJsonObject,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: clean })
  } catch (err) {
    console.error('[PUT /api/pendencies/settings]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
