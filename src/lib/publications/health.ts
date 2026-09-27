// =============================================================================
// Saúde das contas conectadas (cron de reconciliação).
//   • token vencido e conta ainda "Conectada" → marca RECONECTAR (antes de
//     qualquer envio falhar) e avisa os gestores uma vez;
//   • token vence em até 7 dias → avisa os gestores uma vez por vencimento.
// O aviso é controlado por chave em `config.healthNotified` (sem coluna nova).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { notifyByRole } from '@/services/notification.service'
import { logEvent, SYSTEM_ACTOR } from './service'
import { channelSpec } from './channels'

const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE']
const WARN_DAYS = 7

const fmt = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Chave do aviso: evita repetir a mesma notificação a cada 15 min. PURO. */
export function healthNoticeKey(kind: 'VENCIDO' | 'VENCENDO', expiresAt: Date): string {
  return `${kind}:${expiresAt.toISOString()}`
}

/** Classifica o token pela data de vencimento. PURO. */
export function tokenHealth(expiresAt: Date | null, now = new Date()): 'OK' | 'VENCENDO' | 'VENCIDO' {
  if (!expiresAt) return 'OK'
  if (expiresAt.getTime() <= now.getTime()) return 'VENCIDO'
  if (expiresAt.getTime() - now.getTime() <= WARN_DAYS * 86_400_000) return 'VENCENDO'
  return 'OK'
}

export async function checkConnectionHealth(now = new Date()) {
  const out = { expired: 0, expiring: 0 }
  const conns = await prisma.publicationConnection.findMany({
    where: { status: { in: ['CONECTADO', 'RECONECTAR'] }, tokenExpiresAt: { not: null, lt: new Date(now.getTime() + WARN_DAYS * 86_400_000) } },
  })
  for (const c of conns) {
    const kind = tokenHealth(c.tokenExpiresAt, now)
    if (kind === 'OK') continue
    const cfg = (c.config && typeof c.config === 'object' && !Array.isArray(c.config) ? c.config : {}) as Record<string, unknown>
    const key = healthNoticeKey(kind, c.tokenExpiresAt!)
    const already = cfg.healthNotified === key
    const name = `${channelSpec(c.channel)?.name ?? c.channel} (${c.label})`
    const when = fmt(c.tokenExpiresAt!)

    if (kind === 'VENCIDO') {
      if (c.status === 'CONECTADO') {
        await prisma.publicationConnection.update({ where: { id: c.id }, data: { status: 'RECONECTAR', lastError: `Acesso vencido em ${when}. Reconecte a conta para voltar a publicar.` } })
        await logEvent(prisma, { tenantId: c.tenantId, channel: c.channel, type: 'ERRO_AUTENTICACAO', message: `Acesso de ${name} venceu em ${when}; conta marcada para reconectar.`, actor: SYSTEM_ACTOR })
      }
      out.expired++
    } else out.expiring++

    if (already) continue
    await notifyByRole({
      tenantId: c.tenantId, roles: MANAGER_ROLES, type: 'ERRO_INTEGRACAO',
      title: kind === 'VENCIDO' ? `Reconecte ${name}` : `${name}: acesso vence em breve`,
      message: kind === 'VENCIDO'
        ? `O acesso venceu em ${when}. As publicações desse canal ficam aguardando e serão enviadas automaticamente assim que a conta for reconectada em Marketing › Canais.`
        : `O acesso vence em ${when}. Reconecte antes disso em Marketing › Canais (de preferência com token permanente de usuário do sistema do Business Manager) para não interromper as publicações.`,
      actionUrl: '/marketing/canais',
      metadata: { connectionId: c.id, channel: c.channel },
      channels: ['APP_WEB', 'APP_MOBILE'],
    }).catch((e) => console.error('[publications] aviso de conta', c.id, e))
    await prisma.publicationConnection.update({ where: { id: c.id }, data: { config: { ...cfg, healthNotified: key } as never } })
  }
  return out
}
