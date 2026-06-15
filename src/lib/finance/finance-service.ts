// =============================================================================
// Financeiro — helpers compartilhados das rotas /api/finance/*
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

/** Resposta padrão de erro de validação Zod. */
export function zodErrorResponse(err: ZodError) {
  return NextResponse.json(
    { success: false, error: err.errors[0]?.message ?? 'Dados inválidos.', issues: err.errors },
    { status: 400 },
  )
}

/** true se o usuário pode tocar um registro do tenant informado (MASTER vê tudo). */
export function ownsTenant(role: string, userTenantId: string | null | undefined, entityTenantId: string | null): boolean {
  return role === 'MASTER' || entityTenantId === userTenantId
}

/** Decimal/Prisma → number seguro. */
export function num(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}
