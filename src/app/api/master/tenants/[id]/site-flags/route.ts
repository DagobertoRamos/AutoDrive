// /api/master/tenants/[id]/site-flags — chaves do site que só o MASTER controla.
// GET  → { originTags }
// PUT  { originTags: boolean } → liga/desliga as etiquetas de origem no site
import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { siteOriginTagsOn, setSiteOriginTags } from '@/lib/site/origin-tags'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { error } = await requireMaster()
  if (error) return error
  const { id } = await params
  return NextResponse.json({ success: true, data: { originTags: await siteOriginTagsOn(id) } })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireMaster()
  if (error) return error
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (typeof body?.originTags !== 'boolean') return NextResponse.json({ success: false, error: 'Informe se as etiquetas ficam ligadas.' }, { status: 400 })
  await setSiteOriginTags(id, body.originTags, session.id)
  await logMasterAction(session, 'SET_SITE_ORIGIN_TAGS', 'Tenant', id, { tenantId: id, afterData: { originTags: body.originTags }, req })
  return NextResponse.json({ success: true, data: { originTags: body.originTags } })
}
