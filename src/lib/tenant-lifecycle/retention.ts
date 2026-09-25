// =============================================================================
// tenant-lifecycle/retention.ts — prazo de guarda (5 anos) das lojas
// desativadas: registro, avisos ao MASTER e exclusão automática.
//
// O registro fica em SystemSetting (key `tenant_retention:<tenantId>`, valor
// JSON, tenantId NULL de propósito para a própria exclusão não apagá-lo no
// meio do caminho). Sem coluna nova → sem migração (ver deploy: o build não
// roda `prisma migrate deploy`).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import {
  RETENTION_KEY_PREFIX, PURGED_KEY_PREFIX, countsRetention, daysUntil, effectivePurgeAt,
  isPurgeDue, newRetentionRecord, pendingWarning, type RetentionRecord,
} from './core'
import { purgeTenantData } from './purge'
import { invalidateTenantStatus } from './access'

const key = (tenantId: string) => `${RETENTION_KEY_PREFIX}${tenantId}`

export async function getRetention(tenantId: string): Promise<RetentionRecord | null> {
  const s = await prisma.systemSetting.findUnique({ where: { key: key(tenantId) }, select: { value: true } })
  if (!s) return null
  try { return JSON.parse(s.value) as RetentionRecord } catch { return null }
}

async function saveRetention(rec: RetentionRecord): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: key(rec.tenantId) },
    create: {
      key: key(rec.tenantId), tenantId: null, group: 'tenant_retention', value: JSON.stringify(rec),
      description: `Prazo de guarda da loja desativada ${rec.tenantName}`,
    },
    update: { value: JSON.stringify(rec) },
  })
}

/** Ao desativar: começa a contar os 5 anos (não reinicia se já contava). */
export async function startRetention(tenantId: string, tenantName: string, at = new Date()): Promise<RetentionRecord> {
  const existing = await getRetention(tenantId)
  if (existing) return existing
  const rec = newRetentionRecord(tenantId, tenantName, at)
  await saveRetention(rec)
  return rec
}

/** Ao reativar: o prazo acaba — os dados ficam. */
export async function clearRetention(tenantId: string): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key: key(tenantId) } })
}

/**
 * Lojas desativadas sem registro (ex.: desativadas antes deste controle
 * existir): cria o registro usando a data da auditoria da desativação.
 */
export async function ensureRetention(t: { id: string; name: string; updatedAt: Date }): Promise<RetentionRecord> {
  const existing = await getRetention(t.id)
  if (existing) return existing
  const log = await prisma.auditLog.findFirst({
    where: { entity: 'Tenant', entityId: t.id, action: { in: ['STATUS_BANIR', 'STATUS_DESATIVAR'] } },
    orderBy: { createdAt: 'desc' }, select: { createdAt: true },
  })
  return startRetention(t.id, t.name, log?.createdAt ?? t.updatedAt)
}

async function backfillMissing(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ where: { status: 'BANIDO' }, select: { id: true, name: true, updatedAt: true } })
  for (const t of tenants) await ensureRetention(t)
}

async function masterRecipients() {
  return prisma.user.findMany({ where: { role: 'MASTER', status: 'ATIVO' }, select: { id: true, email: true } })
}

const fmt = (iso: string | Date) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

async function warnMasters(rec: RetentionRecord, daysLeft: number, extra?: string): Promise<boolean> {
  const masters = await masterRecipients()
  if (!masters.length) return false
  const when = fmt(effectivePurgeAt(rec))
  const title = `⚠️ Loja desativada será APAGADA em ${daysLeft} dia(s)`
  const message =
    `A loja "${rec.tenantName}" está desativada desde ${fmt(rec.deactivatedAt)}. ` +
    `Em ${when} o sistema apagará automaticamente TODOS os dados e documentos dela. ` +
    `Faça o backup antes (npx tsx scripts/tenant-backup.ts ${rec.tenantId}) ou reative o cadastro.` +
    (extra ? ` ${extra}` : '')
  await prisma.notification.createMany({
    data: masters.map((m) => ({ userId: m.id, type: 'SISTEMA' as never, title, message, actionUrl: `/master/tenants/${rec.tenantId}` })),
  }).catch(() => {})
  const emails = masters.map((m) => m.email).filter(Boolean) as string[]
  if (emails.length) {
    const base = process.env.NEXTAUTH_URL ?? ''
    await sendMail({
      to: emails,
      subject: `[AutoDrive] ${rec.tenantName}: dados serão apagados em ${when}`,
      html: `<p><b>${title}</b></p><p>${message}</p><p><a href="${base}/master/tenants/${rec.tenantId}">Abrir a loja no painel Master</a></p>`,
      text: `${title}\n\n${message}`,
    }).catch(() => null)
  }
  return true
}

