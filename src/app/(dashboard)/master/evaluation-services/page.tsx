'use client'

// =============================================================================
// /master/evaluation-services — CRUD do catálogo de serviços da avaliação.
// Cada tenant tem sua própria lista (herda do global se não customizou).
// MASTER pode editar o global (fallback de todos os tenants) trocando o scope.
// =============================================================================

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Plus, Trash2, GripVertical, Save, RotateCcw, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface ServiceCatalogItem {
  key:            string
  label:          string
  hint?:          string
  serviceType:    string
  suggestedCost?: number
  askCost:        boolean
  active:         boolean
  isBuiltIn:      boolean
  order:          number
}

const SERVICE_TYPES = ['TROCA_OLEO', 'REVISAO', 'CAUTELAR', 'PERICIA', 'HIGIENIZACAO', 'POLIMENTO', 'PINTURA', 'FUNILARIA', 'REPARO_ELETRICO', 'AR_CONDICIONADO', 'ALINHAMENTO', 'BALANCEAMENTO', 'TROCA_PNEU', 'TROCA_PECA', 'OUTRO']

export default function MasterEvaluationServicesPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const canGlobal = role === 'MASTER'

  const [items,   setItems]   = useState<ServiceCatalogItem[]>([])
  const [scope,   setScope]   = useState<'tenant' | 'global'>('tenant')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [ok,      setOk]      = useState('')

  async function load(scopeArg: 'tenant' | 'global') {
    setLoading(true); setError('')
    try {
      const q = scopeArg === 'global' ? '?scope=global' : ''
      const r = await fetch(`/api/master/evaluation-services-catalog${q}`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? 'Falha ao carregar')
      setItems(d.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(scope) }, [scope])

  function updateItem(idx: number, patch: Partial<ServiceCatalogItem>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function moveUp(idx: number) {
    if (idx === 0) return
    setItems((prev) => {
      const arr = [...prev]
      ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
      return arr.map((it, i) => ({ ...it, order: (i + 1) * 10 }))
    })
  }
  function moveDown(idx: number) {
    if (idx >= items.length - 1) return
    setItems((prev) => {
      const arr = [...prev]
      ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
      return arr.map((it, i) => ({ ...it, order: (i + 1) * 10 }))
    })
  }
  function removeItem(idx: number) {
    const it = items[idx]
    if (it.isBuiltIn) {
      // Built-in não deleta — apenas desativa
      updateItem(idx, { active: false })
      return
    }
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  function addNew() {
    const now = Date.now()
    setItems((prev) => [...prev, {
      key: `svc.custom.${now}`,
      label: 'Novo serviço',
      serviceType: 'OUTRO',
      suggestedCost: undefined,
      askCost: true,
      active: true,
      isBuiltIn: false,
      order: (prev.length + 1) * 10,
    }])
  }

  async function save() {
    setSaving(true); setError(''); setOk('')
    try {
      const r = await fetch('/api/master/evaluation-services-catalog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, scope }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? 'Falha ao salvar')
      setItems(d.data ?? items)
      setOk('Catálogo salvo com sucesso.')
      setTimeout(() => setOk(''), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-20 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/master" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Master
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Serviços da avaliação</h1>
      </div>

      <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        Configure os serviços que aparecem na aba <strong>Serviços</strong> da avaliação de veículo (troca de óleo, revisão, higienização, etc). Cada avaliação marca quais serão executados e informa o custo estimado.
      </div>

      {canGlobal && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700">Escopo:</span>
          <button type="button" onClick={() => setScope('tenant')} className={`rounded-full px-3 py-1 text-xs font-medium ${scope === 'tenant' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}`}>Minha loja</button>
          <button type="button" onClick={() => setScope('global')} className={`rounded-full px-3 py-1 text-xs font-medium ${scope === 'global' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}`}>Global (padrão de todas as lojas)</button>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left">Ordem</th>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-right">Custo sugerido</th>
                <th className="px-3 py-2 text-center">Ativo</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it, idx) => (
                <tr key={it.key} className={!it.active ? 'bg-gray-50/60' : ''}>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">▲</button>
                      <button type="button" onClick={() => moveDown(idx)} disabled={idx === items.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">▼</button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={it.label}
                      onChange={(e) => updateItem(idx, { label: e.target.value })}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    {it.isBuiltIn && <span className="text-[10px] text-gray-400">padrão</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={it.serviceType}
                      onChange={(e) => updateItem(idx, { serviceType: e.target.value })}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={it.suggestedCost ?? ''}
                      onChange={(e) => updateItem(idx, { suggestedCost: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      placeholder="R$"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={it.active}
                      onChange={(e) => updateItem(idx, { active: e.target.checked })}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-red-600 hover:text-red-800"
                      title={it.isBuiltIn ? 'Desativar' : 'Remover'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <div className="flex gap-2">
          <button type="button" onClick={addNew} className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100">
            <Plus className="h-3.5 w-3.5" /> Adicionar serviço
          </button>
          <button type="button" onClick={() => load(scope)} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <RotateCcw className="h-3.5 w-3.5" /> Descartar mudanças
          </button>
        </div>
        <button type="button" onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar catálogo
        </button>
      </div>
    </div>
  )
}
