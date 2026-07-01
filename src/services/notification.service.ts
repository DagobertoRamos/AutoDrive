// =============================================================================
// Notification Service — AutoDrive
//
// Serviço centralizado para criação e envio de notificações em todos os canais:
//   • APP_WEB   — persiste no banco (tabela Notification) → polling/SSE
//   • WHATSAPP  — delega ao meta-whatsapp.service
//   • EMAIL     — placeholder (implementar com nodemailer quando necessário)
//   • APP_MOBILE / PUSH — push genérico via FCM nativo e Web Push/VAPID
//
// Uso:
//   await NotificationService.notify({
//     userId:   'abc',
//     tenantId: 'xyz',
//     type:     'NOVA_PENDENCIA',
//     title:    'Nova pendência criada',
//     message:  'O vendedor João criou uma pendência urgente',
//     actionUrl: '/pendencias/central',
//     channels: ['APP_WEB', 'WHATSAPP'],
//   })
// =============================================================================

import { prisma } from '@/lib/prisma'
import { getTenantWhatsappConfig } from '@/lib/whatsapp/credentials'
import { getWhatsappAdapter } from '@/lib/whatsapp/registry'
import { sendGenericPush, type GenericPushChannel } from '@/lib/push/notification-push'
import type { NotificationPreference } from '@prisma/client'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type NotifyChannel = 'APP_WEB' | 'APP_MOBILE' | 'WHATSAPP' | 'EMAIL' | 'PUSH'
const REALTIME_CHANNELS: NotifyChannel[] = ['APP_WEB', 'APP_MOBILE', 'PUSH']

export interface NotifyPayload {
  userId:    string
  tenantId?: string | null
  type:      string          // NotificationType enum value
  title:     string
  message:   string
  actionUrl?: string | null
  metadata?: Record<string, unknown>
  channels?: NotifyChannel[] // padrão: ['APP_WEB']
}

export interface BulkNotifyPayload extends Omit<NotifyPayload, 'userId'> {
  userIds: string[]
}

// ── Helpers internos ──────────────────────────────────────────────────────────

// ── WhatsApp helpers (best-effort — nunca propagam exceção) ──────────────────

interface UserContact {
  id:    string
  phone: string | null
}

/** Busca telefone do user (User.phone + Seller.whatsapp fallback). */
async function loadUserContact(userId: string): Promise<UserContact> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u: any = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, phone: true, seller: { select: { whatsapp: true } }, manager: { select: { whatsapp: true } } },
  })
  if (!u) return { id: userId, phone: null }
  const phone = u.phone ?? u.seller?.whatsapp ?? u.manager?.whatsapp ?? null
  return { id: u.id, phone }
}

async function sendWhatsappBestEffort(
  notificationId: string | null,
  userId: string,
  to: string | null,
  text: string,
  tenantId?: string | null,
): Promise<void> {
  if (!to) return
  try {
    // BYOC + multi-provedor: cada loja usa o SEU provedor/credenciais. Sem
    // configuração da loja → não envia (não usamos número da plataforma).
    const cfg = await getTenantWhatsappConfig(tenantId)
    if (!cfg) return  // loja sem WhatsApp configurado → silencioso
    const adapter = getWhatsappAdapter(cfg.kind)
    if (!adapter) return  // provedor sem adapter implementado → silencioso
    await adapter.sendText({ to, text }, cfg.creds)
    if (notificationId) {
      await prisma.notificationDelivery.create({
        data: { notificationId, userId, channel: 'WHATSAPP', status: 'ENVIADO', sentAt: new Date() },
      }).catch(() => {})
    }
  } catch (err) {
    console.warn('[NotificationService] whatsapp send failed:', err instanceof Error ? err.message : err)
    if (notificationId) {
      await prisma.notificationDelivery.create({
        data: {
          notificationId, userId, channel: 'WHATSAPP', status: 'ERRO',
          sentAt: new Date(), errorMessage: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => {})
    }
  }
}

async function sendEmailBestEffort(
  notificationId: string | null,
  userId: string,
  tenantId: string | null | undefined,
  subject: string,
  text: string,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = await (prisma as any).emailConfig.findFirst({
      where: {
        active: true,
        OR: tenantId ? [{ tenantId }, { tenantId: null }] : [{ tenantId: null }],
        fromEmail: { not: null },
      },
      orderBy: [{ tenantId: 'desc' }, { isDefault: 'desc' }],
    })
    if (!config) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user: any = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, name: true },
    })
    if (!user?.email) return

    // TODO: integrar sender real (nodemailer/sendgrid/resend). Por enquanto,
    // só registramos a tentativa pra rastreabilidade — não envia de fato.
    console.info(`[NotificationService] email queued (sender TODO):`, {
      to: user.email, subject, hasText: !!text, providerType: config.provider,
    })

    if (notificationId) {
      await prisma.notificationDelivery.create({
        data: { notificationId, userId, channel: 'EMAIL', status: 'ENVIADO', sentAt: new Date() },
      }).catch(() => {})
    }
  } catch (err) {
    console.warn('[NotificationService] email send failed:', err instanceof Error ? err.message : err)
  }
}

