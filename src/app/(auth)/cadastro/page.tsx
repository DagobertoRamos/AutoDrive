'use client'

// =============================================================================
// Solicitar Acesso — AutoDrive
// Cria um usuário com status PENDENTE aguardando aprovação do admin.
// O layout visual é fornecido pelo (auth)/layout.tsx
// =============================================================================

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z
  .object({
    name: z
      .string()
      .min(3, 'Nome deve ter pelo menos 3 caracteres')
      .max(100, 'Nome muito longo'),
    email: z
      .string()
      .min(1, 'E-mail obrigatório')
      .email('E-mail inválido'),
    phone: z
      .string()
      .min(10, 'Telefone inválido — mínimo 10 dígitos')
      .max(15, 'Telefone muito longo')
      .regex(/^[\d\s()\-+]+$/, 'Telefone contém caracteres inválidos'),
    password: z
      .string()
      .min(8, 'Senha deve ter pelo menos 8 caracteres')
      .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
      .regex(/[0-9]/, 'Deve conter pelo menos um número'),
    confirmPassword: z.string().min(1, 'Confirme sua senha'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não conferem',
    path:    ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

// ── Componente ────────────────────────────────────────────────────────────────

export default function CadastroPage() {
  const [showPwd,    setShowPwd]    = useState(false)
  const [showConf,   setShowConf]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    setError(null)
    try {
      const res  = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:     data.name,
          email:    data.email,
          phone:    data.phone,
          password: data.password,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erro ao enviar cadastro.'); return }
      setSuccess(true)
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
          <p className="font-bold text-gray-900 text-lg">Cadastro enviado!</p>
          <p className="mt-1.5 text-sm text-gray-500">
            Aguarde a aprovação do administrador. Você receberá um link para ativar seu acesso quando
            for liberado.
          </p>
        </div>
        <Link href="/login" className="text-sm font-medium text-brand-700 hover:text-brand-500 transition">
          Voltar ao login
        </Link>
      </div>
    )
  }

  // ── Formulário ────────────────────────────────────────────────────────────

  return (
    <div className="px-8 py-8">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-gray-900">Solicitar acesso</h2>
        <p className="mt-1 text-sm text-gray-500">Preencha seus dados para solicitar cadastro</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Nome */}
        <div>
          <label htmlFor="name" className="label">Nome completo</label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="João da Silva"
            {...register('name')}
            className={`input ${errors.name ? 'border-red-400 bg-red-50' : ''}`}
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>

        {/* E-mail */}
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

        {/* Telefone */}
        <div>
          <label htmlFor="phone" className="label">Telefone / WhatsApp</label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            {...register('phone')}
            className={`input ${errors.phone ? 'border-red-400 bg-red-50' : ''}`}
          />
          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
        </div>

        {/* Senha */}
        <div>
          <label htmlFor="password" className="label">Senha</label>
          <div className="relative">
            <input
              id="password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Mín. 8 caracteres, 1 maiúscula, 1 número"
              {...register('password')}
              className={`input pr-10 ${errors.password ? 'border-red-400 bg-red-50' : ''}`}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)}
              aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        </div>

        {/* Confirmar senha */}
        <div>
          <label htmlFor="confirmPassword" className="label">Confirmar senha</label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConf ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repita a senha"
              {...register('confirmPassword')}
              className={`input pr-10 ${errors.confirmPassword ? 'border-red-400 bg-red-50' : ''}`}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowConf(v => !v)}
              aria-label={showConf ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
              {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
          ) : 'Solicitar cadastro'}
        </button>
      </form>

      <div className="mt-5 space-y-2 border-t border-gray-100 pt-5 text-center">
        <Link href="/login" className="text-xs font-medium text-brand-800 hover:text-brand-600 transition">
          Já tenho cadastro — Entrar
        </Link>
      </div>
    </div>
  )
}
