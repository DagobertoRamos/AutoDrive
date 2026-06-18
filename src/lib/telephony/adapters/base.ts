// =============================================================================
// telephony/adapters/base.ts — helpers compartilhados dos adapters.
// Verificação de assinatura (HMAC timing-safe) e coerção de campos.
// =============================================================================

import crypto from 'node:crypto'
import type { CallDirection, CallStatus } from '@prisma/client'

/** Compara dois textos em tempo constante (evita timing attack). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

/** HMAC-SHA256(rawBody) em hex, comparado de forma segura com a assinatura recebida. */
export function verifyHmacSha256Hex(rawBody: string, secret: string | undefined, signature: string | null | undefined): boolean {
  if (!secret || !signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const sig = signature.trim().replace(/^sha256=/i, '')
  return safeEqual(sig, expected)
}

export function str(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s.length ? s : undefined
}

export function int(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : undefined
}

export function toDate(v: unknown): Date | undefined {
  if (v == null || v === '') return undefined
  // epoch (segundos ou ms) ou ISO
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v)
    const ms = n > 1e12 ? n : n * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? undefined : d
  }
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? undefined : d
}

const STATUSES: CallStatus[] = ['RINGING', 'ANSWERED', 'MISSED', 'BUSY', 'FAILED', 'COMPLETED', 'VOICEMAIL', 'CANCELED']
const DIRECTIONS: CallDirection[] = ['INBOUND', 'OUTBOUND', 'INTERNAL']

export function coerceStatus(v: unknown, fallback: CallStatus = 'RINGING'): CallStatus {
  const s = String(v ?? '').toUpperCase()
  return (STATUSES as string[]).includes(s) ? (s as CallStatus) : fallback
}

export function coerceDirection(v: unknown, fallback: CallDirection = 'INBOUND'): CallDirection {
  const s = String(v ?? '').toUpperCase()
  return (DIRECTIONS as string[]).includes(s) ? (s as CallDirection) : fallback
}
