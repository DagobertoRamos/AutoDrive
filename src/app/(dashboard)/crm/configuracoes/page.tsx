'use client'

// =============================================================================
// Central de Configurações do CRM (Reforma F1). Abas: Visão geral, Etapas,
// Etiquetas (funcionais). Demais áreas aparecem como "em breve" (roadmap das
// próximas fases). Reaproveita MarketingLead + LeadStatus; nada paralelo.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Settings, Save, Plus, Trash2, Tag as TagIcon, Columns3, RefreshCw, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

interface Stage { code: string; displayName: string; color: string; order: number; active: boolean; category: string }
interface Tag { id: string; name: string; color: string | null; description: string | null; active: boolean }

type TabId = 'overview' | 'stages' | 'tags'
const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'overview', label: 'Visão geral', icon: Settings },
  { id: 'stages', label: 'Etapas', icon: Columns3 },
  { id: 'tags', label: 'Etiquetas', icon: TagIcon },
]
const SOON = ['Temperaturas', 'Tipos de lead', 'Origens', 'Distribuição', 'SLA e follow-up', 'Campos obrigatórios', 'Motivos de encerramento', 'Duplicidades', 'Automações', 'Permissões', 'Auditoria']

export default function CrmConfiguracoesPage() {
  const { data: session } = useSession()
  const canManage = MANAGE_ROLES.includes((session?.user as { role?: string })?.role ?? '')
  const [tab, setTab] = useState<TabId>('overview')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Settings size={20} className="text-brand-600" />Central de Configurações do CRM</h1>
        <p className="mt-0.5 text-sm text-gray-500">Configure o funcionamento real do CRM. Reaproveita os leads (MarketingLead) e as etapas existentes — sem CRM paralelo.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium -mb-px', tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'stages' && <StagesTab canManage={canManage} />}
      {tab === 'tags' && <TagsTab canManage={canManage} />}
    </div>
  )
}

function Overview() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">O que já dá para configurar</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-600 space-y-1">
          <li><b>Etapas</b> — nome exibido, cor, ordem e ativação de cada coluna do Kanban (os códigos internos são preservados para integrações).</li>
          <li><b>Etiquetas</b> — cadastro de múltiplas etiquetas por lead (cliente com troca, financiamento, PCD, sem retorno, etc.).</li>
          <li><b>Temperatura</b> — Quente/Morno/Frio no lead (separada das etiquetas), aplicada no card e no detalhe do lead.</li>
        </ul>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">Próximas fases (roadmap)</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {SOON.map((s) => <span key={s} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500">{s} <span className="text-gray-400">· em breve</span></span>)}
        </div>
      </div>
    </div>
  )
}

function StagesTab({ canManage }: { canManage: boolean }) {
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/crm/config/stages', { credentials: 'include' }).then((x) => x.json()); setStages((r?.data ?? []).slice().sort((a: Stage, b: Stage) => a.order - b.order)) }
    catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const set = (code: string, patch: Partial<Stage>) => setStages((prev) => prev.map((s) => s.code === code ? { ...s, ...patch } : s))
  const move = (i: number, dir: -1 | 1) => setStages((prev) => {
    const next = [...prev]; const j = i + dir; if (j < 0 || j >= next.length) return prev
    ;[next[i], next[j]] = [next[j], next[i]]
    return next.map((s, idx) => ({ ...s, order: idx }))
  })

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/crm/config/stages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ stages: stages.map((s, i) => ({ ...s, order: i })) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao salvar.' }); return }
      setStages((j?.data ?? stages).slice().sort((a: Stage, b: Stage) => a.order - b.order)); setMsg({ ok: true, text: 'Etapas salvas.' })
    } catch { setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div><h2 className="text-sm font-semibold text-gray-900">Etapas do Kanban</h2><p className="text-xs text-gray-500">O código interno é preservado; você ajusta nome, cor, ordem e ativação.</p></div>
        <button onClick={load} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>
      {loading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />)}</div> : (
        <ul className="space-y-2">
          {stages.map((s, i) => (
            <li key={s.code} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2">
              <div className="flex flex-col leading-none">
                <button disabled={!canManage || i === 0} onClick={() => move(i, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30">▲</button>
                <button disabled={!canManage || i === stages.length - 1} onClick={() => move(i, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30">▼</button>
              </div>
              <GripVertical size={14} className="text-gray-300" />
              <input type="color" disabled={!canManage} value={s.color} onChange={(e) => set(s.code, { color: e.target.value })} className="h-8 w-8 shrink-0 rounded border border-gray-200" />
              <input disabled={!canManage} className={cn(inputCls, 'flex-1 min-w-[140px]')} value={s.displayName} onChange={(e) => set(s.code, { displayName: e.target.value })} />
              <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">{s.code}</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{s.category}</span>
              <label className="ml-auto flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" disabled={!canManage} checked={s.active} onChange={(e) => set(s.code, { active: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativa</label>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {msg && <span className={cn('text-sm', msg.ok ? 'text-green-600' : 'text-red-600')}>{msg.text}</span>}
          <button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando…' : 'Salvar etapas'}</button>
        </div>
      )}
    </div>
  )
}

function TagsTab({ canManage }: { canManage: boolean }) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', color: '#6366f1' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/crm/config/tags?includeInactive=1', { credentials: 'include' }).then((x) => x.json()); setTags(r?.data ?? []) }
    catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const r = await fetch('/api/crm/config/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) })
      if (r.ok) { setForm({ name: '', color: '#6366f1' }); await load() } else { const j = await r.json().catch(() => ({})); alert(j?.error ?? 'Falha ao criar.') }
    } finally { setBusy(false) }
  }
  const toggle = async (t: Tag) => { await fetch(`/api/crm/config/tags/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !t.active }) }); await load() }
  const remove = async (t: Tag) => { if (!confirm(`Excluir/desativar a etiqueta "${t.name}"?`)) return; await fetch(`/api/crm/config/tags/${t.id}`, { method: 'DELETE', credentials: 'include' }); await load() }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="mb-3"><h2 className="text-sm font-semibold text-gray-900">Etiquetas</h2><p className="text-xs text-gray-500">Um lead pode ter várias. Etiquetas usadas não são apagadas — são desativadas.</p></div>
      {canManage && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
          <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-9 w-9 rounded border border-gray-200" />
          <input className={cn(inputCls, 'flex-1 min-w-[160px]')} placeholder="Nome da etiqueta (ex.: Financiamento, PCD, Sem retorno)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <button onClick={create} disabled={busy || !form.name.trim()} className="btn-primary text-sm"><Plus size={15} />Adicionar</button>
        </div>
      )}
      {loading ? <div className="flex flex-wrap gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-gray-100" />)}</div> : tags.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Nenhuma etiqueta cadastrada.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t.id} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', t.active ? 'border-gray-200 bg-white text-gray-700' : 'border-gray-100 bg-gray-50 text-gray-400 line-through')}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color ?? '#9ca3af' }} />
              {t.name}
              {canManage && (
                <>
                  <button onClick={() => toggle(t)} className="ml-1 text-[10px] text-gray-400 hover:text-gray-700" title={t.active ? 'Desativar' : 'Ativar'}>{t.active ? 'off' : 'on'}</button>
                  <button onClick={() => remove(t)} className="text-gray-400 hover:text-red-600" title="Excluir"><Trash2 size={12} /></button>
                </>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
