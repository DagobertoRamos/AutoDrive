// /api/publications/settings — fuso, contatos, regra de venda e publicação
// automática (GET: ver; PUT: .connections — ativação expressa, registrada).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { loadPublicationSettings, savePublicationSettings } from '@/lib/publications/settings'
import { logEvent } from '@/lib/publications/service'
import { audit, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  return NextResponse.json({ success: true, data: await loadPublicationSettings(a.tenantId) })
}

export async function PUT(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.connections')
  if (a instanceof NextResponse) return a
  try {
    const before = await loadPublicationSettings(a.tenantId)
    const body = await req.json().catch(() => ({}))
    // Destinos da regra automática precisam ser contas DESTA loja.
    if (body?.autoPublish?.connectionIds) {
      const valid = new Set((await prisma.publicationConnection.findMany({ where: { tenantId: a.tenantId, id: { in: body.autoPublish.connectionIds } }, select: { id: true } })).map((c) => c.id))
      body.autoPublish.connectionIds = body.autoPublish.connectionIds.filter((x: string) => valid.has(x))
    }
    const saved = await savePublicationSettings(a.tenantId, body, { id: a.user.id, name: a.user.name })
    if (saved.autoPublish.enabled !== before.autoPublish.enabled) {
      await logEvent(prisma, { tenantId: a.tenantId, type: saved.autoPublish.enabled ? 'REGRA_AUTOMATICA_LIGADA' : 'REGRA_AUTOMATICA_DESLIGADA', message: saved.autoPublish.enabled ? `Publicação automática após aprovação das fotos LIGADA por ${a.user.name}.` : `Publicação automática desligada por ${a.user.name}.`, actor: a.actor })
    }
    await audit(a, 'UPDATE', 'PublicationSettings', a.tenantId, saved, before)
    return NextResponse.json({ success: true, data: saved })
  } catch (e) {
    return handlePrismaError(e)
  }
}
