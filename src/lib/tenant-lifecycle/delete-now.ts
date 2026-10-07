// =============================================================================
// Exclusão imediata e completa de uma loja (Painel MASTER) — "como se nunca
// tivesse existido": todas as linhas da loja (usuários, negociações, estoque,
// financeiro, CRM, documentos, auditoria…) e os ARQUIVOS no armazenamento.
//   1. Varre (sem apagar) todas as linhas que serão excluídas e coleta as
//      referências de arquivo: `blob://…`, `/uploads/…` e URLs do Vercel Blob.
//   2. Apaga o banco em uma transação só (purge.ts — tudo ou nada).
//   3. Só então apaga os arquivos (best-effort; falhas são contadas).
// Fica apenas a lápide sem dados pessoais (SystemSetting tenant_purged:<id>)
// e o registro do MASTER que excluiu.
// =============================================================================

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { purgeTenantData } from './purge'
import { invalidateTenantStatus } from './access'
import { clearRetention } from './retention'

const BLOB_PREFIX = 'blob://'
const FILE_RE = /(blob:\/\/[^\s"'<>]+|\/uploads\/[^\s"'<>]+|https:\/\/[a-z0-9-]+\.(?:public\.)?blob\.vercel-storage\.com\/[^\s"'<>]+)/gi

function collect(value: unknown, out: Set<string>, depth = 0) {
  if (value == null || depth > 6) return
  if (typeof value === 'string') {
    if (value.length > 4 && (value.includes('blob') || value.includes('/uploads/'))) for (const m of value.match(FILE_RE) ?? []) out.add(m)
    return
  }
  if (Array.isArray(value)) { for (const v of value) collect(v, out, depth + 1); return }
  if (typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) for (const v of Object.values(value as Record<string, unknown>)) collect(v, out, depth + 1)
}

async function deleteStoredFile(ref: string): Promise<boolean> {
  try {
    if (ref.startsWith(BLOB_PREFIX) || ref.startsWith('https://')) {
      const { del } = await import('@vercel/blob')
      const { blobAuth } = await import('@/lib/publications/social/blob-token')
      await del(ref.startsWith(BLOB_PREFIX) ? ref.slice(BLOB_PREFIX.length) : ref, blobAuth())
      return true
    }
    if (ref.startsWith('/uploads/') && !ref.includes('..')) {
      await fs.unlink(path.join(process.cwd(), 'public', decodeURIComponent(ref.split('?')[0])))
      return true
    }
  } catch { /* já não existe / sem acesso */ }
  return false
}

export interface DeleteTenantResult { ok: boolean; error?: string; rows: number; files: number; filesFailed: number }

export async function deleteTenantCompletely(tenantId: string, opts: { dryRun?: boolean } = {}): Promise<DeleteTenantResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } })
  if (!tenant) return { ok: false, error: 'Loja não encontrada.', rows: 0, files: 0, filesFailed: 0 }

  // 1. Varredura (o mesmo conjunto que será apagado) para achar os arquivos.
  const refs = new Set<string>()
  const scan = await purgeTenantData(tenantId, { sink: async (_table, rows) => { for (const r of rows) collect(r, refs) } })
  if (!scan.ok) return { ok: false, error: scan.error, rows: 0, files: 0, filesFailed: 0 }
  if (opts.dryRun) return { ok: true, rows: scan.totalRows, files: refs.size, filesFailed: 0 }

  // 2. Banco: tudo ou nada.
  const r = await purgeTenantData(tenantId)
  if (!r.ok) return { ok: false, error: r.error, rows: 0, files: 0, filesFailed: 0 }
  invalidateTenantStatus(tenantId)
  await clearRetention(tenantId).catch(() => {})

  // 3. Arquivos (o banco já não aponta para eles).
  let files = 0, filesFailed = 0
  for (const ref of refs) (await deleteStoredFile(ref)) ? files++ : filesFailed++

  await prisma.systemSetting.upsert({
    where: { key: `tenant_purged:${tenantId}` },
    create: { key: `tenant_purged:${tenantId}`, tenantId: null, group: 'tenant_retention', value: JSON.stringify({ tenantId, tenantName: tenant.name, purgedAt: new Date().toISOString(), rows: r.totalRows, files, mode: 'MASTER' }), description: `Loja ${tenant.name} excluída pelo MASTER` },
    update: {},
  }).catch(() => {})
  return { ok: true, rows: r.totalRows, files, filesFailed }
}
