'use client'

// =============================================================================
// Estoque › Configurações de avaliação (gerente+). Tabela de reparos com valor
// fixo usada na avaliação de cada item; o avaliador só escolhe. Toda alteração
// fica no histórico (quem, quando, o quê).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { AlertCircle, CheckCircle2, History, Loader2, Plus, Save, Settings, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccessModule } from '@/lib/permissions'
import { MoneyInput } from '@/components/ui/money-input'
import { RequiredMark } from '@/components/ui/field'
import { HelpHint } from '@/components/ui/help-hint'
import { EVAL_SECTIONS, type RepairOption } from '@/lib/evaluation/repair-prices-core'
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '@/lib/evaluation/catalog'

interface HistoryRow { id: string; at: string; user: string | null; changes: string[] }
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const SECTION_SHORT: Record<string, string> = { FRENTE: 'Frente', DIREITA: 'Direita', TRASEIRA: 'Traseira', ESQUERDA: 'Esquerda', INTERIOR: 'Interior', TEST_DRIVE: 'Mecânica' }

export default function EvaluationSettingsPage() {
  const { data: session, status } = useSession()
  const allowed = canAccessModule(session?.user?.role, 'stock.evaluate.config')
  const [rows, setRows] = useState<RepairOption[] | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const j = await fetch('/api/evaluations/repair-prices?all=1', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) { setRows(j.data.repairs); setHistory(j.data.history ?? []) } else setMsg({ ok: false, text: j?.error ?? 'Falha ao carregar.' })
  }, [])
  useEffect(() => {
    if (!allowed) return undefined
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [allowed, load])

  const set = (i: number, patch: Partial<RepairOption>) => { setMsg(null); setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r))) }
  const toggleSection = (i: number, s: RepairOption['sections'][number]) =>
    set(i, { sections: rows![i].sections.includes(s) ? rows![i].sections.filter((x) => x !== s) : [...rows![i].sections, s] })

  async function save() {
    if (!rows) return
    const bad = rows.findIndex((r) => !r.label.trim())
    if (bad >= 0) { setMsg({ ok: false, text: `Informe o nome do reparo (linha ${bad + 1}).` }); return }
    setSaving(true); setMsg(null)
    const r = await fetch('/api/evaluations/repair-prices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repairs: rows }) })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? 'Falha ao salvar.' }); return }
    setRows(j.data.repairs); setHistory(j.data.history ?? [])
    setMsg({ ok: true, text: j.data.changes?.length ? 'Salvo.' : 'Nada mudou.' })
  }

  if (status === 'loading') return <Loader2 className="animate-spin text-gray-400" />
  if (!allowed) return <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Acesso restrito à gerência.</p>

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Settings size={20} /></div>
          <h1 className="text-xl font-bold text-gray-900">Configurações de avaliação</h1>
        </div>
        <button onClick={() => void save()} disabled={saving || !rows} className="btn-primary text-sm">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar</button>
      </div>

      {msg && (
        <p className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>
          {msg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{msg.text}
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3"><h2 className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">Tabela de reparos <HelpHint title="Tabela de reparos" text="Preço padrão de cada reparo, por seção da avaliação. Quando o avaliador marca um reparo, o valor daqui entra como custo previsto do carro." /></h2></div>
        {!rows ? <div className="p-8 text-center"><Loader2 className="mx-auto animate-spin text-gray-400" /></div> : (
          <div className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <div key={r.key + i} className={cn('grid gap-3 px-4 py-3 md:grid-cols-[1.4fr_1fr_140px_auto]', !r.active && 'opacity-60')}>
                <label className="block text-xs font-medium text-gray-600">Reparo <RequiredMark />
                  <input className={cn(inputCls, 'mt-1')} value={r.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={80} />
                </label>
                <label className="block text-xs font-medium text-gray-600">Tipo de serviço
                  <select className={cn(inputCls, 'mt-1')} value={r.serviceType} onChange={(e) => set(i, { serviceType: e.target.value })}>
                    {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t] ?? t}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-600">Valor <RequiredMark />
                  <div className="mt-1"><MoneyInput className={inputCls} value={r.price} onChange={(v) => set(i, { price: v ?? 0 })} /></div>
                </label>
                <div className="flex items-end gap-2">
                  <button type="button" onClick={() => set(i, { active: !r.active })} className={cn('rounded-lg border px-3 py-2 text-xs font-medium', r.active ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-300 text-gray-600')}>{r.active ? 'Ativo' : 'Inativo'}</button>
                  <button type="button" onClick={() => setRows((rs) => rs && rs.filter((_, j) => j !== i))} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Excluir reparo"><Trash2 size={15} /></button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 md:col-span-4">
                  <span className="mr-1 text-[11px] text-gray-500">Aparece em:</span>
                  {EVAL_SECTIONS.map(([k]) => {
                    const on = r.sections.includes(k)
                    return <button key={k} type="button" onClick={() => toggleSection(i, k)} className={cn('rounded-full border px-2.5 py-0.5 text-[11px]', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 text-gray-600')}>{SECTION_SHORT[k]}</button>
                  })}
                  {r.sections.length === 0 && <span className="text-[11px] text-gray-400">todas as seções</span>}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setRows((rs) => [...(rs ?? []), { key: '', label: '', serviceType: 'OUTRO', price: 0, sections: [], active: true, order: 999 }])} className="flex w-full items-center justify-center gap-1.5 py-3 text-sm text-gray-500 hover:bg-gray-50 hover:text-brand-700"><Plus size={15} />Adicionar reparo</button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3"><History size={15} className="text-gray-500" /><h2 className="text-sm font-semibold text-gray-900">Histórico de alterações</h2></div>
        {history.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma alteração.</p> : (
          <ul className="divide-y divide-gray-50">
            {history.map((h) => (
              <li key={h.id} className="px-4 py-2.5 text-sm">
                <p className="text-xs text-gray-500">{new Date(h.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {h.user ?? '—'}</p>
                <ul className="mt-0.5 list-inside list-disc text-gray-800">{h.changes.map((c, k) => <li key={k}>{c}</li>)}</ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
