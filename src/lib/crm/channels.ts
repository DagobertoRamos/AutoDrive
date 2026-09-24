// =============================================================================
// CRM — Canais de captação (lado do banco). Sem migration:
//   t:<tenantId>:crm_channels:v1      → lista de canais da loja (JSON)
//   crm_channel:<key>                 → tenantId (índice da URL de entrada; key é única)
//   t:<tenantId>:crm_channels:log:v1  → últimos recebimentos (JSON, limitado)
// =============================================================================

import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sanitizeChannels, type LeadChannel } from './channels-core'

const cfgKey = (tenantId: string) => `t:${tenantId}:crm_channels:v1`
const logKey = (tenantId: string) => `t:${tenantId}:crm_channels:log:v1`
const idxKey = (key: string) => `crm_channel:${key}`
const LOG_MAX = 300

export const newChannelKey = () => randomBytes(18).toString('base64url')

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.systemSetting.findFirst({ where: { key }, select: { value: true } }).catch(() => null)
  if (!row) return fallback
  try { return JSON.parse(row.value) as T } catch { return fallback }
}

async function writeJson(key: string, tenantId: string, value: unknown, description: string, userId?: string) {
  const text = JSON.stringify(value)
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value: text, ...(userId ? { updatedByUserId: userId } : {}) } })
  else await prisma.systemSetting.create({ data: { key, value: text, tenantId, group: 'crm', description, ...(userId ? { updatedByUserId: userId } : {}) } })
}

export async function loadChannels(tenantId: string): Promise<LeadChannel[]> {
  const v = await readJson<unknown>(cfgKey(tenantId), [])
  return Array.isArray(v) ? (v as LeadChannel[]) : []
}

export async function saveChannels(tenantId: string, input: unknown, userId: string): Promise<LeadChannel[]> {
  const before = await loadChannels(tenantId)
  const next = sanitizeChannels(input, before, newChannelKey)
  const keep = new Set(next.map((c) => c.key))
  await prisma.$transaction(async (tx) => {
    // Índice das URLs: cria os novos e apaga os de canais removidos.
    const removed = before.filter((c) => !keep.has(c.key)).map((c) => idxKey(c.key))
    if (removed.length) await tx.systemSetting.deleteMany({ where: { key: { in: removed } } })
    for (const c of next) {
      await tx.systemSetting.upsert({ where: { key: idxKey(c.key) }, create: { key: idxKey(c.key), value: tenantId, tenantId, group: 'crm' }, update: {} })
    }
  })
  await writeJson(cfgKey(tenantId), tenantId, next, 'Canais de captação do CRM', userId)
  return next
}

/** URL de entrada → loja + canal (null se a chave não existir). */
export async function resolveChannel(key: string): Promise<{ tenantId: string; channel: LeadChannel } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return null
  const row = await prisma.systemSetting.findFirst({ where: { key: idxKey(key) }, select: { value: true } }).catch(() => null)
  if (!row) return null
  const channel = (await loadChannels(row.value)).find((c) => c.key === key)
  return channel ? { tenantId: row.value, channel } : null
}

export interface ChannelLogEntry {
  at: string
  channelId: string
  ok: boolean
  outcome: 'created' | 'existing' | 'duplicate' | 'error' | 'rejected'
  message: string
  leadId?: string
  leadNumber?: number | null
  name?: string
  test?: boolean
}

export async function appendChannelLog(tenantId: string, entry: ChannelLogEntry) {
  const list = await readJson<ChannelLogEntry[]>(logKey(tenantId), [])
  const next = [entry, ...(Array.isArray(list) ? list : [])].slice(0, LOG_MAX)
  await writeJson(logKey(tenantId), tenantId, next, 'Registro dos canais de captação').catch(() => {})
}

export async function loadChannelLog(tenantId: string): Promise<ChannelLogEntry[]> {
  const list = await readJson<ChannelLogEntry[]>(logKey(tenantId), [])
  return Array.isArray(list) ? list : []
}
