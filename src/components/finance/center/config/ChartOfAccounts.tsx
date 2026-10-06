'use client'

// Financeiro › Plano de contas — árvore de receitas e despesas com código, linha
// da DRE (herdada em cinza) e quantidade de lançamentos. Criar no topo ou como
// subcategoria, editar, mover (trocar o pai), inativar/excluir.
// /api/finance/categories?tree=1, POST, /[id] PATCH/DELETE.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FolderTree, Pencil, Plus, Power, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldLabel } from '@/components/ui/field'
import { DRE_GROUPS } from '@/lib/finance/dre-core'
import { Badge, ColorPicker, EmptyState, Modal, PageHeader, Toggle, api, iconBtn, inputClass } from './ui'

type Kind = 'RECEITA' | 'DESPESA'
interface Node {
  id: string; name: string; kind: Kind; code: string | null; color: string | null; parentId: string | null
  dreGroup: string | null; active: boolean; depth: number; effectiveDreGroup: string | null; dreLabel: string | null
  dreInherited: boolean; entryCount: number; totalEntryCount: number; children: Node[]
}
interface Form { id?: string; kind: Kind; name: string; code: string; parentId: string; dreGroup: string; color: string | null; active: boolean }

function flatten(nodes: Node[], out: Node[] = []): Node[] {
  for (const n of nodes) { out.push(n); flatten(n.children, out) }
  return out
}
function subtreeIds(n: Node): Set<string> {
  return new Set(flatten([n]).map((x) => x.id))
}
function filterInactive(nodes: Node[]): Node[] {
  return nodes.filter((n) => n.active).map((n) => ({ ...n, children: filterInactive(n.children) }))
}

