// =============================================================================
// /api/negotiations/[id]/attachments
//   GET  → lista anexos do deal (com filtros opcionais).
//   POST → upload de anexo (multipart/form-data).
//
// Form fields aceitos no POST:
//   file       (File)            — obrigatório
//   category   (DealAttachmentCategory) — obrigatório
//   paymentId  (string, opcional)
//   debtId     (string, opcional)
//   vehicleId  (string, opcional)
//   changeId   (string, opcional)
//   notes      (string, opcional)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { requireModule }        from '@/lib/permissions'
import { saveDealAttachment, validateDealUpload } from '@/lib/negotiation/storage'

export const runtime = 'nodejs'

const VALID_CATEGORIES = new Set([
  'COMPROVANTE_PAGAMENTO',
  'COMPROVANTE_QUITACAO',
  'COMPROVANTE_DEBITO',
  'COMPROVANTE_TROCO',
  'CONTRATO_ASSINADO',
  'PROCURACAO_ASSINADA',
  'NFE',
  'RECIBO',
  'OUTRO',
])

async function loadDeal(id: string) {
  return prisma.deal.findUnique({
    where:  { id },
    select: { id: true, tenantId: true, status: true },
  })
}

// Next 16: params virou Promise. Helper local.
async function resolveDealId(
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
): Promise<string | null> {
  const params = await Promise.resolve(ctxArg.params)
  return params?.id ?? null
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  const dealId = await resolveDealId(ctxArg)
  if (!dealId) return NextResponse.json({ error: 'ID ausente na URL.' }, { status: 400 })

  const deal = await loadDeal(dealId)
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const category = req.nextUrl.searchParams.get('category') ?? undefined

  try {
    const data = await prisma.dealAttachment.findMany({
      where: {
        dealId,
        ...(category && VALID_CATEGORIES.has(category) ? { category: category as any } : {}),
      },
      orderBy: { uploadedAt: 'desc' },
    })
    return NextResponse.json({ data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  const dealId = await resolveDealId(ctxArg)
  if (!dealId) return NextResponse.json({ error: 'ID ausente na URL.' }, { status: 400 })

  const deal = await loadDeal(dealId)
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Corpo inválido (multipart/form-data esperado).' }, { status: 400 })

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Campo "file" é obrigatório.' }, { status: 400 })

  const category = String(formData.get('category') ?? '').trim().toUpperCase()
  if (!VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: `Categoria inválida. Use uma de: ${[...VALID_CATEGORIES].join(', ')}` }, { status: 400 })
  }

  const v = validateDealUpload(file.type, file.size)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const saved = await saveDealAttachment(dealId, file.name, file.type, bytes)

    const att = await prisma.dealAttachment.create({
      data: {
        dealId,
        tenantId:       deal.tenantId,
        category:       category as any,
        fileName:       saved.fileName,
        fileType:       saved.fileType,
        mimeType:       saved.mimeType,
        fileSize:       saved.fileSize,
        storageKey:     saved.storageKey,
        publicUrl:      saved.publicUrl,
        notes:          String(formData.get('notes') ?? '') || null,
        paymentId:      String(formData.get('paymentId') ?? '') || null,
        debtId:         String(formData.get('debtId') ?? '')    || null,
        vehicleId:      String(formData.get('vehicleId') ?? '') || null,
        changeId:       String(formData.get('changeId') ?? '')  || null,
        uploadedById:   session.user.id,
        uploadedByName: session.user.name ?? null,
      },
    })

    return NextResponse.json({ data: att }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
