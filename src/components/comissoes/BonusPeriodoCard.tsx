'use client'

// =============================================================================
// BonusPeriodoCard — bônus de período (mensais, agregados):
//   • Produção da loja: R$/carro da unidade, por colaborador.
//   • Meta da loja: alvo de vendas da unidade → fixo por cargo.
//   • Bônus das 3 dezenas: extra quando o vendedor fecha as 3 dezenas.
// Aplicado no recálculo do período. Reusa /api/commissions/bonus-periodo-config.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Save, RefreshCw, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Rate { key: string; nome: string; rate: string }
interface Config {
  producaoLoja: { active: boolean; rates: Rate[] }
  metaLoja: { active: boolean; targetUnitSales: string; vendedor: string; gerente: string }
  dezenaCombo: { active: boolean; value: string }
}
interface Person { id: string; nome: string }

const asText = (v: number | null | undefined) => (v == null ? '' : String(v))
const pnum = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const inputNum = cn(inputCls, 'text-right')

export default function BonusPeriodoCard() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [sellers, setSellers] = useState<Person[]>([])
  const [pick, setPick] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/commissions/bonus-periodo-config', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao carregar')
      const d = j.data
      setCfg({
        producaoLoja: { active: d.producaoLoja.active, rates: (d.producaoLoja.rates ?? []).map((r: { key: string; nome: string; rate: number }) => ({ key: r.key, nome: r.nome, rate: asText(r.rate) })) },
        metaLoja: { active: d.metaLoja.active, targetUnitSales: asText(d.metaLoja.targetUnitSales), vendedor: asText(d.metaLoja.vendedor), gerente: asText(d.metaLoja.gerente) },
        dezenaCombo: { active: d.dezenaCombo.active, value: asText(d.dezenaCombo.value) },
      })
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/sellers', { credentials: 'include' }).then((r) => r.json())
      .then((j) => setSellers((j?.data ?? []).map((s: { id: string; fullName?: string; name?: string }) => ({ id: `s:${s.id}`, nome: s.fullName || s.name || 'Vendedor' }))))
      .catch(() => setSellers([]))
  }, [])

  const dirty = () => setSaved(false)
  const addRate = () => { if (!pick || !cfg) return; if (cfg.producaoLoja.rates.some((r) => r.key === pick)) return; const p = sellers.find((s) => s.id === pick); dirty(); setCfg({ ...cfg, producaoLoja: { ...cfg.producaoLoja, rates: [...cfg.producaoLoja.rates, { key: pick, nome: p?.nome ?? '', rate: '' }] } }); setPick('') }
  const setRate = (i: number, v: string) => { if (!cfg) return; dirty(); setCfg({ ...cfg, producaoLoja: { ...cfg.producaoLoja, rates: cfg.producaoLoja.rates.map((r, j) => j === i ? { ...r, rate: v } : r) } }) }
  const delRate = (i: number) => { if (!cfg) return; dirty(); setCfg({ ...cfg, producaoLoja: { ...cfg.producaoLoja, rates: cfg.producaoLoja.rates.filter((_, j) => j !== i) } }) }

  const save = async () => {
    if (!cfg) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const payload = {
        producaoLoja: { active: cfg.producaoLoja.active, rates: cfg.producaoLoja.rates.map((r) => ({ key: r.key, nome: r.nome, rate: pnum(r.rate) })) },
        metaLoja: { active: cfg.metaLoja.active, targetUnitSales: pnum(cfg.metaLoja.targetUnitSales), vendedor: pnum(cfg.metaLoja.vendedor), gerente: pnum(cfg.metaLoja.gerente) },
        dezenaCombo: { active: cfg.dezenaCombo.active, value: pnum(cfg.dezenaCombo.value) },
      }
      const res = await fetch('/api/commissions/bonus-periodo-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao salvar')
      setSaved(true); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  const chk = (v: boolean, on: (b: boolean) => void, label: string) => (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <input type="checkbox" checked={v} onChange={(e) => { dirty(); on(e.target.checked) }} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
      <span className="text-sm font-medium text-gray-800">{label}</span>
    </label>
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Trophy size={17} className="text-brand-600" />Bônus de período (produção · meta · dezenas)</h2>
          <p className="mt-0.5 text-xs text-gray-500">Agregados por mês/unidade. Aplicados no recálculo do período.</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {loading ? (
        <div className="mt-4 h-40 animate-pulse rounded-lg bg-gray-100" />
      ) : cfg ? (
        <div className="mt-4 space-y-5">
          {/* Produção da loja */}
          <div className="space-y-2">
            {chk(cfg.producaoLoja.active, (b) => setCfg({ ...cfg, producaoLoja: { ...cfg.producaoLoja, active: b } }), 'Produção da loja — R$ por carro da UNIDADE, por colaborador')}
            <div className="flex gap-2">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls}>
                <option value="">Adicionar colaborador…</option>
                {sellers.filter((s) => !cfg.producaoLoja.rates.some((r) => r.key === s.id)).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <button onClick={addRate} className="btn-secondary whitespace-nowrap text-xs"><Plus size={13} />Adicionar</button>
            </div>
            {cfg.producaoLoja.rates.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50"><tr>{['Colaborador', 'R$ / carro da unidade', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {cfg.producaoLoja.rates.map((r, i) => (
                      <tr key={r.key}>
                        <td className="px-3 py-1.5 text-gray-800">{r.nome || r.key}</td>
                        <td className="px-2 py-1.5"><input inputMode="decimal" value={r.rate} onChange={(e) => setRate(i, e.target.value)} placeholder="0" className={inputNum} /></td>
                        <td className="px-2 py-1.5 text-center"><button onClick={() => delRate(i)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Meta da loja */}
          <div className="space-y-2">
            {chk(cfg.metaLoja.active, (b) => setCfg({ ...cfg, metaLoja: { ...cfg.metaLoja, active: b } }), 'Meta da loja — quando a unidade atinge o alvo de vendas no mês')}
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Alvo (carros da unidade)</label><input inputMode="numeric" value={cfg.metaLoja.targetUnitSales} onChange={(e) => { dirty(); setCfg({ ...cfg, metaLoja: { ...cfg.metaLoja, targetUnitSales: e.target.value } }) }} placeholder="Ex: 30" className={inputNum} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Bônus vendedor (R$)</label><input inputMode="decimal" value={cfg.metaLoja.vendedor} onChange={(e) => { dirty(); setCfg({ ...cfg, metaLoja: { ...cfg.metaLoja, vendedor: e.target.value } }) }} placeholder="250" className={inputNum} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Bônus gerente (R$)</label><input inputMode="decimal" value={cfg.metaLoja.gerente} onChange={(e) => { dirty(); setCfg({ ...cfg, metaLoja: { ...cfg.metaLoja, gerente: e.target.value } }) }} placeholder="500" className={inputNum} /></div>
            </div>
          </div>

          {/* Bônus 3 dezenas */}
          <div className="space-y-2">
            {chk(cfg.dezenaCombo.active, (b) => setCfg({ ...cfg, dezenaCombo: { ...cfg.dezenaCombo, active: b } }), 'Bônus das 3 dezenas — quando o vendedor fecha as 3 dezenas do mês')}
            <div className="max-w-xs"><label className="mb-1 block text-xs font-medium text-gray-700">Valor do bônus (R$)</label><input inputMode="decimal" value={cfg.dezenaCombo.value} onChange={(e) => { dirty(); setCfg({ ...cfg, dezenaCombo: { ...cfg.dezenaCombo, value: e.target.value } }) }} placeholder="1000" className={inputNum} /></div>
          </div>

          {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={14} />{error}</div>}
          {saved && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"><CheckCircle2 size={14} />Salvo. Rode o recálculo do período para aplicar.</div>}

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
