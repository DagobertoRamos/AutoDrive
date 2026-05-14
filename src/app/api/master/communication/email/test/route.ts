// =============================================================================
// POST /api/master/communication/email/test
// Dispara um e-mail de teste REAL usando as configurações salvas.
// Grava o resultado em CommunicationTestLog para auditoria.
// Apenas MASTER pode chamar.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireMaster } from '@/lib/master-guards'
import { sendMail }      from '@/lib/mailer'
import { prisma }        from '@/lib/prisma'

const bodySchema = z.object({
  to: z.string().email('Informe um e-mail válido.'),
})

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' },
      { status: 400 },
    )
  }

  const { to } = parsed.data

  // ── Monta HTML do e-mail de teste ─────────────────────────────────────────

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:32px">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
        <div style="text-align:center;margin-bottom:24px">
          <div style="width:48px;height:48px;background:#16a34a;border-radius:50%;display:inline-flex;align-items:center;justify-content:center">
            <span style="color:#fff;font-size:24px">✓</span>
          </div>
        </div>
        <h2 style="color:#111827;text-align:center;margin:0 0 8px">Teste de E-mail — Sucesso!</h2>
        <p style="color:#6b7280;text-align:center;font-size:14px;margin:0 0 24px">
          Se você recebeu este e-mail, as configurações de SMTP estão funcionando corretamente.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <table style="width:100%;font-size:13px;color:#374151">
          <tr>
            <td style="padding:4px 0;color:#6b7280">Disparado em:</td>
            <td style="padding:4px 0;font-weight:600">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">Testado por:</td>
            <td style="padding:4px 0;font-weight:600">${session.name}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">Destinatário:</td>
            <td style="padding:4px 0;font-weight:600">${to}</td>
          </tr>
        </table>
        <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:24px">
          Este é um e-mail automático de teste — não responda.
        </p>
      </div>
    </body>
    </html>
  `

  // ── Envia o e-mail real ───────────────────────────────────────────────────

  const result = await sendMail({
    to,
    subject: '✉️ Teste de E-mail — Central de Comunicação EasyCar',
    html,
    text:    `Teste de e-mail disparado por ${session.name} em ${new Date().toLocaleString('pt-BR')}. Se você recebeu esta mensagem, as configurações estão corretas.`,
  })

  // ── Grava log ─────────────────────────────────────────────────────────────

  // Lê o provider atual para registrar no log
  const providerSetting = await prisma.systemSetting
    .findUnique({ where: { key: 'email.provider' } })
    .catch(() => null)

  await prisma.communicationTestLog.create({
    data: {
      channel:      'EMAIL',
      provider:     providerSetting?.value ?? null,
      triggeredBy:  session.id,
      target:       to,
      success:      result.success,
      errorCode:    result.errorCode    ?? null,
      errorMessage: result.errorMessage ?? null,
      errorDetails: result.errorDetails ?? null,
      responseMs:   result.responseMs,
      messageId:    result.messageId    ?? null,
    },
  }).catch(err => console.error('[email/test] log write failed:', err))

  // ── Resposta ──────────────────────────────────────────────────────────────

  if (result.success) {
    return NextResponse.json({
      success:    true,
      message:    `E-mail de teste enviado com sucesso para ${to}.`,
      messageId:  result.messageId,
      responseMs: result.responseMs,
    })
  }

  return NextResponse.json(
    {
      success:      false,
      error:        result.errorMessage ?? 'Falha ao enviar e-mail.',
      errorCode:    result.errorCode,
      errorDetails: result.errorDetails,
      responseMs:   result.responseMs,
    },
    { status: 502 },
  )
}
