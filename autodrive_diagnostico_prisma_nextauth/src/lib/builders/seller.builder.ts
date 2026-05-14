// =============================================================================
// Builder para criação de Seller no Prisma.
// Ajuste os nomes dos campos se o seu schema.prisma usar nomenclatura diferente.
// =============================================================================

import type { Prisma } from '@prisma/client'
import type { Session } from 'next-auth'
import { assertTenantId } from '@/lib/auth-guards'

function getSessionUser(session: Session): Record<string, unknown> {
  return session.user as Record<string, unknown>
}

function asString(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    throw new Error(`[validation] Campo obrigatório ausente: ${fieldName}`)
  }

  return normalized
}

function asOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === null || value === undefined || value === '') return defaultValue
  if (typeof value === 'boolean') return value

  const normalized = String(value).trim().toLowerCase()

  if (['true', '1', 'sim', 's', 'yes'].includes(normalized)) return true
  if (['false', '0', 'não', 'nao', 'n', 'no'].includes(normalized)) return false

  return Boolean(value)
}

/**
 * Versão relacional.
 * Use se no schema Seller existir relação:
 * tenant Tenant @relation(...)
 * unit   Unit   @relation(...)
 */
export function buildSellerData(
  body: Record<string, unknown>,
  session: Session,
): Prisma.SellerCreateInput {
  const user = getSessionUser(session)
  const role = String(user.role ?? '')
  const tenantId = assertTenantId(user.tenantId as string | null | undefined, role)

  const data: Prisma.SellerCreateInput = {
    fullName: asString(body.fullName, 'fullName'),
    whatsapp: asString(body.whatsapp, 'whatsapp'),

    unit: {
      connect: {
        id: asString(body.unitId, 'unitId'),
      },
    },

    ...(tenantId
      ? {
          tenant: {
            connect: {
              id: tenantId,
            },
          },
        }
      : {}),

    shortName: asOptionalString(body.shortName),
    cpf: asOptionalString(body.cpf),
    email: asOptionalString(body.email),
    cargo: asOptionalString(body.cargo) ?? 'VENDEDOR',
    active: asBoolean(body.active, true),
    receivesCharge: asBoolean(body.receivesCharge, true),
  }

  return data
}

/**
 * Versão alternativa com campos diretos.
 * Use esta se o seu Prisma reclamar da relação `tenant` ou `unit`.
 *
 * Exemplo de schema compatível:
 * tenantId String
 * unitId   String
 */
export function buildSellerUncheckedData(
  body: Record<string, unknown>,
  session: Session,
): Prisma.SellerUncheckedCreateInput {
  const user = getSessionUser(session)
  const role = String(user.role ?? '')
  const tenantId = assertTenantId(user.tenantId as string | null | undefined, role)

  const data: Prisma.SellerUncheckedCreateInput = {
    fullName: asString(body.fullName, 'fullName'),
    whatsapp: asString(body.whatsapp, 'whatsapp'),
    unitId: asString(body.unitId, 'unitId'),

    ...(tenantId ? { tenantId } : {}),

    shortName: asOptionalString(body.shortName),
    cpf: asOptionalString(body.cpf),
    email: asOptionalString(body.email),
    cargo: asOptionalString(body.cargo) ?? 'VENDEDOR',
    active: asBoolean(body.active, true),
    receivesCharge: asBoolean(body.receivesCharge, true),
  }

  return data
}