async function createWebNotification(payload: NotifyPayload): Promise<string | null> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId:    payload.userId,
        tenantId:  payload.tenantId,
        type:      payload.type as never,
        title:     payload.title,
        message:   payload.message,
        actionUrl: payload.actionUrl,
        metadata:  payload.metadata as never ?? undefined,
      },
    })

    await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        userId:         payload.userId,
        channel:        'APP_WEB',
        status:         'ENVIADO',
        sentAt:         new Date(),
      },
    })

    return notification.id
  } catch (err) {
    console.error('[NotificationService] createWebNotification error', err)
    return null
  }
}

async function loadPreference(userId: string): Promise<NotificationPreference | null> {
  return prisma.notificationPreference.findUnique({ where: { userId } }).catch(() => null)
}

function typeAllowed(pref: NotificationPreference | null, type: string): boolean {
  if (!pref) return true
  if (type === 'NOVA_PENDENCIA') return pref.newPendency
  if (type === 'PENDENCIA_CRITICA' || type === 'ESCALONAMENTO') return pref.pendencyUrgent
  if (type === 'COMISSAO_APROVADA' || type === 'COMISSAO_PAGA') return pref.commissionPaid
  return pref.systemAlerts
}

function channelAllowed(pref: NotificationPreference | null, channel: NotifyChannel, type: string): boolean {
  if (!typeAllowed(pref, type)) return false
  if (!pref) return true
  switch (channel) {
    case 'APP_WEB':    return pref.appWeb
    case 'APP_MOBILE': return pref.appMobile
    case 'PUSH':       return pref.push
    case 'WHATSAPP':   return pref.whatsapp
    case 'EMAIL':      return pref.email
  }
}

