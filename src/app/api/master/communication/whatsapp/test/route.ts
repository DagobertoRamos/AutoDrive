// =============================================================================
// POST /api/master/communication/whatsapp/test
// Dispara uma mensagem de texto REAL via WhatsApp usando as configurações salvas.
// Suporta: Meta Cloud API, Evolution API, Z-API, Twilio.
// Grava o resultado em CommunicationTestLog para auditoria.
// Apenas MASTER pode chamar.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z }                    from 'zod'
import { requireMaster }        from '@/lib/master-guards'
import { prisma }               from '@/lib/prisma'
import { getWhatsAppConfig }    from '@/app/api/master/communication/whatsapp/route'

const bodySchema = z.object({
  to: z.string().min(8, 'Informe um número de telefone válido (com DDD).'),
})

type WaSettings = Record<string, string>

// ── Normaliza número de telefone ──────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Adiciona 55 (Brasil) se não tiver código de país
  return digits.length <= 11 ? `55${digits}` : digits
}

// ── Dispatch por provedor ─────────────────────────────────────────────────────

interface DispatchResult {
  success:      boolean
  messageId?:   string
  errorCode?:   string
  errorMessage?: string
  errorDetails?: string
  responseMs:   number
  rawResponse?: unknown
}

async function dispatchMeta(cfg: WaSettings, to: string, text: string): Promise<DispatchResult> {
  const start      = Date.now()
  const apiVersion = cfg.apiVersion || 'v19.0'
  const baseUrl    = (cfg.apiUrl || 'https://graph.facebook.com').replace(/\/$/, '')
  const url        = `${baseUrl}/${apiVersion}/${cfg.phoneNumberId}/messages`

  if (!cfg.token)         return { success: false, errorCode: 'NO_TOKEN',            errorMessage: 'Token de acesso não configurado.',        responseMs: Date.now() - start }
  if (!cfg.phoneNumberId) return { success: false, errorCode: 'NO_PHONE_NUMBER_ID',  errorMessage: 'Phone Number ID não configurado.',        responseMs: Date.now() - start }

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      }),
    })

    const json = await res.json() as {
      messages?: Array<{ id: string }>
      error?:    { message: string; code: number; error_subcode?: number; fbtrace_id?: string; type?: string }
    }

    if (!res.ok || json.error) {
      const e = json.error
      return {
        success:      false,
        errorCode:    e?.code ? String(e.code) : String(res.status),
        errorMessage: e?.message ?? `HTTP ${res.status}`,
        errorDetails: e ? JSON.stringify(e, null, 2) : undefined,
        responseMs:   Date.now() - start,
        rawResponse:  json,
      }
    }

    return {
      success:     true,
      messageId:   json.messages?.[0]?.id,
      responseMs:  Date.now() - start,
      rawResponse: json,
    }
  } catch (err) {
    const e = err as { message?: string; code?: string }
    return {
      success:      false,
      errorCode:    e.code ?? 'FETCH_ERROR',
      errorMessage: e.message ?? 'Erro de rede ao contactar a API Meta.',
      errorDetails: err instanceof Error ? err.stack : String(err),
      responseMs:   Date.now() - start,
    }
  }
}

async function dispatchEvolution(cfg: WaSettings, to: string, text: string): Promise<DispatchResult> {
  const start = Date.now()
  const url   = `${(cfg.apiUrl || '').replace(/\/$/, '')}/message/sendText/default`

  if (!cfg.apiUrl) return { success: false, errorCode: 'NO_API_URL', errorMessage: 'URL da Evolution API não configurada.', responseMs: Date.now() - start }
  if (!cfg.token)  return { success: false, errorCode: 'NO_TOKEN',   errorMessage: 'API Key (token) não configurado.',       responseMs: Date.now() - start }

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { apikey: cfg.token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ number: to, options: { delay: 0 }, textMessage: { text } }),
    })
    const json = await res.json() as { key?: { id: string }; error?: string; message?: string }

    if (!res.ok) {
      return {
        success:      false,
        errorCode:    String(res.status),
        errorMessage: json.error ?? json.message ?? `HTTP ${res.status}`,
        errorDetails: JSON.stringify(json, null, 2),
        responseMs:   Date.now() - start,
        rawResponse:  json,
      }
    }
    return { success: true, messageId: json.key?.id, responseMs: Date.now() - start, rawResponse: json }
  } catch (err) {
    const e = err as { message?: string; code?: string }
    return { success: false, errorCode: e.code ?? 'FETCH_ERROR', errorMessage: e.message ?? 'Erro de rede.', responseMs: Date.now() - start }
  }
}

async function dispatchZapi(cfg: WaSettings, to: string, text: string): Promise<DispatchResult> {
  const start = Date.now()
  // Z-API: URL pattern = https://api.z-api.io/instances/<instanceId>/token/<token>/send-text
  const url   = `${(cfg.apiUrl || '').replace(/\/$/, '')}/send-text`

  if (!cfg.apiUrl) return { success: false, errorCode: 'NO_API_URL', errorMessage: 'URL da instância Z-API não configurada.', responseMs: Date.now() - start }

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.token ? { 'Client-Token': cfg.token } : {}) },
      body:    JSON.stringify({ phone: to, message: text }),
    })
    const json = await res.json() as { zaapId?: string; messageId?: string; error?: string }

    if (!res.ok) {
      return {
        success:      false,
        errorCode:    String(res.status),
        errorMessage: json.error ?? `HTTP ${res.status}`,
        errorDetails: JSON.stringify(json, null, 2),
        responseMs:   Date.now() - start,
        rawResponse:  json,
      }
    }
    return { success: true, messageId: json.zaapId ?? json.messageId, responseMs: Date.now() - start, rawResponse: json }
  } catch (err) {
    const e = err as { message?: string; code?: string }
    return { success: false, errorCode: e.code ?? 'FETCH_ERROR', errorMessage: e.message ?? 'Erro de rede.', responseMs: Date.now() - start }
  }
}

