// =============================================================================
// /api/publications/connections
//   GET  catálogo de canais (desenvolvimento do conector ≠ conexão da loja) +
//        contas da loja (só dicas mascaradas; segredos nunca saem do servidor)
//   POST conecta canal por CREDENCIAIS de integração (Webmotors, Chaves na Mão).
//        Testa na hora; sem sucesso fica "com pendência" e mostra o motivo.
//        Nunca pede senha pessoal de rede social (essas usam OAuth).
//        Facebook/Instagram também aceitam TOKEN de acesso colado pela loja
//        (usuário do sistema do Gerenciador de Negócios) enquanto o app da
//        plataforma não passa no App Review.
// Gate: ver = marketing.publications; conectar = .connections
// =============================================================================

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { CHANNELS, channelSpec, isPublishable } from '@/lib/publications/channels'
import { isConnectorError } from '@/lib/publications/errors'
import { getConnector } from '@/lib/publications/connectors'
import { connectMetaByToken, oauthConfigured } from '@/lib/publications/oauth'
import { ensureSiteConnection, logEvent, maskHint, releaseBlockedJobs, sealSecrets } from '@/lib/publications/service'
import { connectorContext } from '@/lib/publications/worker'
import { audit, bad, kickWorker, permissions, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  await ensureSiteConnection(a.tenantId)
  const conns = await prisma.publicationConnection.findMany({
    where: { tenantId: a.tenantId }, orderBy: [{ channel: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, channel: true, label: true, externalAccountId: true, status: true, environment: true, maskedHints: true, config: true, tokenExpiresAt: true, throttledUntil: true, quota: true, lastCheckedAt: true, lastError: true, connectedAt: true, disconnectedAt: true, _count: { select: { publications: { where: { archivedAt: null } } } } },
  })
  const [ml, olx, meta, mobi, tiktok] = await Promise.all([oauthConfigured('MERCADO_LIVRE'), oauthConfigured('OLX'), oauthConfigured('META'), oauthConfigured('MOBIAUTO'), oauthConfigured('TIKTOK')])
  const oauth = { MERCADO_LIVRE: ml, OLX: olx, META: meta, MOBIAUTO: mobi, TIKTOK: tiktok }
  return NextResponse.json({
    success: true,
    data: {
      channels: CHANNELS.map((c) => ({ ...c, publishable: isPublishable(c) || c.mechanism === 'MANUAL', implemented: !!getConnector(c.id) || c.mechanism === 'MANUAL' || c.mechanism === 'FEED' })).sort((x, y) => x.priority - y.priority),
      connections: conns.map((c) => ({ ...c, activePublications: c._count.publications })),
      oauth, can: await permissions(a.user),
    },
  })
}

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.connections')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { channel?: string; label?: string; environment?: string; credentials?: Record<string, unknown>; config?: Record<string, unknown> }
  const spec = channelSpec(String(b.channel ?? ''))
  if (!spec) return bad('Canal desconhecido.')
  if (spec.id === 'META_PAGE' || spec.id === 'INSTAGRAM') {
    const str = (k: string) => (typeof b.credentials?.[k] === 'string' ? (b.credentials[k] as string).trim().slice(0, 1000) : '')
    const token = str('token')
    if (!token) return bad('Cole o token de acesso gerado no Gerenciador de Negócios da Meta.')
    try {
      const r = await connectMetaByToken(a.tenantId, { token, appId: str('appId') || undefined, appSecret: str('appSecret') || undefined }, a.actor)
      await audit(a, 'CONNECT', 'PublicationConnection', r.connected.join(', '), { channel: 'META', method: 'token' })
      // Token curto (horas/dias) para de publicar sozinho: avisa bem claro.
      const hrs = r.expiresAt ? (r.expiresAt.getTime() - Date.now()) / 3_600_000 : null
      const quando = r.expiresAt?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      const validade = hrs == null ? ' Token permanente: as publicações não param por vencimento.'
        : hrs < 72 ? ` ATENÇÃO: este token é TEMPORÁRIO e vence em ${quando} (${Math.max(1, Math.round(hrs))} h). Depois disso Facebook/Instagram param de publicar. Use o token de usuário do sistema do Gerenciador de Negócios (não expira) ou informe o ID e a chave secreta do app para torná-lo de longo prazo.`
        : ` Atenção: este token vence em ${quando} — o sistema avisa 7 dias antes; prefira o token de usuário do sistema (não expira).`
      kickWorker()
      return NextResponse.json({ success: true, ok: true, message: `Conectado: ${r.connected.join(', ')}.${validade}` })
    } catch (e) {
      if (isConnectorError(e)) return bad(`${e.message}${e.hint ? ` ${e.hint}` : ''}`)
      return handlePrismaError(e)
    }
  }
  if (spec.connect !== 'CREDENCIAIS' || !spec.credentialFields) return bad(spec.connect === 'OAUTH' ? 'Este canal é conectado pelo botão "Conectar" (autorização oficial).' : 'Este canal não precisa de conexão.')
  const creds: Record<string, string> = {}
  for (const f of spec.credentialFields) {
    const v = typeof b.credentials?.[f.key] === 'string' ? (b.credentials[f.key] as string).trim() : ''
    if (!v) return bad(`Preencha: ${f.label}.`)
    creds[f.key] = v.slice(0, 500)
  }
  const accountId = spec.id === 'WEBMOTORS' ? creds.cnpj.replace(/\D/g, '') : `conta-${maskHint(creds.token ?? '').replace(/\W/g, '')}`
  const hints = Object.fromEntries(spec.credentialFields.map((f) => [f.label, f.secret ? maskHint(creds[f.key]) : creds[f.key]]))
  const environment = b.environment === 'HOMOLOGACAO' ? 'HOMOLOGACAO' : 'PRODUCAO'
  const config = (b.config && typeof b.config === 'object' ? b.config : {}) as Prisma.InputJsonValue
  try {
    const conn = await prisma.publicationConnection.upsert({
      where: { tenantId_channel_externalAccountId: { tenantId: a.tenantId, channel: spec.id, externalAccountId: accountId } },
      create: { tenantId: a.tenantId, channel: spec.id, externalAccountId: accountId, label: String(b.label || `${spec.name} ${accountId}`).slice(0, 80), status: 'PENDENCIA', environment, secretsEncrypted: sealSecrets(creds), maskedHints: hints, config, connectedById: a.user.id, connectedAt: new Date() },
      update: { label: String(b.label || `${spec.name} ${accountId}`).slice(0, 80), environment, secretsEncrypted: sealSecrets(creds), maskedHints: hints, config, connectedById: a.user.id, connectedAt: new Date(), disconnectedAt: null, status: 'PENDENCIA' },
    })
    // Teste imediato (autenticação aprovada ≠ publicação comprovada).
    let test: { ok: boolean; message: string; quota?: Record<string, unknown> } = { ok: false, message: 'Conector sem teste.' }
    const connector = getConnector(spec.id)
    if (connector?.testConnection) {
      try { test = await connector.testConnection(await connectorContext(conn, {})) } catch (e) { test = { ok: false, message: isConnectorError(e) ? `${e.message}${e.hint ? ` ${e.hint}` : ''}` : (e as Error).message } }
    }
    await prisma.publicationConnection.update({ where: { id: conn.id }, data: { status: test.ok ? 'CONECTADO' : 'PENDENCIA', lastCheckedAt: new Date(), lastError: test.ok ? null : test.message.slice(0, 500), quota: (test.quota ?? undefined) as Prisma.InputJsonValue | undefined } })
    if (test.ok) await releaseBlockedJobs(a.tenantId, conn.id)
    await logEvent(prisma, { tenantId: a.tenantId, channel: spec.id, type: test.ok ? 'CONECTADA' : 'CONEXAO_PENDENTE', message: `${spec.name}: ${test.message}`, actor: a.actor })
    await audit(a, 'CONNECT', 'PublicationConnection', conn.id, { channel: spec.id, environment, ok: test.ok })
    return NextResponse.json({ success: true, id: conn.id, ok: test.ok, message: test.message })
  } catch (e) {
    return handlePrismaError(e)
  }
}