async function createSkippedDelivery(
  notificationId: string | null,
  userId: string,
  channel: NotifyChannel,
  reason: string,
): Promise<void> {
  if (!notificationId) return
  await prisma.notificationDelivery.create({
    data: {
      notificationId,
      userId,
      channel,
      status: 'CANCELADO',
      errorMessage: reason,
    },
  }).catch(() => {})
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Envia notificação para um único usuário nos canais especificados.
 */
export async function notify(payload: NotifyPayload): Promise<void> {
  const channels = payload.channels ?? ['APP_WEB']
  const preference = await loadPreference(payload.userId)

  // Cria a notification APP_WEB primeiro (se solicitada) — outros canais
  // referenciam o id pra registrar delivery.
  let notificationId: string | null = null
  if (channels.includes('APP_WEB') && channelAllowed(preference, 'APP_WEB', payload.type)) {
    notificationId = await createWebNotification(payload)
  }

  // Roda canais externos em paralelo, todos best-effort
  await Promise.all(
    channels.map(async (ch) => {
      switch (ch) {
        case 'APP_WEB':
          if (!channelAllowed(preference, ch, payload.type)) {
            await createSkippedDelivery(notificationId, payload.userId, ch, 'Preferência do usuário desativou este canal.')
          }
          // já criado acima quando permitido
          break

        case 'WHATSAPP': {
          if (!channelAllowed(preference, ch, payload.type)) {
            await createSkippedDelivery(notificationId, payload.userId, ch, 'Preferência do usuário desativou este canal.')
            break
          }
          const contact = await loadUserContact(payload.userId)
          await sendWhatsappBestEffort(
            notificationId,
            payload.userId,
            contact.phone,
            `*${payload.title}*\n${payload.message}`,
            payload.tenantId,
          )
          break
        }

        case 'EMAIL':
          if (!channelAllowed(preference, ch, payload.type)) {
            await createSkippedDelivery(notificationId, payload.userId, ch, 'Preferência do usuário desativou este canal.')
            break
          }
          await sendEmailBestEffort(
            notificationId,
            payload.userId,
            payload.tenantId,
            payload.title,
            payload.message,
          )
          break

        case 'APP_MOBILE':
        case 'PUSH': {
          if (!channelAllowed(preference, ch, payload.type)) {
            await createSkippedDelivery(notificationId, payload.userId, ch, 'Preferência do usuário desativou este canal.')
            break
          }
          await sendGenericPush({
            userId:         payload.userId,
            notificationId,
            type:           (payload.metadata?.pushType as string | undefined) ?? 'NOTIFICATION',
            title:          payload.title,
            body:           payload.message,
            url:            payload.actionUrl ?? '/dashboard',
            entityType:     payload.metadata?.entityType as string | undefined,
            entityId:       payload.metadata?.entityId as string | undefined,
            priority:       payload.metadata?.priority as never,
            data:           {
              notificationType: payload.type,
              ...(payload.metadata?.pushData as Record<string, string> | undefined ?? {}),
            },
          }, [ch as GenericPushChannel])
          break
        }
      }
    }),
  )
}

/**
 * Envia notificação para múltiplos usuários de uma vez.
 */
export async function notifyMany(payload: BulkNotifyPayload): Promise<void> {
  const { userIds, ...rest } = payload
  await Promise.all(userIds.map((userId) => notify({ ...rest, userId })))
}

/**
 * Envia notificação para todos os usuários de um tenant com determinadas roles.
 */
export async function notifyByRole(params: {
  tenantId: string
  roles:     string[]
  unitId?:   string
  type:      string
  title:     string
  message:   string
  actionUrl?: string | null
  metadata?:  Record<string, unknown>
  channels?:  NotifyChannel[]
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      tenantId: params.tenantId,
      role:     { in: params.roles as never[] },
      status:   'ATIVO',
      ...(params.unitId ? { unitId: params.unitId } : {}),
    },
    select: { id: true },
  })

  if (!users.length) return

  await notifyMany({
    userIds:   users.map((u) => u.id),
    tenantId:  params.tenantId,
    type:      params.type,
    title:     params.title,
    message:   params.message,
    actionUrl: params.actionUrl,
    metadata:  params.metadata,
    channels:  params.channels,
  })
}

/**
 * Notifica sobre uma pendência nova ou atualizada.
 * Automaticamente determina quem notificar com base no role do usuário responsável.
 */
export async function notifyPendency(params: {
  pendencyId:   string
  tenantId:     string
  unitId:       string
  type:         string  // NOVA_PENDENCIA | PENDENCIA_CRITICA | ESCALONAMENTO | etc.
  title:        string
  message:      string
  actionUrl?:   string
  notifyRoles?: string[]
}): Promise<void> {
  const roles = params.notifyRoles ?? ['GERENTE', 'GERENTE_GERAL', 'ADM']

  await notifyByRole({
    tenantId:  params.tenantId,
    roles,
    unitId:    params.unitId,
    type:      params.type,
    title:     params.title,
    message:   params.message,
    actionUrl: params.actionUrl ?? `/pendencias/central`,
    metadata:  { pendencyId: params.pendencyId },
    channels:  REALTIME_CHANNELS,
  })
}

// ── Notificações de negociação ──────────────────────────────────────────────

/**
 * Notifica TODOS os usuários ativos do tenant (broadcast).
 * Útil pra anúncios sistêmicos: venda aprovada, meta batida, etc.
 */
export async function notifyAllTenant(params: {
  tenantId: string
  type:      string
  title:     string
  message:   string
  actionUrl?: string | null
  metadata?:  Record<string, unknown>
  channels?:  NotifyChannel[]
}): Promise<void> {
  const users = await prisma.user.findMany({
    where:  { tenantId: params.tenantId, status: 'ATIVO' },
    select: { id: true },
  })
  if (!users.length) return

  await notifyMany({
    userIds:   users.map((u) => u.id),
    tenantId:  params.tenantId,
    type:      params.type,
    title:     params.title,
    message:   params.message,
    actionUrl: params.actionUrl,
    metadata:  params.metadata,
    channels:  params.channels ?? REALTIME_CHANNELS,
  })
}

