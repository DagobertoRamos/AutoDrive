import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? 'autodrive_verify_token'

// =============================================================================
// GET — Verificação do webhook pela Meta
// =============================================================================
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
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

  try {
    rawPayload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Registrar o payload bruto
  await prisma.webhookLog.create({
    data: {
      provider: 'META',
      direction: 'INBOUND',
      payload: rawPayload as any,
      processed: false,
    },
  }).catch(err => console.error('[webhook] Failed to save log:', err))

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
      for (const msg of value.messages) {
        await processInboundMessage(msg, value.contacts?.[0])
      }
    }

    // Processar status de entrega/leitura
    if (value.statuses?.length > 0) {
      for (const status of value.statuses) {
        await processMessageStatus(status)
      }
    }

    // Marcar log como processado
    await prisma.webhookLog.updateMany({
      where: { processed: false, provider: 'META' },
      data: { processed: true },
    }).catch(() => { /* silent */ })

  } catch (err) {
    console.error('[webhook/meta] Processing error:', err)
    await prisma.webhookLog.updateMany({
      where: { processed: false, provider: 'META' },
      data: { error: String(err) },
    }).catch(() => { /* silent */ })
  }

  return NextResponse.json({ status: 'ok' })
}

// =============================================================================
// Processamento de mensagem recebida
// =============================================================================
async function processInboundMessage(msg: any, contact: any) {
  const from = msg.from // número WhatsApp do remetente
  const messageType = msg.type
  const messageBody = msg.text?.body ?? msg.caption ?? ''
  const profileName = contact?.profile?.name ?? null
  const whatsappMessageId = msg.id

  // Buscar vendedor pelo WhatsApp
  const seller = await prisma.seller.findFirst({
    where: { whatsapp: { contains: from.replace(/\D/g, '').slice(-11) } },
  })

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
