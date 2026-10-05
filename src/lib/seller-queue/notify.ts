// =============================================================================
// seller-queue/notify.ts — notificações da Fila de Atendimento (in-app + WhatsApp).
// Centraliza as mensagens: vendedor da vez (chamada — alerta crítico), timeout p/
// a gestão e "nenhum vendedor disponível". Usa o NotificationService: canal
// APP_WEB alimenta o balão/central; WHATSAPP envia best-effort ao telefone do
// usuário (só quando o ADM ligou na config da unidade). Nada bloqueia o fluxo.
// =============================================================================

import { notify, notifyByRole, type NotifyChannel } from '@/services/notification.service'
import { prisma } from '@/lib/prisma'
import { pushQueueCall } from '@/lib/push/queue-push'

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
  // Push nativo (FCM) — alerta no celular mesmo em 2º plano / tela bloqueada.
  void pushQueueCall({ sellerId: p.sellerId, attendanceId: p.attendanceId, customerName: p.customerName ?? null, timeoutSeconds: p.timeoutSeconds })
  await notify({
    userId: p.sellerId, tenantId: p.tenantId, type: 'SISTEMA',
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
    tenantId: p.tenantId, unitId: p.unitId, roles: MANAGER_ROLES, type: 'SISTEMA',
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
    tenantId: p.tenantId, unitId: p.unitId, roles: MANAGER_ROLES, type: 'SISTEMA',
    title: 'Cliente aguardando sem vendedor disponível',
    message: 'Há um cliente presencial aguardando e nenhum vendedor disponível na fila.',
    actionUrl: '/vendedor-da-vez/painel',
    metadata: { kind: 'seller_queue_no_seller', arrivalId: p.arrivalId, unitId: p.unitId },
    channels: ch(p.whatsapp ?? false),
  }).catch(() => {})
}

// ── Anti-abuso (strikes) ──────────────────────────────────────────────────────

/** Aviso ao vendedor após perder a vez (penalidade só avisa — não sai da fila). */
export async function notifySellerStrikeWarning(p: {
  tenantId: string; sellerId: string; strikes: number
}): Promise<void> {
  await notify({
    userId: p.sellerId, tenantId: p.tenantId, type: 'SISTEMA',
    title: '⚠️ Você perdeu a vez',
    message: `Você não aceitou no prazo (${p.strikes} perda(s) hoje). A gerência acompanha as perdas do dia.`,
    actionUrl: '/vendedor-da-vez/minha-fila',
    metadata: { kind: 'seller_queue_strike', strikes: p.strikes },
  }).catch(() => {})
}

/** Alerta a gestão quando um vendedor atinge o limiar de perdas do dia. */
export async function notifyBlockManagers(p: {
  tenantId: string; unitId: string; sellerId: string; strikes: number; whatsapp?: boolean
}): Promise<void> {
  const seller = await prisma.user.findUnique({ where: { id: p.sellerId }, select: { name: true } }).catch(() => null)
  const nome = seller?.name ?? 'Um vendedor'
  await notifyByRole({
    tenantId: p.tenantId, unitId: p.unitId, roles: MANAGER_ROLES, type: 'SISTEMA',
    title: 'Vendedor perdendo a vez na fila',
    message: `${nome} perdeu a vez ${p.strikes}x hoje. Ele continua na fila — vale conversar.`,
    actionUrl: '/vendedor-da-vez/painel',
    metadata: { kind: 'seller_queue_strikes_alert', sellerId: p.sellerId, strikes: p.strikes },
    channels: ch(p.whatsapp ?? false),
  }).catch(() => {})
}
