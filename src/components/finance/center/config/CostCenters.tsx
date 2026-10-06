'use client'

// Financeiro › Centros de custo — cadastro (nome, código, pai, ativo) com a
// quantidade de lançamentos. /api/finance/cost-centers (+ /[id]).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Network, Pencil, Plus, Power, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldLabel } from '@/components/ui/field'
import { Badge, EmptyState, Modal, PageHeader, Toggle, api, iconBtn, inputClass } from './ui'

interface CostCenter { id: string; name: string; code: string | null; parentId: string | null; parentName: string | null; active: boolean; entryCount: number }
interface Form { id?: string; name: string; code: string; parentId: string; active: boolean }

/** Ordena em árvore (pai seguido dos filhos) com profundidade. */
function ordered(rows: CostCenter[]): (CostCenter & { depth: number })[] {
  const ids = new Set(rows.map((r) => r.id))
  const out: (CostCenter & { depth: number })[] = []
  const walk = (parentId: string | null, depth: number, seen: Set<string>) => {
    for (const r of rows.filter((x) => (x.parentId && ids.has(x.parentId) ? x.parentId : null) === parentId)) {
      if (seen.has(r.id)) continue
      out.push({ ...r, depth })
      walk(r.id, depth + 1, new Set([...seen, r.id]))
    }
  }
  walk(null, 0, new Set())
  return out
}

export default function CostCenters() {
  const [items, setItems] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await api<CostCenter[]>('/api/finance/cost-centers')
    setItems(r.data ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => ordered(items).filter((r) => showInactive || r.active), [items, showInactive])

  const blocked = useMemo(() => {
    if (!form?.id) return new Set<string>()
    const set = new Set<string>([form.id])
    let grew = true
    while (grew) {
      grew = false
      for (const r of items) if (r.parentId && set.has(r.parentId) && !set.has(r.id)) { set.add(r.id); grew = true }
    }
    return set
  }, [form, items])

  const save = async () => {
    if (!form) return
    if (form.name.trim().length < 2) { setError('Informe o nome.'); return }
    setSaving(true); setError(null)
    const body = { name: form.name.trim(), code: form.code.trim() || null, parentId: form.parentId || null, active: form.active }
    const r = await api(form.id ? `/api/finance/cost-centers/${form.id}` : '/api/finance/cost-centers', { method: form.id ? 'PATCH' : 'POST', body })
    setSaving(false)
    if (!r.ok) { setError(r.error); return }
    setForm(null); load()
  }

  const remove = async (c: CostCenter) => {
    const used = c.entryCount > 0 || items.some((x) => x.parentId === c.id)
    if (!confirm(used ? `"${c.name}" tem lançamentos ou filhos e será inativado. Continuar?` : `Excluir "${c.name}"?`)) return
    await api(`/api/finance/cost-centers/${c.id}`, { method: 'DELETE' })
    load()
  }
  const reactivate = async (c: CostCenter) => {
    await api(`/api/finance/cost-centers/${c.id}`, { method: 'PATCH', body: { active: true } })
    load()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Centros de custo"
        subtitle={loading ? 'Carregando...' : `${items.filter((i) => i.active).length} ativos`}
        actions={<>
          <Toggle checked={showInactive} onChange={setShowInactive} label="Mostrar inativos" />
          <button onClick={() => { setError(null); setForm({ name: '', code: '', parentId: '', active: true }) }} className="btn-primary text-sm"><Plus size={15} />Novo centro de custo</button>
        </>}
      />

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Código</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Centro de custo</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Lançamentos</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 4 }).map((__, j) => <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>)}</tr>)
            ) : rows.length === 0 ? (
              <tr><td colSpan={4}><EmptyState icon={<Network size={32} strokeWidth={1} />} text="Nenhum centro de custo." /></td></tr>
            ) : rows.map((c) => {
              const used = c.entryCount > 0 || items.some((x) => x.parentId === c.id)
              return (
                <tr key={c.id} className={cn('hover:bg-gray-50', !c.active && 'opacity-50')}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">{c.code ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span style={{ paddingLeft: c.depth * 18 }} className={cn('inline-flex items-center gap-2', c.depth === 0 ? 'font-medium text-gray-900' : 'text-gray-700')}>
                      {c.name}{!c.active && <Badge tone="red">Inativo</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{c.entryCount}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => { setError(null); setForm({ id: c.id, name: c.name, code: c.code ?? '', parentId: c.parentId ?? '', active: c.active }) }} className={iconBtn} title="Editar"><Pencil size={15} /></button>
                    {c.active
                      ? <button onClick={() => remove(c)} className={iconBtn} title={used ? 'Inativar' : 'Excluir'}>{used ? <Power size={15} /> : <Trash2 size={15} />}</button>
                      : <button onClick={() => reactivate(c)} className={iconBtn} title="Reativar"><Power size={15} /></button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal
          title={form.id ? 'Editar centro de custo' : 'Novo centro de custo'}
          onClose={() => setForm(null)}
          footer={<>
            <button onClick={() => setForm(null)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
          </>}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><FieldLabel>Código</FieldLabel><input className={cn(inputClass, 'mt-1 font-mono')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div className="col-span-2"><FieldLabel required>Nome</FieldLabel><input className={cn(inputClass, 'mt-1')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
            </div>
            <div><FieldLabel>Centro de custo pai</FieldLabel>
              <select className={cn(inputClass, 'mt-1')} value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">— Nenhum —</option>
                {ordered(items).filter((c) => !blocked.has(c.id) && (c.active || c.id === form.parentId)).map((c) => <option key={c.id} value={c.id}>{' '.repeat(c.depth * 3)}{c.name}</option>)}
              </select>
            </div>
            {form.id && <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Ativo" />}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
