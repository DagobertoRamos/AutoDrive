'use client'

// =============================================================================
// Configuração de Pesos do Ranking — AutoDrive
// UI sobre /api/ranking/rules (GET/PUT). Apenas perfis com 'ranking.configure'.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Save, RefreshCw, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RuleWeights {
  weightSale:            number
  weightPurchase:        number
  weightReturn:          number
  weightDocumentation:   number
  weightWarranty:        number
  weightService:         number
  weightOverduePendency: number
  weightCanceledSale:    number
  weightLateDocument:    number
}

type WeightKey = keyof RuleWeights

const FIELDS: { key: WeightKey; label: string; hint?: string }[] = [
  { key: 'weightSale',            label: 'Venda / Troca concluída' },
  { key: 'weightPurchase',        label: 'Compra concluída' },
  { key: 'weightReturn',          label: 'Retorno concluído' },
  { key: 'weightDocumentation',   label: 'Documento / despachante concluído' },
  { key: 'weightWarranty',        label: 'Garantia estendida vendida' },
  { key: 'weightService',         label: 'Serviço vendido' },
  { key: 'weightOverduePendency', label: 'Pendência vencida', hint: 'penalização (negativo)' },
  { key: 'weightCanceledSale',    label: 'Venda cancelada', hint: 'penalização (negativo)' },
  { key: 'weightLateDocument',    label: 'Documento atrasado', hint: 'penalização (negativo)' },
]

const DEFAULTS: RuleWeights = {
  weightSale: 100, weightPurchase: 40, weightReturn: 25, weightDocumentation: 20,
  weightWarranty: 30, weightService: 20, weightOverduePendency: -15,
  weightCanceledSale: -50, weightLateDocument: -10,
}

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0)

export default function RankingConfigPage() {
  const [name, setName] = useState('Padrão')
  const [weights, setWeights] = useState<RuleWeights>(DEFAULTS)
  const [tiebreakers, setTiebreakers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ranking/rules', { credentials: 'include' })
      const json = await res.json()
      const d = json?.data ?? {}
      setName(d.name ?? 'Padrão')
      setWeights({
        weightSale: num(d.weightSale), weightPurchase: num(d.weightPurchase),
        weightReturn: num(d.weightReturn), weightDocumentation: num(d.weightDocumentation),
        weightWarranty: num(d.weightWarranty), weightService: num(d.weightService),
        weightOverduePendency: num(d.weightOverduePendency), weightCanceledSale: num(d.weightCanceledSale),
        weightLateDocument: num(d.weightLateDocument),
      })
      setTiebreakers(Array.isArray(d.tiebreakers) ? d.tiebreakers : [])
    } catch {
      flash('Não foi possível carregar a configuração.', false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const set = (key: WeightKey, value: number) => setWeights((prev) => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/ranking/rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name, ...weights }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Erro ao salvar')
      flash('Pesos do ranking salvos!', true)
      await load()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erro ao salvar.', false)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums text-right focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurar Pesos do Ranking</h1>
          <p className="mt-1 text-sm text-gray-500">Pontuação por evento concluído. Penalizações usam valores negativos.</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />Recarregar
        </button>
      </div>

      {msg && (
        <div className={cn('flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {msg.ok ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{msg.text}
        </div>
      )}

      <div className="card">
        <div className="section-header">
          <Trophy size={16} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-800">Pesos (pontos)</h2>
        </div>
        <div className="p-5 space-y-1">
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Nome da configuração</label>
            <input className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between border-b border-gray-50 py-2.5">
              <div>
                <p className="text-sm text-gray-800">{f.label}</p>
                {f.hint && <p className="text-xs text-gray-400">{f.hint}</p>}
              </div>
              <input
                type="number" step="1" className={inputCls}
                value={weights[f.key]}
                onChange={(e) => set(f.key, Math.round(Number(e.target.value) || 0))}
              />
            </div>
          ))}

          {tiebreakers.length > 0 && (
            <div className="pt-4 text-xs text-gray-500">
              <span className="font-medium text-gray-600">Critérios de desempate:</span> {tiebreakers.join(' › ')}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setWeights(DEFAULTS)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <RotateCcw size={14} />Restaurar padrões
        </button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
          <Save size={15} />{saving ? 'Salvando...' : 'Salvar pesos'}
        </button>
      </div>
    </div>
  )
}
