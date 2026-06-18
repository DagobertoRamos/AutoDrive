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

const KEY_BASE = 'pendency_settings'
const GROUP    = 'pendency'

const PRIORITIES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const
const WEEKDAYS   = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

type Priority = (typeof PRIORITIES)[number]

interface PendencySettings {
  slaByPriority: Record<Priority, number>   // minutos
  autoSend: {
    enabled:     boolean
    allowedDays: string[]                    // subset de WEEKDAYS
    startTime:   string                      // "HH:MM"
    endTime:     string                      // "HH:MM"
    frequency:   string                      // DAILY | HOURLY | WEEKLY
    maxSends:    number
    sendsPerDay: number
  }
}

const DEFAULTS: PendencySettings = {
  slaByPriority: { BAIXA: 4320, MEDIA: 2880, ALTA: 1440, URGENTE: 480 },
  autoSend: {
    enabled:     false,
    allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    startTime:   '08:00',
    endTime:     '18:00',
    frequency:   'DAILY',
    maxSends:    5,
    sendsPerDay: 1,
  },
}

function keyFor(role: string, tenantId: string | null | undefined) {
  return role === 'MASTER' || !tenantId ? `global:${KEY_BASE}` : `t:${tenantId}:${KEY_BASE}`
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// Saneia/normaliza o payload contra o shape esperado (sem zod, igual a commissions).
function sanitize(raw: unknown): PendencySettings {
  const b = (raw ?? {}) as Record<string, unknown>
  const slaRaw = (b.slaByPriority ?? {}) as Record<string, unknown>
  const autoRaw = (b.autoSend ?? {}) as Record<string, unknown>

  const sla = {} as Record<Priority, number>
  for (const p of PRIORITIES) {
    const n = Number(slaRaw[p])
    sla[p] = Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 60 * 24 * 30) : DEFAULTS.slaByPriority[p]
  }

  const days = Array.isArray(autoRaw.allowedDays)
    ? (autoRaw.allowedDays as unknown[]).map(String).filter((d) => (WEEKDAYS as readonly string[]).includes(d))
    : DEFAULTS.autoSend.allowedDays

  const start = typeof autoRaw.startTime === 'string' && HHMM.test(autoRaw.startTime) ? autoRaw.startTime : DEFAULTS.autoSend.startTime
  const end   = typeof autoRaw.endTime === 'string' && HHMM.test(autoRaw.endTime) ? autoRaw.endTime : DEFAULTS.autoSend.endTime
  const freq  = ['DAILY', 'HOURLY', 'WEEKLY'].includes(String(autoRaw.frequency)) ? String(autoRaw.frequency) : DEFAULTS.autoSend.frequency

  const clampInt = (v: unknown, def: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), max) : def
  }

  return {
    slaByPriority: sla,
    autoSend: {
      enabled:     Boolean(autoRaw.enabled),
      allowedDays: days.length ? Array.from(new Set(days)) : DEFAULTS.autoSend.allowedDays,
      startTime:   start,
      endTime:     end,
      frequency:   freq,
      maxSends:    clampInt(autoRaw.maxSends, DEFAULTS.autoSend.maxSends, 100),
      sendsPerDay: clampInt(autoRaw.sendsPerDay, DEFAULTS.autoSend.sendsPerDay, 24),
    },
  }
}

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

    const key = keyFor(session.user.role, session.user.tenantId)
    const setting = await prisma.systemSetting.findFirst({ where: { key } })
    const data = setting?.value ? sanitize(JSON.parse(setting.value)) : DEFAULTS

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

    const tid = session.user.tenantId ?? null
    const key = keyFor(session.user.role, tid)
    const clean = sanitize(await req.json())
    const value = JSON.stringify(clean)

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
          description:     'Padrões automáticos de pendências (SLA + janela de envio)',
          group:           GROUP,
          tenantId:        tid,
          updatedByUserId: session.user.id,
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        tenantId:  tid ?? 'MASTER',
        userId:    session.user.id,
        userName:  session.user.name,
        userRole:  session.user.role,
        action:    'UPDATE',
        entity:    'SystemSetting',
        entityId:  KEY_BASE,
        afterData: { key: KEY_BASE },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: clean })
  } catch (err) {
    console.error('[PUT /api/settings/pendencies]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
