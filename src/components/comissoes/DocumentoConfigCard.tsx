'use client'

// =============================================================================
// DocumentoConfigCard — comissão de DOCUMENTAÇÃO (despachante), configurável:
//   • Loja paga → cortesia → sem comissão (liga/desliga).
//   • Cliente paga → FAIXAS por valor cobrado, com valor p/ gerente e vendedor.
// Campos editáveis para mudanças futuras de valores. Reusa /api/commissions/documento-config.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { FileText, Save, RefreshCw, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Tier { minFee: string; maxFee: string; gerente: string; vendedor: string }
interface Config { active: boolean; lojaPagaSemComissao: boolean; tiers: Tier[] }

const asText = (v: number | null | undefined) => (v == null ? '' : String(v))
const pnum = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const pnumOrNull = (s: string) => { const t = String(s).trim(); if (!t) return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-right focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function DocumentoConfigCard() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/commissions/documento-config', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao carregar')
      const d = j.data
      setCfg({ active: d.active, lojaPagaSemComissao: d.lojaPagaSemComissao, tiers: (d.tiers ?? []).map((t: { minFee: number; maxFee: number | null; gerente: number; vendedor: number }) => ({ minFee: asText(t.minFee), maxFee: asText(t.maxFee), gerente: asText(t.gerente), vendedor: asText(t.vendedor) })) })
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const setTier = (i: number, k: keyof Tier, v: string) => { setSaved(false); setCfg((c) => c ? { ...c, tiers: c.tiers.map((t, j) => j === i ? { ...t, [k]: v } : t) } : c) }
  const addTier = () => setCfg((c) => c ? { ...c, tiers: [...c.tiers, { minFee: '', maxFee: '', gerente: '', vendedor: '' }] } : c)
  const delTier = (i: number) => setCfg((c) => c ? { ...c, tiers: c.tiers.filter((_, j) => j !== i) } : c)

  const save = async () => {
    if (!cfg) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const payload = {
        active: cfg.active, lojaPagaSemComissao: cfg.lojaPagaSemComissao,
        tiers: cfg.tiers.map((t) => ({ minFee: pnum(t.minFee), maxFee: pnumOrNull(t.maxFee), gerente: pnum(t.gerente), vendedor: pnum(t.vendedor) })),
      }
      const res = await fetch('/api/commissions/documento-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao salvar')
      setSaved(true); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><FileText size={17} className="text-brand-600" />Comissão de documentação</h2>
          <p className="mt-0.5 text-xs text-gray-500">Loja paga = cortesia (sem comissão). Cliente paga = por faixa de valor.</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {loading ? (
        <div className="mt-4 h-40 animate-pulse rounded-lg bg-gray-100" />
      ) : cfg ? (
        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <input type="checkbox" checked={cfg.active} onChange={(e) => { setSaved(false); setCfg({ ...cfg, active: e.target.checked }) }} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            <span className="text-sm font-medium text-gray-800">Usar este modelo de comissão de documentação (por faixa)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <input type="checkbox" checked={cfg.lojaPagaSemComissao} onChange={(e) => { setSaved(false); setCfg({ ...cfg, lojaPagaSemComissao: e.target.checked }) }} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            <span className="text-sm font-medium text-gray-800">Quando a LOJA paga a documentação, não pagar comissão (cortesia)</span>
          </label>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>{['Faixa — de (R$)', 'até (R$)', 'Gerente (R$)', 'Vendedor (R$)', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cfg.tiers.map((t, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5"><input inputMode="decimal" value={t.minFee} onChange={(e) => setTier(i, 'minFee', e.target.value)} placeholder="Ex: 990" className={inputCls} /></td>
                    <td className="px-2 py-1.5"><input inputMode="decimal" value={t.maxFee} onChange={(e) => setTier(i, 'maxFee', e.target.value)} placeholder="sem teto" className={inputCls} /></td>
                    <td className="px-2 py-1.5"><input inputMode="decimal" value={t.gerente} onChange={(e) => setTier(i, 'gerente', e.target.value)} placeholder="0" className={inputCls} /></td>
                    <td className="px-2 py-1.5"><input inputMode="decimal" value={t.vendedor} onChange={(e) => setTier(i, 'vendedor', e.target.value)} placeholder="0" className={inputCls} /></td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => delTier(i)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover faixa"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
                {cfg.tiers.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-sm text-gray-400">Sem faixas — abaixo de qualquer faixa, não paga comissão.</td></tr>}
              </tbody>
            </table>
          </div>
          <button onClick={addTier} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600"><Plus size={15} />Adicionar faixa</button>
          <p className="text-xs text-gray-400">Valor cobrado abaixo da menor faixa → sem comissão. Ex.: 990–1489,99 = gerente 50 / vendedor 100; 1490+ = gerente 100 / vendedor 200.</p>

          {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={14} />{error}</div>}
          {saved && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"><CheckCircle2 size={14} />Salvo. Reimporte/regenere as vendas para aplicar.</div>}

          <div className="flex justify-end">
            <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? <><RefreshCw size={13} className="animate-spin" />Salvando...</> : <><Save size={13} />Salvar</>}</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || 'Não foi possível carregar.'}</div>
      )}
    </div>
  )
}
