'use client'

// =============================================================================
// /master/maintenance — Modo de manutenção (MASTER only)
//
// • Exibe o estado atual (global e histórico)
// • Permite ativar / desativar manutenção global com mensagem, datas e papéis permitidos
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession }                        from 'next-auth/react'
import { useRouter }                         from 'next/navigation'
import {
  Construction, AlertTriangle, CheckCircle2, Loader2,
  AlertCircle, Power, PowerOff, Clock, Info,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MaintenanceMode {
  id:           string
  active:       boolean
  message:      string | null
  startAt:      string | null
  endAt:        string | null
  scope:        string
  scopeId:      string | null
  allowedRoles: string[]
  activatedBy:  string
  createdAt:    string
}

interface MaintenanceData {
  global:  MaintenanceMode | null
  history: MaintenanceMode[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

const ROLE_OPTIONS = [
  { value: 'MASTER', label: 'Master' },
  { value: 'ADMIN',  label: 'Admin' },
  { value: 'GESTOR', label: 'Gestor' },
]

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [data,    setData]    = useState<MaintenanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  // Form para nova entrada
  const [form, setForm] = useState({
    active:       false,
    message:      '',
    startAt:      '',
    endAt:        '',
    allowedRoles: ['MASTER'] as string[],
  })

  // Auth guard
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  const load = useCallback(async () => {
    if (session?.user?.role !== 'MASTER') return
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/master/maintenance')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json.data)
      // Inicializa o form com estado atual
      const g = json.data?.global as MaintenanceMode | null
      if (g) {
        setForm({
          active:       g.active,
          message:      g.message ?? '',
          startAt:      g.startAt  ? g.startAt.slice(0, 16)  : '',
          endAt:        g.endAt    ? g.endAt.slice(0, 16)    : '',
          allowedRoles: g.allowedRoles,
        })
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const res  = await fetch('/api/master/maintenance', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          active:       form.active,
          message:      form.message.trim()  || null,
          startAt:      form.startAt         || null,
          endAt:        form.endAt           || null,
          scope:        'GLOBAL',
          allowedRoles: form.allowedRoles,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao salvar.')
      setSuccess(json.message ?? 'Configuração salva.')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  function toggleRole(role: string) {
    setForm(p => ({
      ...p,
      allowedRoles: p.allowedRoles.includes(role)
        ? p.allowedRoles.filter(r => r !== role)
        : [...p.allowedRoles, role],
    }))
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  const isActive = data?.global?.active === true

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isActive ? 'bg-amber-500' : 'bg-gray-400'}`}>
          <Construction size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Modo de Manutenção</h1>
          <p className="text-xs text-gray-400">Controle o acesso à plataforma durante janelas de manutenção</p>
        </div>
      </div>

      {/* Status atual */}
      <div className={`rounded-xl border px-5 py-4 ${
        isActive
          ? 'border-amber-200 bg-amber-50'
          : 'border-emerald-200 bg-emerald-50'
      }`}>
        <div className="flex items-center gap-3">
          {isActive
            ? <AlertTriangle size={20} className="text-amber-600 shrink-0" />
            : <CheckCircle2  size={20} className="text-emerald-600 shrink-0" />
          }
          <div>
            <p className={`font-semibold text-sm ${isActive ? 'text-amber-800' : 'text-emerald-800'}`}>
              {isActive ? 'Manutenção ATIVA' : 'Sistema operacional'}
            </p>
            {isActive && data?.global?.message && (
              <p className="text-xs text-amber-700 mt-0.5">{data.global.message}</p>
            )}
            {isActive && (
              <p className="text-xs text-amber-600 mt-0.5">
                Papéis com acesso: {data?.global?.allowedRoles.join(', ')}
              </p>
            )}
          </div>
          {isActive && data?.global && (
            <div className="ml-auto text-right text-xs text-amber-600 space-y-0.5">
              {data.global.startAt && <p>Início: {formatDate(data.global.startAt)}</p>}
              {data.global.endAt   && <p>Fim: {formatDate(data.global.endAt)}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Mensagens de feedback */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="shrink-0" />
          {success}
        </div>
      )}

      {/* Form de configuração */}
      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
        <h2 className="font-semibold text-gray-800 text-sm">Configurar nova entrada de manutenção</h2>

        {/* Ativar / desativar */}
        <div className="flex items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">Estado da manutenção</p>
            <p className="text-xs text-gray-500">Ativar bloqueará o acesso para papéis não permitidos</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, active: false }))}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                !form.active
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Power size={12} /> Desativar
            </button>
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, active: true }))}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                form.active
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <PowerOff size={12} /> Ativar
            </button>
          </div>
        </div>

        {/* Mensagem */}
        <div>
          <label className={labelCls}>Mensagem para os usuários</label>
          <textarea
            rows={3}
            className={inputCls}
            placeholder="Ex: Sistema em manutenção para atualização. Retornaremos às 08:00."
            value={form.message}
            onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
          />
        </div>

        {/* Janela de tempo */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              <span className="flex items-center gap-1"><Clock size={11} /> Início</span>
            </label>
            <input
              type="datetime-local"
              className={inputCls}
              value={form.startAt}
              onChange={e => setForm(p => ({ ...p, startAt: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>
              <span className="flex items-center gap-1"><Clock size={11} /> Término previsto</span>
            </label>
            <input
              type="datetime-local"
              className={inputCls}
              value={form.endAt}
              onChange={e => setForm(p => ({ ...p, endAt: e.target.value }))}
            />
          </div>
        </div>

        {/* Papéis com acesso */}
        <div>
          <label className={labelCls}>Papéis com acesso durante manutenção</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {ROLE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleRole(value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  form.allowedRoles.includes(value)
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
            <Info size={11} />
            MASTER sempre tem acesso, independentemente da seleção.
          </p>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <button
            type="submit"
            disabled={saving}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
              form.active
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {saving
              ? <Loader2 size={14} className="animate-spin" />
              : form.active ? <PowerOff size={14} /> : <Power size={14} />
            }
            {saving ? 'Salvando...' : form.active ? 'Ativar manutenção' : 'Desativar manutenção'}
          </button>
        </div>
      </form>

      {/* Histórico */}
      {data?.history && data.history.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Histórico (últimas 10 entradas)
          </h2>
          <div className="space-y-2">
            {data.history.map(m => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 text-xs"
              >
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${
                  m.active
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  {m.active ? 'Ativada' : 'Desativada'}
                </span>
                <span className="text-gray-500">{m.scope}</span>
                {m.message && <span className="flex-1 truncate text-gray-400 italic">&quot;{m.message}&quot;</span>}
                <span className="ml-auto text-gray-400 flex-shrink-0">
                  {new Date(m.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
