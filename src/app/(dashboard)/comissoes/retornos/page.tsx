'use client'

// =============================================================================
// Retorno (ILA / IOF) — cadastro GLOBAL do tenant.
// Uma única configuração vale para todos os financiamentos: faixa de retorno +
// ILA% + IOF%. O retorno bruto vem da negociação (ou financiado × % padrão); o
// líquido = bruto − ILA − IOF. A COMISSÃO do retorno sai de uma regra do tipo
// "Retorno" (por cargo/vendedor), cadastrada em Regras de Comissão.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Save, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint } from '@/components/ui/help-hint'
import { DEAL_HINTS } from '@/lib/glossary-deals'
import RetornoPercentuais from '@/components/comissoes/RetornoPercentuais'
import DocumentoConfigCard from '@/components/comissoes/DocumentoConfigCard'
import GarantiaConfigCard from '@/components/comissoes/GarantiaConfigCard'
import BonusPeriodoCard from '@/components/comissoes/BonusPeriodoCard'
import { RequiredMark } from '@/components/ui/field'

interface RetornoConfig {
  active: boolean
  ilaPercent: number
  iofPercent: number
  minReturnPercent: number
  maxReturnPercent: number
  defaultReturnPercent: number | null
}

function pnum(s: string): number { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0 }
function pnumOrNull(s: string): number | null { const t = String(s).trim(); if (!t) return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null }
const asText = (v: number | null | undefined) => (v == null ? '' : String(v))

function inputCls() {
  return cn(
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400',
    'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
  )
}

export default function RetornosPage() {
  const [cfg, setCfg] = useState<RetornoConfig | null>(null)
  const [text, setText] = useState({ ila: '', iof: '', min: '', max: '', def: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const syncText = (c: RetornoConfig) => setText({
    ila: asText(c.ilaPercent), iof: asText(c.iofPercent),
    min: asText(c.minReturnPercent), max: asText(c.maxReturnPercent),
    def: asText(c.defaultReturnPercent),
  })

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/commissions/retorno-config', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao carregar')
      setCfg(data.data); syncText(data.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setField = (k: keyof typeof text, v: string) => { setText((p) => ({ ...p, [k]: v })); setSaved(false) }
  const setActive = (v: boolean) => { setCfg((p) => (p ? { ...p, active: v } : p)); setSaved(false) }

  const save = async () => {
    if (!cfg) return
    if (cfg.active && [text.ila, text.iof, text.min, text.max].some((v) => !v.trim())) { setError('Preencha ILA, IOF e a faixa de retorno.'); return }
    if (text.min.trim() && text.max.trim() && pnum(text.min) > pnum(text.max)) { setError('Faixa de retorno inválida.'); return }
    setSaving(true); setError(''); setSaved(false)
    try {
      const payload = {
        active: cfg.active,
        ilaPercent: pnum(text.ila),
        iofPercent: pnum(text.iof),
        minReturnPercent: pnum(text.min),
        maxReturnPercent: pnum(text.max),
        defaultReturnPercent: pnumOrNull(text.def),
      }
      const res = await fetch('/api/commissions/retorno-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar')
      setCfg(data.data); syncText(data.data); setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">Retorno (ILA / IOF)<HelpHint {...DEAL_HINTS.RETORNO_IMPORTACAO} /></h1>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
        {loading ? (
          <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
        ) : cfg ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <input type="checkbox" checked={cfg.active} onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm font-medium text-gray-800">Calcular retorno nas importações</span>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">ILA (%){cfg.active && <RequiredMark />}<HelpHint term="ILA" size={12} /></label>
                <input inputMode="decimal" className={inputCls()} value={text.ila} onChange={(e) => setField('ila', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">IOF (%){cfg.active && <RequiredMark />}<HelpHint term="IOF" size={12} /></label>
                <input inputMode="decimal" className={inputCls()} value={text.iof} onChange={(e) => setField('iof', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">Retorno mínimo (%){cfg.active && <RequiredMark />}<HelpHint {...DEAL_HINTS.FAIXA_RETORNO} size={12} /></label>
                <input inputMode="decimal" className={inputCls()} value={text.min} onChange={(e) => setField('min', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Retorno máximo (%){cfg.active && <RequiredMark className="ml-0.5" />}</label>
                <input inputMode="decimal" className={inputCls()} value={text.max} onChange={(e) => setField('max', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Retorno padrão (%)</label>
                <input inputMode="decimal" className={inputCls()} value={text.def} onChange={(e) => setField('def', e.target.value)} />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            {saved && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                <CheckCircle2 size={14} /> Salvo. Reimporte as vendas para aplicar.
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={save} disabled={saving} className="btn-primary text-sm">
                {saving ? <><RefreshCw size={13} className="animate-spin" /> Salvando...</> : <><Save size={13} /> Salvar</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={14} /> {error || 'Não foi possível carregar a configuração.'}
          </div>
        )}
      </div>

      {/* Percentual de comissão do retorno (por cargo ou por vendedor específico) */}
      <RetornoPercentuais />

      {/* Comissão de documentação (despachante) — faixas + loja/cliente paga */}
      <DocumentoConfigCard />

      {/* Comissão de garantia (Gestauto/seguros) — por produto + loja/cliente paga */}
      <GarantiaConfigCard />

      {/* Bônus de período — produção da loja, meta da loja, 3 dezenas */}
      <BonusPeriodoCard />

    </div>
  )
}
