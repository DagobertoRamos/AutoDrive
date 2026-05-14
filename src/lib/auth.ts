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
// NextAuth options
// ---------------------------------------------------------------------------
export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
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
    async jwt({ token, user }) {
      if (user) {
        token.id                = user.id
        token.role              = (user as { role: UserRole }).role
        token.status            = (user as { status: UserStatus }).status
        token.unitId            = (user as { unitId: string | null }).unitId
        token.tenantId          = (user as { tenantId: string | null }).tenantId
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false
      }
      return token
    },

    // ------------------------------------------------------------------
    // Session callback — expõe dados para o cliente e para rotas API
    // ------------------------------------------------------------------
    async session({ session, token }) {
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
