// =============================================================================
// Route Debugger — Wrapper temporário de diagnóstico para API Routes
// REMOVER em produção.
// Uso: envolver handlers problemáticos com withRouteDebug()
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type RouteContext = {
  params?: Record<string, string> | Promise<Record<string, string>>
}

type AnyRouteHandler = (
  req: NextRequest,
  ctx?: RouteContext,
) => Promise<NextResponse>

interface PrismaKnownError {
  code?: string
  meta?: Record<string, unknown>
  message: string
  clientVersion?: string
}

// ── Helpers visuais ───────────────────────────────────────────────────────────

const HR = '═'.repeat(72)
const HR2 = '─'.repeat(72)

const tag = (label: string) =>
  `\n  ┌─ ${label.toUpperCase()} ${'─'.repeat(Math.max(0, 40 - label.length))}`

function parsePrismaError(err: unknown): string {
  const e = err as PrismaKnownError

  if (!e?.code) return ''

  const codes: Record<string, string> = {
    P2000: 'Valor muito longo para o campo',
    P2002: 'Violação de unique constraint',
    P2003: 'FK inexistente — ID de relação inválido',
    P2004: 'Constraint violada',
    P2005: 'Tipo de valor inválido para o campo',
    P2006: 'Valor inválido para tipo do campo, por exemplo string/NaN em Int/Decimal',
    P2011: 'Campo NOT NULL não pode receber null',
    P2012: 'Campo obrigatório ausente no payload para o Prisma',
    P2025: 'Registro não encontrado, comum em update/delete por ID inexistente',
  }

  return [
    `  [Prisma ${e.code}] ${codes[e.code] ?? 'Erro Prisma desconhecido'}`,
    `  meta: ${JSON.stringify(e.meta ?? {}, null, 2)}`,
    `  clientVersion: ${e.clientVersion ?? 'não informado'}`,
  ].join('\n')
}

// ── Wrapper principal ─────────────────────────────────────────────────────────

export function withRouteDebug(routeName: string, handler: AnyRouteHandler): AnyRouteHandler {
  return async (req: NextRequest, ctx?: RouteContext) => {
    console.log(`\n${HR}`)
    console.log(`🔍  ROUTE DEBUG  ·  ${routeName}  ·  ${req.method}  ·  ${new Date().toISOString()}`)
    console.log(HR)

    // ── 1. Sessão ────────────────────────────────────────────────────────────
    console.log(tag('1 · sessão recebida'))

    try {
      const session = await getServerSession(authOptions)

      if (!session) {
        console.log('  └─ ❌  SEM SESSÃO — getServerSession retornou null')
        console.log('         Causa provável: cookie de sessão ausente, expirado ou rota fora do contexto correto.')
      } else {
        const u = session.user as Record<string, unknown>

        const fields = {
          id: u?.id,
          email: u?.email,
          role: u?.role,
          tenantId: u?.tenantId,
          name: u?.name,
        }

        for (const [k, v] of Object.entries(fields)) {
          const ok = v !== undefined && v !== null && v !== ''
          console.log(`  │  ${k.padEnd(10)} : ${ok ? '✅' : '⚠️ '} ${JSON.stringify(v)}`)
        }

        if (u?.tenantId === undefined) {
          console.log('  └─ ⚠️  tenantId está UNDEFINED — provável falta no callback jwt/session do NextAuth.')
        } else if (u?.tenantId === null) {
          console.log('  └─ ℹ️  tenantId é NULL — aceitável apenas para usuário MASTER/SUPER ADMIN.')
        }
      }
    } catch (sessionErr) {
      console.error('  └─ ❌  ERRO ao chamar getServerSession:', sessionErr)
    }

    // ── 2. Payload bruto ─────────────────────────────────────────────────────
    console.log(tag('2 · payload bruto frontend → api'))

    const reqClone = req.clone()

    try {
      const rawBody = await reqClone.json()

      console.log(
        JSON.stringify(rawBody, null, 2)
          .split('\n')
          .map((l) => `  │  ${l}`)
          .join('\n'),
      )
    } catch {
      console.log(`  └─ ℹ️  Body vazio ou não-JSON. Método: ${req.method}`)
    }

    // ── 3. Executar handler e capturar erros ─────────────────────────────────
    console.log(tag('3 · execução do handler'))

    try {
      const response = await handler(req, ctx)

      const resClone = response.clone()
      const resJson = await resClone.json().catch(() => null)
      const statusIcon = response.status < 400 ? '✅' : response.status < 500 ? '⚠️ ' : '❌'

      console.log(`  └─ ${statusIcon} STATUS ${response.status}`)

      if (resJson) {
        console.log('     body:', JSON.stringify(resJson))
      }

      console.log(HR2)

      return response
    } catch (err: unknown) {
      console.error('\n  ❌  EXCEÇÃO NÃO TRATADA NO HANDLER:')
      console.error(HR2)

      if (err instanceof Error) {
        console.error('  name    :', err.name)
        console.error('  message :', err.message)

        const prismaInfo = parsePrismaError(err)

        if (prismaInfo) {
          console.error('\n  🔴 DETALHES PRISMA:')
          console.error(prismaInfo)
        }

        console.error('\n  stack trace:')

        ;(err.stack ?? '')
          .split('\n')
          .forEach((l) => console.error(' ', l))
      } else {
        console.error('  Valor não-Error lançado:', err)
      }

      console.log(HR)

      return NextResponse.json(
        {
          success: false,
          error: 'Erro interno',
          _debug: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      )
    }
  }
}

// ── Helper de diff de whitelist ───────────────────────────────────────────────

/**
 * Chame logo após extrair os campos do body no handler.
 *
 * Exemplo:
 * const body = await req.json()
 * const { fullName, whatsapp, unitId, cargo, active } = body
 * logPayloadDiff(body, { fullName, whatsapp, unitId, cargo, active })
 */
export function logPayloadDiff(
  raw: Record<string, unknown>,
  whitelisted: Record<string, unknown>,
): void {
  const rawKeys = Object.keys(raw)
  const safeKeys = Object.keys(whitelisted)
  const dropped = rawKeys.filter((k) => !safeKeys.includes(k))
  const undefinedKeys = safeKeys.filter((k) => whitelisted[k] === undefined)
  const nullKeys = safeKeys.filter((k) => whitelisted[k] === null)

  console.log(tag('2b · diff whitelist'))
  console.log(`  │  campos recebidos  (${rawKeys.length}): ${rawKeys.join(', ') || '(nenhum)'}`)
  console.log(`  │  campos permitidos (${safeKeys.length}): ${safeKeys.join(', ') || '(nenhum)'}`)

  if (dropped.length) {
    console.log(`  │  🟡 DESCARTADOS : ${dropped.join(', ')}`)
  }

  if (undefinedKeys.length) {
    console.log(
      `  │  ⚠️  UNDEFINED  : ${undefinedKeys.join(', ')} ← Prisma ignorará estes campos e pode quebrar required fields`,
    )
  }

  if (nullKeys.length) {
    console.log(`  │  ℹ️  NULL       : ${nullKeys.join(', ')} ← será gravado como NULL no banco`)
  }

  console.log('  └─ payload final para Prisma:')

  console.log(
    JSON.stringify(whitelisted, null, 2)
      .split('\n')
      .map((l) => `     ${l}`)
      .join('\n'),
  )
}
