'use client'

// =============================================================================
// Login Page — AutoDrive
// =============================================================================

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { clearSidebarMenuState } from '@/lib/sidebar-menu-state'

// ── Schema ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, 'E-mail obrigatório').email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

type LoginFormData = z.infer<typeof loginSchema>

// ── Mensagens de erro ───────────────────────────────────────────────────────

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: 'E-mail ou senha incorretos. Verifique e tente novamente.',
  INACTIVE: 'Usuário inativo. Entre em contato com o administrador.',
  PENDING:  'Cadastro aguardando aprovação. Entre em contato com o administrador.',
  BLOCKED:  'Usuário bloqueado. Entre em contato com o suporte.',
}

// ── Componente ──────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  useEffect(() => {
    clearSidebarMenuState()
  }, [])

  // Redireciona se já autenticado
  useEffect(() => {
    if (status === 'authenticated' && session) {
      router.replace('/dashboard')
    }
  }, [status, session, router])

  // Lê erro da URL (next-auth redirect com ?error=)
  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam) {
      setAuthError(
        AUTH_ERROR_MESSAGES[errorParam] ??
          'Credenciais inválidas. Verifique e tente novamente.',
      )
    }
  }, [searchParams])

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true)
    setAuthError(null)

    try {
      const result = await signIn('credentials', {
        email:    data.email,
        password: data.password,
        redirect: false,
      })

      if (result?.error) {
        setAuthError(
          AUTH_ERROR_MESSAGES[result.error] ??
            'Credenciais inválidas. Verifique e tente novamente.',
        )
      } else if (result?.ok) {
        clearSidebarMenuState()
        router.replace('/dashboard')
      }
    } catch {
      setAuthError('Erro inesperado. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'loading' || status === 'authenticated') return null

  return (
    <div className="px-8 py-8">
      {/* Título do card */}
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-gray-900">Entrar na plataforma</h2>
        <p className="mt-1 text-sm text-gray-500">
          Insira suas credenciais de acesso
        </p>
      </div>

      {/* Banner de erro */}
      {authError && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">!</span>
          </div>
          <p className="text-sm text-red-700 leading-snug">{authError}</p>
        </div>
      )}

      {/* Formulário */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* E-mail */}
        <div>
          <label htmlFor="email" className="label">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            {...register('email')}
            className={`input ${errors.email ? 'border-red-400 bg-red-50' : ''}`}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        {/* Senha */}
        <div>
          <label htmlFor="password" className="label">
            Senha
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              className={`input pr-10 ${errors.password ? 'border-red-400 bg-red-50' : ''}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {/* Esqueci a senha */}
        <div className="flex justify-end">
          <Link
            href="/recuperar-senha"
            className="text-xs font-medium text-brand-800 hover:text-brand-600 transition"
          >
            Esqueci minha senha
          </Link>
        </div>

        {/* Botão entrar */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Entrando...
            </>
          ) : (
            'Entrar'
          )}
        </button>
      </form>

      {/* Ações secundárias */}
      {/* "Ativar cadastro" desabilitado temporariamente (fluxo em revisão). */}
      <div className="mt-5 space-y-2 border-t border-gray-100 pt-5">
        <Link
          href="/cadastro"
          className="btn-secondary w-full text-center"
        >
          Solicitar acesso
        </Link>
      </div>
    </div>
  )
}
