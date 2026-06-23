// =============================================================================
// seller-queue/notify.ts — notificações da Fila de Atendimento (in-app + WhatsApp).
// Centraliza as mensagens: vendedor da vez (chamada — alerta crítico), timeout p/
// a gestão e "nenhum vendedor disponível". Usa o NotificationService: canal
// APP_WEB alimenta o balão/central; WHATSAPP envia best-effort ao telefone do
// usuário (só quando o ADM ligou na config da unidade). Nada bloqueia o fluxo.
// =============================================================================

import { notify, notifyByRole, type NotifyChannel } from '@/services/notification.service'
import { prisma } from '@/lib/prisma'

const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER']

const ch = (whatsapp: boolean): NotifyChannel[] => (whatsapp ? ['APP_WEB', 'WHATSAPP'] : ['APP_WEB'])

/** Alerta (crítico) o vendedor da vez de que há cliente presencial aguardando. */
export async function notifySellerCalled(p: {
  tenantId: string
  sellerId: string
  timeoutSeconds: number
  attendanceId: string
  arrivalId?: string | null
  customerName?: string | null
  recurring?: boolean
  whatsapp?: boolean
}): Promise<void> {
  const who = p.customerName?.trim() ? `: ${p.customerName.trim()}` : ''
  const rec = p.recurring ? ' (cliente recorrente / retorno)' : ''
  await notify({
    userId: p.sellerId, tenantId: p.tenantId, type: 'WARNING',
    title: 'Você é o vendedor da vez 🔔',
    message: `Atenção: cliente presencial aguardando${who}${rec}. Você tem ${p.timeoutSeconds} segundos para aceitar.`,
    actionUrl: '/vendedor-da-vez/minha-fila',
    metadata: { kind: 'seller_queue_called', attendanceId: p.attendanceId, arrivalId: p.arrivalId ?? null },
    channels: ch(p.whatsapp ?? false),
  }).catch(() => {})
}

/** Avisa a gestão (líder/gerente) que um aceite estourou o prazo. */
export async function notifyTimeoutManagers(p: { tenantId: string; unitId: string; attendanceId: string; whatsapp?: boolean }): Promise<void> {
  await notifyByRole({
    tenantId: p.tenantId, unitId: p.unitId, roles: MANAGER_ROLES, type: 'WARNING',
    title: 'Vendedor não aceitou no prazo',
    message: 'Um cliente presencial não foi aceito a tempo — o próximo vendedor foi chamado.',
    actionUrl: '/vendedor-da-vez/painel',
    metadata: { kind: 'seller_queue_timeout', attendanceId: p.attendanceId, unitId: p.unitId },
    channels: ch(p.whatsapp ?? false),
  }).catch(() => {})
}

/** Avisa a gestão que há cliente aguardando e ninguém disponível na fila. */
export async function notifyNoSellerAvailable(p: { tenantId: string; unitId: string; arrivalId: string; whatsapp?: boolean }): Promise<void> {
  await notifyByRole({
    tenantId: p.tenantId, unitId: p.unitId, roles: MANAGER_ROLES, type: 'WARNING',
    title: 'Cliente aguardando sem vendedor disponível',
    message: 'Há um cliente presencial aguardando e nenhum vendedor disponível na fila.',
    actionUrl: '/vendedor-da-vez/painel',
    metadata: { kind: 'seller_queue_no_seller', arrivalId: p.arrivalId, unitId: p.unitId },
    channels: ch(p.whatsapp ?? false),
  }).catch(() => {})
}

// ── Anti-abuso (strikes) ──────────────────────────────────────────────────────

/** Aviso progressivo ao vendedor após perder a vez (sem bloquear ainda). */
export async function notifySellerStrikeWarning(p: {
  tenantId: string; sellerId: string; strikes: number; remaining: number; cooldownHours: number; willBeDaily: boolean
}): Promise<void> {
  const consequencia = p.willBeDaily
    ? `mais ${p.remaining} e você fica bloqueado até o fim do dia`
    : `mais ${p.remaining} e você fica ${p.cooldownHours}h fora da fila`
  await notify({
    userId: p.sellerId, tenantId: p.tenantId, type: 'WARNING',
    title: '⚠️ Você perdeu a vez',
    message: `Você não aceitou no prazo (${p.strikes} perda(s) hoje). Atenção: ${consequencia}.`,
    actionUrl: '/vendedor-da-vez/minha-fila',
    metadata: { kind: 'seller_queue_strike', strikes: p.strikes },
  }).catch(() => {})
}

/** Avisa o vendedor que foi bloqueado (temporário ou diário). */
export async function notifySellerBlocked(p: {
  tenantId: string; sellerId: string; type: 'COOLDOWN' | 'DAILY_BLOCK'; strikes: number; hours: number
}): Promise<void> {
  const isDaily = p.type === 'DAILY_BLOCK'
  await notify({
    userId: p.sellerId, tenantId: p.tenantId, type: 'WARNING',
    title: isDaily ? '🚫 Bloqueado na fila (reincidência)' : '🚫 Bloqueado temporariamente na fila',
    message: isDaily
      ? `Você perdeu a vez ${p.strikes}x hoje e está bloqueado até o fim do dia. Procure a gerência.`
      : `Você perdeu a vez ${p.strikes}x e está fora da fila pelas próximas ${p.hours} horas.`,
    actionUrl: '/vendedor-da-vez/minha-fila',
    metadata: { kind: 'seller_queue_blocked', blockType: p.type, strikes: p.strikes },
  }).catch(() => {})
}

/** Avisa a gestão que um vendedor foi bloqueado automaticamente. */
export async function notifyBlockManagers(p: {
  tenantId: string; unitId: string; sellerId: string; type: 'COOLDOWN' | 'DAILY_BLOCK'; strikes: number; whatsapp?: boolean
}): Promise<void> {
  const seller = await prisma.user.findUnique({ where: { id: p.sellerId }, select: { name: true } }).catch(() => null)
  const nome = seller?.name ?? 'Um vendedor'
  const tipo = p.type === 'DAILY_BLOCK' ? 'até o fim do dia' : 'temporariamente'
  await notifyByRole({
    tenantId: p.tenantId, unitId: p.unitId, roles: MANAGER_ROLES, type: 'WARNING',
    title: 'Vendedor bloqueado na fila',
    message: `${nome} foi bloqueado ${tipo} por perder a vez ${p.strikes}x hoje. Você pode liberar no Painel.`,
    actionUrl: '/vendedor-da-vez/painel',
    metadata: { kind: 'seller_queue_auto_block', sellerId: p.sellerId, blockType: p.type, strikes: p.strikes },
    channels: ch(p.whatsapp ?? false),
  }).catch(() => {})
}
