'use client'

// =============================================================================
// Master > IA > Instruções da IA (ensinar a IA). MASTER-only.
// Regras globais de comportamento por escopo, com histórico de versões.
// Consome /api/master/ai/instructions (+[id]).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { GraduationCap, Plus, Pencil, Trash2, X, Save, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

const SCOPES = ['global', 'ajuda', 'relatorios', 'documentos', 'f&i', 'estoque', 'vendas', 'financeiro', 'pos-venda', 'marketing'] as const
type Scope = (typeof SCOPES)[number]
interface Row { id: string; title: string; area: string | null; scope: Scope; content: string; status: string; priority: number; versions: number; updatedAt: string }
interface Form { title: string; area: string; scope: Scope; content: string; status: 'ATIVO' | 'INATIVO'; priority: number }
const empty: Form = { title: '', area: '', scope: 'global', content: '', status: 'ATIVO', priority: 0 }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

const SUGGESTIONS = [
  'A IA deve responder apenas com base nos dados autorizados do tenant.',
  'A IA não pode inventar informação; deve avisar quando não tiver dados suficientes.',
  'A IA não pode aprovar financiamento nem prometer crédito.',
  'A IA não pode alterar negociação sem confirmação do usuário autorizado.',
  'A IA deve respeitar as permissões do usuário logado e nunca expor dados de outro tenant.',
  'A IA não pode expor credenciais, tokens, senhas ou dados sigilosos.',
]

export default function MasterAiInstructionsPage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'

  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/master/ai/instructions', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  const openNew = () => { setEditingId(null); setForm(empty); setError(null); setModal(true) }
  const openEdit = (r: Row) => { setEditingId(r.id); setForm({ title: r.title, area: r.area ?? '', scope: r.scope, content: r.content, status: r.status as 'ATIVO' | 'INATIVO', priority: r.priority }); setError(null); setModal(true) }
  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) { setError('Título e conteúdo são obrigatórios.'); return }
    setSaving(true); setError(null)
    try {
      const url = editingId ? `/api/master/ai/instructions/${editingId}` : '/api/master/ai/instructions'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ...form, area: form.area || null }) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const remove = async (r: Row) => { if (!confirm(`Excluir a instrução "${r.title}"?`)) return; await fetch(`/api/master/ai/instructions/${r.id}`, { method: 'DELETE', credentials: 'include' }); await load() }

  if (session && !isMaster) return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><GraduationCap size={20} className="text-brand-600" />Instruções da IA</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} instrução(ões) globais — como a IA deve se comportar`}</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Nova instrução</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Título', 'Escopo', 'Prioridade', 'Versões', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={6} className="py-14 text-center"><GraduationCap size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma instrução. Ensine a IA com as primeiras regras.</p></td></tr>)
              : items.map((r) => (
                <tr key={r.id} className={cn('hover:bg-gray-50', r.status !== 'ATIVO' && 'opacity-50')}>
                  <td className="px-4 py-3"><p className="font-medium text-gray-900">{r.title}</p><p className="max-w-md truncate text-xs text-gray-500">{r.content}</p></td>
                  <td className="px-4 py-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{r.scope}</span></td>
                  <td className="px-4 py-3 text-center tabular-nums text-gray-500">{r.priority}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-gray-500">{r.versions}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.status}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
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
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar instrução' : 'Nova instrução'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Título <span className="text-red-500">*</span></label><input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Escopo</label><select className={inputCls} value={form.scope} onChange={(e) => set('scope', e.target.value as Scope)}>{SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Área (opcional)</label><input className={inputCls} value={form.area} onChange={(e) => set('area', e.target.value)} placeholder="ex.: atendimento" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Prioridade</label><input type="number" min={0} max={100} className={inputCls} value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Status</label><select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value as 'ATIVO' | 'INATIVO')}><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Conteúdo <span className="text-red-500">*</span></label><textarea className={cn(inputCls, 'min-h-[100px] resize-y')} value={form.content} onChange={(e) => set('content', e.target.value)} placeholder="Descreva a regra de comportamento da IA..." /></div>
              {!editingId && (
                <div className="col-span-2"><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Sugestões (clique para usar)</p><div className="flex flex-wrap gap-1">{SUGGESTIONS.map((s) => (<button key={s} type="button" onClick={() => set('content', s)} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 hover:bg-brand-50 hover:text-brand-700">{s.slice(0, 38)}…</button>))}</div></div>
              )}
              {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
