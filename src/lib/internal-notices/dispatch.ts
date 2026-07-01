// =============================================================================
// internal-notices/dispatch.ts — cria notificações individuais para avisos
// internos ativos e aciona push genérico (Android FCM + Web Push).
// =============================================================================

import type { InternalNotice } from '@prisma/client'
import { notifyMany } from '@/services/notification.service'
import { resolveInternalNoticeRecipients } from './targeting'

function isPublishableNow(notice: InternalNotice): boolean {
  const now = Date.now()
  if (!notice.active || notice.status !== 'ACTIVE') return false
  if (notice.startsAt && notice.startsAt.getTime() > now) return false
  if (notice.endsAt && notice.endsAt.getTime() < now) return false
  return true
}

function noticeNotificationType(notice: InternalNotice): string {
  return notice.type === 'INFO' ? 'INFO' : 'SISTEMA'
}

export async function dispatchInternalNoticeNotifications(notice: InternalNotice): Promise<{ recipients: number }> {
  if (!isPublishableNow(notice)) return { recipients: 0 }

  const recipients = await resolveInternalNoticeRecipients(notice)
  if (!recipients.length) return { recipients: 0 }

  await notifyMany({
    userIds:   recipients.map((user) => user.id),
    tenantId:  notice.targetType === 'SELECTED_TENANTS' || notice.targetType === 'TENANT' ? notice.targetId : null,
    type:      noticeNotificationType(notice),
    title:     notice.title,
    message:   notice.message,
    actionUrl: notice.actionUrl || '/comunicacao/avisos',
    metadata:  {
      pushType:     'INTERNAL_NOTICE',
      entityType:   'internal_notice',
      entityId:     notice.id,
      priority:     notice.priority === 'CRITICAL' || notice.type === 'CRITICAL' ? 'HIGH' : 'NORMAL',
      pushData:     {
        noticeId: notice.id,
        noticeType: notice.type,
      },
    },
    channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
  })

  return { recipients: recipients.length }
}
