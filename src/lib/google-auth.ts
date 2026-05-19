// =============================================================================
// src/lib/google-auth.ts
// Utilitário compartilhado: parse robusto de credenciais Google Service Account
// + construção do cliente GoogleAuth.
//
// FONTE DAS CREDENCIAIS (em ordem de prioridade):
//   1. Argumento explícito (raw passado pelo chamador)
//   2. SystemSettings.key = 'sheets.serviceAccountJson' (banco de dados)
//   3. Variável de ambiente GOOGLE_SHEETS_CREDENTIALS (fallback legado)
//
// Formatos aceitos para o valor bruto:
//   1. JSON puro              →  {"type":"service_account",...}
//   2. JSON com \n escapados  →  {"private_key":"-----BEGIN...\\n..."}
//   3. Base64 de JSON         →  eyJ0eXBlIjoi...
//   4. Base64 com prefixo     →  base64:eyJ0eXBlIjoi...
// =============================================================================

import { google }         from 'googleapis'
import type { GoogleAuth } from 'googleapis-common'

// ── Parser de credenciais ──────────────────────────────────────────────────────

export function parseGoogleSheetsCredentials(raw?: string): Record<string, unknown> {
  if (!raw || !raw.trim()) {
    throw new Error(
      'Credencial Google não configurada. ' +
      'Acesse Master → Importador Sheets → Configurações e cole o JSON da Service Account.',
    )
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
        'Credencial Google inválida: não é JSON nem Base64. ' +
        'Verifique o valor colado na tela de Configurações.',
      )
    }
  }

  // ── Parse JSON ──────────────────────────────────────────────────────────────
  // IMPORTANTE: o replace(/\\n/g, '\n') NÃO deve ocorrer antes do JSON.parse.
  // O \n dentro do campo private_key é um escape válido de JSON — convertê-lo
  // para uma quebra de linha real antes do parse torna o JSON inválido.
  // A conversão para newline real é feita DEPOIS do parse (linha abaixo).
  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(value) as Record<string, unknown>
  } catch {
    // Segunda tentativa: o valor pode ter vindo de .env com \\n duplamente escapado
    // (ex: GOOGLE_SHEETS_CREDENTIALS='{"private_key":"-----BEGIN...\\nMII..."}')
    try {
      credentials = JSON.parse(value.replace(/\\n/g, '\n')) as Record<string, unknown>
    } catch {
      throw new Error(
        'Credencial Google inválida: JSON malformado. ' +
        'Cole o conteúdo completo do arquivo .json gerado no Google Cloud Console ' +
        '(não é necessário minificar — o formato identado é aceito).',
      )
    }
  }

  if (!credentials.client_email) {
    throw new Error('Credencial Google inválida: campo "client_email" ausente.')
  }
  if (!credentials.private_key) {
    throw new Error('Credencial Google inválida: campo "private_key" ausente.')
  }

  // Converte \n escapados em quebras de linha reais na chave privada
  // (necessário para o caso de .env com \\n literal; no JSON bem formado já vem correto)
  credentials.private_key = String(credentials.private_key).replace(/\\n/g, '\n')

  return credentials
}

// ── Leitura das credenciais do banco de dados ─────────────────────────────────

/**
 * Busca o JSON bruto da Service Account armazenado em SystemSettings.
 * Retorna null se não configurado, sem lançar exceção.
 */
export async function getSheetsCredsFromDB(): Promise<string | null> {
  try {
    // Importação dinâmica para evitar dependência circular em contextos não-DB
    const { prisma } = await import('@/lib/prisma')
    const { decrypt, isEncrypted } = await import('@/lib/crypto')

    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'sheets.serviceAccountJson' },
    })

    if (!setting?.value) return null

    const raw = isEncrypted(setting.value) ? decrypt(setting.value) : setting.value
    return raw || null
  } catch {
    // Silencia erros de DB para não quebrar inicialização do servidor
    return null
  }
}

/**
 * Busca o Spreadsheet ID do banco de dados.
 * Retorna null se não configurado.
 */
export async function getMasterSheetIdFromDB(): Promise<string | null> {
  try {
    const { prisma } = await import('@/lib/prisma')
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'sheets.masterSheetId' },
    })
    return setting?.value?.trim() || null
  } catch {
    return null
  }
}

// ── Factory do GoogleAuth (async — prioridade: arg > DB > env) ────────────────

/**
 * Constrói um GoogleAuth autenticado com a Service Account.
 *
 * Ordem de resolução das credenciais:
 *   1. `credentialsRaw` passado explicitamente
 *   2. SystemSettings no banco (sheets.serviceAccountJson)
 *   3. Variável de ambiente GOOGLE_SHEETS_CREDENTIALS (legado)
 *
 * @throws Error se nenhuma fonte de credencial estiver disponível.
 */
export async function buildGoogleAuth(
  credentialsRaw?: string,
  scopes: string[] = ['https://www.googleapis.com/auth/spreadsheets.readonly'],
): Promise<GoogleAuth> {
  const raw =
    credentialsRaw?.trim() ||
    (await getSheetsCredsFromDB()) ||
    process.env.GOOGLE_SHEETS_CREDENTIALS

  const credentials = parseGoogleSheetsCredentials(raw)
  return new google.auth.GoogleAuth({ credentials, scopes })
}
