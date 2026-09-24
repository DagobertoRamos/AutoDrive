// =============================================================================
// POST /api/integrations/leads/[key] — URL de entrada de um canal de captação
// (Facebook/Instagram via conector, TikTok, Google Ads, OLX, RD Station, n8n...).
// Pública: a chave na URL identifica loja + canal. Aceita JSON ou formulário.
// Respostas: 200 ok · 4xx conteúdo recusado (não reenviar) · 5xx reenviar.
// GET: teste de vida e verificação de webhook no padrão Meta (hub.challenge).
// =============================================================================

import { NextResponse } from 'next/server'
import { resolveChannel } from '@/lib/crm/channels'
import { intakeChannelLead } from '@/lib/crm/channel-intake'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 200_000
const hits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > 120
}

async function readBody(req: Request): Promise<unknown> {
  const text = await req.text()
  if (text.length > MAX_BYTES) throw new Error('too_large')
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text))
  try { return JSON.parse(text) } catch { return Object.fromEntries(new URLSearchParams(text)) }
}

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const found = await resolveChannel(key)
  if (!found) return NextResponse.json({ success: false, error: 'Canal não encontrado.' }, { status: 404 })
  if (rateLimited(key)) return NextResponse.json({ success: false, error: 'Muitas requisições.' }, { status: 429 })

  let body: unknown
  try { body = await readBody(req) } catch {
    return NextResponse.json({ success: false, error: 'Corpo grande demais.' }, { status: 413 })
  }
  const r = await intakeChannelLead(found.tenantId, found.channel, body, req.headers.get('authorization'))
  return NextResponse.json(r.body, { status: r.status })
}

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const found = await resolveChannel(key)
  if (!found) return NextResponse.json({ success: false, error: 'Canal não encontrado.' }, { status: 404 })
  const sp = new URL(req.url).searchParams
  // Verificação no padrão Meta/Facebook: devolve o desafio se o token confere.
  if (sp.get('hub.mode') === 'subscribe') {
    const token = sp.get('hub.verify_token') ?? ''
    const expected = found.channel.secret || key
    return token === expected ? new Response(sp.get('hub.challenge') ?? '', { status: 200 }) : new Response('Forbidden', { status: 403 })
  }
  return NextResponse.json({ success: true, channel: found.channel.name, active: found.channel.active, message: 'Canal pronto para receber leads por POST.' })
}
