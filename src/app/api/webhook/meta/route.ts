import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

// Sem fallback fixo: o token vem do ambiente (ver .env.example).
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

// Assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo BRUTO com o App Secret
// do app da Meta que entrega o webhook). Sem a env configurada, aceita mas avisa.
let warnedNoSecret = false
function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_WEBHOOK_APP_SECRET
  if (!secret) {
    if (!warnedNoSecret) { console.warn('[webhook/meta] META_WEBHOOK_APP_SECRET não configurado — assinatura NÃO verificada.'); warnedNoSecret = true }
    return true
  }
  if (!header?.startsWith('sha256=')) return false
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex'), 'utf8')
  const got = Buffer.from(header.slice(7), 'utf8')
  return got.length === expected.length && crypto.timingSafeEqual(got, expected)
}

// Loja dona do número (phone_number_id) que recebeu a mensagem, se configurada.
async function tenantByPhoneNumberId(phoneNumberId: string | undefined): Promise<string | null> {
  if (!phoneNumberId) return null
  const prov = await prisma.whatsappProvider.findFirst({ where: { phoneNumberId, tenantId: { not: null } }, select: { tenantId: true } }).catch(() => null)
  if (prov?.tenantId) return prov.tenantId
  const setting = await prisma.systemSetting.findFirst({
    where: { key: { startsWith: 't:', endsWith: ':whatsapp.phoneNumberId' }, value: { in: [phoneNumberId, JSON.stringify(phoneNumberId)] } },
    select: { key: true },
  }).catch(() => null)
  return setting ? setting.key.slice(2, -':whatsapp.phoneNumberId'.length) : null
}

// =============================================================================
// GET — Verificação do webhook pela Meta
// =============================================================================
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    console.info('[webhook/meta] Verificação bem-sucedida')
    return new Response(challenge ?? '', { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// =============================================================================
// POST — Recebimento de eventos da Meta
// =============================================================================
export async function POST(req: Request) {
  let rawPayload: unknown

  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  try {
    rawPayload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Registrar o payload bruto
  const log = await prisma.webhookLog.create({
    data: {
      provider: 'META',
      direction: 'INBOUND',
      payload: rawPayload as any,
      processed: false,
    },
    select: { id: true },
  }).catch(err => { console.error('[webhook] Failed to save log:', err); return null })

  try {
    const body = rawPayload as any
    const entry = body?.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (!value) {
      return NextResponse.json({ status: 'ok' })
    }

    // Processar mensagens recebidas
    if (value.messages?.length > 0) {
      const tenantId = await tenantByPhoneNumberId(value.metadata?.phone_number_id)
      for (const msg of value.messages) {
        await processInboundMessage(msg, value.contacts?.[0], tenantId)
      }
    }

    // Processar status de entrega/leitura
    if (value.statuses?.length > 0) {
      for (const status of value.statuses) {
        await processMessageStatus(status)
      }
    }

    // Marcar log como processado (só o desta entrega)
    if (log) await prisma.webhookLog.update({
      where: { id: log.id },
      data: { processed: true },
    }).catch(() => { /* silent */ })

  } catch (err) {
    console.error('[webhook/meta] Processing error:', err)
    if (log) await prisma.webhookLog.update({
      where: { id: log.id },
      data: { error: String(err) },
    }).catch(() => { /* silent */ })
  }

  return NextResponse.json({ status: 'ok' })
}

// =============================================================================
// Processamento de mensagem recebida
// =============================================================================
async function processInboundMessage(msg: any, contact: any, tenantId: string | null) {
  const from = msg.from // número WhatsApp do remetente
  const messageType = msg.type
  const messageBody = msg.text?.body ?? msg.caption ?? ''
  const profileName = contact?.profile?.name ?? null
  const whatsappMessageId = msg.id

  // Buscar vendedor pelo WhatsApp — na loja dona do número; sem loja conhecida,
  // só aceita se o telefone casar com UM único vendedor (evita cruzar lojas).
  const sellers = await prisma.seller.findMany({
    where: { whatsapp: { contains: from.replace(/\D/g, '').slice(-11) }, ...(tenantId ? { unit: { tenantId } } : {}) },
    take: 2,
  })
  const seller = tenantId ? (sellers[0] ?? null) : (sellers.length === 1 ? sellers[0] : null)

  // Buscar pendência mais recente deste vendedor
  let pendencyId: string | null = null
  if (seller) {
    const recentPendency = await prisma.pendency.findFirst({
      where: { responsibleId: seller.id, status: { in: ['ABERTA', 'EM_ANDAMENTO'] } },
      orderBy: { lastSentAt: 'desc' },
    })
    pendencyId = recentPendency?.id ?? null
  }

  // Salvar retorno
  const messageReturn = await prisma.messageReturn.create({
    data: {
      whatsappFrom: from,
      profileName,
      messageType,
      messageBody,
      whatsappMessageId,
      pendencyId,
      sellerId: seller?.id ?? null,
      managerId: pendencyId
        ? (await prisma.pendency.findUnique({ where: { id: pendencyId }, select: { managerId: true } }))?.managerId ?? null
        : null,
      customerName: pendencyId
        ? (await prisma.pendency.findUnique({ where: { id: pendencyId }, select: { customerName: true } }))?.customerName ?? null
        : null,
      plate: pendencyId
        ? (await prisma.pendency.findUnique({ where: { id: pendencyId }, select: { plate: true } }))?.plate ?? null
        : null,
      rawPayload: msg,
    },
  })

  // Detectar resposta positiva (inteligência básica)
  const positiveKeywords = ['resolvido', 'já entreguei', 'processo entregue', 'feito', 'já mandei', 'finalizado', 'ok', 'entregue', 'concluído']
  const isPositive = positiveKeywords.some(kw => messageBody.toLowerCase().includes(kw))

  // Notificar gerente responsável
  if (pendencyId) {
    const pendency = await prisma.pendency.findUnique({
      where: { id: pendencyId },
      include: { manager: { select: { userId: true } } },
    })

    if (pendency?.manager?.userId) {
      await prisma.notification.create({
        data: {
          userId: pendency.manager.userId,
          type: 'RESPOSTA',
          title: `${profileName ?? 'Vendedor'} respondeu uma pendência`,
          message: `Cliente: ${pendency.customerName} | Placa: ${pendency.plate ?? '—'} | Resposta: ${messageBody.slice(0, 100)}${isPositive ? ' ✓' : ''}`,
          actionUrl: `/pendencias/gerencia`,
        },
      })
    }
  }
}

// =============================================================================
// Processamento de status de mensagem
// =============================================================================
async function processMessageStatus(status: any) {
  const { id: whatsappMessageId, status: msgStatus, recipient_id } = status

  await prisma.pendencyMessage.updateMany({
    where: { whatsappMessageId },
    data: { status: msgStatus },
  })
}
