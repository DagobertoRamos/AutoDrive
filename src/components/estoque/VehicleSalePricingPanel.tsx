'use client'

// =============================================================================
// VehicleSalePricingPanel — Painel "Precificação de Venda"
//
// Gerente+: formulário para editar salePrice/promo/availability/notes
// Vendedor: resumo read-only (sem campos sensíveis editáveis)
// Mostra também timeline com as últimas alterações registradas.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, Tag, History, Save, Loader2, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react'
import { maskBRL, parseBRL, numberToBRLMask, formatBRL } from '@/lib/masks'

interface PricingState {
  salePrice:          number | null
  purchasePrice:      number | null
  fipeValue:          number | null
  promoPrice:         number | null
  isPromo:            boolean
  promoStartsAt:      string | null
  promoEndsAt:        string | null
  isAvailableForSale: boolean
  pricingNotes:       string | null
  pricedById:         string | null
  pricedAt:           string | null
  stockStatus:        string | null
  active:             boolean
}

interface PricingHistoryRow {
  id:              string
  changedById:     string
  changedByName:   string | null
  action:          string
  oldSalePrice:    number | null
  newSalePrice:    number | null
  oldPromoPrice:   number | null
  newPromoPrice:   number | null
  oldIsAvailable:  boolean | null
  newIsAvailable:  boolean | null
  oldIsPromo:      boolean | null
  newIsPromo:      boolean | null
  reason:          string | null
  createdAt:       string
}

interface Props {
  vehicleId: string
  canManage: boolean
}

