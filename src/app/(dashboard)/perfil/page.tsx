'use client'

// =============================================================================
// Perfil — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { User, Lock, Bell, Camera, Save, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskPhone } from '@/lib/masks'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface PersonalData {
  name: string
  phone: string
  email: string
}

interface PasswordData {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

interface NotificationPrefs {
  emailAlerts: boolean
  whatsappAlerts: boolean
  newPending: boolean
  pendingUpdates: boolean
  commissionUpdates: boolean
  systemAlerts: boolean
}

type AlertType = 'success' | 'error'

interface AlertState {
  type: AlertType
  message: string
}

// -----------------------------------------------------------------------------
// Alert component
// -----------------------------------------------------------------------------

function Alert({ type, message, onClose }: AlertState & { onClose: () => void }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium',
        type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
      )}
    >
      {type === 'success' ? (
        <CheckCircle className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 text-current opacity-60 hover:opacity-100">&times;</button>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Toggle component
// -----------------------------------------------------------------------------

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
          checked ? 'bg-brand-600' : 'bg-gray-200'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </label>
  )
}

// -----------------------------------------------------------------------------
// Section card
// -----------------------------------------------------------------------------

function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
          <Icon className="h-5 w-5 text-brand-700" />
        </div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------------

export default function PerfilPage() {
  const { data: session } = useSession()

  // Personal data
  const [personal, setPersonal] = useState<PersonalData>({
    name: '',
    phone: '',
    email: '',
  })
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [personalAlert, setPersonalAlert] = useState<AlertState | null>(null)

  // Password
  const [password, setPassword] = useState<PasswordData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordAlert, setPasswordAlert] = useState<AlertState | null>(null)

  // Notifications
  const [notifs, setNotifs] = useState<NotificationPrefs>({
    emailAlerts: true,
    whatsappAlerts: true,
    newPending: true,
    pendingUpdates: true,
    commissionUpdates: false,
    systemAlerts: false,
  })
  const [savingNotifs, setSavingNotifs] = useState(false)
  const [notifsAlert, setNotifsAlert] = useState<AlertState | null>(null)

  // Load user data
  useEffect(() => {
    if (!session?.user) return
    setPersonal({
      name: session.user.name ?? '',
      phone: (session.user as { phone?: string })?.phone ?? '',
      email: session.user.email ?? '',
    })
  }, [session])

  // Fetch preferences
  const fetchPrefs = useCallback(async () => {
    if (!session?.user) return
    try {
      const userId = (session.user as { id?: string })?.id
      if (!userId) return
      const res = await fetch(`/api/users/${userId}`)
      const json = await res.json()
      if (json?.data?.notificationPrefs) {
        setNotifs((prev) => ({ ...prev, ...json.data.notificationPrefs }))
      }
    } catch {
      // silently fail
    }
  }, [session])

  useEffect(() => {
    fetchPrefs()
  }, [fetchPrefs])

  // Save personal
  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault()
    const userId = (session?.user as { id?: string })?.id
    if (!userId) return

    setSavingPersonal(true)
    setPersonalAlert(null)
    try {
      const res  = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: personal.name, phone: personal.phone }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error ?? 'Erro ao salvar.')
      setPersonalAlert({ type: 'success', message: 'Dados pessoais salvos com sucesso!' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar dados pessoais.'
      setPersonalAlert({ type: 'error', message })
    } finally {
      setSavingPersonal(false)
    }
  }

  // Save password
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordAlert(null)

    if (password.newPassword !== password.confirmPassword) {
      setPasswordAlert({ type: 'error', message: 'A nova senha e a confirmação não conferem.' })
      return
    }
    if (password.newPassword.length < 8) {
      setPasswordAlert({ type: 'error', message: 'A nova senha deve ter no mínimo 8 caracteres.' })
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword:  password.currentPassword,
          newPassword:      password.newPassword,
          confirmPassword:  password.confirmPassword,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error ?? json?.message ?? 'Erro ao alterar senha.')
      }
      setPasswordAlert({ type: 'success', message: 'Senha alterada com sucesso!' })
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao alterar senha.'
      setPasswordAlert({ type: 'error', message })
    } finally {
      setSavingPassword(false)
    }
  }

  // Save notifications
  const handleSaveNotifs = async (e: React.FormEvent) => {
    e.preventDefault()
    const userId = (session?.user as { id?: string })?.id
    if (!userId) return

    setSavingNotifs(true)
    setNotifsAlert(null)
    try {
      const res  = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationPrefs: notifs }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error ?? 'Erro ao salvar.')
      setNotifsAlert({ type: 'success', message: 'Preferências salvas com sucesso!' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar preferências.'
      setNotifsAlert({ type: 'error', message })
    } finally {
      setSavingNotifs(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
        <p className="mt-1 text-sm text-gray-500">Gerencie suas informações pessoais e preferências.</p>
      </div>

      {/* ── Dados Pessoais ── */}
      <SectionCard icon={User} title="Dados Pessoais">
        <form onSubmit={handleSavePersonal} className="space-y-4">
          {/* Avatar placeholder */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-700 text-2xl font-bold text-white">
                {personal.name?.charAt(0) ?? '?'}
              </div>
              <button
                type="button"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-200 hover:bg-gray-300 transition-colors"
                title="Trocar foto"
              >
                <Camera className="h-3.5 w-3.5 text-gray-600" />
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">{personal.name || 'Seu nome'}</p>
              <p className="text-xs text-gray-400">{(session?.user as { role?: string })?.role ?? 'Usuário'}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome completo</label>
              <input
                type="text"
                className={inputClass}
                value={personal.name}
                onChange={(e) => setPersonal((p) => ({ ...p, name: e.target.value }))}
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Telefone / WhatsApp</label>
              <input
                type="tel"
                inputMode="numeric"
                className={inputClass}
                value={maskPhone(personal.phone)}
                onChange={(e) => setPersonal((p) => ({ ...p, phone: maskPhone(e.target.value) }))}
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">E-mail</label>
            <input
              type="email"
              className={inputClass}
              value={personal.email}
              disabled
              title="O e-mail não pode ser alterado"
            />
            <p className="mt-1 text-xs text-gray-400">O e-mail não pode ser alterado por aqui.</p>
          </div>

          {personalAlert && (
            <Alert {...personalAlert} onClose={() => setPersonalAlert(null)} />
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPersonal}
              className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
            >
              <Save className="h-4 w-4" />
              {savingPersonal ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* ── Alterar Senha ── */}
      <SectionCard icon={Lock} title="Alterar Senha">
        <form onSubmit={handleSavePassword} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Senha atual</label>
            <div className="relative">
              <input
                type={showCurrentPwd ? 'text' : 'password'}
                className={cn(inputClass, 'pr-10')}
                value={password.currentPassword}
                onChange={(e) => setPassword((p) => ({ ...p, currentPassword: e.target.value }))}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Nova senha</label>
            <div className="relative">
              <input
                type={showNewPwd ? 'text' : 'password'}
                className={cn(inputClass, 'pr-10')}
                value={password.newPassword}
                onChange={(e) => setPassword((p) => ({ ...p, newPassword: e.target.value }))}
                placeholder="••••••••"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Confirmar nova senha</label>
            <div className="relative">
              <input
                type={showConfirmPwd ? 'text' : 'password'}
                className={cn(inputClass, 'pr-10')}
                value={password.confirmPassword}
                onChange={(e) => setPassword((p) => ({ ...p, confirmPassword: e.target.value }))}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {passwordAlert && (
            <Alert {...passwordAlert} onClose={() => setPasswordAlert(null)} />
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
            >
              <Lock className="h-4 w-4" />
              {savingPassword ? 'Alterando...' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* ── Preferências de Notificação ── */}
      <SectionCard icon={Bell} title="Preferências de Notificação">
        <form onSubmit={handleSaveNotifs} className="space-y-4">
          <div className="space-y-3 divide-y divide-gray-100">
            <Toggle
              label="Alertas por e-mail"
              checked={notifs.emailAlerts}
              onChange={(v) => setNotifs((p) => ({ ...p, emailAlerts: v }))}
            />
            <div className="pt-3">
              <Toggle
                label="Alertas por WhatsApp"
                checked={notifs.whatsappAlerts}
                onChange={(v) => setNotifs((p) => ({ ...p, whatsappAlerts: v }))}
              />
            </div>
            <div className="pt-3">
              <Toggle
                label="Novas pendências"
                checked={notifs.newPending}
                onChange={(v) => setNotifs((p) => ({ ...p, newPending: v }))}
              />
            </div>
            <div className="pt-3">
              <Toggle
                label="Atualizações de pendências"
                checked={notifs.pendingUpdates}
                onChange={(v) => setNotifs((p) => ({ ...p, pendingUpdates: v }))}
              />
            </div>
            <div className="pt-3">
              <Toggle
                label="Atualizações de comissões"
                checked={notifs.commissionUpdates}
                onChange={(v) => setNotifs((p) => ({ ...p, commissionUpdates: v }))}
              />
            </div>
            <div className="pt-3">
              <Toggle
                label="Alertas do sistema"
                checked={notifs.systemAlerts}
                onChange={(v) => setNotifs((p) => ({ ...p, systemAlerts: v }))}
              />
            </div>
          </div>

          {notifsAlert && (
            <Alert {...notifsAlert} onClose={() => setNotifsAlert(null)} />
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingNotifs}
              className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
            >
              <Save className="h-4 w-4" />
              {savingNotifs ? 'Salvando...' : 'Salvar preferências'}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  )
}