export interface RetentionSweepResult {
  checked: number
  warned: { tenantId: string; daysLeft: number }[]
  purged: { tenantId: string; rows: number }[]
  errors: { tenantId: string; error: string }[]
}

/** Rodado 1x/dia pelo cron: avisa quem está perto e apaga quem venceu. */
export async function runRetentionSweep(now = new Date()): Promise<RetentionSweepResult> {
  const out: RetentionSweepResult = { checked: 0, warned: [], purged: [], errors: [] }
  await backfillMissing()

  const settings = await prisma.systemSetting.findMany({ where: { key: { startsWith: RETENTION_KEY_PREFIX } }, select: { value: true } })
  for (const s of settings) {
    let rec: RetentionRecord
    try { rec = JSON.parse(s.value) } catch { continue }
    out.checked++

    // Loja reativada por fora (ou já inexistente): encerra o prazo sem apagar nada.
    const tenant = await prisma.tenant.findUnique({ where: { id: rec.tenantId }, select: { status: true, name: true } })
    if (!tenant || !countsRetention(tenant.status)) { await clearRetention(rec.tenantId); continue }

    try {
      const w = pendingWarning(rec, now)
      if (w) {
        const daysLeft = Math.max(1, daysUntil(effectivePurgeAt(rec).toISOString(), now))
        // Simula a exclusão já no aviso: se algo for impedir, o MASTER fica sabendo com antecedência.
        const dry = w.threshold <= 30 ? await purgeTenantData(rec.tenantId, { dryRun: true }) : null
        const extra = dry && !dry.ok ? `ATENÇÃO: a simulação da exclusão falhou (${dry.error}). Verifique.` : undefined
        if (await warnMasters(rec, daysLeft, extra)) {
          rec.warned = [...new Set([...rec.warned, ...w.markAsWarned])]
          rec.firstWarnedAt ??= now.toISOString()
          await saveRetention(rec)
          out.warned.push({ tenantId: rec.tenantId, daysLeft })
        }
      }

      if (isPurgeDue(rec, now)) {
        const r = await purgeTenantData(rec.tenantId)
        if (!r.ok) {
          rec.lastError = r.error ?? 'erro desconhecido'
          await saveRetention(rec)
          out.errors.push({ tenantId: rec.tenantId, error: rec.lastError })
          continue
        }
        invalidateTenantStatus(rec.tenantId)
        await clearRetention(rec.tenantId)
        // Lápide: o que foi apagado e quando (sem dados pessoais).
        await prisma.systemSetting.upsert({
          where: { key: `${PURGED_KEY_PREFIX}${rec.tenantId}` },
          create: {
            key: `${PURGED_KEY_PREFIX}${rec.tenantId}`, tenantId: null, group: 'tenant_retention',
            value: JSON.stringify({ tenantId: rec.tenantId, tenantName: rec.tenantName, deactivatedAt: rec.deactivatedAt, purgedAt: now.toISOString(), rows: r.totalRows }),
            description: `Loja ${rec.tenantName} apagada após o prazo de guarda`,
          },
          update: {},
        })
        await prisma.auditLog.create({
          data: { action: 'TENANT_PURGED', entity: 'Tenant', entityId: rec.tenantId, userName: 'Sistema (prazo de guarda)', afterData: { tenantName: rec.tenantName, rows: r.totalRows } },
        }).catch(() => {})
        out.purged.push({ tenantId: rec.tenantId, rows: r.totalRows })
      }
    } catch (err) {
      out.errors.push({ tenantId: rec.tenantId, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return out
}
