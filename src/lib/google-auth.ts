// =============================================================================
// src/lib/google-auth.ts
// Utilitário compartilhado: parse robusto de GOOGLE_SHEETS_CREDENTIALS +
// construção do cliente GoogleAuth.
//
// Formatos aceitos:
//   1. JSON puro                  →  {"type":"service_account",...}
//   2. JSON com \n escapados      →  {"private_key":"-----BEGIN...\\n..."}
//   3. Base64 de JSON             →  eyJ0eXBlIjoi...
//   4. Base64 com prefixo         →  base64:eyJ0eXBlIjoi...
// =============================================================================

import { google } from 'googleapis'

// ── Parser de credenciais ──────────────────────────────────────────────────────

export function parseGoogleSheetsCredentials(raw?: string) {
  if (!raw || !raw.trim()) {
    throw new Error('GOOGLE_SHEETS_CREDENTIALS não configurada no ambiente.')
  }

  let value = raw.trim()

  // Remove aspas externas se houver (alguns provedores envolvem o valor)
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  // Remove prefixo explícito "base64:"
  if (value.startsWith('base64:')) {
    value = value.slice('base64:'.length).trim()
  }

  // Se não começa com "{", assume Base64
  if (!value.trimStart().startsWith('{')) {
    try {
      value = Buffer.from(value, 'base64').toString('utf8').trim()
    } catch {
      throw new Error(
        'GOOGLE_SHEETS_CREDENTIALS não é JSON válido nem Base64 válido. ' +
        'Verifique se a variável foi gerada corretamente.',
      )
    }
  }

  // Substitui \n escapados antes do parse (alguns geradores os incluem)
  value = value.replace(/\\n/g, '\n')

  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(value) as Record<string, unknown>
  } catch {
    throw new Error(
      'GOOGLE_SHEETS_CREDENTIALS contém JSON inválido. ' +
      'Se estiver em Base64, confirme se a codificação está correta.',
    )
  }

  if (!credentials.client_email) {
    throw new Error('Credencial Google inválida: campo "client_email" ausente.')
  }
  if (!credentials.private_key) {
    throw new Error('Credencial Google inválida: campo "private_key" ausente.')
  }

  // Garante quebras de linha reais na chave privada
  credentials.private_key = String(credentials.private_key).replace(/\\n/g, '\n')

  return credentials
}

// ── Factory do GoogleAuth (readonly) ──────────────────────────────────────────

export function buildGoogleAuth(scopes: string[] = ['https://www.googleapis.com/auth/spreadsheets.readonly']) {
  const credentials = parseGoogleSheetsCredentials(process.env.GOOGLE_SHEETS_CREDENTIALS)
  return new google.auth.GoogleAuth({ credentials, scopes })
}
