// =============================================================================
// POST /api/master/communication/whatsapp/webhook-validate
// Simula a validação GET do webhook Meta (hub.mode + hub.challenge + hub.verify_token).
// Faz uma chamada simulada para o próprio endpoint de webhook configurado,
// verificando se ele responde corretamente ao challenge da Meta.
// Apenas MASTER.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster } from '@/lib/master-guards'
import { prisma }        from '@/lib/prisma'
import { getWhatsAppConfig } from '../route'

export async function POST(_req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  const start = Date.now()
  const cfg   = await getWhatsAppConfig().catch(() => null)

  if (!cfg?.webhookCallbackUrl) {
    return NextResponse.json(
      { success: false, error: 'Webhook Callback URL não configurada.', errorCode: 'NO_WEBHOOK_URL' },
      { status: 400 },
    )
  }
  if (!cfg?.webhookVerifyToken) {
    return NextResponse.json(
      { success: false, error: 'Webhook Verify Token não configurado.', errorCode: 'NO_VERIFY_TOKEN' },
      { status: 400 },
    )
  }

  const challenge    = `challenge_${Date.now()}`
  const verifyToken  = cfg.webhookVerifyToken
  const callbackUrl  = cfg.webhookCallbackUrl

  // Monta a URL com parâmetros exatamente como a Meta faz
  const testUrl = new URL(callbackUrl)
  testUrl.searchParams.set('hub.mode',         'subscribe')
  testUrl.searchParams.set('hub.challenge',    challenge)
  testUrl.searchParams.set('hub.verify_token', verifyToken)

  let success      = false
  let errorCode:    string | undefined
  let errorMessage: string | undefined
  let errorDetails: string | undefined
  let responseBody  = ''
  let httpStatus    = 0

  try {
    const res = await fetch(testUrl.toString(), {
      method:  'GET',
      headers: { 'User-Agent': 'facebookexternalua' },
      signal:  AbortSignal.timeout(10_000),
    })

    httpStatus   = res.status
    responseBody = await res.text()

    if (res.ok && responseBody.trim() === challenge) {
      success = true
    } else if (!res.ok) {
      errorCode    = String(res.status)
      errorMessage = `Webhook retornou HTTP ${res.status}. Esperado 200.`
      errorDetails = responseBody
    } else {
      errorCode    = 'CHALLENGE_MISMATCH'
      errorMessage = `Webhook não retornou o challenge correto. Esperado: "${challenge}", Recebido: "${responseBody.trim().slice(0, 100)}"`
    }
  } catch (err) {
    const e = err as { message?: string; code?: string; name?: string }
    errorCode    = e.code ?? (e.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_ERROR')
    errorMessage = e.name === 'TimeoutError'
      ? 'Timeout: o webhook não respondeu em 10 segundos.'
      : (e.message ?? 'Erro de rede ao chamar o webhook.')
    errorDetails = err instanceof Error ? err.stack : String(err)
  }

  const responseMs = Date.now() - start

  // Grava no webhook_logs para rastreabilidade
  await prisma.webhookLog.create({
    data: {
      provider:  'meta',
      direction: 'OUTBOUND_TEST',
      payload:   {
        url:       testUrl.toString(),
        challenge,
        success,
        response:  responseBody.slice(0, 500),
        triggeredBy: session.id,
      },
      processed: success,
      error:     errorMessage ?? null,
    },
  }).catch(() => {})

  if (success) {
    return NextResponse.json({
      success:     true,
      message:     'Webhook validado com sucesso! O endpoint respondeu corretamente ao challenge da Meta.',
      callbackUrl: cfg.webhookCallbackUrl,
      httpStatus,
      responseMs,
    })
  }

  return NextResponse.json(
    {
      success:      false,
      error:        errorMessage ?? 'Falha na validação do webhook.',
      errorCode,
      errorDetails,
      callbackUrl:  cfg.webhookCallbackUrl,
      httpStatus,
      responseMs,
    },
    { status: 502 },
  )
}
