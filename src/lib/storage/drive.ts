// =============================================================================
// Google Drive — conexão da conta da plataforma (OAuth) e operações de arquivo.
// A conta é conectada uma vez pelo MASTER (/master/drive). Guardado em
// SystemSetting (grupo "drive"), segredos criptografados:
//   drive.clientId · drive.clientSecret (enc) · drive.refreshToken (enc)
//   drive.account (e-mail) · drive.connectedAt · drive.rootFolderId
// Pastas criadas ficam em cache (grupo "drive-folders", chave = caminho).
// Escopo drive.file: o sistema só vê/mexe no que ele mesmo criou.
// =============================================================================

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Readable } from 'node:stream'
import { google, type drive_v3 } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/crypto'
import { DRIVE_FOLDER_MIME, DRIVE_ROOT_FOLDER, DRIVE_SCOPES, driveQ } from './drive-core'

const GROUP = 'drive'
const K = {
  clientId: 'drive.clientId',
  clientSecret: 'drive.clientSecret',
  refreshToken: 'drive.refreshToken',
  account: 'drive.account',
  connectedAt: 'drive.connectedAt',
  rootFolderId: 'drive.rootFolderId',
} as const

export const DRIVE_CALLBACK_PATH = '/api/master/drive/callback'

interface DriveSettings {
  clientId: string; clientSecret: string; refreshToken: string
  account: string; connectedAt: string; rootFolderId: string
}

let settingsCache: { at: number; data: DriveSettings } | null = null

async function loadSettings(): Promise<DriveSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache.data
  const rows = await prisma.systemSetting.findMany({ where: { group: GROUP }, select: { key: true, value: true } })
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const data: DriveSettings = {
    clientId: m[K.clientId] ?? '',
    clientSecret: m[K.clientSecret] ? decrypt(m[K.clientSecret]) : '',
    refreshToken: m[K.refreshToken] ? decrypt(m[K.refreshToken]) : '',
    account: m[K.account] ?? '',
    connectedAt: m[K.connectedAt] ?? '',
    rootFolderId: m[K.rootFolderId] ?? '',
  }
  settingsCache = { at: Date.now(), data }
  return data
}

async function setSetting(key: string, value: string, description: string) {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, group: GROUP, description },
    update: { value },
  })
  settingsCache = null
}

async function clearSettings(keys: string[]) {
  await prisma.systemSetting.deleteMany({ where: { key: { in: keys } } })
  settingsCache = null
}

// ── Configuração / conexão (MASTER) ─────────────────────────────────────────

export interface DriveStatus {
  clientConfigured: boolean
  clientId: string
  connected: boolean
  account: string
  connectedAt: string
}

export async function driveStatus(): Promise<DriveStatus> {
  const s = await loadSettings()
  return { clientConfigured: !!(s.clientId && s.clientSecret), clientId: s.clientId, connected: !!s.refreshToken, account: s.account, connectedAt: s.connectedAt }
}

export async function saveDriveClient(clientId: string, clientSecret: string | null) {
  await setSetting(K.clientId, clientId.trim(), 'Google Drive — Client ID (OAuth)')
  if (clientSecret) await setSetting(K.clientSecret, encrypt(clientSecret.trim()), 'Google Drive — Client secret (OAuth, criptografado)')
}

export async function disconnectDrive() {
  await clearSettings([K.refreshToken, K.account, K.connectedAt, K.rootFolderId])
  await prisma.systemSetting.deleteMany({ where: { group: FOLDER_GROUP } })
  folderMemo.clear()
}

function oauth(s: DriveSettings, redirectUri?: string) {
  return new google.auth.OAuth2(s.clientId, s.clientSecret, redirectUri)
}

// state assinado (anti-CSRF): userId + validade, HMAC com NEXTAUTH_SECRET.
function stateSecret() { return process.env.NEXTAUTH_SECRET || process.env.ENCRYPTION_KEY || 'drive-state' }

export function signDriveState(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + 10 * 60_000 })).toString('base64url')
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyDriveState(state: string, userId: string): boolean {
  const [payload, sig] = String(state ?? '').split('.')
  if (!payload || !sig) return false
  const expected = createHmac('sha256', stateSecret()).update(payload).digest('base64url')
  const a = Buffer.from(sig); const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u: string; e: number }
    return p.u === userId && p.e > Date.now()
  } catch { return false }
}

export async function driveAuthUrl(redirectUri: string, state: string): Promise<string> {
  const s = await loadSettings()
  if (!s.clientId || !s.clientSecret) throw new Error('Cadastre o Client ID e o Client secret antes de conectar.')
  return oauth(s, redirectUri).generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: DRIVE_SCOPES, state, include_granted_scopes: true })
}

