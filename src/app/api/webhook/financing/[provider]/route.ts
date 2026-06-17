// =============================================================================
// /api/webhook/financing/[provider] — receptor de webhook de F&I (Fase 7b).
// PÚBLICO (chamado por sistemas externos) — fica sob /api/webhook, que o
// middleware deixa passar sem sessão. PROTEGIDO POR SEGREDO: exige
// FINANCE_WEBHOOK_SECRET (header `x-webhook-secret` ou `?secret=`). Sem a env
// definida, o endpoint fica DESLIGADO (503) — nunca um sink aberto de escrita.
// Segredo inválido → 401 SEM gravar nada. Com segredo válido: registra o evento,
// casa a submissão por externalId e atualiza o status (linha do tempo WEBHOOK).
// NOTA: a verificação de assinatura OFICIAL (HMAC do provedor) substitui o
// segredo compartilhado quando houver integração homologada. Sem RPA oculto.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { secretsMatch, extractWebhookFields, mapProviderStatus } from '@/lib/finance/webhook-service'

type Ctx = { params: Promise<{ provider: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const expected = process.env.FINANCE_WEBHOOK_SECRET
  if (!expected || expected.trim().length < 8) {
    return NextResponse.json({ success: false, error: 'Webhook desativado (FINANCE_WEBHOOK_SECRET não configurado).' }, { status: 503 })
  }

  const { provider } = await params
  const url = new URL(req.url)
  const provided = req.headers.get('x-webhook-secret') ?? url.searchParams.get('secret')
  if (!secretsMatch(provided, expected)) {
    // Não grava nada para não virar sink de spam.
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }

  let payload: unknown
  try { payload = await req.json() } catch { payload = null }
  if (payload == null) {
    return NextResponse.json({ success: false, error: 'Payload inválido.' }, { status: 400 })
  }

  try {
    const { externalId, statusRaw, message } = extractWebhookFields(payload)
    const mapped = mapProviderStatus(statusRaw)

    // Casa a submissão pelo externalId (provedores reais retornam um id).
    const submission = externalId
      ? await prisma.financeProposalSubmission.findFirst({ where: { externalId }, orderBy: { submittedAt: 'desc' } })
      : null

    let processed = false
    let error: string | null = null
    if (!externalId) error = 'Sem externalId no payload.'
    else if (!submission) error = 'Nenhuma submissão com este externalId.'
    else if (!mapped) error = `Status não reconhecido: ${statusRaw ?? '(vazio)'}.`

    // Registra o evento bruto (sem segredo) para auditoria/depuração.
    await prisma.financeWebhookEvent.create({
      data: {
        tenantId: submission?.tenantId ?? null, provider: provider || null, externalId: externalId ?? null,
        signatureValid: true, payload: payload as never, processed: false, error,
      },
    })

    // Aplica o status na submissão + linha do tempo.
    if (submission && mapped) {
      await prisma.financeProposalSubmission.update({ where: { id: submission.id }, data: { status: mapped } })
      await prisma.financeProposalEvent.create({
        data: { tenantId: submission.tenantId, proposalId: submission.proposalId, submissionId: submission.id, type: 'WEBHOOK', status: mapped, message, source: 'WEBHOOK' },
      })
      if (mapped === 'APROVADA' && submission.proposalId) {
        await prisma.financeProposal.update({ where: { id: submission.proposalId }, data: { status: 'APROVADA' } }).catch(() => {})
      }
      await prisma.financeWebhookEvent.updateMany({ where: { externalId, processed: false }, data: { processed: true } })
      processed = true
    }

    // 200 sempre que autenticado, para o provedor não entrar em retry storm.
    return NextResponse.json({ success: true, processed, status: mapped })
  } catch (err) {
    return handlePrismaError(err)
  }
}
