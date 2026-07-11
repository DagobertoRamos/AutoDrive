// =============================================================================
// seller-queue/geo.ts — validação de PRESENÇA (puro, testável).
// Distância Haversine + decisão de presença por camadas (QR/GPS/device/override).
// NÃO faz rastreio contínuo — é avaliado só no momento de um evento operacional.
// =============================================================================

/** Distância em metros entre dois pontos (Haversine). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export interface PresenceConfig {
  active: boolean
  presenceMethods: string[]
  geofenceLat: number | null
  geofenceLng: number | null
  geofenceRadiusM: number
  qrSecret: string | null
}

export interface PresenceInput {
  latitude?: number | null
  longitude?: number | null
  accuracyM?: number | null
  deviceId?: string | null
  qrToken?: string | null
}

export interface PresenceResult {
  ok: boolean
  method: string // GPS | QR_CODE | DEVICE_CHECK | MANUAL_REVIEW
  distanceM?: number
  reason?: string
}

/**
 * Avalia a presença conforme a config da unidade. Sem config ativa, a presença
 * NÃO é forçada (MANUAL_REVIEW, ok=true) — permite operar antes de configurar.
 * Override de gerente/líder é tratado na rota (não aqui).
 */
export function evaluatePresence(cfg: PresenceConfig | null, input: PresenceInput): PresenceResult {
  if (!cfg || !cfg.active) {
    return { ok: true, method: 'MANUAL_REVIEW', reason: 'Presença não configurada para a unidade.' }
  }
  const methods = cfg.presenceMethods?.length ? cfg.presenceMethods : ['GPS']

  // QR Code fixo da loja.
  if (input.qrToken && methods.includes('QR_CODE')) {
    if (cfg.qrSecret && input.qrToken === cfg.qrSecret) return { ok: true, method: 'QR_CODE' }
    return { ok: false, method: 'QR_CODE', reason: 'QR Code inválido.' }
  }

  // GPS / geofence.
  if (methods.includes('GPS')) {
    // Geofence não configurada → nada a validar → permite (GPS é opcional neste caso).
    if (cfg.geofenceLat == null || cfg.geofenceLng == null) {
      return { ok: true, method: 'GPS', reason: 'Geofence não configurada — presença liberada.' }
    }
    // Coordenadas fornecidas → valida distância.
    if (input.latitude != null && input.longitude != null) {
      const d = haversineMeters(input.latitude, input.longitude, cfg.geofenceLat, cfg.geofenceLng)
      const dist = Math.round(d)
      if (d <= cfg.geofenceRadiusM) return { ok: true, method: 'GPS', distanceM: dist }
      return { ok: false, method: 'GPS', distanceM: dist, reason: `Fora do raio da loja (${dist}m > ${cfg.geofenceRadiusM}m).` }
    }
    // Geofence configurada mas nenhuma coordenada enviada → tenta outros métodos.
  }

  // Dispositivo reconhecido.
  if (input.deviceId && methods.includes('DEVICE_CHECK')) {
    return { ok: true, method: 'DEVICE_CHECK' }
  }

  return { ok: false, method: 'MANUAL_REVIEW', reason: 'Presença não validada — envie GPS/QR/dispositivo ou peça liberação ao gestor.' }
}
