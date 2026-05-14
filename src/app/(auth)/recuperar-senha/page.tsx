'use client'

// =============================================================================
// Recuperar Senha — AutoDrive
// Passo 1: solicitar link via e-mail
// Passo 2: redefinir senha com token da URL
// O layout visual é fornecido pelo (auth)/layout.tsx
// =============================================================================

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, CheckCircle, Mail } from 'lucide-react'

// ── Schemas ───────────────────────────────────────────────────────────────────

const emailSchema = z.object({
  email: z.string().min(1, 'E-mail obrigatório').email('E-mail inválido'),
})

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Senha deve ter pelo menos 8 caracteres')
      .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
      .regex(/[0-9]/, 'Deve conter pelo menos um número'),
    confirmPassword: z.string().min(1, 'Confirme sua senha'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  })

type EmailForm = z.infer<typeof emailSchema>
type ResetForm = z.infer<typeof resetSchema>

// ── Passo 1 — Solicitar link ──────────────────────────────────────────────────

function EmailStep() {
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [sent,       setSent]       = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
  })

  const onSubmit = async (data: EmailForm) => {
    setSubmitting(true)
    setError(null)
    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: data.email }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erro ao enviar solicitação.'); return }
      setSent(true)
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="px-8 py-10 flex flex-col items-center gap-4 text-center">
        <Mail className="w-14 h-14 text-brand-600" />
        <div>
          <p className="font-bold text-gray-900 text-lg">Solicitação enviada!</p>
          <p className="mt-1.5 text-sm text-gray-500">
            Se o e-mail existir em nossa base, você receberá as instruções de recuperação em breve.
          </p>
        </div>
        <Link href="/login" className="text-sm font-medium text-brand-700 hover:text-brand-500 transition">
          Voltar ao login
        </Link>
      </div>
    )
  }

  return (
    <div className="px-8 py-8">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-gray-900">Recuperar senha</h2>
        <p className="mt-1 text-sm text-gray-500">
          Informe seu e-mail para receber o link de recuperação
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            {...register('email')}
            className={`input ${errors.email ? 'border-red-400 bg-red-50' : ''}`}
          />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
          ) : 'Enviar link de recuperação'}
        </button>
      </form>

      <div className="mt-5 border-t border-gray-100 pt-4 text-center">
        <Link href="/login" className="text-xs font-medium text-brand-800 hover:text-brand-600 transition">
          Voltar ao login
        </Link>
      </div>
    </div>
  )
}

// ── Passo 2 — Redefinir senha ─────────────────────────────────────────────────

function ResetStep({ token }: { token: string }) {
  const router = useRouter()

  const [showPwd,    setShowPwd]    = useState(false)
  const [showConf,   setShowConf]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  })

  const onSubmit = async (data: ResetForm) => {
    setSubmitting(true)
    setError(null)
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password: data.password }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erro ao redefinir senha.'); return }
      setSuccess(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="px-8 py-10 flex flex-col items-center gap-4 text-center">
        <CheckCircle className="w-14 h-14 text-emerald-500" />
        <div>
          <p className="font-bold text-gray-900 text-lg">Senha redefinida!</p>
          <p className="mt-1.5 text-sm text-gray-500">
            Você será redirecionado para o login em instantes...
          </p>
        </div>
        <Link href="/login" className="text-sm font-medium text-brand-700 hover:text-brand-500 transition">
          Ir para o login agora
        </Link>
      </div>
    )
  }

  return (
    <div className="px-8 py-8">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-gray-900">Nova senha</h2>
        <p className="mt-1 text-sm text-gray-500">Defina sua nova senha de acesso</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label className="label">Nova senha</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Mín. 8 caracteres, 1 maiúscula, 1 número"
              {...register('password')}
              className={`input pr-10 ${errors.password ? 'border-red-400 bg-red-50' : ''}`}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        </div>

        <div>
          <label className="label">Confirmar nova senha</label>
          <div className="relative">
            <input
              type={showConf ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              {...register('confirmPassword')}
              className={`input pr-10 ${errors.confirmPassword ? 'border-red-400 bg-red-50' : ''}`}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowConf(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Redefinindo...</>
          ) : 'Redefinir senha'}
        </button>
      </form>

      <div className="mt-5 border-t border-gray-100 pt-4 text-center">
        <Link href="/login" className="text-xs font-medium text-brand-800 hover:text-brand-600 transition">
          Voltar ao login
        </Link>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecuperarSenhaPage() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')

  return token ? <ResetStep token={token} /> : <EmailStep />
}
