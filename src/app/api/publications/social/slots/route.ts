// POST /api/publications/social/slots — agenda inteligente das redes:
// { requests: [{ key, connectionId, format, also? }], startLocal? }  (also = outras contas do mesmo post) → { slots: { key: "AAAA-MM-DDTHH:MM" }, notice }
// Entre 07:00 e 20:00, sem repetir horário (considera tudo o que já está
// agendado) e dentro da quantidade segura por conta/dia.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad, pubAuth } from '@/lib/publications/api'
import { isSocialFormat } from '@/lib/publications/social/formats'
import { allocateSlots } from '@/lib/publications/social/cadence'
import { CADENCE_NOTICE } from '@/lib/publications/social/cadence-core'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { requests?: unknown; startLocal?: unknown }
  const raw = Array.isArray(b.requests) ? b.requests.slice(0, 300) : []
  const own = new Set((await prisma.publicationConnection.findMany({ where: { tenantId: a.tenantId }, select: { id: true } })).map((c) => c.id))
  const requests = raw.flatMap((r) => {
    const x = r as { key?: unknown; connectionId?: unknown; format?: unknown; also?: unknown }
    const format = x.format === 'LINK' ? 'POST' : x.format
    const also = Array.isArray(x.also) ? x.also.filter((c): c is string => typeof c === 'string' && own.has(c)) : []
    return typeof x.key === 'string' && typeof x.connectionId === 'string' && own.has(x.connectionId) && isSocialFormat(format) ? [{ key: x.key.slice(0, 200), connectionId: x.connectionId, format, also }] : []
  })
  if (!requests.length) return bad('Nada para agendar.')
  const out = await allocateSlots(a.tenantId, requests, typeof b.startLocal === 'string' ? b.startLocal : undefined)
  return NextResponse.json({ success: true, slots: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.local])), notice: CADENCE_NOTICE })
}
