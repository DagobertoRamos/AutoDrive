'use client'

// =============================================================================
// Configurações da Loja > F&I > Retornos por Banco (Fase 2b.2).
// Regras de retorno (% ou valor fixo) por banco e faixa de parcelas.
// Consome /api/settings/financing/returns (+[id]). RBAC financing.config.
// Vendedor NÃO altera retorno (gate financing.config).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Pencil, Trash2, Percent, X, Save, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL } from '@/lib/masks'
import { useFiPermissions } from '@/components/financing/useFiPermissions'
import { ReturnProfessionalSettings } from '@/components/financing/ReturnProfessionalSettings'

const CONFIG_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO']

interface Row { id: string; bankId: string | null; bankName: string; percent: number | null; fixedValue: number | null; minInstallments: number | null; maxInstallments: number | null; notes: string | null; active: boolean }
interface Bank { id: string; name: string }
interface Form { bankId: string; percent: string; fixedValue: number; minInstallments: string; maxInstallments: string; notes: string; active: boolean }
const emptyForm: Form = { bankId: '', percent: '', fixedValue: 0, minInstallments: '', maxInstallments: '', notes: '', active: true }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FiReturnsPage() {
  const { data: session } = useSession()
  const { perms } = useFiPermissions()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || CONFIG_ROLES.includes(role)
  const canEdit = perms.alterarRetorno

  const [items, setItems] = useState<Row[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/financing/returns', { credentials: 'include' })
      const json = await res.json()
      setItems(json?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (allowed) load() }, [allowed, load])

  useEffect(() => {
    if (!allowed) return
    (async () => {
      try {
        const b = await fetch('/api/financing/banks?active=true', { credentials: 'include' }).then((r) => r.json())
        setBanks((b?.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
      } catch { /* sem bancos */ }
    })()
  }, [allowed])

  const openNew = () => { setEditingId(null); setForm(emptyForm); setError(null); setModal(true) }
  const openEdit = (r: Row) => {
    setEditingId(r.id)
    setForm({ bankId: r.bankId ?? '', percent: r.percent != null ? String(r.percent) : '', fixedValue: r.fixedValue ?? 0, minInstallments: r.minInstallments != null ? String(r.minInstallments) : '', maxInstallments: r.maxInstallments != null ? String(r.maxInstallments) : '', notes: r.notes ?? '', active: r.active })
    setError(null); setModal(true)
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const payload: Record<string, unknown> = {
        bankId: form.bankId || null,
        percent: form.percent.trim() ? Number(form.percent.replace(',', '.')) : null,
        fixedValue: form.fixedValue || null,
        minInstallments: form.minInstallments.trim() ? Number(form.minInstallments) : null,
        maxInstallments: form.maxInstallments.trim() ? Number(form.maxInstallments) : null,
        notes: form.notes || null,
        active: form.active,
      }
      const url = editingId ? `/api/settings/financing/returns/${editingId}` : '/api/settings/financing/returns'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const remove = async (r: Row) => {
    if (!confirm(`Excluir a regra de retorno de "${r.bankName}"?`)) return
    await fetch(`/api/settings/financing/returns/${r.id}`, { method: 'DELETE', credentials: 'include' }); await load()
  }

  const range = (r: Row) => {
    if (r.minInstallments && r.maxInstallments) return `${r.minInstallments}–${r.maxInstallments}x`
    if (r.minInstallments) return `≥ ${r.minInstallments}x`
    if (r.maxInstallments) return `≤ ${r.maxInstallments}x`
    return 'Qualquer prazo'
  }

  if (session && !allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Configuração restrita</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">Os retornos por banco são definidos pela loja (administração/gerência/financeiro). Vendedores não alteram retornos.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Retorno / F&amp;I</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} regra(s) por banco · faixa, ILA e IOF configuráveis`}</p>
        </div>
        {canEdit && <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Nova regra</button>}
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500"><Lock size={15} />Somente leitura: seu perfil não pode alterar retorno (Permissões F&amp;I da loja).</div>
      )}

      <ReturnProfessionalSettings canEdit={canEdit} />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Banco', 'Retorno', 'Faixa de parcelas', 'Observações', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center"><Percent size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma regra de retorno cadastrada.</p></td></tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id} className={cn('hover:bg-gray-50', !r.active && 'opacity-50')}>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.bankName}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{r.percent != null ? `${r.percent}%` : ''}{r.percent != null && r.fixedValue != null ? ' + ' : ''}{r.fixedValue != null ? fmt(r.fixedValue) : ''}{r.percent == null && r.fixedValue == null ? '—' : ''}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{range(r)}</td>
                    <td className="px-4 py-3 text-gray-600"><span className="block max-w-[220px] truncate">{r.notes || '—'}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.active ? 'Ativo' : 'Inativo'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {canEdit ? (<>
                        <button onClick={() => openEdit(r)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                        <button onClick={() => remove(r)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                      </>) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar regra' : 'Nova regra de retorno'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Banco</label><select className={inputCls} value={form.bankId} onChange={(e) => set('bankId', e.target.value)}><option value="">Todos os bancos</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}{editingId && form.bankId && !banks.some((b) => b.id === form.bankId) && <option value={form.bankId}>Banco atual</option>}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Percentual (%)</label><input type="text" inputMode="decimal" className={inputCls} value={form.percent} onChange={(e) => set('percent', e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="Ex: 2,5" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Valor fixo</label><input type="text" inputMode="numeric" className={inputCls} value={maskBRL(form.fixedValue ? Math.round(form.fixedValue * 100).toString() : '')} onChange={(e) => set('fixedValue', parseBRL(maskBRL(e.target.value)) ?? 0)} placeholder="0,00" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Parcela mínima</label><input type="number" min={1} className={inputCls} value={form.minInstallments} onChange={(e) => set('minInstallments', e.target.value)} placeholder="Ex: 1" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Parcela máxima</label><input type="number" min={1} className={inputCls} value={form.maxInstallments} onChange={(e) => set('maxInstallments', e.target.value)} placeholder="Ex: 60" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><textarea className={cn(inputCls, 'min-h-[60px] resize-y')} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Regra ativa</label>
              {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
