'use client'

// =============================================================================
// Ativar Cadastro — AutoDrive
// O layout visual é fornecido pelo (auth)/layout.tsx
// =============================================================================

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, CheckCircle, KeyRound } from 'lucide-react'

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z
  .object({
    token: z.string().min(1, 'Token de ativação é obrigatório'),
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

type FormData = z.infer<typeof schema>

// ── Componente ────────────────────────────────────────────────────────────────

export default function AtivarCadastroPage() {
  const router         = useRouter()
  const searchParams   = useSearchParams()
  const tokenFromUrl   = searchParams.get('token') ?? ''

  const [showPwd,    setShowPwd]    = useState(false)
  const [showConf,   setShowConf]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver:      zodResolver(schema),
    defaultValues: { token: tokenFromUrl },
  })

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    setError(null)
    try {
      const res  = await fetch('/api/auth/activate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: data.token, password: data.password }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erro ao ativar conta.'); return }
      setSuccess(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Sucesso ───────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="px-8 py-10 flex flex-col items-center gap-4 text-center">
        <CheckCircle className="w-14 h-14 text-emerald-500" />
        <div>
          <p className="font-bold text-gray-900 text-lg">Conta ativada!</p>
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

  // ── Formulário ────────────────────────────────────────────────────────────

  return (
    <div className="px-8 py-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
          <KeyRound className="h-5 w-5 text-brand-700" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Ativar cadastro</h2>
        <p className="mt-1 text-sm text-gray-500">Defina sua senha para ativar o acesso</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Token — visível só se não vier da URL */}
        {!tokenFromUrl ? (
          <div>
            <label className="label">Token de ativação</label>
            <input
              type="text"
              placeholder="Cole o token recebido por e-mail"
              {...register('token')}
              className={`input ${errors.token ? 'border-red-400 bg-red-50' : ''}`}
            />
            {errors.token && <p className="mt-1 text-xs text-red-600">{errors.token.message}</p>}
          </div>
        ) : (
          <input type="hidden" {...register('token')} />
        )}

        {/* Senha */}
        <div>
          <label className="label">Senha</label>
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

        {/* Confirmar senha */}
        <div>
          <label className="label">Confirmar senha</label>
          <div className="relative">
            <input
              type={showConf ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repita a senha"
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
            <><Loader2 className="w-4 h-4 animate-spin" /> Ativando...</>
          ) : 'Ativar minha conta'}
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
