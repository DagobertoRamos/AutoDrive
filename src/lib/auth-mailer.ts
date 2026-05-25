// =============================================================================
// auth-mailer.ts — Envio de e-mails de autenticação (recuperação + ativação)
//
// Encapsula a montagem do template + URL + chamada ao mailer, garantindo:
//   • template puxado do DB (por purpose+key); se não houver, cai no default
//     em src/lib/email-defaults.ts (zero configuração no banco já funciona)
//   • envio sempre via sendMail({ purpose, tenantId }) → respeita o servidor
//     cadastrado no master/communication para cada propósito
//   • layout HTML profissional via wrapWithLayout (logo + footer AutoDrive)
//   • falha silenciosa nunca expõe ao cliente (apenas log no servidor)
// =============================================================================

import { prisma } from '@/lib/prisma'
import { sendMail, type MailResult } from '@/lib/mailer'
import { renderEmailTemplate, wrapWithLayout, type RenderableTemplate } from '@/lib/email-renderer'
import { DEFAULT_EMAIL_TEMPLATES } from '@/lib/email-defaults'
import type { EmailPurpose } from '@prisma/client'

// ── Resolução do template ─────────────────────────────────────────────────────
// 1) Tenta DB: tenantId + purpose + key (active)
// 2) Tenta DB: tenantId=null (global) + purpose + key (active)
// 3) Fallback: default do código (email-defaults.ts) — garante operação
async function resolveTemplate(
  purpose:  EmailPurpose,
  key:      string,
  tenantId: string | null,
): Promise<RenderableTemplate> {
  const candidates = await prisma.emailTemplate.findMany({
    where:   { OR: [{ tenantId }, { tenantId: null }], purpose, key, active: true },
    orderBy: [{ tenantId: 'desc' }, { updatedAt: 'desc' }],
    take:    1,
  })

  if (candidates[0]) {
    return {
      subject:   candidates[0].subject,
      bodyHtml:  candidates[0].bodyHtml,
      bodyText:  candidates[0].bodyText,
      variables: candidates[0].variables,
    }
  }

  const fallback = DEFAULT_EMAIL_TEMPLATES.find((t) => t.purpose === purpose && t.key === key)
  if (!fallback) {
    throw new Error(`Template padrão ausente para ${purpose}/${key}.`)
  }
  return {
    subject:   fallback.subject,
    bodyHtml:  fallback.bodyHtml,
    bodyText:  fallback.bodyText,
    variables: fallback.variables,
  }
}

// ── Helpers de URL ────────────────────────────────────────────────────────────

function appUrl(): string {
  const url = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? ''
  return url.replace(/\/$/, '')
}

function humanExpiry(ms: number): string {
  const hours = Math.round(ms / (60 * 60 * 1000))
  if (hours >= 24) {
    const days = Math.round(hours / 24)
    return days === 1 ? '1 dia' : `${days} dias`
  }
  return hours === 1 ? '1 hora' : `${hours} horas`
}

// ── Senders ───────────────────────────────────────────────────────────────────

export interface PasswordResetEmailInput {
  user: {
    id:       string
    name:     string | null
    email:    string
    tenantId: string | null
  }
  token:        string
  expiresAtMs:  number   // milissegundos até expirar (ex: 60 * 60 * 1000 = 1h)
}

/**
 * Envia o e-mail "Esqueci minha senha" usando o template PASSWORD_RESET.
 * Nunca lança — retorna `MailResult` com `success: false` em caso de falha
 * (para que o caller possa logar mas não expor ao usuário final).
 */
export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<MailResult> {
  const { user, token, expiresAtMs } = input
  const purpose: EmailPurpose = 'PASSWORD_RESET'

  try {
    const template = await resolveTemplate(purpose, 'password_reset', user.tenantId)
    const resetUrl = `${appUrl()}/recuperar-senha?token=${encodeURIComponent(token)}`
    const rendered = renderEmailTemplate(template, {
      userName:  user.name ?? user.email,
      resetUrl,
      expiresIn: humanExpiry(expiresAtMs),
    })

    return await sendMail(
      {
        to:      user.email,
        subject: rendered.subject,
        html:    wrapWithLayout(rendered.bodyHtml, { previewText: rendered.subject }),
        text:    rendered.bodyText,
      },
      { purpose, tenantId: user.tenantId },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sendPasswordResetEmail] falha:', msg)
    return {
      success:      false,
      errorCode:    'RENDER_OR_SEND_ERROR',
      errorMessage: msg,
      responseMs:   0,
    }
  }
}

export interface ActivationEmailInput {
  user: {
    id:       string
    name:     string | null
    email:    string
    tenantId: string | null
  }
  token:        string
  expiresAtMs:  number
}

/**
 * Envia o e-mail de ativação de conta (link para /ativar-cadastro?token=...).
 * Usa o template SYSTEM/welcome como base — adiciona vars resetUrl + expiresIn.
 */
export async function sendActivationEmail(input: ActivationEmailInput): Promise<MailResult> {
  const { user, token, expiresAtMs } = input
  const purpose: EmailPurpose = 'SYSTEM'

  try {
    const template = await resolveTemplate(purpose, 'welcome', user.tenantId)
    const activationUrl = `${appUrl()}/ativar-cadastro?token=${encodeURIComponent(token)}`

    // Compõe um corpo curto baseado no welcome adicionando o CTA de ativação
    // ao final — não mexe no template original, apenas concatena.
    const rendered = renderEmailTemplate(template, {
      userName: user.name ?? user.email,
      loginUrl: activationUrl,
    })

    const activationBlock = `
      <p style="margin:0 0 12px;color:#374151;line-height:1.6">
        Para ativar sua conta e definir sua senha, clique no botão abaixo:
      </p>
      <p style="text-align:center;margin:24px 0">
        <a href="${activationUrl}" style="display:inline-block;background:#166534;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Ativar minha conta
        </a>
      </p>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5">
        Este link expira em <strong>${humanExpiry(expiresAtMs)}</strong>.
      </p>
    `.trim()

    return await sendMail(
      {
        to:      user.email,
        subject: 'Ative sua conta — AutoDrive',
        html:    wrapWithLayout(rendered.bodyHtml + activationBlock, { previewText: 'Ative sua conta no AutoDrive' }),
        text:    `${rendered.bodyText}\n\nAtive sua conta: ${activationUrl}\n\nLink válido por ${humanExpiry(expiresAtMs)}.`,
      },
      { purpose, tenantId: user.tenantId },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sendActivationEmail] falha:', msg)
    return {
      success:      false,
      errorCode:    'RENDER_OR_SEND_ERROR',
      errorMessage: msg,
      responseMs:   0,
    }
  }
}
