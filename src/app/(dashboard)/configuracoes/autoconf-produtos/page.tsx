'use client'

import { useEffect, useState, useCallback } from 'react'

interface ProductMap {
  id: string
  externalTipoDebitoId: string | null
  externalProdutoId: string | null
  externalLabel: string
  canonicalCategory: string
  autoMapped: boolean
  active: boolean
  firstSeenAt: string
  lastSeenAt: string
}

const CATEGORIES = [
  { value: 'WARRANTY', label: 'Garantia' },
  { value: 'DOCUMENTATION', label: 'Documentação' },
  { value: 'FINANCING_PAYOFF', label: 'Quitação/Financ.' },
  { value: 'INSPECTION', label: 'Perícia/Laudo' },
  { value: 'LICENSING', label: 'Licenciamento' },
  { value: 'TAX', label: 'Imposto (IPVA)' },
  { value: 'FINE', label: 'Multa' },
  { value: 'ACCESSORY', label: 'Acessório' },
  { value: 'SERVICE', label: 'Serviço/Taxa' },
  { value: 'OTHER', label: 'Outro' },
]

const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v

export default function AutoconfProdutosPage() {
  const [items, setItems] = useState<ProductMap[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/autoconf-products')
      const j = await res.json()
      if (j.success) setItems(j.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function updateItem(id: string, data: Record<string, unknown>) {
    setSaving(id)
    try {
      const res = await fetch(`/api/settings/autoconf-products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const j = await res.json()
      if (j.success) {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...j.data } : it)))
      }
    } finally {
      setSaving(null)
    }
  }

  const filtered = filter
    ? items.filter((it) => it.externalLabel.toLowerCase().includes(filter.toLowerCase()) || catLabel(it.canonicalCategory).toLowerCase().includes(filter.toLowerCase()))
    : items

  const autoCount = items.filter((it) => it.autoMapped).length
  const confirmedCount = items.filter((it) => !it.autoMapped).length

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Produtos AutoConf</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Mapeamento de tipos de débito/produto importados do AutoConf para categorias canônicas do AutoDrive.
          Itens marcados como &quot;auto&quot; foram classificados por regra e podem ser reclassificados.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          placeholder="Filtrar por nome ou categoria..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>{items.length} total</span>
          <span className="text-amber-600">{autoCount} auto</span>
          <span className="text-green-600">{confirmedCount} confirmados</span>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          {items.length === 0 ? 'Nenhum produto importado ainda. Importe negociações com a extensão V2 ativa.' : 'Nenhum resultado para o filtro.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                <th className="px-4 py-3">Rótulo AutoConf</th>
                <th className="px-4 py-3">IDs externos</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Visto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((it) => (
                <tr key={it.id} className={`${!it.active ? 'opacity-50' : ''} ${saving === it.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                    {it.externalLabel}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                    {[it.externalTipoDebitoId && `tipo:${it.externalTipoDebitoId}`, it.externalProdutoId && `prod:${it.externalProdutoId}`].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={it.canonicalCategory}
                      onChange={(e) => updateItem(it.id, { canonicalCategory: e.target.value })}
                      disabled={saving === it.id}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    {it.autoMapped && (
                      <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">auto</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateItem(it.id, { active: !it.active })}
                      disabled={saving === it.id}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${it.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                    >
                      {it.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(it.lastSeenAt).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
