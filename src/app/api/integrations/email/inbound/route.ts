// =============================================================================
// POST /api/integrations/email/inbound — recebimento de e-mails de lead.
// O serviço de e-mail de entrada da plataforma (Postmark, SendGrid Inbound
// Parse, Mailgun Routes ou Cloudflare Email Workers) entrega aqui cada e-mail
// enviado para leads+<chave do canal>@INBOUND_EMAIL_DOMAIN.
// Autenticação: segredo da plataforma (INBOUND_EMAIL_SECRET) no cabeçalho
// x-inbound-secret, Bearer ou ?secret=. Sem o segredo configurado: desligado.
// O e-mail é gravado ANTES de processar; 2xx assim que estiver gravado.
// =============================================================================

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { channelKeyFromAddress, normalizeInboundEmail } from '@/lib/crm/email-lead-core'
import { resolveChannelInsensitive } from '@/lib/crm/channels'
import { EMAIL_PROVIDER, handleEmailLeadEvent, inboundEmailDomain } from '@/lib/crm/email-intake'
import { processInboxEvent, receiveEvent } from '@/lib/integrations/inbox'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 2_000_000

function authorized(req: Request): boolean {
  const secret = process.env.INBOUND_EMAIL_SECRET ?? ''
  if (!secret) return false
  const url = new URL(req.url)
  const got = req.headers.get('x-inbound-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('secret') ?? ''
  const a = Buffer.from(got), b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function readBody(req: Request): Promise<unknown> {
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData()
    const out: Record<string, string> = {}
    for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v.slice(0, 200_000)
    return out
  }
  const text = await req.text()
  if (text.length > MAX_BYTES) throw new Error('too_large')
  return JSON.parse(text)
}

export async function POST(req: Request) {
  const domain = inboundEmailDomain()
  if (!domain || !process.env.INBOUND_EMAIL_SECRET) return NextResponse.json({ ok: false, error: 'Recebimento de e-mail não configurado.' }, { status: 503 })
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 })

  let body: unknown
  try { body = await readBody(req) } catch { return NextResponse.json({ ok: false, error: 'Corpo inválido.' }, { status: 400 }) }
  const mail = normalizeInboundEmail(body)
  // 2xx em conteúdo inválido: o serviço de e-mail não deve ficar reenviando.
  if (!mail) return NextResponse.json({ ok: true, ignored: 'E-mail sem destinatário ou texto.' })
  const key = channelKeyFromAddress(mail.to, domain)
  const found = key ? await resolveChannelInsensitive(key) : null
  if (!found) return NextResponse.json({ ok: true, ignored: 'Endereço não pertence a nenhum canal.' })

  let ev
  try {
    ev = await receiveEvent({
      provider: EMAIL_PROVIDER, kind: 'EMAIL', tenantId: found.tenantId, channelRef: found.channel.id,
      scope: `${found.tenantId}:${found.channel.id}`, providerEventId: mail.messageId || null, payload: mail,
    })
  } catch (err) {
    console.error('[email/inbound] não gravou:', err)
    return NextResponse.json({ ok: false, error: 'Falha temporária.' }, { status: 500 })
  }
  if (ev.duplicate) return NextResponse.json({ ok: true, duplicate: true, eventId: ev.correlationId })
  const r = await processInboxEvent(ev.id, handleEmailLeadEvent)
  return NextResponse.json({ ok: true, status: r.status, leadId: r.resultRef, eventId: ev.correlationId }, { status: r.status === 'PROCESSED' ? 200 : 202 })
}