export default function ChartOfAccounts() {
  const [tree, setTree] = useState<Record<Kind, Node[]>>({ RECEITA: [], DESPESA: [] })
  const [kind, setKind] = useState<Kind>('DESPESA')
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await api<Record<Kind, Node[]>>('/api/finance/categories?tree=1')
    setTree(r.data ?? { RECEITA: [], DESPESA: [] })
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const roots = useMemo(() => (showInactive ? tree[kind] : filterInactive(tree[kind])), [tree, kind, showInactive])
  const all = useMemo(() => flatten(tree[kind]), [tree, kind])
  const byId = useMemo(() => new Map(all.map((n) => [n.id, n])), [all])

  const toggleCollapse = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const openCreate = (parent?: Node) => {
    setError(null)
    setForm({ kind: parent?.kind ?? kind, name: '', code: '', parentId: parent?.id ?? '', dreGroup: '', color: null, active: true })
  }
  const openEdit = (n: Node) => {
    setError(null)
    setForm({ id: n.id, kind: n.kind, name: n.name, code: n.code ?? '', parentId: n.parentId ?? '', dreGroup: n.dreGroup ?? '', color: n.color, active: n.active })
  }

  const save = async () => {
    if (!form) return
    if (form.name.trim().length < 2) { setError('Informe o nome.'); return }
    setSaving(true); setError(null)
    const body = { name: form.name.trim(), code: form.code.trim() || null, parentId: form.parentId || null, dreGroup: form.dreGroup || null, color: form.color, active: form.active, ...(form.id ? {} : { kind: form.kind }) }
    const r = await api(form.id ? `/api/finance/categories/${form.id}` : '/api/finance/categories', { method: form.id ? 'PATCH' : 'POST', body })
    setSaving(false)
    if (!r.ok) { setError(r.error); return }
    setForm(null); load()
  }

  const remove = async (n: Node) => {
    const used = n.totalEntryCount > 0 || n.children.length > 0
    if (!confirm(used ? `"${n.name}" tem lançamentos ou subcategorias e será inativada. Continuar?` : `Excluir "${n.name}"?`)) return
    const r = await api(`/api/finance/categories/${n.id}`, { method: 'DELETE' })
    if (!r.ok) { setMsg(r.error); return }
    setMsg(r.json?.deleted ? 'Categoria excluída.' : 'Categoria inativada.')
    load()
  }
  const reactivate = async (n: Node) => {
    await api(`/api/finance/categories/${n.id}`, { method: 'PATCH', body: { active: true } })
    load()
  }

  // Pais possíveis no formulário: mesmo tipo, fora da própria subárvore.
  const parentOptions = useMemo(() => {
    if (!form) return []
    const blocked = form.id && byId.get(form.id) ? subtreeIds(byId.get(form.id)!) : new Set<string>()
    return flatten(tree[form.kind]).filter((n) => !blocked.has(n.id) && (n.active || n.id === form.parentId))
  }, [form, tree, byId])
  const inheritedLabel = useMemo(() => {
    if (!form?.parentId) return null
    const p = flatten(tree[form.kind]).find((n) => n.id === form.parentId)
    return p?.dreLabel ?? null
  }, [form, tree])

  const renderNode = (n: Node): React.ReactNode => {
    const isCollapsed = collapsed.has(n.id)
    return (
      <div key={n.id}>
        <div className={cn('group flex items-center gap-2 border-b border-gray-100 px-3 py-2 hover:bg-gray-50', !n.active && 'opacity-50')}>
          <div className="flex min-w-0 flex-1 items-center gap-1.5" style={{ paddingLeft: n.depth * 20 }}>
            {n.children.length ? (
              <button onClick={() => toggleCollapse(n.id)} className="rounded p-0.5 text-gray-400 hover:text-gray-700" aria-label={isCollapsed ? 'Expandir' : 'Recolher'}>
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              </button>
            ) : <span className="w-5" />}
            {n.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: n.color }} />}
            {n.code && <span className="shrink-0 font-mono text-xs text-gray-500">{n.code}</span>}
            <span className={cn('truncate text-sm', n.depth === 0 ? 'font-semibold text-gray-900' : 'text-gray-800')}>{n.name}</span>
            {!n.active && <Badge tone="red">Inativa</Badge>}
          </div>
          <div className="hidden w-64 shrink-0 truncate text-xs md:block">
            {n.dreLabel ? <span className={n.dreInherited ? 'text-gray-400' : 'text-gray-700'}>{n.dreLabel}</span> : <span className="text-gray-300">—</span>}
          </div>
          <div className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-500" title="Lançamentos (com subcategorias)">{n.totalEntryCount || ''}</div>
          <div className="flex w-28 shrink-0 justify-end">
            {n.active && <button onClick={() => openCreate(n)} className={iconBtn} title="Nova subcategoria"><Plus size={15} /></button>}
            <button onClick={() => openEdit(n)} className={iconBtn} title="Editar"><Pencil size={15} /></button>
            {n.active ? (
              <button onClick={() => remove(n)} className={iconBtn} title={n.totalEntryCount || n.children.length ? 'Inativar' : 'Excluir'}>
                {n.totalEntryCount || n.children.length ? <Power size={15} /> : <Trash2 size={15} />}
              </button>
            ) : (
              <button onClick={() => reactivate(n)} className={iconBtn} title="Reativar"><Power size={15} /></button>
            )}
          </div>
        </div>
        {!isCollapsed && n.children.map(renderNode)}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Plano de contas"
        subtitle={loading ? 'Carregando...' : `${all.filter((n) => n.active).length} categorias ativas`}
        actions={<>
          <Toggle checked={showInactive} onChange={setShowInactive} label="Mostrar inativas" />
          <button onClick={() => openCreate()} className="btn-primary text-sm"><Plus size={15} />Nova categoria</button>
        </>}
      />

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
        {(['DESPESA', 'RECEITA'] as Kind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('rounded-md px-4 py-1.5 text-sm font-medium', kind === k ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
            {k === 'DESPESA' ? 'Despesas' : 'Receitas'}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-gray-600">{msg}</p>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <div className="flex-1">Categoria</div>
          <div className="hidden w-64 md:block">Linha da DRE</div>
          <div className="w-16 text-right">Lanç.</div>
          <div className="w-28" />
        </div>
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-gray-100" />)}</div>
        ) : roots.length === 0 ? (
          <EmptyState icon={<FolderTree size={32} strokeWidth={1} />} text="Nenhuma categoria." />
        ) : roots.map(renderNode)}
      </div>

      {form && (
        <Modal
          title={form.id ? 'Editar categoria' : form.parentId ? 'Nova subcategoria' : 'Nova categoria'}
          onClose={() => setForm(null)}
          footer={<>
            <button onClick={() => setForm(null)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
          </>}
        >
          <div className="space-y-3">
            {!form.id && !form.parentId && (
              <div><FieldLabel required>Tipo</FieldLabel>
                <select className={cn(inputClass, 'mt-1')} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind, parentId: '', dreGroup: '' })}>
                  <option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option>
                </select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div><FieldLabel>Código</FieldLabel><input className={cn(inputClass, 'mt-1 font-mono')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Auto" /></div>
              <div className="col-span-2"><FieldLabel required>Nome</FieldLabel><input className={cn(inputClass, 'mt-1')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
            </div>
            <div><FieldLabel>Categoria pai</FieldLabel>
              <select className={cn(inputClass, 'mt-1')} value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">— Topo do plano —</option>
                {parentOptions.map((p) => <option key={p.id} value={p.id}>{' '.repeat(p.depth * 3)}{p.code ? `${p.code} ` : ''}{p.name}</option>)}
              </select>
            </div>
            <div><FieldLabel>Linha da DRE</FieldLabel>
              <select className={cn(inputClass, 'mt-1')} value={form.dreGroup} onChange={(e) => setForm({ ...form, dreGroup: e.target.value })}>
                <option value="">{inheritedLabel ? `Herdar: ${inheritedLabel}` : 'Não definida'}</option>
                {DRE_GROUPS.filter((g) => g.kind === form.kind || g.key === 'NAO_OPERACIONAL').map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
            <div><FieldLabel>Cor</FieldLabel><div className="mt-1"><ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></div></div>
            {form.id && <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Ativa" />}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
