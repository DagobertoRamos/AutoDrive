// /api/publications/settings — fuso, contatos, regra de venda e publicação
// automática (GET: ver; PUT: .connections — ativação expressa, registrada).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { loadPublicationSettings, savePublicationSettings } from '@/lib/publications/settings'
import { logEvent } from '@/lib/publications/service'
import { audit, pubAuth } from '@/lib/publications/api'
import { planAutoProgram } from '@/lib/publications/social/autoprog'

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
    if (body?.autoProgram?.connectionIds) {
      const valid = new Set((await prisma.publicationConnection.findMany({ where: { tenantId: a.tenantId, id: { in: body.autoProgram.connectionIds } }, select: { id: true } })).map((c) => c.id))
      body.autoProgram.connectionIds = body.autoProgram.connectionIds.filter((x: string) => valid.has(x))
    }
    if (body?.autoPublish?.connectionIds) {
      const valid = new Set((await prisma.publicationConnection.findMany({ where: { tenantId: a.tenantId, id: { in: body.autoPublish.connectionIds } }, select: { id: true } })).map((c) => c.id))
      body.autoPublish.connectionIds = body.autoPublish.connectionIds.filter((x: string) => valid.has(x))
    }
    const saved = await savePublicationSettings(a.tenantId, body, { id: a.user.id, name: a.user.name })
    if (saved.autoPublish.enabled !== before.autoPublish.enabled) {
      await logEvent(prisma, { tenantId: a.tenantId, type: saved.autoPublish.enabled ? 'REGRA_AUTOMATICA_LIGADA' : 'REGRA_AUTOMATICA_DESLIGADA', message: saved.autoPublish.enabled ? `Publicação automática após aprovação das fotos LIGADA por ${a.user.name}.` : `Publicação automática desligada por ${a.user.name}.`, actor: a.actor })
    }
    await audit(a, 'UPDATE', 'PublicationSettings', a.tenantId, saved, before)
    if (saved.autoProgram.enabled !== before.autoProgram.enabled) {
      await logEvent(prisma, { tenantId: a.tenantId, type: saved.autoProgram.enabled ? 'PROGRAMACAO_LIGADA' : 'PROGRAMACAO_DESLIGADA', message: `Programação automática ${saved.autoProgram.enabled ? 'LIGADA' : 'desligada'} por ${a.user.name}.`, actor: a.actor })
    }
    // Programação ligada: já preenche as próximas 48 h (a rotina mantém a cada 15 min).
    const program = saved.autoProgram.enabled ? await planAutoProgram(a.tenantId).catch((e) => ({ planned: 0, message: `Não foi possível programar agora: ${(e as Error).message}` })) : null
    return NextResponse.json({ success: true, data: saved, program: program ? { planned: program.planned, message: program.message } : null })
  } catch (e) {
    return handlePrismaError(e)
  }
}
