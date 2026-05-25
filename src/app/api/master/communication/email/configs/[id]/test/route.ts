// =============================================================================
// POST /api/master/communication/email/configs/[id]/test
// Verifica a conexão SMTP do EmailConfig. Se `testEmail` for fornecido no body,
// envia também uma mensagem de teste real.
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { verifyEmailConfig, sendMailWithConfig } from '@/lib/mailer'
import { wrapWithLayout } from '@/lib/email-renderer'

const bodySchema = z.object({
  testEmail: z.string().email('E-mail de teste inválido.').optional(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error

  const raw = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' },
      { status: 400 },
    )
  }
  const { testEmail } = parsed.data

  // 1) Verify connection
  const verify = await verifyEmailConfig(params.id)
  if (!verify.success) {
    await prisma.emailConfig.update({
      where: { id: params.id },
      data:  { lastTestedAt: new Date(), lastTestOk: false },
    }).catch(() => null)
    return NextResponse.json({ ...verify, success: false }, { status: 502 })
  }

  // 2) Optionally send a real email
  let sendResult: Awaited<ReturnType<typeof sendMailWithConfig>> | null = null
  if (testEmail) {
    const html = wrapWithLayout(`
      <h2 style="margin:0 0 12px;color:#111827">Teste de configuração de e-mail</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 8px">
        Se você está lendo esta mensagem, a configuração SMTP do servidor está funcionando corretamente.
      </p>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0">
        Disparado por <strong>${session.name}</strong> em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.
      </p>
    `, { previewText: 'Teste de servidor de e-mail AutoDrive' })

    sendResult = await sendMailWithConfig(params.id, {
      to:      testEmail,
      subject: 'Teste de servidor de e-mail — AutoDrive',
      html,
      text:    `Teste de servidor de e-mail. Disparado por ${session.name}.`,
    })
  }

  const success = verify.success && (sendResult ? sendResult.success : true)

  await prisma.emailConfig.update({
    where: { id: params.id },
    data:  { lastTestedAt: new Date(), lastTestOk: success },
  }).catch(() => null)

  await prisma.communicationTestLog.create({
    data: {
      channel:      'EMAIL',
      provider:     'smtp',
      triggeredBy:  session.id,
      target:       testEmail ?? '(verify-only)',
      success,
      errorCode:    sendResult?.errorCode    ?? verify.errorCode    ?? null,
      errorMessage: sendResult?.errorMessage ?? verify.errorMessage ?? null,
      errorDetails: sendResult?.errorDetails ?? verify.errorDetails ?? null,
      responseMs:   (sendResult?.responseMs ?? 0) + verify.responseMs,
      messageId:    sendResult?.messageId ?? null,
    },
  }).catch(err => console.error('[email/configs/test] log write failed:', err))

  await logMasterAction(session, 'TEST_EMAIL_CONFIG', 'EmailConfig', params.id, {
    afterData: { success, testEmail: testEmail ?? null }, req,
  })

  if (success) {
    return NextResponse.json({
      success: true,
      verify,
      send:    sendResult,
      message: sendResult ? `E-mail enviado para ${testEmail}.` : 'Conexão SMTP verificada com sucesso.',
    })
  }
  return NextResponse.json({
    success: false,
    error:   sendResult?.errorMessage ?? verify.errorMessage,
    verify,
    send:    sendResult,
  }, { status: 502 })
}
