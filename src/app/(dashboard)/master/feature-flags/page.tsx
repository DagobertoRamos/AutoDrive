'use client'

// =============================================================================
// /master/feature-flags — Gerenciamento de Feature Flags (MASTER only)
//
// • Lista todas as flags globais
// • Toggle enable/disable inline
// • Editar rolloutPct e notas inline
// • Criar nova flag via modal
// • Excluir flag
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession }                        from 'next-auth/react'
import { useRouter }                         from 'next/navigation'
import {
  Flag, Plus, Trash2, Loader2, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, X, Save, ToggleLeft, ToggleRight,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TenantFlagOverride {
  tenantId: string
  enabled:  boolean
}

interface FeatureFlag {
  id:          string
  key:         string
  name:        string
  description: string | null
  enabled:     boolean
  rolloutPct:  number
  notes:       string | null
  createdAt:   string
  tenantFlags: TenantFlagOverride[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

// ── Modal: criar nova flag ─────────────────────────────────────────────────────

interface CreateModalProps {
  onClose:  () => void
  onSaved:  () => void
}

function CreateModal({ onClose, onSaved }: CreateModalProps) {
  const [form, setForm] = useState({
    key: '', name: '', description: '', enabled: true,
    rolloutPct: 100, notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.key.trim() || !form.name.trim()) {
      setError('Chave e nome são obrigatórios.')
      return
    }
    setSaving(true)
    try {
      const res  = await fetch('/api/master/feature-flags', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          key:         form.key.trim(),
          name:        form.name.trim(),
          description: form.description.trim() || null,
          enabled:     form.enabled,
          rolloutPct:  Math.min(100, Math.max(0, Number(form.rolloutPct) || 0)),
          notes:       form.notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar flag.')
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar flag.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Nova feature flag</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={13} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Chave (key) *</label>
              <input
                className={`${inputCls} font-mono`}
                placeholder="nome_da_flag"
                value={form.key}
                onChange={set('key')}
              />
              <p className="mt-1 text-xs text-gray-400">Somente letras, números e _</p>
            </div>
            <div>
              <label className={labelCls}>Nome exibição *</label>
              <input className={inputCls} placeholder="Ex: Relatório Beta" value={form.name} onChange={set('name')} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Descrição</label>
            <textarea
              className={inputCls} rows={2}
              value={form.description}
              onChange={set('description')}
              placeholder="Opcional — o que essa flag controla"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Rollout (%)</label>
              <input
                type="number" min={0} max={100}
                className={inputCls}
                value={form.rolloutPct}
                onChange={set('rolloutPct')}
              />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex cursor-pointer items-center gap-2 pb-1">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                  checked={form.enabled}
                  onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))}
                />
                <span className="text-sm text-gray-700">Habilitada por padrão</span>
              </label>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea
              className={inputCls} rows={2}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Contexto, links de ticket, etc."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Criar flag
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Row: uma flag ─────────────────────────────────────────────────────────────

interface FlagRowProps {
  flag:      FeatureFlag
  onReload:  () => void
}

function FlagRow({ flag, onReload }: FlagRowProps) {
  const [toggling,  setToggling]  = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [expanded,  setExpanded]  = useState(false)
  const [editMode,  setEditMode]  = useState(false)
  const [rollout,   setRollout]   = useState(String(flag.rolloutPct))
  const [notes,     setNotes]     = useState(flag.notes ?? '')
  const [saving,    setSaving]    = useState(false)

  async function toggle() {
    setToggling(true)
    try {
      await fetch(`/api/master/feature-flags/${flag.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ enabled: !flag.enabled }),
      })
      onReload()
    } finally {
      setToggling(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/master/feature-flags/${flag.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          rolloutPct: Math.min(100, Math.max(0, Number(rollout) || 0)),
          notes:      notes.trim() || null,
        }),
      })
      setEditMode(false)
      onReload()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir a flag "${flag.key}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    try {
      await fetch(`/api/master/feature-flags/${flag.id}`, { method: 'DELETE' })
      onReload()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-gray-400 hover:text-gray-600"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Key */}
        <code className="min-w-[180px] flex-shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700">
          {flag.key}
        </code>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{flag.name}</p>
          {flag.description && (
            <p className="text-xs text-gray-400 truncate">{flag.description}</p>
          )}
        </div>

        {/* Rollout */}
        <span className="hidden md:block text-xs text-gray-500 flex-shrink-0 w-16 text-center">
          {flag.rolloutPct}%
        </span>

        {/* Overrides count */}
        {flag.tenantFlags.length > 0 && (
          <span className="hidden md:block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 flex-shrink-0">
            {flag.tenantFlags.length} override{flag.tenantFlags.length > 1 ? 's' : ''}
          </span>
        )}

        {/* Toggle */}
        <button
          onClick={toggle}
          disabled={toggling}
          className="flex-shrink-0 disabled:opacity-50"
          title={flag.enabled ? 'Desabilitar' : 'Habilitar'}
        >
          {toggling
            ? <Loader2 size={20} className="animate-spin text-gray-400" />
            : flag.enabled
              ? <ToggleRight size={24} className="text-brand-600" />
              : <ToggleLeft  size={24} className="text-gray-300" />
          }
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          title="Excluir flag"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
          {editMode ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Rollout (%)</label>
                  <input
                    type="number" min={0} max={100}
                    className={inputCls}
                    value={rollout}
                    onChange={e => setRollout(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notas internas</label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Salvar
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Rollout: <strong className="text-gray-800">{flag.rolloutPct}%</strong></span>
                <span>Criado em: <strong className="text-gray-800">{new Date(flag.createdAt).toLocaleDateString('pt-BR')}</strong></span>
                <span>Status: <strong className={flag.enabled ? 'text-emerald-700' : 'text-gray-500'}>{flag.enabled ? 'Habilitada' : 'Desabilitada'}</strong></span>
              </div>
              {flag.notes && (
                <p className="text-xs text-gray-500 italic">Notas: {flag.notes}</p>
              )}
              <button
                onClick={() => setEditMode(true)}
                className="text-xs text-brand-600 hover:underline"
              >
                Editar rollout / notas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function FeatureFlagsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [flags,   setFlags]   = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all')

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
      const res  = await fetch('/api/master/feature-flags')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFlags(data.data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar flags.')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { load() }, [load])

  const filtered = flags.filter(f =>
    filter === 'all'      ? true :
    filter === 'enabled'  ? f.enabled :
    !f.enabled,
  )

  const enabledCount  = flags.filter(f => f.enabled).length
  const disabledCount = flags.length - enabledCount

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
            <Flag size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Feature Flags</h1>
            <p className="text-xs text-gray-400">
              {flags.length} flags — {enabledCount} ativas, {disabledCount} inativas
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus size={15} />
          Nova flag
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
        {(['all', 'enabled', 'disabled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'all' ? 'Todas' : f === 'enabled' ? 'Ativas' : 'Inativas'}
          </button>
        ))}
      </div>

      {/* Flags list */}
      {filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
          <Flag size={24} />
          <p className="text-sm">Nenhuma flag encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(flag => (
            <FlagRow key={flag.id} flag={flag} onReload={load} />
          ))}
        </div>
      )}

      {/* Stats footer */}
      {flags.length > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 size={13} />
            <span>{enabledCount} ativas</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <ToggleLeft size={13} />
            <span>{disabledCount} inativas</span>
          </div>
          <div className="ml-auto text-xs text-gray-400">
            {flags.filter(f => f.tenantFlags.length > 0).length} flags com overrides por tenant
          </div>
        </div>
      )}

      {/* Modal criar */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}
