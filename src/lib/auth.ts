// =============================================================================
// NextAuth configuration — AutoDrive
// Arquivo corrigido e reforçado para evitar tenantId undefined nas rotas
// =============================================================================

import { type NextAuthOptions, getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { type UserRole, type UserStatus } from '@/types'

// ---------------------------------------------------------------------------
// Helper: register audit log entry
// ---------------------------------------------------------------------------
async function createAuditLog({
  userId,
  action,
  entity,
  entityId,
  ipAddress,
  userAgent,
}: {
  userId: string
  action: string
  entity: string
  entityId?: string
  ipAddress?: string
  userAgent?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId:  entityId  ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    })
  } catch {
    // Audit failures must never block authentication
    console.error('[auth] Failed to write audit log')
  }
}

// ---------------------------------------------------------------------------
// Helper: leitura segura de headers do NextAuth CredentialsProvider
// ---------------------------------------------------------------------------
function getHeaderValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const value = headers?.[key]

  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

// ---------------------------------------------------------------------------
// Duração de sessão / janela deslizante
// ---------------------------------------------------------------------------
// PROBLEMA que isto resolve: antes o maxAge era fixo em 8h SEM `updateAge`, e o
// padrão de `updateAge` do NextAuth (24h) é maior que o maxAge — então o token
// NUNCA era renovado durante a sessão e ela morria "no relógio" às 8h, mesmo
// com o usuário ativo. Isso derrubava o Painel de Atendimento (que faz poll o
// tempo todo) e parava a fila.
//
// SOLUÇÃO (sem reduzir segurança): sessão DESLIZANTE. `updateAge` baixo faz o
// token ser reemitido a cada atividade, e a expiração real passa a ser por
// INATIVIDADE, controlada pela política de segurança (master/security →
// "Duração da sessão" / "Tempo de inatividade") — que antes era salva mas não
// tinha efeito nenhum. Sessão ativa (painel/PWA fazendo poll) nunca expira;
// sessão ociosa expira após a janela configurada.
const DEFAULT_SESSION_SECS = 8 * 60 * 60 // 8h — igual ao default da SecurityPolicy
// Teto absoluto do cookie/token (a janela desliza dentro dele). Configurável
// por env para cenários de quiosque; padrão 30 dias.
const SESSION_ABSOLUTE_MAX_SECS = Math.max(
  DEFAULT_SESSION_SECS,
  Number(process.env.SESSION_MAX_AGE_SECS) || 30 * 24 * 60 * 60,
)
// Intervalo de renovação do token (< janela mínima de 15min permitida na UI),
// garantindo que uma sessão ativa sempre renove antes de "envelhecer".
const SESSION_UPDATE_AGE_SECS = 5 * 60

// Cache leve da política de segurança — evita 1 query por leitura de sessão.
let _policyCache: { at: number; idleWindowSecs: number } | null = null
async function getSessionIdleWindowSecs(): Promise<number> {
  const now = Date.now()
  if (_policyCache && now - _policyCache.at < 60_000) return _policyCache.idleWindowSecs
  try {
    const p = await prisma.securityPolicy.findFirst({
      where: { scope: 'GLOBAL' },
      select: { sessionMaxAgeSecs: true, inactivityTimeoutSecs: true },
    })
    const base = p?.sessionMaxAgeSecs && p.sessionMaxAgeSecs > 0 ? p.sessionMaxAgeSecs : DEFAULT_SESSION_SECS
    // inactivityTimeoutSecs (0 = desligado) pode apertar ainda mais a janela.
    const inact = p?.inactivityTimeoutSecs && p.inactivityTimeoutSecs > 0 ? p.inactivityTimeoutSecs : base
    const idle = Math.min(base, inact)
    _policyCache = { at: now, idleWindowSecs: idle }
    return idle
  } catch {
    // fail-open: uma falha de leitura NUNCA pode deslogar todos os usuários.
    return _policyCache?.idleWindowSecs ?? DEFAULT_SESSION_SECS
  }
}

