// =============================================================================
// Garante que o `type` gravado em Notification exista no enum NotificationType.
// Um tipo inválido (ex.: 'WARNING') fazia o prisma.notification.create falhar
// em silêncio — o aviso sumia do sininho enquanto o push ainda saía.
// =============================================================================

import { NotificationType } from '@prisma/client'

const VALID = new Set<string>(Object.values(NotificationType))
export const FALLBACK_NOTIFICATION_TYPE: NotificationType = NotificationType.SISTEMA

export function resolveNotificationType(type: string): NotificationType {
  if (VALID.has(type)) return type as NotificationType
  console.warn(`[notification] tipo inválido "${type}" — usando ${FALLBACK_NOTIFICATION_TYPE}.`)
  return FALLBACK_NOTIFICATION_TYPE
}
