'use client'

// =============================================================================
// Regras de Notificação — AutoDrive (MASTER)
// Gerenciar regras globais que controlam quando e como pendências e alertas
// são gerados e distribuídos.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Bell, Plus, Loader2, Pencil, Trash2, ToggleLeft, ToggleRight,
  CheckCircle2, AlertCircle, X, RefreshCw, ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Rule {
  id:             string
  scope:          string
  name:           string
  description?:   string | null
  module:         string
  conditionType:  string
  priority:       string
  severity:       string
  slaMinutes?:    number | null
  channels:       string[]
  targetRoles:    string[]
  escalationRoles: string[]
  escalationAfterMinutes?: number | null
  maxPerDay:      number
  isActive:       boolean
  creator?:       { name: string; role: string } | null
  createdAt:      string
}

interface RuleForm {
  name:              string
  description:       string
  module:            string
  conditionType:     string
  priority:          string
  severity:          string
  slaMinutes:        string
  channels:          string[]
  targetRoles:       string[]
  escalationRoles:   string[]
  escalationAfterMinutes: string
  maxPerDay:         string
  isActive:          boolean
}

const EMPTY_FORM: RuleForm = {
  name: '', description: '', module: 'DEALS', conditionType: '',
  priority: 'MEDIA', severity: 'MEDIUM', slaMinutes: '',
  channels: ['APP_WEB'], targetRoles: ['GERENTE'], escalationRoles: [],
  escalationAfterMinutes: '', maxPerDay: '10', isActive: true,
}

const MODULE_LABELS: Record<string, string> = {
  DEALS: 'Negociações', COMMISSIONS: 'Comissões', STOCK: 'Estoque',
  CRM: 'CRM', WHATSAPP: 'WhatsApp', PENDENCIES: 'Pendências',
}

const PRIORITY_LABELS: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente',
}

const SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto', CRITICAL: 'Crítico',
}

const ALL_CHANNELS = ['APP_WEB', 'APP_MOBILE', 'WHATSAPP', 'EMAIL', 'PUSH']
const ALL_ROLES    = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR']

// ── Componente ────────────────────────────────────────────────────────────────

