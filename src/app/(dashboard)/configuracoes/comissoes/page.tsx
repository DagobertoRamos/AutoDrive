'use client'

// =============================================================================
// Configurações de Comissões — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Save, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SaleRange {
  id: string
  from: number
  to: number
  value: number
}

interface ServiceCommission {
  id: string
  serviceId: string
  serviceName: string
  commissionValue: number
}

interface WarrantyCommission {
  id: string
  warrantyId: string
  warrantyName: string
  commissionValue: number
}

interface ReturnCommission {
  id: string
  type: 'R1' | 'R2' | 'R3' | 'R4' | 'R5'
  calcType: 'FIXED' | 'PERCENTAGE'
  value: number
}

interface ServiceOption {
  id: string
  name: string
}

interface WarrantyOption {
  id: string
  name: string
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function inputClass(extra?: string) {
  return cn(
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
    extra
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-brand-400 px-4 py-2 text-sm font-medium text-brand-600 hover:border-brand-600 hover:bg-brand-50 transition-colors"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  )
}

// -----------------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------------

export default function ConfiguracoesComissoesPage() {
  // Section 1: Sale ranges
  const [saleRanges, setSaleRanges] = useState<SaleRange[]>([])

  // Section 2: Purchase commission
  const [purchaseCommission, setPurchaseCommission] = useState<number>(0)

  // Section 3: Document commission
  const [documentCommission, setDocumentCommission] = useState<number>(0)

  // Section 4: Service commissions
  const [serviceCommissions, setServiceCommissions] = useState<ServiceCommission[]>([])
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([])

  // Section 5: Warranty commissions
  const [warrantyCommissions, setWarrantyCommissions] = useState<WarrantyCommission[]>([])
  const [warrantyOptions, setWarrantyOptions] = useState<WarrantyOption[]>([])

  // Section 6: Return commissions
  const [returnCommissions, setReturnCommissions] = useState<ReturnCommission[]>([])

  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Load all data
  useEffect(() => {
    // Load commission settings
    fetch('/api/settings/commissions')
      .then((r) => r.json())
      .then((d) => {
        if (!d?.data) return
        const s = d.data
        if (s.saleRanges) setSaleRanges(s.saleRanges)
        if (s.purchaseCommission !== undefined) setPurchaseCommission(s.purchaseCommission)
        if (s.documentCommission !== undefined) setDocumentCommission(s.documentCommission)
        if (s.serviceCommissions) setServiceCommissions(s.serviceCommissions)
        if (s.warrantyCommissions) setWarrantyCommissions(s.warrantyCommissions)
        if (s.returnCommissions) setReturnCommissions(s.returnCommissions)
      })
      .catch(() => {})

    // Load service options
    fetch('/api/services')
      .then((r) => r.json())
      .then((d) => setServiceOptions(d?.data ?? []))
      .catch(() => setServiceOptions([]))

    // Load warranty options
    fetch('/api/warranties')
      .then((r) => r.json())
      .then((d) => setWarrantyOptions(d?.data ?? []))
      .catch(() => setWarrantyOptions([]))
  }, [])

  // ── Sale ranges ──
  const addSaleRange = () => {
    setSaleRanges((prev) => [...prev, { id: uid(), from: 0, to: 0, value: 0 }])
  }
  const updateSaleRange = (id: string, field: keyof Omit<SaleRange, 'id'>, value: number) => {
    setSaleRanges((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }
  const removeSaleRange = (id: string) => {
    setSaleRanges((prev) => prev.filter((r) => r.id !== id))
  }

  // ── Service commissions ──
  const addServiceCommission = () => {
    setServiceCommissions((prev) => [...prev, { id: uid(), serviceId: '', serviceName: '', commissionValue: 0 }])
  }
  const updateServiceCommission = useCallback((id: string, serviceId: string, commissionValue: number) => {
    const found = serviceOptions.find((s) => s.id === serviceId)
    setServiceCommissions((prev) =>
      prev.map((sc) =>
        sc.id === id ? { ...sc, serviceId, serviceName: found?.name ?? '', commissionValue } : sc
      )
    )
  }, [serviceOptions])
  const removeServiceCommission = (id: string) => {
    setServiceCommissions((prev) => prev.filter((sc) => sc.id !== id))
  }

  // ── Warranty commissions ──
  const addWarrantyCommission = () => {
    setWarrantyCommissions((prev) => [...prev, { id: uid(), warrantyId: '', warrantyName: '', commissionValue: 0 }])
  }
  const updateWarrantyCommission = useCallback((id: string, warrantyId: string, commissionValue: number) => {
    const found = warrantyOptions.find((w) => w.id === warrantyId)
    setWarrantyCommissions((prev) =>
      prev.map((wc) =>
        wc.id === id ? { ...wc, warrantyId, warrantyName: found?.name ?? '', commissionValue } : wc
      )
    )
  }, [warrantyOptions])
  const removeWarrantyCommission = (id: string) => {
    setWarrantyCommissions((prev) => prev.filter((wc) => wc.id !== id))
  }

  // ── Return commissions ──
  const addReturnCommission = () => {
    setReturnCommissions((prev) => [...prev, { id: uid(), type: 'R1', calcType: 'FIXED', value: 0 }])
  }
  const updateReturnCommission = (id: string, field: keyof Omit<ReturnCommission, 'id'>, value: string | number) => {
    setReturnCommissions((prev) =>
      prev.map((rc) => (rc.id === id ? { ...rc, [field]: value } : rc))
    )
  }
  const removeReturnCommission = (id: string) => {
    setReturnCommissions((prev) => prev.filter((rc) => rc.id !== id))
  }

  // ── Save ──
  const handleSave = async () => {
    setSaving(true)
    setAlert(null)
    try {
      const res = await fetch('/api/settings/commissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleRanges,
          purchaseCommission,
          documentCommission,
          serviceCommissions,
          warrantyCommissions,
          returnCommissions,
        }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      setAlert({ type: 'success', message: 'Configurações de comissões salvas!' })
    } catch {
      setAlert({ type: 'error', message: 'Erro ao salvar. Tente novamente.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações de Comissões</h1>
        <p className="mt-1 text-sm text-gray-500">Defina as regras de comissionamento do sistema.</p>
      </div>

      {/* ── 1. Faixas de vendas ── */}
      <SectionCard title="1. Faixas de Vendas">
        <p className="mb-3 text-xs text-gray-500">Defina o valor de comissão para cada faixa de quantidade de vendas.</p>
        <div className="space-y-2">
          {saleRanges.map((range) => (
            <div key={range.id} className="flex items-center gap-3">
              <span className="shrink-0 text-xs text-gray-500">De</span>
              <input
                type="number"
                min={0}
                className={inputClass('w-24')}
                value={range.from}
                onChange={(e) => updateSaleRange(range.id, 'from', Number(e.target.value))}
                placeholder="0"
              />
              <span className="shrink-0 text-xs text-gray-500">até</span>
              <input
                type="number"
                min={0}
                className={inputClass('w-24')}
                value={range.to}
                onChange={(e) => updateSaleRange(range.id, 'to', Number(e.target.value))}
                placeholder="10"
              />
              <span className="shrink-0 text-xs text-gray-500">vendas =</span>
              <input
                type="number"
                min={0}
                step={0.01}
                className={inputClass('w-32')}
                value={range.value}
                onChange={(e) => updateSaleRange(range.id, 'value', Number(e.target.value))}
                placeholder="0,00"
              />
              <span className="shrink-0 text-xs text-gray-500">/ venda</span>
              <button
                type="button"
                onClick={() => removeSaleRange(range.id)}
                className="ml-auto rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {saleRanges.length === 0 && (
            <p className="text-sm text-gray-400">Nenhuma faixa cadastrada.</p>
          )}
        </div>
        <AddButton onClick={addSaleRange} label="Adicionar faixa" />
      </SectionCard>

      {/* ── 2. Comissão por compra ── */}
      <SectionCard title="2. Comissão por Compra">
        <p className="mb-3 text-xs text-gray-500">Valor fixo de comissão por cada veículo comprado.</p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">R$</span>
          <input
            type="number"
            min={0}
            step={0.01}
            className={inputClass('w-48')}
            value={purchaseCommission}
            onChange={(e) => setPurchaseCommission(Number(e.target.value))}
            placeholder="0,00"
          />
          <span className="text-sm text-gray-500">por compra</span>
        </div>
        <p className="mt-2 text-xs text-gray-400">Valor atual: {formatMoney(purchaseCommission)}</p>
      </SectionCard>

      {/* ── 3. Comissão por documento ── */}
      <SectionCard title="3. Comissão por Documento">
        <p className="mb-3 text-xs text-gray-500">Valor fixo de comissão por documento vendido.</p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">R$</span>
          <input
            type="number"
            min={0}
            step={0.01}
            className={inputClass('w-48')}
            value={documentCommission}
            onChange={(e) => setDocumentCommission(Number(e.target.value))}
            placeholder="0,00"
          />
          <span className="text-sm text-gray-500">por documento</span>
        </div>
        <p className="mt-2 text-xs text-gray-400">Valor atual: {formatMoney(documentCommission)}</p>
      </SectionCard>

      {/* ── 4. Serviços ── */}
      <SectionCard title="4. Comissão por Serviço">
        <p className="mb-3 text-xs text-gray-500">Configure o valor de comissão para cada tipo de serviço.</p>
        <div className="space-y-2">
          {serviceCommissions.map((sc) => (
            <div key={sc.id} className="flex items-center gap-3">
              <select
                className={inputClass('flex-1')}
                value={sc.serviceId}
                onChange={(e) => updateServiceCommission(sc.id, e.target.value, sc.commissionValue)}
              >
                <option value="">Selecione um serviço</option>
                {serviceOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                className={inputClass('w-36')}
                value={sc.commissionValue}
                onChange={(e) => updateServiceCommission(sc.id, sc.serviceId, Number(e.target.value))}
                placeholder="Comissão R$"
              />
              <button
                type="button"
                onClick={() => removeServiceCommission(sc.id)}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {serviceCommissions.length === 0 && (
            <p className="text-sm text-gray-400">Nenhum serviço configurado.</p>
          )}
        </div>
        <AddButton onClick={addServiceCommission} label="Adicionar serviço" />
      </SectionCard>

      {/* ── 5. Garantias ── */}
      <SectionCard title="5. Comissão por Garantia">
        <p className="mb-3 text-xs text-gray-500">Configure o valor de comissão para cada tipo de garantia.</p>
        <div className="space-y-2">
          {warrantyCommissions.map((wc) => (
            <div key={wc.id} className="flex items-center gap-3">
              <select
                className={inputClass('flex-1')}
                value={wc.warrantyId}
                onChange={(e) => updateWarrantyCommission(wc.id, e.target.value, wc.commissionValue)}
              >
                <option value="">Selecione uma garantia</option>
                {warrantyOptions.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                className={inputClass('w-36')}
                value={wc.commissionValue}
                onChange={(e) => updateWarrantyCommission(wc.id, wc.warrantyId, Number(e.target.value))}
                placeholder="Comissão R$"
              />
              <button
                type="button"
                onClick={() => removeWarrantyCommission(wc.id)}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {warrantyCommissions.length === 0 && (
            <p className="text-sm text-gray-400">Nenhuma garantia configurada.</p>
          )}
        </div>
        <AddButton onClick={addWarrantyCommission} label="Adicionar garantia" />
      </SectionCard>

      {/* ── 6. Retornos ── */}
      <SectionCard title="6. Comissão por Retorno">
        <p className="mb-3 text-xs text-gray-500">Configure as comissões para cada tipo de retorno (R1 a R5).</p>
        <div className="space-y-2">
          {returnCommissions.map((rc) => (
            <div key={rc.id} className="flex items-center gap-3">
              <select
                className={inputClass('w-24')}
                value={rc.type}
                onChange={(e) => updateReturnCommission(rc.id, 'type', e.target.value)}
              >
                {['R1', 'R2', 'R3', 'R4', 'R5'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                className={inputClass('w-40')}
                value={rc.calcType}
                onChange={(e) => updateReturnCommission(rc.id, 'calcType', e.target.value)}
              >
                <option value="FIXED">Valor Fixo</option>
                <option value="PERCENTAGE">Percentual</option>
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                className={inputClass('w-36')}
                value={rc.value}
                onChange={(e) => updateReturnCommission(rc.id, 'value', Number(e.target.value))}
                placeholder={rc.calcType === 'PERCENTAGE' ? 'Ex: 5 (%)' : 'Valor R$'}
              />
              {rc.calcType === 'PERCENTAGE' && (
                <span className="text-sm text-gray-500">%</span>
              )}
              <button
                type="button"
                onClick={() => removeReturnCommission(rc.id)}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {returnCommissions.length === 0 && (
            <p className="text-sm text-gray-400">Nenhum retorno configurado.</p>
          )}
        </div>
        <AddButton onClick={addReturnCommission} label="Adicionar retorno" />
      </SectionCard>

      {/* Fixed save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-6 py-4 shadow-lg">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          {alert ? (
            <div className={cn('flex items-center gap-2 text-sm font-medium', alert.type === 'success' ? 'text-green-700' : 'text-red-700')}>
              {alert.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {alert.message}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Lembre-se de salvar as alterações.</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </div>
    </div>
  )
}
