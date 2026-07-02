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
import { maskBRL, parseBRL } from '@/lib/masks'

interface Props {
  dealId:   string
  canEdit:  boolean
  onReload: () => void
  onToast:  (msg: string, kind?: 'success' | 'error') => void
}

interface Warranty {
  id: string; name: string; coverageType: string | null; durationYears: 1 | 2
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
  const [soldPrice, setSoldPrice] = useState(0)
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
  const fullPrice = selected ? num(selected.fullPrice) : 0
  const discountPrice = selected ? num(selected.reducedPrice) : 0
  const premiumValue = selected && selected.hasPremiumAddon && premium ? num(selected.premiumAddonValue) : 0
  const finalPrice = soldPrice
  const commissionStatus = !selected
    ? 'none'
    : finalPrice >= fullPrice
      ? 'full'
      : finalPrice >= discountPrice
        ? 'discount'
        : 'zero'
  const commBase = selected
    ? commissionStatus === 'full'
      ? num(selected.fullSaleCommissionValue)
      : commissionStatus === 'discount'
        ? num(selected.reducedSaleCommissionValue)
        : 0
    : 0
  const commPremium = selected && commissionStatus !== 'zero' && selected.hasPremiumAddon && premium ? num(selected.premiumAddonCommissionValue) : 0
  const commTotal = commBase + commPremium
  const commissionLabel = commissionStatus === 'full'
    ? 'comissão cheia'
    : commissionStatus === 'discount'
      ? 'comissão com desconto'
      : 'sem comissão'

  const add = async () => {
    if (!warrantyId) { onToast('Selecione uma garantia.', 'error'); return }
    if (soldPrice <= 0) { onToast('Informe o valor vendido da garantia.', 'error'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/warranty-sales`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ warrantyId, soldPrice, clientBoughtPremium: premium }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Erro ao vender garantia')
      onToast('Garantia vendida.', 'success')
      setWarrantyId(''); setSoldPrice(0); setPremium(false)
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
                <select className={inputCls} value={warrantyId} onChange={(e) => {
                  const id = e.target.value
                  const next = catalog.find((w) => w.id === id)
                  setWarrantyId(id)
                  setSoldPrice(next ? num(next.fullPrice) : 0)
                  setPremium(false)
                }}>
                  <option value="">Selecione...</option>
                  {catalog.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.durationYears === 2 ? '02 anos' : '01 ano'}{w.coverageType ? ` (${w.coverageType})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Valor vendido</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputCls}
                  value={maskBRL(soldPrice ? Math.round(soldPrice * 100).toString() : '')}
                  onChange={(e) => setSoldPrice(parseBRL(maskBRL(e.target.value)) ?? 0)}
                  placeholder="0,00"
                />
              </div>
            </div>

            {selected?.hasPremiumAddon && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Cliente comprou o adicional {selected.premiumAddonName || 'prêmio/luxo'}? (+{brl(num(selected.premiumAddonValue))})
              </label>
            )}

            {selected && (
              <div className={cn('flex items-center justify-between rounded-lg px-3 py-2 text-sm', commissionStatus === 'zero' ? 'bg-amber-50' : 'bg-white')}>
                <span className="text-gray-600">
                  Cheio: <span className="font-medium text-gray-900">{brl(fullPrice)}</span>
                  <span className="text-gray-400"> · desconto </span>
                  <span className="font-medium text-gray-900">{brl(discountPrice)}</span>
                  <span className="text-gray-400"> · vendido </span>
                  <span className="font-semibold text-gray-900">{brl(finalPrice)}</span>
                  <span className="text-gray-400"> · {commissionLabel} </span>
                  <span className={cn('font-semibold', commissionStatus === 'zero' ? 'text-amber-700' : 'text-brand-700')}>{brl(commTotal)}</span>
                  {premiumValue > 0 && <span className="text-gray-400"> · adicional {brl(premiumValue)}</span>}
                  {commissionStatus === 'zero' && <span className="block text-xs text-amber-700">Valor vendido abaixo do valor com desconto. Esta garantia não gera comissão.</span>}
                </span>
                <button
                  onClick={add} disabled={saving || !warrantyId || soldPrice <= 0}
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