export async function finishDriveConnect(redirectUri: string, code: string): Promise<{ account: string }> {
  const s = await loadSettings()
  const client = oauth(s, redirectUri)
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) throw new Error('O Google não devolveu a autorização permanente. Remova o acesso do app em myaccount.google.com/permissions e conecte de novo.')
  let account = ''
  if (tokens.id_token) {
    try { account = String(JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8')).email ?? '') } catch { /* sem e-mail */ }
  }
  await setSetting(K.refreshToken, encrypt(tokens.refresh_token), 'Google Drive — autorização (criptografada)')
  await setSetting(K.account, account, 'Google Drive — conta conectada')
  await setSetting(K.connectedAt, new Date().toISOString(), 'Google Drive — conectado em')
  // Conta pode ter mudado: pastas antigas não valem mais.
  await clearSettings([K.rootFolderId])
  await prisma.systemSetting.deleteMany({ where: { group: FOLDER_GROUP } })
  folderMemo.clear()
  return { account }
}

// ── Cliente ─────────────────────────────────────────────────────────────────

/** Cliente do Drive, ou null se a conta não estiver conectada. */
export async function driveClient(): Promise<drive_v3.Drive | null> {
  const s = await loadSettings()
  if (!s.clientId || !s.clientSecret || !s.refreshToken) return null
  const auth = oauth(s)
  auth.setCredentials({ refresh_token: s.refreshToken })
  return google.drive({ version: 'v3', auth })
}

export async function driveEnabled(): Promise<boolean> {
  return (await driveClient().catch(() => null)) != null
}

// ── Pastas ──────────────────────────────────────────────────────────────────

const FOLDER_GROUP = 'drive-folders'
const folderMemo = new Map<string, Promise<string>>()
const folderKey = (path: string[]) => `drive:folder:${createHash('sha1').update(path.join('\u0001')).digest('hex')}`

async function findOrCreateFolder(drive: drive_v3.Drive, name: string, parent: string): Promise<string> {
  const q = `name = '${driveQ(name)}' and '${driveQ(parent)}' in parents and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`
  const found = await drive.files.list({ q, fields: 'files(id)', pageSize: 1, spaces: 'drive' })
  const id = found.data.files?.[0]?.id
  if (id) return id
  const created = await drive.files.create({ requestBody: { name, mimeType: DRIVE_FOLDER_MIME, parents: [parent] }, fields: 'id' })
  if (!created.data.id) throw new Error('O Drive não criou a pasta.')
  return created.data.id
}

async function rootFolder(drive: drive_v3.Drive): Promise<string> {
  const s = await loadSettings()
  if (s.rootFolderId) return s.rootFolderId
  const id = await findOrCreateFolder(drive, DRIVE_ROOT_FOLDER, 'root')
  await setSetting(K.rootFolderId, id, 'Google Drive — pasta raiz AutoDrive')
  return id
}

/** Garante a cadeia de pastas (abaixo de "AutoDrive") e devolve o id da última. */
async function ensureFolderPath(drive: drive_v3.Drive, path: string[]): Promise<string> {
  const key = folderKey(path)
  const memo = folderMemo.get(key)
  if (memo) return memo
  const work = (async () => {
    const cached = await prisma.systemSetting.findUnique({ where: { key }, select: { value: true } })
    if (cached?.value) return cached.value
    const parent = path.length > 1 ? await ensureFolderPath(drive, path.slice(0, -1)) : await rootFolder(drive)
    const id = await findOrCreateFolder(drive, path[path.length - 1], parent)
    await prisma.systemSetting.upsert({ where: { key }, create: { key, value: id, group: FOLDER_GROUP, description: path.join(' / ').slice(0, 250) }, update: { value: id } })
    return id
  })()
  folderMemo.set(key, work)
  work.catch(() => folderMemo.delete(key))
  return work
}

/** Esquece as pastas em cache (alguém apagou/moveu no Drive). */
async function forgetFolders() {
  folderMemo.clear()
  await prisma.systemSetting.deleteMany({ where: { group: FOLDER_GROUP } })
  await clearSettings([K.rootFolderId])
}

// ── Arquivos ────────────────────────────────────────────────────────────────

const isNotFound = (e: unknown) => (e as { code?: number; status?: number })?.code === 404 || (e as { status?: number })?.status === 404

/** Envia o arquivo para a pasta do caminho e devolve o id dele no Drive. */
export async function uploadToDrive(path: string[], fileName: string, mimeType: string, bytes: Buffer): Promise<string> {
  const drive = await driveClient()
  if (!drive) throw new Error('Google Drive não conectado.')
  const send = async () => {
    const parent = await ensureFolderPath(drive, path)
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [parent] },
      media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(bytes) },
      fields: 'id,size',
    })
    if (!res.data.id) throw new Error('O Drive não devolveu o arquivo.')
    if (res.data.size && Number(res.data.size) !== bytes.length) throw new Error('Tamanho no Drive diferente do enviado.')
    return res.data.id
  }
  try {
    return await send()
  } catch (e) {
    // Pasta do cache sumiu no Drive: refaz a cadeia uma vez.
    if (!isNotFound(e)) throw e
    await forgetFolders()
    return send()
  }
}

export async function readFromDrive(fileId: string): Promise<Buffer> {
  const drive = await driveClient()
  if (!drive) throw new Error('Google Drive não conectado.')
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  return Buffer.from(res.data as ArrayBuffer)
}

/** Manda para a lixeira do Drive (recuperável por 30 dias). */
export async function trashOnDrive(fileId: string): Promise<void> {
  const drive = await driveClient()
  if (!drive) return
  await drive.files.update({ fileId, requestBody: { trashed: true } }).catch((e) => { if (!isNotFound(e)) throw e })
}

/** Teste da conexão: garante a pasta raiz e devolve o link dela. */
export async function testDrive(): Promise<{ folderId: string; link: string }> {
  const drive = await driveClient()
  if (!drive) throw new Error('Google Drive não conectado.')
  const folderId = await rootFolder(drive)
  return { folderId, link: `https://drive.google.com/drive/folders/${folderId}` }
}
