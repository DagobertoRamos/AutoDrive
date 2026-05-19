// =============================================================================
// mailer.ts — Serviço de envio de e-mail transacional (Nodemailer)
//
// Lê as configurações do banco (SystemSetting group='email') para construir
// o transporter dinamicamente. Suporta SMTP próprio e provedores API-based
// via SMTP relay (SendGrid, Mailgun, Resend, SES) ou API HTTP (quando o SDK
// estiver disponível — stub ready).
// =============================================================================

import nodemailer, { type Transporter } from 'nodemailer'
import { prisma } from '@/lib/prisma'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MailPayload {
  to:       string | string[]
  subject:  string
  html:     string
  text?:    string
  replyTo?: string
}

export interface MailResult {
  success:    boolean
  messageId?: string
  errorCode?: string
  errorMessage?: string
  errorDetails?: string
  responseMs: number
}

interface EmailSettings {
  provider:     string
  smtpHost:     string
  smtpPort:     string
  smtpSecure:   string
  smtpUser:     string
  smtpPass:     string
  fromName:     string
  fromEmail:    string
  replyTo:      string
  apiKey:       string
  domain:       string
  active:       string
}

// ── Leitura das configurações ─────────────────────────────────────────────────

async function getEmailSettings(): Promise<EmailSettings> {
  const rows = await prisma.systemSetting.findMany({
    where:  { group: 'email' },
    select: { key: true, value: true },
  })
  const map = Object.fromEntries(rows.map(r => [r.key.replace('email.', ''), r.value ?? '']))
  return map as unknown as EmailSettings
}

// ── Construção do transporter ─────────────────────────────────────────────────

function buildTransporter(cfg: EmailSettings): Transporter {
  const port   = Number(cfg.smtpPort)   || 587
  const secure = cfg.smtpSecure === 'true'

  switch (cfg.provider) {
    case 'sendgrid':
      return nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: { user: 'apikey', pass: cfg.apiKey },
      })

    case 'resend':
      return nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: { user: 'resend', pass: cfg.apiKey },
      })

    case 'mailgun':
      return nodemailer.createTransport({
        host: `smtp.mailgun.org`,
        port: 587,
        secure: false,
        auth: { user: `postmaster@${cfg.domain}`, pass: cfg.apiKey },
      })

    case 'ses':
      // SES via SMTP relay — credenciais são IAM access key / secret (usuário=key, senha=secret)
      return nodemailer.createTransport({
        host: `email-smtp.us-east-1.amazonaws.com`,
        port: 587,
        secure: false,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
      })

    default: // smtp
      return nodemailer.createTransport({
        host:   cfg.smtpHost,
        port,
        secure,
        auth:   cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
        tls:    { rejectUnauthorized: false },
      })
  }
}

// ── Envio de e-mail ───────────────────────────────────────────────────────────

export async function sendMail(payload: MailPayload): Promise<MailResult> {
  const start = Date.now()

  let cfg: EmailSettings
  try {
    cfg = await getEmailSettings()
  } catch (err) {
    return {
      success:      false,
      errorCode:    'CONFIG_READ_ERROR',
      errorMessage: 'Falha ao ler configurações de e-mail do banco de dados.',
      errorDetails: err instanceof Error ? err.message : String(err),
      responseMs:   Date.now() - start,
    }
  }

  if (!cfg.provider) {
    return {
      success:      false,
      errorCode:    'NO_PROVIDER',
      errorMessage: 'Nenhum provedor de e-mail configurado. Configure o provedor na Central de Comunicação.',
      responseMs:   Date.now() - start,
    }
  }

  if (!cfg.fromEmail) {
    return {
      success:      false,
      errorCode:    'NO_FROM_EMAIL',
      errorMessage: 'E-mail de remetente não configurado (fromEmail).',
      responseMs:   Date.now() - start,
    }
  }

  const from = cfg.fromName
    ? `"${cfg.fromName}" <${cfg.fromEmail}>`
    : cfg.fromEmail

  const transporter = buildTransporter(cfg)

  try {
    const info = await transporter.sendMail({
      from,
      to:       Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
      subject:  payload.subject,
      html:     payload.html,
      text:     payload.text,
      replyTo:  payload.replyTo ?? cfg.replyTo ?? undefined,
    })

    return {
      success:    true,
      messageId:  info.messageId,
      responseMs: Date.now() - start,
    }
  } catch (err: unknown) {
    // Nodemailer / SMTP errors carry .code property
    const e = err as { message?: string; code?: string; responseCode?: number; response?: string }
    return {
      success:      false,
      errorCode:    e.code ?? (e.responseCode ? String(e.responseCode) : 'SEND_ERROR'),
      errorMessage: e.message ?? 'Erro desconhecido ao enviar e-mail.',
      errorDetails: e.response ?? (err instanceof Error ? err.stack : String(err)),
      responseMs:   Date.now() - start,
    }
  }
}

// ── Teste de conexão SMTP (verify sem enviar) ─────────────────────────────────

export async function verifyConnection(): Promise<MailResult> {
  const start = Date.now()

  let cfg: EmailSettings
  try {
    cfg = await getEmailSettings()
  } catch {
    return {
      success:      false,
      errorCode:    'CONFIG_READ_ERROR',
      errorMessage: 'Falha ao ler configurações de e-mail.',
      responseMs:   Date.now() - start,
    }
  }

  if (!cfg.provider) {
    return {
      success:      false,
      errorCode:    'NO_PROVIDER',
      errorMessage: 'Nenhum provedor configurado.',
      responseMs:   Date.now() - start,
    }
  }

  const transporter = buildTransporter(cfg)

  try {
    await transporter.verify()
    return { success: true, responseMs: Date.now() - start }
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string; responseCode?: number; response?: string }
    return {
      success:      false,
      errorCode:    e.code ?? String(e.responseCode ?? 'VERIFY_ERROR'),
      errorMessage: e.message ?? 'Falha na verificação da conexão SMTP.',
      errorDetails: e.response ?? undefined,
      responseMs:   Date.now() - start,
    }
  }
}
