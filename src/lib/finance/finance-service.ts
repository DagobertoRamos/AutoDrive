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

/**
 * Cláusula OR de busca textual para FinancialEntry. Cobre descrição (que inclui
 * placa/negociação/nome do veículo), contraparte (fornecedor/cliente) e nº do
 * documento; se o termo for numérico, também casa o valor. null se vazio.
 */
export function entryTextSearch(q: string | null | undefined): Record<string, unknown>[] | null {
  const term = q?.trim()
  if (!term) return null
  const or: Record<string, unknown>[] = [
    { description: { contains: term, mode: 'insensitive' } },
    { counterparty: { contains: term, mode: 'insensitive' } },
    { documentNumber: { contains: term, mode: 'insensitive' } },
  ]
  const n = Number(term.replace(/\./g, '').replace(',', '.'))
  if (/\d/.test(term) && !Number.isNaN(n)) or.push({ amount: n })
  return or
}
