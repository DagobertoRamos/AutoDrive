'use client'

// =============================================================================
// Master > IA > Base de Conhecimento. MASTER-only.
// Conteúdo global que a IA pode usar (manuais, políticas, FAQs, fluxos).
// Consome /api/master/ai/knowledge (+[id], +[id]/reprocess).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { BookOpen, Plus, Pencil, Trash2, X, Save, Lock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const SOURCES = ['manual_text', 'pdf', 'docx', 'image', 'url', 'system_doc'] as const
type Source = (typeof SOURCES)[number]
interface Row { id: string; scope: string; title: string; description: string | null; sourceType: Source; status: string; chunks: number; hasContent: boolean; updatedAt: string }
interface Form { title: string; description: string; sourceType: Source; content: string; status: 'ATIVO' | 'INATIVO' }
const empty: Form = { title: '', description: '', sourceType: 'manual_text', content: '', status: 'ATIVO' }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function MasterAiKnowledgePage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'

  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/master/ai/knowledge', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  const openNew = () => { setEditingId(null); setForm(empty); setError(null); setModal(true) }
  const openEdit = (r: Row) => { setEditingId(r.id); setForm({ title: r.title, description: r.description ?? '', sourceType: r.sourceType, content: '', status: r.status as 'ATIVO' | 'INATIVO' }); setError(null); setModal(true) }
  const save = async () => {
    if (!form.title.trim()) { setError('Título é obrigatório.'); return }
    setSaving(true); setError(null)
    try {
      const url = editingId ? `/api/master/ai/knowledge/${editingId}` : '/api/master/ai/knowledge'
      const body: Record<string, unknown> = { title: form.title, description: form.description || null, sourceType: form.sourceType, status: form.status }
      if (!editingId || form.content.trim()) body.content = form.content || null
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const reprocess = async (r: Row) => { setBusy(r.id); try { await fetch(`/api/master/ai/knowledge/${r.id}/reprocess`, { method: 'POST', credentials: 'include' }); await load() } finally { setBusy(null) } }
  const remove = async (r: Row) => { if (!confirm(`Excluir "${r.title}"?`)) return; await fetch(`/api/master/ai/knowledge/${r.id}`, { method: 'DELETE', credentials: 'include' }); await load() }

  if (session && !isMaster) return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><BookOpen size={20} className="text-brand-600" />Base de Conhecimento</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} base(s) global(is) — origem rastreável`}</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Nova base</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Título', 'Origem', 'Chunks', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={5} className="py-14 text-center"><BookOpen size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma base. Cadastre o primeiro conteúdo.</p></td></tr>)
              : items.map((r) => (
                <tr key={r.id} className={cn('hover:bg-gray-50', r.status !== 'ATIVO' && 'opacity-50')}>
                  <td className="px-4 py-3"><p className="font-medium text-gray-900">{r.title}</p>{r.description && <p className="max-w-md truncate text-xs text-gray-500">{r.description}</p>}</td>
                  <td className="px-4 py-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{r.sourceType}</span></td>
                  <td className="px-4 py-3 text-center tabular-nums text-gray-500">{r.chunks}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.status}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => reprocess(r)} disabled={busy === r.id || !r.hasContent} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40" title="Reprocessar (gerar chunks)"><RefreshCw size={15} className={cn(busy === r.id && 'animate-spin')} /></button>
                    <button onClick={() => openEdit(r)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                    <button onClick={() => remove(r)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-4 w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar base' : 'Nova base de conhecimento'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Título <span className="text-red-500">*</span></label><input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Tipo de origem</label><select className={inputCls} value={form.sourceType} onChange={(e) => set('sourceType', e.target.value as Source)}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Status</label><select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value as 'ATIVO' | 'INATIVO')}><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Descrição</label><input className={inputCls} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Conteúdo {editingId && <span className="text-[11px] text-gray-400">(em branco = manter)</span>}</label><textarea className={cn(inputCls, 'min-h-[120px] resize-y')} value={form.content} onChange={(e) => set('content', e.target.value)} placeholder="Cole o manual/política/FAQ. Depois use “Reprocessar” para gerar os chunks." /></div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
