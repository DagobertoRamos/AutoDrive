'use client'

// =============================================================================
// GarantiaConfigCard — comissão de GARANTIA por PRODUTO, com CHEIA × DESCONTO:
//   • Loja paga → cortesia (sem comissão).
//   • Cliente paga → comissão por produto. O tier (cheia/desconto) é decidido
//     pelo VALOR COBRADO real (do AutoConf) vs o "valor cheio" cadastrado.
//   • Gerente é fixo por garantia. Produto não cadastrado → defaults.
// Reusa /api/commissions/garantia-config.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, Save, RefreshCw, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint } from '@/components/ui/help-hint'
import { DEAL_HINTS } from '@/lib/glossary-deals'
import { MoneyInput, moneyToText, textToMoney } from '@/components/ui/money-input'

interface Produto { match: string; valorCheia: string; vendedorCheia: string; vendedorDesconto: string; gerente: string }
interface Config { active: boolean; lojaPagaSemComissao: boolean; produtos: Produto[]; defaultGerente: string; defaultVendedorCheia: string; defaultVendedorDesconto: string }

const asText = (v: number | null | undefined) => (v == null ? '' : String(v))
const pnum = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const pnumOrNull = (s: string) => { const t = String(s).trim(); if (!t) return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const inputNum = cn(inputCls, 'text-right')

export default function GarantiaConfigCard() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/commissions/garantia-config', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao carregar')
      const d = j.data
      setCfg({
        active: d.active, lojaPagaSemComissao: d.lojaPagaSemComissao,
        defaultGerente: asText(d.defaultGerente), defaultVendedorCheia: asText(d.defaultVendedorCheia), defaultVendedorDesconto: asText(d.defaultVendedorDesconto),
        produtos: (d.produtos ?? []).map((p: { match: string; valorCheia: number | null; vendedorCheia: number; vendedorDesconto: number; gerente: number }) => ({ match: p.match, valorCheia: asText(p.valorCheia), vendedorCheia: asText(p.vendedorCheia), vendedorDesconto: asText(p.vendedorDesconto), gerente: asText(p.gerente) })),
      })
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const setProd = (i: number, k: keyof Produto, v: string) => { setSaved(false); setCfg((c) => c ? { ...c, produtos: c.produtos.map((p, j) => j === i ? { ...p, [k]: v } : p) } : c) }
  const addProd = () => setCfg((c) => c ? { ...c, produtos: [...c.produtos, { match: '', valorCheia: '', vendedorCheia: '', vendedorDesconto: '', gerente: '' }] } : c)
  const delProd = (i: number) => setCfg((c) => c ? { ...c, produtos: c.produtos.filter((_, j) => j !== i) } : c)

  const save = async () => {
    if (!cfg) return
    if (cfg.produtos.some((p) => !p.match.trim())) { setError('Informe o nome de cada produto.'); return }
    setSaving(true); setError(''); setSaved(false)
    try {
      const payload = {
        active: cfg.active, lojaPagaSemComissao: cfg.lojaPagaSemComissao,
        defaultGerente: pnum(cfg.defaultGerente), defaultVendedorCheia: pnum(cfg.defaultVendedorCheia), defaultVendedorDesconto: pnum(cfg.defaultVendedorDesconto),
        produtos: cfg.produtos.map((p) => ({ match: p.match.trim(), valorCheia: pnumOrNull(p.valorCheia), vendedorCheia: pnum(p.vendedorCheia), vendedorDesconto: pnum(p.vendedorDesconto), gerente: pnum(p.gerente) })),
      }
      const res = await fetch('/api/commissions/garantia-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao salvar')
      setSaved(true); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><ShieldCheck size={17} className="text-brand-600" />Comissão de garantia</h2>
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {loading ? (
        <div className="mt-4 h-40 animate-pulse rounded-lg bg-gray-100" />
      ) : cfg ? (
        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <input type="checkbox" checked={cfg.active} onChange={(e) => { setSaved(false); setCfg({ ...cfg, active: e.target.checked }) }} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            <span className="text-sm font-medium text-gray-800">Comissão por produto</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <input type="checkbox" checked={cfg.lojaPagaSemComissao} onChange={(e) => { setSaved(false); setCfg({ ...cfg, lojaPagaSemComissao: e.target.checked }) }} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            <span className="text-sm font-medium text-gray-800">Sem comissão quando a loja paga a garantia</span>
          </label>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>{['Produto *', 'Valor cheio (R$)', 'Vend. cheia', 'Vend. desconto', 'Gerente', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"><span className="inline-flex items-center gap-1">{h}{h === 'Vend. desconto' && <HelpHint {...DEAL_HINTS.GARANTIA_CHEIA_REDUZIDA} />}</span></th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cfg.produtos.map((p, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5"><input value={p.match} onChange={(e) => setProd(i, 'match', e.target.value)} placeholder="Trecho do nome" className={inputCls} /></td>
                    <td className="px-2 py-1.5"><MoneyInput value={textToMoney(p.valorCheia)} onChange={(n) => setProd(i, 'valorCheia', moneyToText(n))} className={inputNum} /></td>
                    <td className="px-2 py-1.5"><MoneyInput value={textToMoney(p.vendedorCheia)} onChange={(n) => setProd(i, 'vendedorCheia', moneyToText(n))} className={inputNum} /></td>
                    <td className="px-2 py-1.5"><MoneyInput value={textToMoney(p.vendedorDesconto)} onChange={(n) => setProd(i, 'vendedorDesconto', moneyToText(n))} className={inputNum} /></td>
                    <td className="px-2 py-1.5"><MoneyInput value={textToMoney(p.gerente)} onChange={(n) => setProd(i, 'gerente', moneyToText(n))} className={inputNum} /></td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => delProd(i)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover produto"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
                {cfg.produtos.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-sm text-gray-400">Nenhum produto. Valem os valores padrão.</td></tr>}
              </tbody>
            </table>
          </div>
          <button onClick={addProd} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600"><Plus size={15} />Adicionar produto</button>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Padrão vendedor (cheia)</label>
              <MoneyInput value={textToMoney(cfg.defaultVendedorCheia)} onChange={(n) => { setSaved(false); setCfg({ ...cfg, defaultVendedorCheia: moneyToText(n) }) }} className={inputNum} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Padrão vendedor (desconto)</label>
              <MoneyInput value={textToMoney(cfg.defaultVendedorDesconto)} onChange={(n) => { setSaved(false); setCfg({ ...cfg, defaultVendedorDesconto: moneyToText(n) }) }} className={inputNum} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Padrão gerente</label>
              <MoneyInput value={textToMoney(cfg.defaultGerente)} onChange={(n) => { setSaved(false); setCfg({ ...cfg, defaultGerente: moneyToText(n) }) }} className={inputNum} />
            </div>
          </div>

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