export default function NotificationRulesPage() {
  const [rules,     setRules]     = useState<Rule[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState<Rule | null>(null)
  const [form,      setForm]      = useState<RuleForm>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [feedback,  setFeedback]  = useState<{ ok: boolean; msg: string } | null>(null)
  const [deleting,  setDeleting]  = useState<string | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/notification-rules', { credentials: 'include' })
      const data = await res.json()
      if (data.success) setRules(data.data ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  // ── Modal ────────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFeedback(null)
    setShowModal(true)
  }

  const openEdit = (rule: Rule) => {
    setEditing(rule)
    setForm({
      name:           rule.name,
      description:    rule.description ?? '',
      module:         rule.module,
      conditionType:  rule.conditionType,
      priority:       rule.priority,
      severity:       rule.severity,
      slaMinutes:     rule.slaMinutes != null ? String(rule.slaMinutes) : '',
      channels:       rule.channels,
      targetRoles:    rule.targetRoles,
      escalationRoles: rule.escalationRoles,
      escalationAfterMinutes: rule.escalationAfterMinutes != null ? String(rule.escalationAfterMinutes) : '',
      maxPerDay:      String(rule.maxPerDay),
      isActive:       rule.isActive,
    })
    setFeedback(null)
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditing(null) }

  const toggleChannel = (ch: string) =>
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch],
    }))

  const toggleRole = (role: string, field: 'targetRoles' | 'escalationRoles') =>
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(role) ? f[field].filter((r) => r !== role) : [...f[field], role],
    }))

  // ── Save ──────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim() || !form.conditionType.trim()) {
      setFeedback({ ok: false, msg: 'Nome e tipo de condição são obrigatórios.' })
      return
    }

    setSaving(true)
    setFeedback(null)

    const body = {
      name:              form.name,
      description:       form.description || undefined,
      module:            form.module,
      conditionType:     form.conditionType,
      priority:          form.priority,
      severity:          form.severity,
      slaMinutes:        form.slaMinutes ? Number(form.slaMinutes) : null,
      channels:          form.channels,
      targetRoles:       form.targetRoles,
      escalationRoles:   form.escalationRoles,
      escalationAfterMinutes: form.escalationAfterMinutes ? Number(form.escalationAfterMinutes) : null,
      maxPerDay:         Number(form.maxPerDay) || 10,
      isActive:          form.isActive,
    }

    try {
      const url    = editing ? `/api/notification-rules/${editing.id}` : '/api/notification-rules'
      const method = editing ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setFeedback({ ok: true, msg: editing ? 'Regra atualizada.' : 'Regra criada com sucesso.' })
        await fetchRules()
        setTimeout(closeModal, 1200)
      } else {
        setFeedback({ ok: false, msg: data.error ?? 'Erro ao salvar.' })
      }
    } catch {
      setFeedback({ ok: false, msg: 'Erro de conexão.' })
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle ativo ──────────────────────────────────────────────────────────────

  const handleToggle = async (rule: Rule) => {
    try {
      await fetch(`/api/notification-rules/${rule.id}`, {
        method:  'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      })
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
    } catch { /* silent */ }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta regra? Esta ação não pode ser desfeita.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/notification-rules/${id}`, {
        method: 'DELETE', credentials: 'include',
      })
      if (res.ok) setRules((prev) => prev.filter((r) => r.id !== id))
    } catch { /* silent */ }
    finally { setDeleting(null) }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <ShieldAlert size={20} className="text-brand-600" />
            Regras de Notificação
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Regras globais que determinam quando e como pendências são criadas e alertas disparados.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchRules} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </button>
          <button onClick={openCreate} className="btn-primary text-sm">
            <Plus size={14} /> Nova regra
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : rules.length === 0 ? (
          <div className="py-14 text-center">
            <Bell size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
            <p className="text-sm text-gray-400">Nenhuma regra configurada</p>
            <button onClick={openCreate} className="mt-3 btn-primary text-sm">
              <Plus size={14} /> Criar primeira regra
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Regra', 'Módulo', 'Prioridade', 'SLA', 'Canais', 'Escopo', 'Status', 'Ações'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{rule.name}</p>
                      {rule.description && (
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">{rule.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">Cond.: {rule.conditionType}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {MODULE_LABELS[rule.module] ?? rule.module}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-gray-700">{PRIORITY_LABELS[rule.priority] ?? rule.priority}</span>
                        <span className="text-xs text-gray-500">{SEVERITY_LABELS[rule.severity] ?? rule.severity}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {rule.slaMinutes ? `${rule.slaMinutes}min` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rule.channels.map((ch) => (
                          <span key={ch} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{ch}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        rule.scope === 'GLOBAL' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600',
                      )}>
                        {rule.scope === 'GLOBAL' ? 'Global' : 'Tenant'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggle(rule)} className="transition">
                        {rule.isActive
                          ? <ToggleRight size={22} className="text-emerald-500" />
                          : <ToggleLeft  size={22} className="text-gray-300" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(rule)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          disabled={deleting === rule.id}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          {deleting === rule.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal criar/editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="font-semibold text-gray-800">
                {editing ? 'Editar regra' : 'Nova regra de notificação'}
              </h2>
              <button onClick={closeModal} className="rounded p-1.5 hover:bg-gray-100 transition">
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
              {/* Nome */}
              <div>
                <label className="label">Nome da regra *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ex: Negociação parada há +24h"
                  className="input"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="label">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="input resize-none"
                  placeholder="Explique quando esta regra dispara..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Módulo */}
                <div>
                  <label className="label">Módulo *</label>
                  <select
                    value={form.module}
                    onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))}
                    className="input"
                  >
                    {Object.entries(MODULE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Tipo de condição */}
                <div>
                  <label className="label">Tipo de condição *</label>
                  <input
                    value={form.conditionType}
                    onChange={(e) => setForm((f) => ({ ...f, conditionType: e.target.value }))}
                    placeholder="ex: DEAL_STUCK_24H"
                    className="input"
                  />
                </div>

                {/* Prioridade */}
                <div>
                  <label className="label">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="input"
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Severidade */}
                <div>
                  <label className="label">Severidade</label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                    className="input"
                  >
                    {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* SLA */}
                <div>
                  <label className="label">SLA (minutos)</label>
                  <input
                    type="number" min={0}
                    value={form.slaMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, slaMinutes: e.target.value }))}
                    placeholder="ex: 240 (= 4h)"
                    className="input"
                  />
                </div>

                {/* Max por dia */}
                <div>
                  <label className="label">Máx. por dia / usuário</label>
                  <input
                    type="number" min={1} max={100}
                    value={form.maxPerDay}
                    onChange={(e) => setForm((f) => ({ ...f, maxPerDay: e.target.value }))}
                    className="input"
                  />
                </div>

                {/* Escalonamento após */}
                <div>
                  <label className="label">Escalonar após (min)</label>
                  <input
                    type="number" min={0}
                    value={form.escalationAfterMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, escalationAfterMinutes: e.target.value }))}
                    placeholder="ex: 60"
                    className="input"
                  />
                </div>
              </div>

              {/* Canais */}
              <div>
                <label className="label">Canais de entrega</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => toggleChannel(ch)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        form.channels.includes(ch)
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              {/* Roles alvo */}
              <div>
                <label className="label">Notificar roles</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRole(r, 'targetRoles')}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        form.targetRoles.includes(r)
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Roles de escalonamento */}
              <div>
                <label className="label">Roles para escalonamento</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRole(r, 'escalationRoles')}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        form.escalationRoles.includes(r)
                          ? 'border-amber-600 bg-amber-50 text-amber-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ativo */}
              <div className="flex items-center gap-3">
                <label className="label mb-0">Regra ativa</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                >
                  {form.isActive
                    ? <ToggleRight size={24} className="text-emerald-500" />
                    : <ToggleLeft  size={24} className="text-gray-300" />}
                </button>
              </div>

              {/* Feedback */}
              {feedback && (
                <div className={cn(
                  'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
                  feedback.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700',
                )}>
                  {feedback.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                  {feedback.msg}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <button onClick={closeModal} className="btn-secondary">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar regra'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
