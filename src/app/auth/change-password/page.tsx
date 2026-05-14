'use client'

// =============================================================================
// /auth/change-password — Troca obrigatória de senha no primeiro acesso
//
// Critérios mínimos:
//   ✅ 1 letra maiúscula
//   ✅ 1 letra minúscula
//   ✅ 1 número
//   ✅ 2 caracteres especiais
//   ✅ Mínimo 8 caracteres
//   🚫 Não aceita nível "fraco" ou "muito fraco"
// =============================================================================

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Lock, CheckCircle2, XCircle, Eye, EyeOff,
  ShieldCheck, AlertTriangle, Loader2,
} from 'lucide-react'

// ── Medidor de força ──────────────────────────────────────────────────────────

interface PasswordStrength {
  score:  0 | 1 | 2 | 3 | 4
  label:  string
  color:  string
  width:  string
  rules: {
    uppercase: boolean
    lowercase: boolean
    digit:     boolean
    specials:  number
    length:    boolean
  }
  valid: boolean
}

function analyzePassword(pwd: string): PasswordStrength {
  const uppercase = /[A-Z]/.test(pwd)
  const lowercase = /[a-z]/.test(pwd)
  const digit     = /\d/.test(pwd)
  const specials  = (pwd.match(/[^A-Za-z0-9]/g) ?? []).length
  const length    = pwd.length >= 8

  const mandatoryOk = uppercase && lowercase && digit && specials >= 2 && length

  let score = 0
  if (length)           score++
  if (pwd.length >= 12) score++
  if (uppercase)        score++
  if (lowercase)        score++
  if (digit)            score++
  if (specials >= 1)    score++
  if (specials >= 2)    score++

  const normalized = Math.min(4, Math.floor(score / 2)) as 0 | 1 | 2 | 3 | 4

  const labels = ['Muito fraca', 'Fraca', 'Média', 'Forte', 'Muito forte']
  const colors = [
    'bg-red-500',    // 0 — Muito fraca
    'bg-orange-400', // 1 — Fraca
    'bg-yellow-400', // 2 — Média
    'bg-emerald-400',// 3 — Forte
    'bg-emerald-600',// 4 — Muito forte
  ]
  const widths = ['w-1/5', 'w-2/5', 'w-3/5', 'w-4/5', 'w-full']

  return {
    score:    normalized,
    label:    labels[normalized],
    color:    colors[normalized],
    width:    widths[normalized],
    rules:    { uppercase, lowercase, digit, specials, length },
    valid:    mandatoryOk,
  }
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ChangePasswordPage() {
  const { data: session, update } = useSession()
  const router = useRouter()

  const [newPassword,    setNewPassword]    = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew,        setShowNew]        = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [success,        setSuccess]        = useState(false)

  const strength = analyzePassword(newPassword)
  const match    = newPassword && confirmPassword && newPassword === confirmPassword
  const mismatch = confirmPassword && newPassword !== confirmPassword

  // Redireciona se não precisa trocar a senha
  useEffect(() => {
    const user = session?.user as { mustChangePassword?: boolean } | undefined
    if (session && !user?.mustChangePassword && !success) {
      router.replace('/')
    }
  }, [session, success, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!strength.valid) {
      setError('A senha não atende aos critérios mínimos de segurança.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação de senha não coincide.')
      return
    }
    if (strength.score < 2) {
      setError('A senha está fraca demais. Adicione letras maiúsculas, números e caracteres especiais.')
      return
    }

    setSaving(true)
    try {
      const res  = await fetch('/api/auth/change-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newPassword, confirmPassword }),
      })
      const data = await res.json()

      if (data.success) {
        setSuccess(true)
        // Atualiza a sessão para remover o flag mustChangePassword
        await update({ mustChangePassword: false })
        setTimeout(() => router.push('/'), 2500)
      } else {
        setError(data.error ?? 'Erro ao alterar senha.')
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-lg p-8 text-center flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-emerald-700">Senha alterada!</h2>
          <p className="text-sm text-gray-500">Redirecionando para o sistema...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl bg-white shadow-lg overflow-hidden">

          {/* Cabeçalho */}
          <div className="bg-brand-600 px-6 py-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Troca de senha obrigatória</h1>
                <p className="text-xs text-brand-100">Defina uma senha segura para continuar</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Aviso */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
              <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Por segurança, você precisa definir uma nova senha antes de usar o sistema.
                Não utilize o CPF ou dados pessoais simples.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">

              {/* Nova senha */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Nova senha</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Digite sua nova senha"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm pr-10 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Medidor de força */}
                {newPassword && (
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                      </div>
                      <span className={`ml-3 text-xs font-semibold ${
                        strength.score <= 1 ? 'text-red-600' :
                        strength.score === 2 ? 'text-yellow-600' :
                        'text-emerald-600'
                      }`}>
                        {strength.label}
                      </span>
                    </div>

                    {/* Regras */}
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { ok: strength.rules.length,    label: 'Mínimo 8 caracteres' },
                        { ok: strength.rules.uppercase,  label: '1 letra maiúscula' },
                        { ok: strength.rules.lowercase,  label: '1 letra minúscula' },
                        { ok: strength.rules.digit,      label: '1 número' },
                        { ok: strength.rules.specials >= 2, label: '2 caracteres especiais' },
                        { ok: newPassword.length >= 12,  label: 'Preferível: 12+ chars' },
                      ].map(rule => (
                        <div key={rule.label} className="flex items-center gap-1.5">
                          {rule.ok
                            ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                            : <XCircle      className="h-3 w-3 text-gray-300 shrink-0" />
                          }
                          <span className={`text-xs ${rule.ok ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {rule.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirmar senha */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Confirmar nova senha</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Repita a nova senha"
                    className={[
                      'w-full rounded-lg border px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-1',
                      match    ? 'border-emerald-400 bg-emerald-50 focus:ring-emerald-400' :
                      mismatch ? 'border-red-300 bg-red-50 focus:ring-red-400' :
                      'border-gray-300 focus:border-brand-500 focus:ring-brand-500',
                    ].join(' ')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {match    && <CheckCircle2 className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />}
                  {mismatch && <XCircle      className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />}
                </div>
                {mismatch && <p className="text-xs text-red-600">As senhas não coincidem.</p>}
                {match    && <p className="text-xs text-emerald-600">Senhas coincidem. ✓</p>}
              </div>

              {/* Erro */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={saving || !strength.valid || !match}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : <><Lock className="h-4 w-4" />Definir nova senha</>}
              </button>

              {/* Logout */}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-xs text-gray-400 hover:text-gray-600 text-center"
              >
                Sair e entrar com outra conta
              </button>

            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
