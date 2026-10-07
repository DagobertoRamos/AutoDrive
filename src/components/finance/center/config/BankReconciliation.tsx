'use client'

// Financeiro › Conciliação bancária — importa o extrato (OFX/CSV) e casa cada
// linha com os lançamentos. /api/finance/center/reconciliation

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, FileUp, Loader2, Plus, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader, api, brl, inputClass } from './ui'

interface Sug { id: string; description: string; counterparty: string | null; signedAmount: number; date: string; open: boolean; score: number }
interface Line {
  id: string; date: string; amount: number; description: string; document: string | null; status: 'PENDENTE' | 'CONCILIADO' | 'IGNORADO'
  matched: { id: string; description: string; signedAmount: number }[]; suggestions: Sug[]
}
interface Data { lines: Line[]; summary: { pending: number; reconciled: number; ignored: number; pendingAmount: number } }
interface Category { id: string; name: string; kind: 'RECEITA' | 'DESPESA'; code: string | null; active?: boolean }

const TABS: [string, string][] = [['PENDENTE', 'Pendentes'], ['CONCILIADO', 'Conciliadas'], ['IGNORADO', 'Ignoradas']]
const dBR = (ymd: string) => ymd.split('-').reverse().join('/')

export default function BankReconciliation() {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [accountId, setAccountId] = useState('')
  const [tab, setTab] = useState('PENDENTE')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      const r = await api<{ id: string; name: string; active: boolean }[]>('/api/finance/accounts?active=true')
      const list = (r.data ?? []).map((a) => ({ id: a.id, name: a.name }))
      setAccounts(list)
      if (list.length) setAccountId((cur) => cur || list[0].id)
      const c = await api<Category[]>('/api/finance/categories?active=true')
      setCats(c.data ?? [])
    })()
  }, [])

  const load = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    const r = await api<Data>(`/api/finance/center/reconciliation?accountId=${accountId}&status=${tab}`)
    setData(r.data)
    if (!r.ok) setMsg({ ok: false, text: r.error ?? 'Erro.' })
    setLoading(false)
  }, [accountId, tab])
  useEffect(() => { void load() }, [load])

  const upload = async (file: File) => {
    const fd = new FormData()
    fd.append('accountId', accountId); fd.append('file', file)
    setLoading(true)
    const r = await fetch('/api/finance/center/reconciliation', { method: 'POST', body: fd, credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.success) setMsg({ ok: false, text: j.error ?? 'Não foi possível importar.' })
    else setMsg({ ok: true, text: `${j.data.created} linha(s) importada(s)${j.data.duplicates ? ` · ${j.data.duplicates} já existiam` : ''}.` })
    if (fileRef.current) fileRef.current.value = ''
    setTab('PENDENTE'); await load()
  }

  const act = async (body: Record<string, unknown>, ok: string) => {
    const r = await api('/api/finance/center/reconciliation', { method: 'POST', body })
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? 'Erro.' })
    if (r.ok) await load()
  }

  const s = data?.summary
  return (
    <div className="space-y-5">
      <PageHeader title="Conciliação bancária" helpText="Importe o extrato do banco (OFX ou CSV) e confirme cada linha com o lançamento correspondente. Título em aberto é baixado na data do extrato."
        actions={<>
          <select className={cn(inputClass, 'w-56')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input ref={fileRef} type="file" accept=".ofx,.csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <button type="button" disabled={!accountId || loading} onClick={() => fileRef.current?.click()} className="btn-primary text-sm"><FileUp size={15} />Importar extrato</button>
        </>} />

      {msg && <p className={cn('rounded-lg px-3 py-2 text-sm', msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')}>{msg.text}</p>}

      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', tab === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')}>
            {l}{s && <span className="ml-1.5 opacity-80">{k === 'PENDENTE' ? s.pending : k === 'CONCILIADO' ? s.reconciled : s.ignored}</span>}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading && <div className="h-24 animate-pulse rounded-xl bg-gray-100" />}
        {!loading && data && !data.lines.length && <p className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">Nada aqui.</p>}
        {!loading && data?.lines.map((l) => <LineCard key={l.id} line={l} cats={cats} onAct={act} />)}
      </div>
    </div>
  )
}

function LineCard({ line, cats, onAct }: { line: Line; cats: Category[]; onAct: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [sel, setSel] = useState<string[]>(() => (line.suggestions[0]?.score >= 90 ? [line.suggestions[0].id] : []))
  const [creating, setCreating] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [busy, setBusy] = useState(false)
  const kind = line.amount >= 0 ? 'RECEITA' : 'DESPESA'
  const total = useMemo(() => line.suggestions.filter((x) => sel.includes(x.id)).reduce((a, x) => a + x.signedAmount, 0), [sel, line.suggestions])
  const fits = Math.abs(total - line.amount) <= 0.009
  const run = async (b: Record<string, unknown>, ok: string) => { setBusy(true); await onAct(b, ok); setBusy(false) }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{line.description}</p>
          <p className="text-xs text-gray-500">{dBR(line.date)}{line.document ? ` · ${line.document}` : ''}</p>
        </div>
        <p className={cn('text-lg font-bold tabular-nums', line.amount < 0 ? 'text-orange-700' : 'text-teal-700')}>{brl(line.amount)}</p>
      </div>

      {line.status !== 'PENDENTE' ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-gray-600">{line.status === 'IGNORADO' ? 'Ignorada' : line.matched.map((m) => m.description).join(' · ')}</span>
          <button type="button" disabled={busy} onClick={() => run({ action: 'DESFAZER', lineId: line.id }, 'Linha voltou para pendente.')} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><Undo2 size={13} />Desfazer</button>
        </div>
      ) : (
        <>
          {line.suggestions.length > 0 && (
            <div className="mt-3 space-y-1">
              {line.suggestions.map((x) => (
                <label key={x.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', sel.includes(x.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-100 hover:bg-gray-50')}>
                  <input type="checkbox" checked={sel.includes(x.id)} onChange={(e) => setSel((cur) => e.target.checked ? [...cur, x.id] : cur.filter((y) => y !== x.id))} />
                  <span className="min-w-0 flex-1 truncate">{x.description}{x.counterparty ? <span className="text-gray-500"> · {x.counterparty}</span> : null}</span>
                  {x.open && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">em aberto</span>}
                  <span className="text-xs text-gray-500">{dBR(x.date)}</span>
                  <span className="w-28 text-right tabular-nums">{brl(x.signedAmount)}</span>
                </label>
              ))}
            </div>
          )}
          {creating && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <select className={cn(inputClass, 'w-72')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Categoria</option>
                {cats.filter((c) => c.kind === kind && c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} ` : ''}{c.name}</option>)}
              </select>
              <button type="button" disabled={busy || !categoryId} onClick={() => run({ action: 'CREATE', lineId: line.id, categoryId }, 'Lançamento criado e conciliado.')} className="btn-primary text-sm">Criar e conciliar</button>
              <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500">Voltar</button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {sel.length > 0 && !fits && <span className="mr-auto text-xs text-red-600">Selecionado {brl(total)} · falta {brl(line.amount - total)}</span>}
            <button type="button" disabled={busy} onClick={() => run({ action: 'IGNORAR', lineId: line.id }, 'Linha ignorada.')} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"><X size={14} />Ignorar</button>
            {!creating && <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"><Plus size={14} />Criar lançamento</button>}
            <button type="button" disabled={busy || !sel.length || !fits} onClick={() => run({ action: 'MATCH', lineId: line.id, entryIds: sel }, 'Conciliado.')} className="btn-primary text-sm">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Conciliar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
