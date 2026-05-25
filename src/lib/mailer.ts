// =============================================================================
// mailer.ts — Serviço de envio de e-mail transacional (Nodemailer)
//
// Fonte primária de configuração: model EmailConfig (per-tenant, per-purpose).
// Fonte de fallback (legado): SystemSetting group='email'.
//
// Resolução do EmailConfig (na ordem):
//   1) tenantId + purpose, active=true, isDefault=true
//   2) tenantId + purpose, active=true (primeiro encontrado)
//   3) tenantId=null (global) + purpose, active=true (com isDefault prioritário)
//   4) Recurso: repete 1–3 com purpose='SYSTEM'
//   5) Legacy: SystemSetting group='email' (mantém compatibilidade)
// =============================================================================

import nodemailer, { type Transporter } from 'nodemailer'
import { EmailPurpose, type EmailConfig } from '@prisma/client'
import { prisma }  from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MailPayload {
  to:       string | string[]
  subject:  string
  html:     string
  text?:    string
  replyTo?: string
}

export interface SendMailOptions {
  purpose?:  EmailPurpose       // default SYSTEM
  tenantId?: string | null      // null = master/global
}

export interface MailResult {
  success:       boolean
  messageId?:    string
  errorCode?:    string
  errorMessage?: string
  errorDetails?: string
  responseMs:    number
}

interface ResolvedConfig {
  source:     'EmailConfig' | 'SystemSetting'
  provider:   string
  smtpHost?:  string
  smtpPort:   number
  smtpSecure: boolean
  smtpUser:   string
  smtpPass:   string
  fromName:   string
  fromEmail:  string
  replyTo?:   string | null
  apiKey?:    string
  domain?:    string
  region?:    string
  configId?:  string
}

// ── Resolução do EmailConfig ──────────────────────────────────────────────────

async function findEmailConfig(tenantId: string | null, purpose: EmailPurpose): Promise<EmailConfig | null> {
  // Busca todos os candidatos active=true do tenant (ou globais) para o purpose
  const candidates = await prisma.emailConfig.findMany({
    where:   { tenantId, purpose, active: true },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    take:    1,
  })
  return candidates[0] ?? null
}

async function resolveEmailConfig(
  tenantId: string | null,
  purpose:  EmailPurpose,
): Promise<EmailConfig | null> {
  // 1+2: tenant específico + purpose
  if (tenantId) {
    const own = await findEmailConfig(tenantId, purpose)
    if (own) return own
  }
  // 3: global + purpose
  const global = await findEmailConfig(null, purpose)
  if (global) return global

  // 4: fallback SYSTEM
  if (purpose !== 'SYSTEM') {
    if (tenantId) {
      const ownSys = await findEmailConfig(tenantId, 'SYSTEM')
      if (ownSys) return ownSys
    }
    const globalSys = await findEmailConfig(null, 'SYSTEM')
    if (globalSys) return globalSys
  }
  return null
}

function emailConfigToResolved(cfg: EmailConfig): ResolvedConfig {
  // smtpPass/apiKey podem estar criptografados
  const pass   = cfg.smtpPass ? decrypt(cfg.smtpPass) : ''
  const apiKey = cfg.apiKey   ? decrypt(cfg.apiKey)   : ''
  return {
    source:     'EmailConfig',
    provider:   cfg.provider ?? 'smtp',
    smtpHost:   cfg.smtpHost   ?? undefined,
    smtpPort:   cfg.smtpPort,
    smtpSecure: cfg.smtpSecure,
    smtpUser:   cfg.smtpUser   ?? '',
    smtpPass:   pass,
    fromName:   cfg.fromName,
    fromEmail:  cfg.fromEmail,
    replyTo:    cfg.replyTo,
    apiKey,
    domain:     cfg.domain     ?? undefined,
    region:     cfg.region     ?? undefined,
    configId:   cfg.id,
  }
}

// ── Fallback legacy: SystemSetting group='email' ──────────────────────────────

async function getLegacyEmailSettings(): Promise<ResolvedConfig | null> {
  const rows = await prisma.systemSetting.findMany({
    where:  { group: 'email' },
    select: { key: true, value: true },
  })
  if (rows.length === 0) return null

  const map = Object.fromEntries(rows.map(r => [r.key.replace('email.', ''), r.value ?? '']))
  if (!map.provider) return null

  const smtpPassRaw = map.smtpPass ?? ''
  const apiKeyRaw   = map.apiKey   ?? ''

  return {
    source:     'SystemSetting',
    provider:   map.provider,
    smtpHost:   map.smtpHost,
    smtpPort:   Number(map.smtpPort) || 587,
    smtpSecure: map.smtpSecure === 'true',
    smtpUser:   map.smtpUser ?? '',
    smtpPass:   decrypt(smtpPassRaw),
    fromName:   map.fromName ?? '',
    fromEmail:  map.fromEmail ?? '',
    replyTo:    map.replyTo ?? null,
    apiKey:     decrypt(apiKeyRaw),
    domain:     map.domain ?? '',
  }
}

// ── Construção do transporter ─────────────────────────────────────────────────

