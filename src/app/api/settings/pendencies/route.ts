// =============================================================================
// API: /api/settings/pendencies — AutoDrive
// Padrões automáticos das pendências (SLA por prioridade + janela de envio).
// Persiste como JSON em SystemSetting. Chave: `t:{tenantId}:pendency_settings`
// (MASTER usa `global:pendency_settings`). Gate: stock.pendencies.configure.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
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

// ── GET — retorna configuração atual (ou defaults) ───────────────────────────
export async function GET() {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'stock.pendencies.configure')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'stock.pendencies.configure'); if (gate) return gate }

    const key = pendencySettingsKeyForSession(session.user.role, session.user.tenantId)
    const data = await loadPendencySettingsByKey(key)

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/settings/pendencies]', err)
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
    if (!canAccessModule(session.user.role, 'stock.pendencies.configure')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'stock.pendencies.configure'); if (gate) return gate }

    const tid = session.user.tenantId ?? null
    const key = pendencySettingsKeyForSession(session.user.role, tid)
    const current = await loadPendencySettingsByKey(key)
    const clean = mergePendencySettings(current, await req.json())

    await upsertPendencySettings({
      key,
      tenantId: tid,
      settings: clean,
      updatedByUserId: session.user.id,
      description: 'Padrões automáticos de pendências (SLA + janela de envio)',
    })

    await prisma.auditLog.create({
      data: {
        tenantId:  tid ?? 'MASTER',
        userId:    session.user.id,
        userName:  session.user.name,
        userRole:  session.user.role,
        action:    'UPDATE',
        entity:    'SystemSetting',
        entityId:  PENDENCY_SETTINGS_KEY_BASE,
        afterData: { key: PENDENCY_SETTINGS_KEY_BASE },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: clean })
  } catch (err) {
    console.error('[PUT /api/settings/pendencies]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
