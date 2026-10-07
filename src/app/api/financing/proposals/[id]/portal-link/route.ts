// POST /api/financing/proposals/[id]/portal-link — gera o link seguro do cliente
// (ver situação, enviar documentos). Opcional: envia pelo WhatsApp da loja (canal
// central do SaaS). O token só existe na resposta; no banco fica o hash.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getTenantWhatsappConfig } from '@/lib/whatsapp/credentials'
import { getWhatsappAdapter } from '@/lib/whatsapp/registry'
import { issuePortalLink } from '@/lib/finance/fi/orchestrator'
import { addTimeline } from '@/lib/finance/fi/events'
import { fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

function appOrigin(req: Request) {
  const env = process.env.NEXTAUTH_URL?.replace(/\/+$/, '')
  return env || new URL(req.url).origin
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'acessarDocumentos' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const p = await findScopedProposal(auth, id)
    if (!p) return notFoundFicha()
    const d = z.object({ channel: z.enum(['COPIAR', 'WHATSAPP']).default('COPIAR') }).parse(await req.json().catch(() => ({})))
    const { token, expiresAt } = await issuePortalLink(id, auth.actor)
    const url = `${appOrigin(req)}/minha-ficha/${token}`
    const person = await prisma.financeProponent.findUnique({ where: { id: p.proponentId }, select: { nomeCompleto: true, razaoSocial: true, personType: true, celular: true } })
    const pending = await prisma.financeProposalDocument.findMany({ where: { proposalId: id, status: 'PENDENTE' }, select: { type: true }, take: 5 })
    const first = (person?.personType === 'PJ' ? person?.razaoSocial : person?.nomeCompleto)?.split(' ')[0] ?? ''
    const ask = pending.length
      ? `precisamos de ${pending.map((x) => x.type.toLowerCase()).join(', ')} para concluir a análise do financiamento`
      : 'você pode acompanhar a análise do seu financiamento'
    const message = `Olá${first ? `, ${first}` : ''}! ${ask[0].toUpperCase()}${ask.slice(1)}. Acesse pelo link seguro: ${url}`

    let sent: { ok: boolean; error?: string } | null = null
    if (d.channel === 'WHATSAPP') {
      const phone = (person?.celular ?? '').replace(/\D/g, '')
      const cfg = await getTenantWhatsappConfig(auth.tenantId)
      const adapter = cfg ? getWhatsappAdapter(cfg.kind) : null
      if (phone.length < 10) sent = { ok: false, error: 'O cliente não tem celular válido na ficha.' }
      else if (!cfg || !adapter) sent = { ok: false, error: 'O WhatsApp da loja não está configurado. Copie o link e envie pelo seu WhatsApp.' }
      else {
        try {
          await adapter.sendText({ to: phone.startsWith('55') ? phone : `55${phone}`, text: message }, cfg.creds)
          sent = { ok: true }
          await addTimeline(prisma, { tenantId: auth.tenantId, proposalId: id, type: 'PORTAL', source: 'MANUAL', actorId: auth.actor.id, message: 'Link enviado ao cliente pelo WhatsApp da loja.' })
        } catch (e) {
          console.error('[fi/portal] WhatsApp', e instanceof Error ? e.message : e)
          sent = { ok: false, error: 'O WhatsApp não aceitou o envio agora. Copie o link e envie pelo seu WhatsApp.' }
        }
      }
    }
    return NextResponse.json({ success: true, data: { url, expiresAt, message, sent } })
  } catch (err) { return fiErrorResponse(err) }
}