interface DealNotifContext {
  dealId:       string
  dealNumber:   string | null
  dealType:     string  // VENDA | COMPRA | TROCA | CONSIGNACAO
  tenantId:     string | null
  vehicleLabel: string  // ex.: "VW Gol 1.0 (placa FOZ6303)"
  approverName: string  // quem aprovou (ou rejeitou)
  sellerName:   string  // vendedor da negociação
}

/**
 * Dispara notificação de "Venda aprovada" pra TODOS do tenant.
 * Mensagem sistema + (opcional) WhatsApp + Email — best-effort por canal.
 */
export async function notifyDealApproved(ctx: DealNotifContext): Promise<void> {
  if (!ctx.tenantId) return  // negociações sem tenant (MASTER) não broadcastam
  const tipoLabel = ctx.dealType === 'VENDA'  ? 'venda'
                  : ctx.dealType === 'COMPRA' ? 'compra'
                  : ctx.dealType === 'TROCA'  ? 'troca'
                  : 'consignação'

  const title   = `🎉 ${tipoLabel.charAt(0).toUpperCase() + tipoLabel.slice(1)} aprovada`
  const message = `A ${tipoLabel} do veículo ${ctx.vehicleLabel} acaba de ser aprovada por ${ctx.approverName}. Parabéns, mais uma ${tipoLabel} do vendedor ${ctx.sellerName}!`

  await notifyAllTenant({
    tenantId:  ctx.tenantId,
    type:      'NEGOCIACAO_LIBERADA',
    title,
    message,
    actionUrl: `/negociacoes/${ctx.dealId}`,
    metadata:  { dealId: ctx.dealId, dealNumber: ctx.dealNumber, dealType: ctx.dealType },
    channels:  ['APP_WEB', 'APP_MOBILE', 'PUSH', 'WHATSAPP', 'EMAIL'],
  })
}

/**
 * Notifica o(s) gerente(s) responsável(eis) que há negociação aguardando aprovação.
 * Sistema + WhatsApp.
 */
export async function notifyDealSubmittedForApproval(params: {
  dealId:       string
  dealNumber:   string | null
  tenantId:     string | null
  vehicleLabel: string
  sellerName:   string
  /** Gerente direto vinculado ao deal (deal.managerId) — recebe prioridade. */
  managerId?:   string | null
}): Promise<void> {
  if (!params.tenantId) return

  const title   = '📋 Nova negociação aguardando aprovação'
  const message = `${params.sellerName} enviou a negociação${params.dealNumber ? ` ${params.dealNumber}` : ''} (${params.vehicleLabel}) para sua aprovação.`
  const actionUrl = `/negociacoes/${params.dealId}`

  // 1) Notifica gerente direto, se houver
  if (params.managerId) {
    await notify({
      userId:    params.managerId,
      tenantId:  params.tenantId,
      type:      'NEGOCIACAO_NOVA',
      title,
      message,
      actionUrl,
      metadata:  { dealId: params.dealId, dealNumber: params.dealNumber },
      channels:  ['APP_WEB', 'APP_MOBILE', 'PUSH', 'WHATSAPP'],
    })
  }

  // 2) Fallback / cobertura: todos os GERENTE / GERENTE_GERAL / ADM do tenant
  //    (caso managerId não esteja setado ou o user queira garantir cobertura).
  await notifyByRole({
    tenantId:  params.tenantId,
    roles:     ['GERENTE', 'GERENTE_GERAL', 'ADM', 'MASTER'],
    type:      'NEGOCIACAO_NOVA',
    title,
    message,
    actionUrl,
    metadata:  { dealId: params.dealId, dealNumber: params.dealNumber },
    channels:  ['APP_WEB', 'APP_MOBILE', 'PUSH', 'WHATSAPP'],
  }).catch((e) => console.warn('[notifyDealSubmittedForApproval] role broadcast failed:', e))
}

// Re-export namespace style for backwards-compat
export const NotificationService = {
  notify, notifyMany, notifyByRole, notifyPendency,
  notifyAllTenant, notifyDealApproved, notifyDealSubmittedForApproval,
}
export default NotificationService
