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
  P2021: { message: 'Este recurso ainda não foi ativado no banco de dados (tabela ausente). É preciso aplicar a migração pendente na base — fale com o administrador.', status: 503 },
  P2025: { message: 'Registro não encontrado.', status: 404 },
}

// ── Interface de resposta de erro ─────────────────────────────────────────────

export interface ApiError {
  success: false
  error:   string
  code?:   string  // Apenas em desenvolvimento
  field?:  string  // Nome da coluna/relação que falhou (P2002/P2003)
  hint?:   string  // Sugestão amigável de próxima ação
}

// ── Mensagens específicas P2003 por campo conhecido ──────────────────────────
// Quando o Prisma reporta P2003 ele inclui `meta.field_name` (ou modelName).
// Mapeamos os campos mais comuns para mensagens com contexto + ação sugerida.
const P2003_FIELD_HINTS: Array<{ match: RegExp; hint: string }> = [
  { match: /tenantId/i,   hint: 'O tenant referenciado não existe. Faça logout/login novamente — sua sessão pode estar apontando para um tenant removido.' },
  { match: /unitId/i,     hint: 'A unidade referenciada não existe. Crie a unidade matriz antes de vincular registros a ela.' },
  { match: /userId|ownerId|createdById|enabledBy/i, hint: 'O usuário referenciado não existe. Se você é MASTER, faça logout/login. Se for criação de tenant, o sistema deve permitir userId nulo no AuditLog.' },
  { match: /sellerId/i,   hint: 'O vendedor referenciado não existe.' },
  { match: /personId/i,   hint: 'A pessoa (cliente) referenciada não existe.' },
  { match: /vehicleId/i,  hint: 'O veículo referenciado não existe.' },
  { match: /dealId/i,     hint: 'A negociação referenciada não existe.' },
  { match: /planId/i,     hint: 'O plano referenciado não existe.' },
]

function buildP2003Hint(fieldName: string | null): string {
  if (!fieldName) return 'Verifique se todos os registros relacionados (tenant, unidade, usuário, etc) existem no banco.'
  const found = P2003_FIELD_HINTS.find(({ match }) => match.test(fieldName))
  if (found) return found.hint
  return `Campo "${fieldName}" referencia um registro inexistente.`
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

    // P2002 e P2003 expõem `meta.field_name` (string ou array).
    const metaField = err.meta && (err.meta as Record<string, unknown>).field_name
    const fieldStr  = Array.isArray(metaField) ? (metaField as string[]).join(', ') : (typeof metaField === 'string' ? metaField : null)

    // P2003 — Referência inválida: detalha o campo problemático.
    if (err.code === 'P2003') {
      return {
        body: {
          success: false,
          error:   'Não foi possível salvar porque uma referência interna está inválida. Atualize a página, faça login novamente e tente de novo. Se persistir, verifique plano/unidade/usuário relacionado.',
          hint:    buildP2003Hint(fieldStr),
          field:   fieldStr ?? undefined,
          ...(isDev ? { code: err.code } : {}),
        },
        status: 400,
      }
    }

    return {
      body: {
        success: false,
        error:   mapped?.message ?? `Erro de banco de dados. [${err.code}]`,
        field:   fieldStr ?? undefined,
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
      'Este veículo já está em negociação',
      'Este veículo não está mais disponível',
      'Este veículo avaliado não está disponível para troca',
      'Este veículo avaliado já está vinculado',
      'Avaliação informada não foi encontrada',
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
