// =============================================================================
// GET /api/publications/oauth/<mercado-livre|olx|meta>/start    → vai ao canal
// GET /api/publications/oauth/<mercado-livre|olx|meta>/callback → volta do canal
// O `state` assinado liga o retorno à MESMA loja e ao MESMO usuário logado.
// Gate: .connections
// =============================================================================

import { NextResponse } from 'next/server'
import { isConnectorError } from '@/lib/publications/errors'
import { authorizeUrl, completeOAuth, oauthConfigured, signState, verifyState, type OAuthChannel } from '@/lib/publications/oauth'
import { audit, kickWorker, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'

const CHANNEL: Record<string, OAuthChannel> = { 'mercado-livre': 'MERCADO_LIVRE', olx: 'OLX', meta: 'META', mobiauto: 'MOBIAUTO' }

function back(req: Request, params: Record<string, string>) {
  const u = new URL('/marketing/canais', req.url)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return NextResponse.redirect(u)
}

export async function GET(req: Request, ctx: { params: Promise<{ channel: string; step: string }> }) {
  const { channel: slug, step } = await ctx.params
  const channel = CHANNEL[slug]
  if (!channel || (step !== 'start' && step !== 'callback')) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  const a = await pubAuth(req, 'marketing.publications.connections')
  if (a instanceof NextResponse) return a

  if (step === 'start') {
    if (!await oauthConfigured(channel)) return back(req, { erro: 'A plataforma ainda não tem o aplicativo oficial deste canal configurado. Fale com o suporte AutoDrive.' })
    return NextResponse.redirect(await authorizeUrl(channel, signState({ t: a.tenantId, u: a.user.id, c: channel })))
  }

  const sp = new URL(req.url).searchParams
  if (sp.get('error')) return back(req, { erro: `Autorização não concedida (${sp.get('error_description') || sp.get('error')}).` })
  const claims = verifyState(sp.get('state') ?? '')
  if (!claims || claims.c !== channel) return back(req, { erro: 'Link de autorização expirado ou inválido. Tente conectar de novo.' })
  if (claims.u !== a.user.id || claims.t !== a.tenantId) return back(req, { erro: 'A autorização foi iniciada por outro usuário ou outra loja.' })
  const code = sp.get('code')
  if (!code) return back(req, { erro: 'O canal não devolveu o código de autorização.' })
  try {
    const r = await completeOAuth(claims, code, a.actor)
    await audit(a, 'CONNECT', 'PublicationConnection', null, { channel, contas: r.connected })
    kickWorker()
    return back(req, { ok: `Conectado: ${r.connected.join(', ')}` })
  } catch (e) {
    return back(req, { erro: isConnectorError(e) ? `${e.message}${e.hint ? ` ${e.hint}` : ''}` : 'Falha ao concluir a autorização.' })
  }
}
