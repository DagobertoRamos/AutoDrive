// /api/publications/wizard — progresso do assistente "Nova publicação" por
// usuário (retoma de onde parou, em qualquer computador). Expira em 2 dias.
//   GET  → { data: estado | null, savedAt }
//   PUT  → grava o estado (veículos, etapa, destinos, estúdio)
//   DELETE → descarta (ao publicar ou "começar do zero")
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad, pubAuth } from '@/lib/publications/api'
import { RETENTION_DAYS } from '@/lib/publications/retention'

export const dynamic = 'force-dynamic'
const key = (tenantId: string, userId: string) => `u:${userId}:t:${tenantId}:pubwizard:v1`

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const row = await prisma.systemSetting.findUnique({ where: { key: key(a.tenantId, a.user.id) } })
  if (!row || row.updatedAt.getTime() < Date.now() - RETENTION_DAYS * 86_400_000) return NextResponse.json({ success: true, data: null })
  try { return NextResponse.json({ success: true, data: JSON.parse(row.value), savedAt: row.updatedAt }) } catch { return NextResponse.json({ success: true, data: null }) }
}

export async function PUT(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const text = await req.text()
  if (text.length > 60_000) return bad('Progresso grande demais.')
  let body: unknown
  try { body = JSON.parse(text) } catch { return bad('Progresso inválido.') }
  const b = (body ?? {}) as Record<string, unknown>
  const value = JSON.stringify({
    step: Number.isInteger(b.step) ? b.step : 0,
    selected: Array.isArray(b.selected) ? b.selected.filter((x) => typeof x === 'string').slice(0, 50) : [],
    targets: Array.isArray(b.targets) ? b.targets.filter((x) => typeof x === 'string').slice(0, 30) : [],
    campaign: typeof b.campaign === 'string' ? b.campaign.slice(0, 60) : 'principal',
    social: b.social && typeof b.social === 'object' ? b.social : null,
  })
  const k = key(a.tenantId, a.user.id)
  await prisma.systemSetting.upsert({ where: { key: k }, create: { key: k, tenantId: a.tenantId, value, group: 'publications', description: 'Progresso da Nova publicação' }, update: { value } })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  await prisma.systemSetting.deleteMany({ where: { key: key(a.tenantId, a.user.id) } })
  return NextResponse.json({ success: true })
}
