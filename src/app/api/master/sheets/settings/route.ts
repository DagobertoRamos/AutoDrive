// =============================================================================
// /api/master/sheets/settings
// GET  — carrega configurações do Google Sheets salvas no banco
// POST — salva/atualiza configurações (serviceAccountJson criptografado)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  requireMaster,
  upsertSystemSetting,
  getSettingGroup,
} from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { encrypt, decrypt, isMasked, isEncrypted, MASKED } from '@/lib/crypto'
import { parseGoogleSheetsCredentials } from '@/lib/google-auth'

const GROUP = 'sheets'

// Chave do JSON da Service Account — armazenada criptografada
const KEY_JSON   = 'sheets.serviceAccountJson'
const KEY_ID     = 'sheets.masterSheetId'
const KEY_GID    = 'sheets.defaultGid'
const KEY_TAB    = 'sheets.defaultTab'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const settings = await getSettingGroup(GROUP)

    // Mascara o JSON da Service Account — nunca retorna o valor real
    const hasCredential = Boolean(settings[KEY_JSON])
    const clientEmail   = _extractClientEmail(settings[KEY_JSON])

    return NextResponse.json({
      success: true,
      data: {
        masterSheetId:        settings[KEY_ID]  ?? '',
        defaultGid:           settings[KEY_GID] ?? '',
        defaultTab:           settings[KEY_TAB] ?? '',
        serviceAccountJson:   hasCredential ? MASKED : '',
        // Metadados para exibição
        credentialConfigured: hasCredential,
        clientEmail,          // e-mail da service account, se decodificável
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json() as {
      masterSheetId?:      string
      defaultGid?:         string
      defaultTab?:         string
      serviceAccountJson?: string
    }

    const ops: Promise<void>[] = []

    // ── Salva o ID da planilha ────────────────────────────────────────────────
    if (body.masterSheetId !== undefined) {
      const id = body.masterSheetId.trim()
      ops.push(
        upsertSystemSetting(
          KEY_ID, id, GROUP, session.id,
          'ID da planilha Google Sheets do Painel Master',
        ),
      )
    }

    // ── Salva GID e Tab padrão ────────────────────────────────────────────────
    if (body.defaultGid !== undefined) {
      ops.push(upsertSystemSetting(KEY_GID, body.defaultGid.trim(), GROUP, session.id, 'GID padrão da aba'))
    }
    if (body.defaultTab !== undefined) {
      ops.push(upsertSystemSetting(KEY_TAB, body.defaultTab.trim(), GROUP, session.id, 'Nome da aba padrão'))
    }

    // ── Salva o JSON da Service Account (criptografado) ───────────────────────
    if (body.serviceAccountJson !== undefined && !isMasked(body.serviceAccountJson)) {
      const raw = body.serviceAccountJson.trim()

      if (raw) {
        // Valida o JSON antes de salvar (lança erro com mensagem clara se inválido)
        parseGoogleSheetsCredentials(raw)

        // Criptografa e persiste
        const encrypted = encrypt(raw)
        ops.push(
          upsertSystemSetting(
            KEY_JSON, encrypted, GROUP, session.id,
            'Service Account JSON do Google (criptografado)',
          ),
        )
      } else {
        // String vazia = apagar a credencial
        ops.push(
          upsertSystemSetting(KEY_JSON, '', GROUP, session.id, 'Service Account JSON (limpo)'),
        )
      }
    }

    await Promise.all(ops)

    return NextResponse.json({
      success: true,
      message: 'Configurações do Google Sheets salvas com sucesso.',
    })
  } catch (err) {
    // Erros de validação de credencial são esperados — retornam 400 com mensagem clara
    if (err instanceof Error && (
      err.message.startsWith('Credencial') ||
      err.message.includes('service_account') ||
      err.message.includes('client_email') ||
      err.message.includes('private_key') ||
      err.message.includes('JSON')
    )) {
      return NextResponse.json(
        { success: false, error: err.message, errorCode: 'INVALID_CREDENTIAL' },
        { status: 400 },
      )
    }
    return handlePrismaError(err)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extrai o client_email do JSON armazenado (criptografado ou não).
 * Silencia erros — usado apenas para exibição amigável na UI.
 */
function _extractClientEmail(storedValue?: string): string {
  if (!storedValue) return ''
  try {
    const raw = isEncrypted(storedValue) ? decrypt(storedValue) : storedValue
    if (!raw) return ''
    const parsed = JSON.parse(raw.replace(/\\n/g, '\n'))
    return parsed.client_email ?? ''
  } catch {
    return ''
  }
}