function buildTransporter(cfg: ResolvedConfig): Transporter {
  switch (cfg.provider) {
    case 'sendgrid':
      return nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: { user: 'apikey', pass: cfg.apiKey ?? cfg.smtpPass },
      })

    case 'resend':
      return nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: { user: 'resend', pass: cfg.apiKey ?? cfg.smtpPass },
      })

    case 'mailgun':
      return nodemailer.createTransport({
        host: 'smtp.mailgun.org',
        port: 587,
        secure: false,
        auth: { user: `postmaster@${cfg.domain ?? ''}`, pass: cfg.apiKey ?? cfg.smtpPass },
      })

    case 'ses':
      return nodemailer.createTransport({
        host: `email-smtp.${cfg.region ?? 'us-east-1'}.amazonaws.com`,
        port: 587,
        secure: false,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
      })

    default: // smtp
      return nodemailer.createTransport({
        host:   cfg.smtpHost,
        port:   cfg.smtpPort,
        secure: cfg.smtpSecure,
        auth:   cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
        tls:    { rejectUnauthorized: false },
      })
  }
}

// ── Resolução completa com fallback legacy ────────────────────────────────────

async function getConfigForSend(opts?: SendMailOptions): Promise<ResolvedConfig | null> {
  const purpose  = opts?.purpose  ?? ('SYSTEM' as EmailPurpose)
  const tenantId = opts?.tenantId ?? null

  const cfg = await resolveEmailConfig(tenantId, purpose)
  if (cfg) return emailConfigToResolved(cfg)
  return await getLegacyEmailSettings()
}

// ── Envio de e-mail ───────────────────────────────────────────────────────────

export async function sendMail(payload: MailPayload, opts?: SendMailOptions): Promise<MailResult> {
  const start = Date.now()

  let cfg: ResolvedConfig | null
  try {
    cfg = await getConfigForSend(opts)
  } catch (err) {
    return {
      success:      false,
      errorCode:    'CONFIG_READ_ERROR',
      errorMessage: 'Falha ao ler configurações de e-mail do banco de dados.',
      errorDetails: err instanceof Error ? err.message : String(err),
      responseMs:   Date.now() - start,
    }
  }

  if (!cfg) {
    return {
      success:      false,
      errorCode:    'NO_CONFIG',
      errorMessage: 'Nenhuma configuração de e-mail encontrada para este propósito. Configure em Central de Comunicação.',
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

// ── Verificação da conexão SMTP ───────────────────────────────────────────────

export async function verifyConnection(opts?: SendMailOptions): Promise<MailResult> {
  const start = Date.now()

  let cfg: ResolvedConfig | null
  try {
    cfg = await getConfigForSend(opts)
  } catch {
    return {
      success:      false,
      errorCode:    'CONFIG_READ_ERROR',
      errorMessage: 'Falha ao ler configurações de e-mail.',
      responseMs:   Date.now() - start,
    }
  }

  if (!cfg) {
    return {
      success:      false,
      errorCode:    'NO_CONFIG',
      errorMessage: 'Nenhuma configuração de e-mail configurada.',
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

// ── Verificação direta a partir de um EmailConfig específico ──────────────────

/**
 * Verifica conexão usando um EmailConfig específico (sem resolução por purpose).
 * Útil para o botão "Testar" na UI por servidor de e-mail.
 */
export async function verifyEmailConfig(configId: string): Promise<MailResult> {
  const start = Date.now()
  const cfg = await prisma.emailConfig.findUnique({ where: { id: configId } })
  if (!cfg) {
    return {
      success:      false,
      errorCode:    'NOT_FOUND',
      errorMessage: 'Configuração de e-mail não encontrada.',
      responseMs:   Date.now() - start,
    }
  }
  const resolved = emailConfigToResolved(cfg)
  const transporter = buildTransporter(resolved)
  try {
    await transporter.verify()
    return { success: true, responseMs: Date.now() - start }
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string; responseCode?: number; response?: string }
    return {
      success:      false,
      errorCode:    e.code ?? String(e.responseCode ?? 'VERIFY_ERROR'),
      errorMessage: e.message ?? 'Falha na verificação SMTP.',
      errorDetails: e.response ?? undefined,
      responseMs:   Date.now() - start,
    }
  }
}

/**
 * Envia mensagem usando um EmailConfig específico, contornando a resolução por purpose.
 */
export async function sendMailWithConfig(configId: string, payload: MailPayload): Promise<MailResult> {
  const start = Date.now()
  const cfg = await prisma.emailConfig.findUnique({ where: { id: configId } })
  if (!cfg) {
    return {
      success:      false,
      errorCode:    'NOT_FOUND',
      errorMessage: 'Configuração de e-mail não encontrada.',
      responseMs:   Date.now() - start,
    }
  }
  const resolved = emailConfigToResolved(cfg)
  const transporter = buildTransporter(resolved)

  const from = resolved.fromName
    ? `"${resolved.fromName}" <${resolved.fromEmail}>`
    : resolved.fromEmail

  try {
    const info = await transporter.sendMail({
      from,
      to:      Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
      subject: payload.subject,
      html:    payload.html,
      text:    payload.text,
      replyTo: payload.replyTo ?? resolved.replyTo ?? undefined,
    })
    return { success: true, messageId: info.messageId, responseMs: Date.now() - start }
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string; responseCode?: number; response?: string }
    return {
      success:      false,
      errorCode:    e.code ?? (e.responseCode ? String(e.responseCode) : 'SEND_ERROR'),
      errorMessage: e.message ?? 'Erro ao enviar e-mail.',
      errorDetails: e.response ?? (err instanceof Error ? err.stack : String(err)),
      responseMs:   Date.now() - start,
    }
  }
}
