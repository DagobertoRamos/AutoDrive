// =============================================================================
// /api/master/communication/whatsapp
// GET  — carrega configuração global do WhatsApp (credenciais mascaradas)
// POST — salva/atualiza configuração (segredos só sobrescritos se enviado novo valor)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction, upsertSystemSetting, getSettingGroup } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { encrypt, decrypt, isMasked, MASKED } from '@/lib/crypto'

const GROUP = 'whatsapp'

// Chaves sensíveis — armazenadas criptografadas, retornadas mascaradas
const SECRET_KEYS = ['token', 'appSecret', 'webhookVerifyToken'] as const
type SecretKey = typeof SECRET_KEYS[number]

// Todas as chaves gerenciadas neste endpoint
const PLAIN_KEYS = [
  'whatsapp.provider',
  'whatsapp.environment',      // TEST | REAL | PRODUCTION
  'whatsapp.active',
  'whatsapp.apiUrl',
  'whatsapp.apiVersion',
  'whatsapp.phoneNumberId',
  'whatsapp.businessAccountId', // WABA ID
  'whatsapp.businessManagerId',
  'whatsapp.appId',
  'whatsapp.webhookCallbackUrl',
  'whatsapp.webhookFields',
  'whatsapp.defaultLanguage',
  'whatsapp.useOfficialTemplates',
  'whatsapp.fallbackToText',
  'whatsapp.defaultHeaderImageUrl',
  'whatsapp.defaultHeaderMediaId',
  'whatsapp.monthlyLimit',
  'whatsapp.testPhone',
  'whatsapp.lastConnectAt',
  'whatsapp.lastConnectStatus',
]

const SECRET_FULL_KEYS = SECRET_KEYS.map(k => `whatsapp.${k}`)

// ── Validação de URL base da API ──────────────────────────────────────────────

function validateApiUrl(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return 'A URL base deve usar HTTPS.'
    if (parsed.hostname.includes('@'))  return 'A URL base não pode conter e-mail.'
    if (!parsed.hostname.includes('.')) return 'URL inválida.'
    return null // ok
  } catch {
    return 'URL inválida. Use o formato https://graph.facebook.com'
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const settings = await getSettingGroup(GROUP)
    const clean: Record<string, string> = {}

    for (const [k, v] of Object.entries(settings)) {
      const shortKey = k.replace(`${GROUP}.`, '')
      // Retorna máscara para segredos — nunca o valor real
      if ((SECRET_KEYS as readonly string[]).includes(shortKey)) {
        clean[shortKey] = v ? MASKED : ''
      } else {
        clean[shortKey] = v
      }
    }

    return NextResponse.json({ success: true, data: clean })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json() as Record<string, string>

    // Validação da URL base da API
    if (body.apiUrl !== undefined && body.apiUrl !== '') {
      const urlError = validateApiUrl(body.apiUrl)
      if (urlError) {
        return NextResponse.json({ success: false, error: urlError }, { status: 400 })
      }
    }

    // Validação do formato da versão da API
    if (body.apiVersion && !/^v\d+\.\d+$/.test(body.apiVersion)) {
      return NextResponse.json(
        { success: false, error: 'Versão da API inválida. Use formato v20.0, v21.0, etc.' },
        { status: 400 },
      )
    }

    // Validação: campos numéricos não podem conter @
    for (const numericField of ['phoneNumberId', 'businessAccountId', 'businessManagerId', 'appId']) {
      const val = body[numericField]
      if (val && !/^\d+$/.test(val)) {
        return NextResponse.json(
          { success: false, error: `${numericField}: aceita apenas números.` },
          { status: 400 },
        )
      }
    }

    const saves: Promise<void>[] = []

    // Chaves simples
    for (const key of PLAIN_KEYS) {
      const shortKey = key.replace(`${GROUP}.`, '')
      if (shortKey in body && body[shortKey] != null) {
        saves.push(upsertSystemSetting(key, String(body[shortKey]), GROUP, session.id, key))
      }
    }

    // Chaves sensíveis — só atualiza se vier valor novo (não mascarado)
    for (const secretShort of SECRET_KEYS) {
      const fullKey = `whatsapp.${secretShort}`
      if (secretShort in body) {
        const val = body[secretShort]
        if (!val || isMasked(val)) continue // mantém o segredo antigo
        saves.push(upsertSystemSetting(fullKey, encrypt(val), GROUP, session.id, fullKey))
      }
    }

    await Promise.all(saves)

    await logMasterAction(session, 'UPDATE_WHATSAPP_CONFIG', 'SystemSetting', null, {
      afterData: {
        provider:    body.provider,
        environment: body.environment,
        apiVersion:  body.apiVersion,
      },
      req,
    })

    return NextResponse.json({ success: true, message: 'Configurações do WhatsApp salvas com sucesso.' })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── Helpers exportados para uso interno (test routes) ─────────────────────────

export async function getWhatsAppConfig(): Promise<Record<string, string>> {
  const settings = await getSettingGroup('whatsapp')
  const config: Record<string, string> = {}

  for (const [k, v] of Object.entries(settings)) {
    const shortKey = k.replace('whatsapp.', '')
    // Descriptografar segredos para uso interno
    if ((SECRET_KEYS as readonly string[]).includes(shortKey)) {
      config[shortKey] = decrypt(v)
    } else {
      config[shortKey] = v
    }
  }

  return config
}