// ---------------------------------------------------------------------------
// NextAuth options
// ---------------------------------------------------------------------------
export const authOptions: NextAuthOptions = {
  session: {
    strategy:  'jwt',
    maxAge:    SESSION_ABSOLUTE_MAX_SECS,
    updateAge: SESSION_UPDATE_AGE_SECS,
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },

      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Informe e-mail e senha.')
        }

        const normalizedEmail = credentials.email.toLowerCase().trim()

        // 1. Busca o usuário pelo e-mail
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: {
            id:                true,
            name:              true,
            email:             true,
            passwordHash:      true,
            role:              true,
            status:            true,
            unitId:            true,
            tenantId:          true,
            image:             true,
            mustChangePassword: true,
          },
        })

        if (!user) {
          throw new Error('Credenciais inválidas.')
        }

        // 2. Verifica status antes de checar senha
        if (user.status !== 'ATIVO') {
          const messages: Record<string, string> = {
            INATIVO: 'Sua conta está inativa. Entre em contato com o administrador.',
            PENDENTE: 'Sua conta está aguardando aprovação.',
            BLOQUEADO: 'Sua conta foi bloqueada. Entre em contato com o administrador.',
          }

          throw new Error(messages[user.status] ?? 'Acesso negado.')
        }

        // 3. Confere a senha
        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash ?? '',
        )

        if (!passwordValid) {
          throw new Error('Credenciais inválidas.')
        }

        // 4. Segurança multi-tenant:
        // Usuários comuns precisam obrigatoriamente estar vinculados a um tenant.
        // MASTER pode operar sem tenantId.
        if (String(user.role) !== 'MASTER' && !user.tenantId) {
          console.error(
            `[auth] Usuário sem tenantId. userId=${user.id}, email=${user.email}, role=${user.role}`,
          )

          throw new Error(
            'Usuário sem empresa/loja vinculada. Entre em contato com o administrador.',
          )
        }

        // 5. Atualiza lastLoginAt de forma assíncrona
        const headers = req?.headers as
          | Record<string, string | string[] | undefined>
          | undefined

        const forwardedFor = getHeaderValue(headers, 'x-forwarded-for')
        const realIp       = getHeaderValue(headers, 'x-real-ip')
        const userAgent    = getHeaderValue(headers, 'user-agent')

        const ipAddress = forwardedFor?.split(',')[0]?.trim() ?? realIp

        void prisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(() => {
            console.error('[auth] Failed to update lastLoginAt')
          })

        // 6. Registra audit log sem bloquear o login
        void createAuditLog({
          userId: user.id,
          action: 'LOGIN',
          entity: 'User',
          entityId: user.id,
          ipAddress,
          userAgent,
        })

        // 7. Retorna os dados que irão para o JWT callback
        return {
          id:                user.id,
          name:              user.name,
          email:             user.email,
          role:              user.role as UserRole,
          status:            user.status as UserStatus,
          unitId:            user.unitId,
          tenantId:          user.tenantId,
          image:             user.image,
          mustChangePassword: user.mustChangePassword,
        }
      },
    }),
  ],

  callbacks: {
    // ------------------------------------------------------------------
    // JWT callback — popula o token com dados extras
    // ------------------------------------------------------------------
    async jwt({ token, user, trigger, session }) {
      const nowSecs = Math.floor(Date.now() / 1000)
      if (user) {
        token.id                = user.id
        token.role              = (user as { role: UserRole }).role
        token.status            = (user as { status: UserStatus }).status
        token.unitId            = (user as { unitId: string | null }).unitId
        token.tenantId          = (user as { tenantId: string | null }).tenantId
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false
        token.lastSeen          = nowSecs
        token.expired           = false
      }
      // Atualização vinda do client via useSession().update(...) — ex.: após
      // trocar a senha no 1º acesso, limpamos o flag para não voltar à tela.
      if (trigger === 'update' && session && typeof session === 'object') {
        const s = session as { mustChangePassword?: boolean }
        if ('mustChangePassword' in s) token.mustChangePassword = s.mustChangePassword ?? false
      }

      // Janela deslizante de sessão: renova enquanto houver atividade; expira só
      // após 'idleWindow' de INATIVIDADE. O painel de atendimento faz poll o
      // tempo todo → nunca fica ocioso → nunca expira. Fail-open.
      if (typeof token.lastSeen === 'number') {
        const idleWindow = await getSessionIdleWindowSecs()
        if (nowSecs - token.lastSeen > idleWindow) {
          token.expired = true
        } else {
          token.lastSeen = nowSecs
          token.expired  = false
        }
      } else {
        token.lastSeen = nowSecs
      }
      return token
    },

    // ------------------------------------------------------------------
    // Session callback — expõe dados para o cliente e para rotas API
    // ------------------------------------------------------------------
    async session({ session, token }) {
      // Sessão expirada por inatividade (política de segurança): devolve sem
      // usuário para os guards tratarem como não-autenticado e mandarem re-login.
      if (token.expired) {
        return { ...session, user: undefined as unknown as typeof session.user, expires: new Date(0).toISOString() }
      }
      if (!session.user) {
        return session
      }

      session.user.id                = (token.id ?? token.sub) as string
      session.user.role              = token.role as UserRole
      session.user.status            = token.status as UserStatus
      session.user.unitId            = token.unitId as string | null
      session.user.tenantId          = token.tenantId as string | null
      session.user.mustChangePassword = token.mustChangePassword as boolean | undefined

      return session
    },
  },
}

// ---------------------------------------------------------------------------
// Helper: obtém a sessão no lado do servidor (App Router / Route Handlers)
// ---------------------------------------------------------------------------
export async function getServerAuthSession() {
  return getServerSession(authOptions)
}
