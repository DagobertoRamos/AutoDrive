// =============================================================================
// POST /api/publications/platform-app — cadastra o app OAuth do canal
// (client key/segredo) direto da tela Canais conectados.
//   • MASTER: app DA PLATAFORMA (todas as lojas) — mesmo lugar de Master ›
//     Integrações (IntegrationCredential PUB_*, segredo cifrado).
//   • Loja (quem gerencia conexões): app PRÓPRIO da loja, que vale antes do
//     da plataforma só para ela (SystemSetting t:<loja>:pubapp:<canal>, cifrado).
// Testa pelo meio oficial do canal antes de gravar e devolve o link de login.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, bad, pubAuth } from '@/lib/publications/api'
import { clearPlatformAppCache, saveTenantApp, sealIfPublication, testPlatformApp, type PlatformChannel } from '@/lib/publications/platform-apps'

export const dynamic = 'force-dynamic'

const SERVICE: Partial<Record<PlatformChannel, { service: string; name: string; slug: string }>> = {
  TIKTOK: { service: 'PUB_TIKTOK', name: 'TikTok (app da plataforma)', slug: 'tiktok' },
  MERCADO_LIVRE: { service: 'PUB_MERCADO_LIVRE', name: 'Mercado Livre (app da plataforma)', slug: 'mercado-livre' },
  OLX: { service: 'PUB_OLX', name: 'OLX (app da plataforma)', slug: 'olx' },
  MOBIAUTO: { service: 'PUB_MOBIAUTO', name: 'Mobiauto (app da plataforma)', slug: 'mobiauto' },
}

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.connections')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { channel?: string; clientId?: string; clientSecret?: string }
  const def = SERVICE[String(b.channel ?? '') as PlatformChannel]
  if (!def) return bad('Canal sem aplicativo de plataforma.')
  const clientId = String(b.clientId ?? '').trim().slice(0, 200)
  const secret = String(b.clientSecret ?? '').trim().slice(0, 500)
  if (!clientId || !secret) return bad('Informe a client key e o client secret.')

  const sealed = sealIfPublication(def.service, secret)
  const test = await testPlatformApp(def.service, clientId, sealed)
  // App recusado não é gravado: o botão "Conectar" levaria a um login que falha.
  if (!test.ok) return bad(test.message)
  const start = `/api/publications/oauth/${def.slug}/start`
  if (a.user.role !== 'MASTER') {
    await saveTenantApp(a.tenantId, b.channel as PlatformChannel, clientId, secret)
    await audit(a, 'UPDATE', 'PublicationApp', b.channel ?? null, { canal: b.channel, escopo: 'loja' })
    return NextResponse.json({ success: true, ok: true, message: test.message, start })
  }
  const now = new Date()
  const existing = await prisma.integrationCredential.findFirst({ where: { service: def.service }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] })
  const data = { apiKey: clientId, apiSecret: sealed, active: true, isDefault: true, lastTestedAt: now, lastTestOk: true, lastTestMsg: test.message }
  const cred = existing
    ? await prisma.integrationCredential.update({ where: { id: existing.id }, data })
    : await prisma.integrationCredential.create({ data: { service: def.service, name: def.name, createdById: a.user.id, ...data } })
  clearPlatformAppCache()
  await audit(a, 'UPDATE', 'IntegrationCredential', cred.id, { service: def.service, origem: 'Canais conectados', testeOk: test.ok })
  return NextResponse.json({ success: true, ok: true, message: test.message, start })
}