const ACTION_LABEL: Record<string, string> = {
  SET_PRICE:        'Definiu preço de venda',
  UPDATE_PRICE:     'Atualizou preço',
  PROMO_START:      'Iniciou promoção',
  PROMO_END:        'Encerrou promoção',
  AVAILABILITY_ON:  'Publicou no estoque',
  AVAILABILITY_OFF: 'Despublicou do estoque',
  NOTES_UPDATE:     'Atualizou observações',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // yyyy-MM-ddTHH:mm para <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function VehicleSalePricingPanel({ vehicleId, canManage }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [data,    setData]    = useState<PricingState | null>(null)
  const [history, setHistory] = useState<PricingHistoryRow[]>([])

  // Form state (controlled)
  const [salePriceMask,  setSalePriceMask]  = useState('')
  const [promoPriceMask, setPromoPriceMask] = useState('')
  const [isPromo,            setIsPromo]            = useState(false)
  const [promoStartsAt,      setPromoStartsAt]      = useState('')
  const [promoEndsAt,        setPromoEndsAt]        = useState('')
  const [isAvailableForSale, setIsAvailableForSale] = useState(false)
  const [pricingNotes,       setPricingNotes]       = useState('')
  const [reason,             setReason]             = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/vehicles/${vehicleId}/pricing`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json?.error ?? 'Falha ao carregar precificação.')
        return
      }
      const v = json.data.vehicle as PricingState
      setData(v)
      setHistory(json.data.history ?? [])
      setSalePriceMask(numberToBRLMask(v.salePrice))
      setPromoPriceMask(numberToBRLMask(v.promoPrice))
      setIsPromo(!!v.isPromo)
      setPromoStartsAt(fmtDateInput(v.promoStartsAt))
      setPromoEndsAt(fmtDateInput(v.promoEndsAt))
      setIsAvailableForSale(!!v.isAvailableForSale)
      setPricingNotes(v.pricingNotes ?? '')
    } catch {
      setError('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }, [vehicleId])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const body = {
        salePrice:          parseBRL(salePriceMask),
        promoPrice:         isPromo ? parseBRL(promoPriceMask) : null,
        isPromo,
        promoStartsAt:      promoStartsAt || null,
        promoEndsAt:        promoEndsAt   || null,
        isAvailableForSale,
        pricingNotes:       pricingNotes.trim() || null,
        reason:             reason.trim() || null,
      }
      const res  = await fetch(`/api/vehicles/${vehicleId}/pricing`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json?.error ?? 'Falha ao salvar precificação.')
        return
      }
      setSuccess('Precificação salva com sucesso.')
      setReason('')
      await load()
    } catch {
      setError('Erro de conexão.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? 'Sem dados de precificação.'}
      </div>
    )
  }

  // ── Read-only para vendedor ────────────────────────────────────────────────
  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Preço de Venda"      value={formatBRL(data.salePrice)} accent />
          <SummaryCard label="Preço Promocional"   value={data.isPromo ? formatBRL(data.promoPrice) : '—'} />
          <SummaryCard label="Disponível para Venda" value={data.isAvailableForSale ? 'Sim' : 'Não'} />
        </div>
        {data.pricingNotes && (
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Observações</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.pricingNotes}</p>
          </div>
        )}
        <HistoryTimeline history={history} />
      </div>
    )
  }

  // ── Editor gerente+ ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">

      {/* Status atual */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Compra (avaliado)" value={formatBRL(data.purchasePrice)} />
        <SummaryCard label="FIPE atual"        value={formatBRL(data.fipeValue)} />
        <SummaryCard
          label="Última atualização"
          value={data.pricedAt ? fmtDate(data.pricedAt) : '—'}
        />
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Formulário */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldMoney
            label="Preço de Venda"
            value={salePriceMask}
            onChange={(v) => setSalePriceMask(maskBRL(v))}
            icon={<DollarSign className="h-4 w-4 text-brand-500" />}
            required
          />

          <div className="flex flex-col gap-2">
            <ToggleField
              label="Em promoção"
              icon={<Tag className="h-4 w-4 text-amber-500" />}
              checked={isPromo}
              onChange={setIsPromo}
            />
            {isPromo && (
              <FieldMoney
                label="Preço promocional"
                value={promoPriceMask}
                onChange={(v) => setPromoPriceMask(maskBRL(v))}
              />
            )}
          </div>

          {isPromo && (
            <>
              <DateTimeField
                label="Início da promoção"
                value={promoStartsAt}
                onChange={setPromoStartsAt}
              />
              <DateTimeField
                label="Fim da promoção"
                value={promoEndsAt}
                onChange={setPromoEndsAt}
              />
            </>
          )}

          <ToggleField
            label="Disponível para venda (publicar no estoque)"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            checked={isAvailableForSale}
            onChange={setIsAvailableForSale}
          />

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Observações internas</label>
            <textarea
              value={pricingNotes}
              onChange={(e) => setPricingNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Notas visíveis apenas para a equipe..."
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Motivo da alteração (opcional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Ex.: ajuste de margem, alinhamento com FIPE..."
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar precificação'}
          </button>
        </div>
      </div>

      <HistoryTimeline history={history} />
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={[
      'rounded-xl p-4 text-center',
      accent ? 'bg-brand-50 border border-brand-200' : 'bg-gray-50',
    ].join(' ')}>
      <p className={['text-xs', accent ? 'text-brand-600' : 'text-gray-500'].join(' ')}>{label}</p>
      <p className={['mt-1 text-lg font-bold', accent ? 'text-brand-700' : 'text-gray-900'].join(' ')}>{value}</p>
    </div>
  )
}

function FieldMoney({
  label, value, onChange, icon, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  icon?: React.ReactNode
  required?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</div>}
        <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={[
            'w-full rounded-lg border border-gray-300 py-2 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
            icon ? 'pl-16' : 'pl-10',
          ].join(' ')}
          placeholder="0,00"
        />
      </div>
    </div>
  )
}

function ToggleField({
  label, checked, onChange, icon,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        checked
          ? 'border-brand-300 bg-brand-50 text-brand-800'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
      ].join(' ')}
    >
      <span className="flex items-center gap-2 font-medium">
        {icon}
        {label}
      </span>
      {checked
        ? <ToggleRight className="h-5 w-5 text-brand-600" />
        : <ToggleLeft  className="h-5 w-5 text-gray-400" />}
    </button>
  )
}

function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </div>
  )
}

function HistoryTimeline({ history }: { history: PricingHistoryRow[] }) {
  return (
    <div>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <History className="h-4 w-4 text-gray-500" />
        Histórico de Precificação
        <span className="text-xs font-normal text-gray-400">({history.length})</span>
      </h4>
      {history.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
          Nenhuma alteração registrada ainda.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {history.map((h) => {
            const label = ACTION_LABEL[h.action] ?? h.action
            const isPositive = ['AVAILABILITY_ON', 'PROMO_START', 'SET_PRICE'].includes(h.action)
            const isNegative = ['AVAILABILITY_OFF', 'PROMO_END'].includes(h.action)
            return (
              <li
                key={h.id}
                className={[
                  'rounded-lg border px-3 py-2',
                  isPositive ? 'border-emerald-200 bg-emerald-50'
                  : isNegative ? 'border-amber-200 bg-amber-50'
                  : 'border-gray-200 bg-white',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    {isPositive ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    : isNegative ? <XCircle className="h-3.5 w-3.5 text-amber-600" />
                    : <Tag className="h-3.5 w-3.5 text-gray-500" />}
                    {label}
                  </p>
                  <span className="text-xs text-gray-500">{fmtDate(h.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-600">
                  Por <span className="font-medium">{h.changedByName ?? '—'}</span>
                </p>
                {h.oldSalePrice != null || h.newSalePrice != null ? (
                  <p className="mt-1 text-xs text-gray-700">
                    Venda: <span className="line-through opacity-60">{formatBRL(h.oldSalePrice)}</span>
                    {' → '}<span className="font-semibold">{formatBRL(h.newSalePrice)}</span>
                  </p>
                ) : null}
                {h.oldPromoPrice != null || h.newPromoPrice != null ? (
                  <p className="mt-1 text-xs text-gray-700">
                    Promo: <span className="line-through opacity-60">{formatBRL(h.oldPromoPrice)}</span>
                    {' → '}<span className="font-semibold">{formatBRL(h.newPromoPrice)}</span>
                  </p>
                ) : null}
                {h.reason && (
                  <p className="mt-1 text-xs italic text-gray-600">&quot;{h.reason}&quot;</p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
