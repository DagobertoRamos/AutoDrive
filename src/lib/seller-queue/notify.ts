// =============================================================================
// seller-queue/notify.ts — notificações da Fila de Atendimento (in-app/central).
// Centraliza as mensagens: vendedor da vez (chamada), timeout p/ a gestão e
// "nenhum vendedor disponível". Usa o NotificationService (canal APP_WEB →
// alimenta o balão/central). Todas best-effort (não bloqueiam o fluxo).
// =============================================================================

import { notify, notifyByRole } from '@/services/notification.service'

const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER']

/** Alerta o vendedor da vez de que há cliente presencial aguardando. */
export async function notifySellerCalled(p: {
  tenantId: string
  sellerId: string
  timeoutSeconds: number
  attendanceId: string
  arrivalId?: string | null
}): Promise<void> {
  await notify({
    userId: p.sellerId, tenantId: p.tenantId, type: 'WARNING',
    title: 'Você é o vendedor da vez',
    message: `Atenção: você é o vendedor da vez. Cliente presencial aguardando. Você tem ${p.timeoutSeconds} segundos para aceitar.`,
    actionUrl: '/vendedor-da-vez/minha-fila',
    metadata: { kind: 'seller_queue_called', attendanceId: p.attendanceId, arrivalId: p.arrivalId ?? null },
  }).catch(() => {})
}

/** Avisa a gestão (líder/gerente) que um aceite estourou o prazo. */
export async function notifyTimeoutManagers(p: { tenantId: string; unitId: string; attendanceId: string }): Promise<void> {
  await notifyByRole({
    tenantId: p.tenantId, roles: MANAGER_ROLES, type: 'WARNING',
    title: 'Vendedor não aceitou no prazo',
    message: 'Um cliente presencial não foi aceito a tempo — o próximo vendedor foi chamado.',
    actionUrl: '/vendedor-da-vez/painel',
    metadata: { kind: 'seller_queue_timeout', attendanceId: p.attendanceId, unitId: p.unitId },
  }).catch(() => {})
}

/** Avisa a gestão que há cliente aguardando e ninguém disponível na fila. */
export async function notifyNoSellerAvailable(p: { tenantId: string; unitId: string; arrivalId: string }): Promise<void> {
  await notifyByRole({
    tenantId: p.tenantId, roles: MANAGER_ROLES, type: 'WARNING',
    title: 'Cliente aguardando sem vendedor disponível',
    message: 'Há um cliente presencial aguardando e nenhum vendedor disponível na fila.',
    actionUrl: '/vendedor-da-vez/painel',
    metadata: { kind: 'seller_queue_no_seller', arrivalId: p.arrivalId, unitId: p.unitId },
  }).catch(() => {})
}
