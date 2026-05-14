'use client'

// =============================================================================
// Templates de Mensagem — AutoDrive
// Gerenciamento dos templates usados nos disparos automáticos e manuais
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Edit2, Trash2, MessageSquare, RefreshCw,
  CheckCircle2, X, Loader2, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Template {
  id:         string
  name:       string
  content:    string
  category:   string
  active:     boolean
  createdAt:  string
  updatedAt:  string
}

interface TemplateFormData {
  name:     string
  content:  string
  category: string
  active:   boolean
}

const EMPTY_FORM: TemplateFormData = { name: '', content: '', category: 'GERAL', active: true }

const VARIABLE_HINTS = [
  { var: '{{nome_cliente}}',   desc: 'Nome completo do cliente' },
  { var: '{{placa}}',          desc: 'Placa do veículo' },
  { var: '{{veiculo}}',        desc: 'Modelo do veículo' },
  { var: '{{vendedor}}',       desc: 'Nome do vendedor responsável' },
  { var: '{{vencimento}}',     desc: 'Data de vencimento da pendência' },
  { var: '{{tipo_pendencia}}', desc: 'Tipo da pendência' },
]

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<Template | null>(null)
  const [form, setForm]           = useState<TemplateFormData>(EMPTY_FORM)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [feedback, setFeedback]   = useState<{ ok: boolean; msg: string } | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/communication/templates', { credentials: 'include' })
      const data = await res.json()
      if (data.success) setTemplates(data.data ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  const openNew  = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); setFeedback(null) }
  const openEdit = (t: Template) => {
    setEditing(t)
    setForm({ name: t.name, content: t.content, category: t.category, active: t.active })
    setShowForm(true)
    setFeedback(null)
  }
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM) }

  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) {
      setFeedback({ ok: false, msg: 'Nome e conteúdo são obrigatórios.' })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const url    = editing ? `/api/communication/templates/${editing.id}` : '/api/communication/templates'
      const method = editing ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        setFeedback({ ok: true, msg: editing ? 'Template atualizado.' : 'Template criado.' })
        closeForm()
        fetchTemplates()
      } else {
        setFeedback({ ok: false, msg: data.error ?? 'Erro ao salvar.' })
      }
    } catch {
      setFeedback({ ok: false, msg: 'Erro de conexão.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res  = await fetch(`/api/communication/templates/${id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (data.success) fetchTemplates()
    } catch { /* silent */ }
    finally { setDeleteId(null) }
  }

  const insertVar = (v: string) =>
    setForm((prev) => ({ ...prev, content: prev.content + v }))

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Templates de Mensagem</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Carregando...' : `${templates.length} template${templates.length !== 1 ? 's' : ''} cadastrado${templates.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTemplates} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </button>
          <button onClick={openNew} className="btn-primary text-xs">
            <Plus size={13} />
            Novo template
          </button>
        </div>
      </div>

      {/* ── Feedback global ───────────────────────────────────────────────── */}
      {feedback && !showForm && (
        <div className={cn(
          'flex items-center gap-2 rounded-lg px-4 py-3 text-sm',
          feedback.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700',
        )}>
          {feedback.ok ? <CheckCircle2 size={14} /> : <X size={14} />}
          {feedback.msg}
        </div>
      )}

      {/* ── Form ──────────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="card animate-fade-in">
          <div className="section-header">
            <MessageSquare size={15} className="text-brand-700" />
            <h2 className="text-sm font-semibold text-gray-800">
              {editing ? 'Editar Template' : 'Novo Template'}
            </h2>
            <button onClick={closeForm} className="ml-auto rounded p-1 hover:bg-gray-100">
              <X size={14} className="text-gray-400" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Nome do template *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex.: Lembrete de pendência vencida"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  className="input"
                >
                  <option value="GERAL">Geral</option>
                  <option value="LEMBRETE">Lembrete</option>
                  <option value="VENCIMENTO">Vencimento</option>
                  <option value="RESOLUCAO">Resolução</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Conteúdo da mensagem *</label>
                <span className="text-xs text-gray-400">{form.content.length} caracteres</span>
              </div>
              <textarea
                value={form.content}
                onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                rows={6}
                placeholder="Olá {{nome_cliente}}, sua pendência referente ao veículo {{veiculo}} venceu em {{vencimento}}..."
                className="input resize-none font-mono text-xs"
              />
            </div>

            {/* Variáveis */}
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Info size={13} className="text-blue-600 shrink-0" />
                <span className="text-xs font-semibold text-blue-700">Variáveis disponíveis — clique para inserir</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {VARIABLE_HINTS.map((v) => (
                  <button
                    key={v.var}
                    onClick={() => insertVar(v.var)}
                    title={v.desc}
                    className="rounded bg-white border border-blue-200 px-2 py-0.5 text-xs text-blue-700 font-mono hover:bg-blue-100 transition-colors"
                  >
                    {v.var}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={form.active}
                onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="active" className="text-sm text-gray-700">Template ativo</label>
            </div>

            {feedback && (
              <div className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                feedback.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
              )}>
                {feedback.ok ? <CheckCircle2 size={13} /> : <X size={13} />}
                {feedback.msg}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={closeForm} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving ? <><Loader2 size={13} className="animate-spin" />Salvando...</> : 'Salvar template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista de templates ────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <MessageSquare size={36} strokeWidth={1} />
          <p className="mt-3 text-sm font-medium">Nenhum template cadastrado</p>
          <p className="text-xs">Crie seu primeiro template para usar nos disparos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className={cn(
              'card',
              !t.active && 'opacity-60',
            )}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{t.name}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {t.category}
                      </span>
                      {!t.active && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm text-gray-600 font-mono whitespace-pre-line line-clamp-3">
                      {t.content}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => openEdit(t)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal de confirmação de exclusão ─────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-gray-900">Excluir template?</h3>
            <p className="mt-1 text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={() => handleDelete(deleteId)} className="btn-danger text-sm">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
