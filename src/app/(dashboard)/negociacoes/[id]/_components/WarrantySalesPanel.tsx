'use client'

// =============================================================================
// WarrantySalesPanel — Venda de garantia dentro da negociação (autocontido)
// Seleciona garantia + tipo (cheio/reduzido) + adicional prêmio. Preço e
// comissão calculados (preview); o backend recalcula e registra a comissão.
// Consome /api/warranties e /api/negotiations/[id]/warranty-sales.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, RefreshCw, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  dealId:   string
  canEdit:  boolean
  onReload: () => void
  onToast:  (msg: string, kind?: 'success' | 'error') => void
}

interface Warranty {
  id: string; name: string; coverageType: string | null
  fullPrice: number | string; reducedPrice: number | string
  hasPremiumAddon: boolean; premiumAddonName: string | null; premiumAddonValue: number | string
  fullSaleCommissionValue: number | string; reducedSaleCommissionValue: number | string
  premiumAddonCommissionValue: number | string
}
interface Sale {
  id: string; saleType: 'FULL' | 'REDUCED'; finalPrice: number | string; status: string
  hasPremiumAddon: boolean; warranty?: { name: string } | null
}

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0)
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function WarrantySalesPanel({ dealId, canEdit, onReload, onToast }: Props) {
  const [catalog, setCatalog] = useState<Warranty[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [warrantyId, setWarrantyId] = useState('')
  const [saleType, setSaleType] = useState<'FULL' | 'REDUCED'>('FULL')
  const [premium, setPremium] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cat, sl] = await Promise.all([
        fetch('/api/warranties?active=true', { credentials: 'include' }).then((r) => r.json()).catch(() => null),
        fetch(`/api/negotiations/${dealId}/warranty-sales`, { credentials: 'include' }).then((r) => r.json()).catch(() => null),
      ])
      setCatalog(cat?.data ?? [])
      setSales(sl?.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => { load() }, [load])

  const selected = catalog.find((w) => w.id === warrantyId) || null
  const base = selected ? (saleType === 'FULL' ? num(selected.fullPrice) : num(selected.reducedPrice)) : 0
  const premiumValue = selected && selected.hasPremiumAddon && premium ? num(selected.premiumAddonValue) : 0
  const finalPrice = base + premiumValue
  const commBase = selected ? (saleType === 'FULL' ? num(selected.fullSaleCommissionValue) : num(selected.reducedSaleCommissionValue)) : 0
  const commPremium = selected && selected.hasPremiumAddon && premium ? num(selected.premiumAddonCommissionValue) : 0
  const commTotal = commBase + commPremium

  const add = async () => {
    if (!warrantyId) { onToast('Selecione uma garantia.', 'error'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/warranty-sales`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ warrantyId, saleType, clientBoughtPremium: premium }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Erro ao vender garantia')
      onToast('Garantia vendida.', 'success')
      setWarrantyId(''); setSaleType('FULL'); setPremium(false)
      await load(); onReload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao vender garantia.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const cancel = async (sale: Sale) => {
    if (!confirm('Cancelar esta venda de garantia?')) return
    try {
      const res = await fetch(`/api/negotiations/${dealId}/warranty-sales/${sale.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error()
      onToast('Venda de garantia cancelada.', 'success')
      await load(); onReload()
    } catch { onToast('Erro ao cancelar.', 'error') }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-brand-700" />
          <h3 className="text-sm font-semibold text-gray-800">Garantia</h3>
        </div>
        <button onClick={load} disabled={loading} className="text-gray-400 hover:text-gray-600" aria-label="Recarregar">
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Vendas registradas */}
        {sales.length > 0 && (
          <div className="divide-y divide-gray-50 rounded-lg border border-gray-100">
            {sales.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-800">{s.warranty?.name ?? 'Garantia'}</p>
                  <p className="text-xs text-gray-400">
                    {s.saleType === 'FULL' ? 'Cheio' : 'Reduzido'}{s.hasPremiumAddon ? ' + prêmio' : ''} · {brl(num(s.finalPrice))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
                    s.status === 'ATIVA' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                    {s.status}
                  </span>
                  {canEdit && s.status === 'ATIVA' && (
                    <button onClick={() => cancel(s)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Cancelar">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Formulário de venda */}
        {canEdit && (
          <div className="space-y-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Garantia</label>
                <select className={inputCls} value={warrantyId} onChange={(e) => { setWarrantyId(e.target.value); setPremium(false) }}>
                  <option value="">Selecione...</option>
                  {catalog.map((w) => <option key={w.id} value={w.id}>{w.name}{w.coverageType ? ` (${w.coverageType})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Tipo de venda</label>
                <select className={inputCls} value={saleType} onChange={(e) => setSaleType(e.target.value as 'FULL' | 'REDUCED')}>
                  <option value="FULL">Valor cheio</option>
                  <option value="REDUCED">Valor reduzido</option>
                </select>
              </div>
            </div>

            {selected?.hasPremiumAddon && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Cliente comprou o adicional {selected.premiumAddonName || 'prêmio/luxo'}? (+{brl(num(selected.premiumAddonValue))})
              </label>
            )}

            {selected && (
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-gray-600">
                  Preço: <span className="font-semibold text-gray-900">{brl(finalPrice)}</span>
                  <span className="text-gray-400"> · comissão prevista </span>
                  <span className="font-semibold text-brand-700">{brl(commTotal)}</span>
                </span>
                <button
                  onClick={add} disabled={saving || !warrantyId}
                  className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
                >
                  <Plus size={14} />{saving ? 'Vendendo...' : 'Vender garantia'}
                </button>
              </div>
            )}
          </div>
        )}

        {sales.length === 0 && !canEdit && (
          <p className="py-4 text-center text-sm text-gray-400">Nenhuma garantia vendida.</p>
        )}
      </div>
    </div>
  )
}
