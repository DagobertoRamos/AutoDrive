// =============================================================================
// prisma-errors.ts — Mapeamento centralizado de erros Prisma
// Traduz códigos técnicos em mensagens amigáveis sem vazar stack trace.
// =============================================================================

import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

// ── Mapa de código → mensagem amigável ────────────────────────────────────────

const PRISMA_CODE_MAP: Record<string, { message: string; status: number }> = {
  P2002: { message: 'Registro duplicado. Verifique os campos únicos (ex: CPF, CNPJ, slug).', status: 409 },
  P2003: { message: 'Referência inválida. O registro relacionado não existe (ex: unidade ou tenant incorreto).', status: 400 },
  P2004: { message: 'Operação violou uma restrição do banco de dados.', status: 400 },
  P2005: { message: 'Valor inválido para o tipo do campo.', status: 400 },
  P2006: { message: 'Tipo de dado incorreto. Verifique campos numéricos e datas.', status: 400 },
  P2011: { message: 'Campo obrigatório está nulo. Verifique todos os campos obrigatórios.', status: 400 },
  P2012: { message: 'Campo obrigatório ausente no payload enviado.', status: 400 },
  P2025: { message: 'Registro não encontrado.', status: 404 },
}

// ── Interface de resposta de erro ─────────────────────────────────────────────

export interface ApiError {
  success: false
  error:   string
  code?:   string  // Apenas em desenvolvimento
}

// ── mapPrismaError ────────────────────────────────────────────────────────────

/**
 * Traduz um erro qualquer em um objeto ApiError seguro.
 * Nunca expõe stack trace ou detalhes internos em produção.
 */
export function mapPrismaError(err: unknown): { body: ApiError; status: number } {
  const isDev = process.env.NODE_ENV !== 'production'

  // Erros Prisma com código conhecido
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_CODE_MAP[err.code]
    if (isDev) console.error('[prisma-error]', err.code, err.meta, err.message)
    return {
      body: {
        success: false,
        error:   mapped?.message ?? `Erro de banco de dados. [${err.code}]`,
        ...(isDev ? { code: err.code } : {}),
      },
      status: mapped?.status ?? 500,
    }
  }

  // Erros de validação do Prisma Client
  if (err instanceof Prisma.PrismaClientValidationError) {
    if (isDev) console.error('[prisma-validation]', err.message)
    return {
      body: { success: false, error: 'Dados inválidos. Verifique os campos enviados.' },
      status: 400,
    }
  }

  // Erros de validação customizados lançados pelas guards
  if (err instanceof Error) {
    const knownPrefixes = [
      'Usuário sem empresa vinculada',
      'Unidade inválida',
      'Campo obrigatório',
      "Campo '",          // errors from requireCurrency
    ]
    const isKnown = knownPrefixes.some(p => err.message.startsWith(p))
    if (isKnown) {
      return {
        body: { success: false, error: err.message },
        status: err.message.startsWith('Usuário sem empresa') ? 403 : 400,
      }
    }
  }

  // Erro desconhecido — não vaza detalhes em produção
  if (isDev && err instanceof Error) {
    console.error('[unhandled-error]', err.stack)
  }

  return {
    body: { success: false, error: 'Erro interno do servidor.' },
    status: 500,
  }
}

// ── handlePrismaError ─────────────────────────────────────────────────────────

/**
 * Atalho: mapeia o erro e retorna NextResponse pronto.
 * Use no catch das rotas.
 */
export function handlePrismaError(err: unknown): NextResponse<ApiError> {
  const { body, status } = mapPrismaError(err)
  return NextResponse.json(body, { status })
}