async function dispatchTwilio(cfg: WaSettings, to: string, text: string): Promise<DispatchResult> {
  const start = Date.now()
  // Twilio: token format = "AccountSid:AuthToken", apiUrl = account SID
  const parts     = cfg.token?.split(':') ?? []
  const accountSid = parts[0] ?? ''
  const authToken  = parts[1] ?? ''

  if (!accountSid || !authToken) return { success: false, errorCode: 'NO_TOKEN', errorMessage: 'Token Twilio deve ser "AccountSid:AuthToken".', responseMs: Date.now() - start }
  if (!cfg.phoneNumberId)        return { success: false, errorCode: 'NO_FROM',  errorMessage: 'Phone Number ID (número Twilio) não configurado.', responseMs: Date.now() - start }

  const url  = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const body = new URLSearchParams({
    From: `whatsapp:+${cfg.phoneNumberId}`,
    To:   `whatsapp:+${to}`,
    Body: text,
  })

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const json = await res.json() as { sid?: string; status?: string; error_code?: number; message?: string }

    if (!res.ok) {
      return {
        success:      false,
        errorCode:    json.error_code ? String(json.error_code) : String(res.status),
        errorMessage: json.message ?? `HTTP ${res.status}`,
        errorDetails: JSON.stringify(json, null, 2),
        responseMs:   Date.now() - start,
        rawResponse:  json,
      }
    }
    return { success: true, messageId: json.sid, responseMs: Date.now() - start, rawResponse: json }
  } catch (err) {
    const e = err as { message?: string; code?: string }
    return { success: false, errorCode: e.code ?? 'FETCH_ERROR', errorMessage: e.message ?? 'Erro de rede.', responseMs: Date.now() - start }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  const raw    = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' },
      { status: 400 },
    )
  }

  const to = normalizePhone(parsed.data.to)

  // ── Carrega configurações ─────────────────────────────────────────────────

  let cfg: WaSettings
  try {
    cfg = await getWhatsAppConfig()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Falha ao ler configurações do WhatsApp.', errorCode: 'CONFIG_READ_ERROR' },
      { status: 500 },
    )
  }

  if (!cfg.provider) {
    return NextResponse.json(
      { success: false, error: 'Nenhum provedor de WhatsApp configurado.', errorCode: 'NO_PROVIDER' },
      { status: 400 },
    )
  }

  // ── Monta mensagem de teste ───────────────────────────────────────────────

  const text = [
    '✅ *Teste de WhatsApp — EasyCar*',
    '',
    `Mensagem de teste disparada por *${session.name}* em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`,
    '',
    'Se você recebeu esta mensagem, as configurações do WhatsApp estão funcionando corretamente.',
    '',
    '_Este é um envio automático de teste — não responda._',
  ].join('\n')

  // ── Despacha para o provedor correto ─────────────────────────────────────

  let result: DispatchResult

  switch (cfg.provider) {
    case 'meta':
      result = await dispatchMeta(cfg, to, text)
      break
    case 'evolution':
      result = await dispatchEvolution(cfg, to, text)
      break
    case 'zapi':
      result = await dispatchZapi(cfg, to, text)
      break
    case 'twilio':
      result = await dispatchTwilio(cfg, to, text)
      break
    default:
      result = { success: false, errorCode: 'UNSUPPORTED_PROVIDER', errorMessage: `Provedor "${cfg.provider}" não suportado para teste direto.`, responseMs: 0 }
  }

  // ── Grava log ─────────────────────────────────────────────────────────────

  await prisma.communicationTestLog.create({
    data: {
      channel:      'WHATSAPP',
      provider:     cfg.provider,
      triggeredBy:  session.id,
      target:       to,
      success:      result.success,
      errorCode:    result.errorCode    ?? null,
      errorMessage: result.errorMessage ?? null,
      errorDetails: result.errorDetails ?? null,
      responseMs:   result.responseMs,
      messageId:    result.messageId    ?? null,
      metadata:     result.rawResponse  ? (result.rawResponse as object) : undefined,
    },
  }).catch(err => console.error('[whatsapp/test] log write failed:', err))

  // ── Resposta ──────────────────────────────────────────────────────────────

  if (result.success) {
    return NextResponse.json({
      success:    true,
      message:    `Mensagem de teste enviada com sucesso para +${to}.`,
      messageId:  result.messageId,
      responseMs: result.responseMs,
    })
  }

  return NextResponse.json(
    {
      success:      false,
      error:        result.errorMessage ?? 'Falha ao enviar mensagem de teste.',
      errorCode:    result.errorCode,
      errorDetails: result.errorDetails,
      responseMs:   result.responseMs,
    },
    { status: 502 },
  )
}
