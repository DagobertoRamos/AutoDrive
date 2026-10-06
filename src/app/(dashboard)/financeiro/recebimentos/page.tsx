'use client'

// =============================================================================
// Financeiro › Recebimentos — o que os clientes pagaram/vão pagar nas
// negociações. O financeiro confere o comprovante, preenche a autorização do
// cartão e CONFIRMA (só aqui; na negociação o pagamento entra pendente).
// Visualização em Lista (tabela compacta, linha expansível) ou Cards; filtros
// por busca, unidade, período (vencimento/pagamento), forma, banco e status —
// filtrados no servidor (/api/finance/receivables), com totais do conjunto.
// =============================================================================

import { Fragment, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  CheckCircle2, ChevronDown, ExternalLink, Landmark, LayoutGrid, List, Loader2, Paperclip, RotateCcw, Search, X, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RequiredMark } from '@/components/ui/field'
import { DealPeekLink } from '@/components/deals/DealPeek'
import FiContractPanel, { type FiData, type FiProduct } from '@/components/finance/center/receivables/FiContractPanel'

interface Row {
  id: string; type: string; method: string | null; status: string; value: number
  dueDate: string | null; paidAt: string | null; bank: string | null; cardBrand: string | null; installments: number | null
  authorizationCode: string | null; notes: string | null
  deal: { id: string; number: string | null; status: string; unitId: string | null; unit: string | null; client: string | null; seller: string | null; vehicle: string | null; plate: string | null }
  receipts: Array<{ id: string; fileName: string; url: string | null; fileType: string }>
  fi: FiData | null
}
interface Summary { count: number; total: number; shown: number; byType: { type: string; count: number; total: number }[] }
type Status = 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO' | 'TODOS'
type View = 'lista' | 'cards'

const TYPE: Record<string, string> = {
  DINHEIRO: 'Dinheiro', PIX: 'Pix', SINAL: 'Sinal', ENTRADA: 'Entrada', FINANCIAMENTO: 'Financiamento', CARTAO_CREDITO: 'Cartão de crédito',
  CARTAO_DEBITO: 'Cartão de débito', BOLETO: 'Boleto', DUPLICATA: 'Duplicata', TRANSFERENCIA: 'Transferência', OUTRO: 'Outro', OUTROS: 'Outro',
}
const TYPE_FILTER: [string, string][] = [
  ['PIX', 'Pix'], ['DINHEIRO', 'Dinheiro'], ['CARTAO_CREDITO,CARTAO_DEBITO', 'Cartão (crédito/débito)'], ['CARTAO_CREDITO', 'Cartão de crédito'],
  ['CARTAO_DEBITO', 'Cartão de débito'], ['FINANCIAMENTO', 'Financiamento'], ['BOLETO', 'Boleto'], ['TRANSFERENCIA', 'Transferência'],
  ['SINAL', 'Sinal'], ['ENTRADA', 'Entrada'], ['DUPLICATA', 'Duplicata'], ['OUTRO,OUTROS', 'Outro'],
]
const STATUS_TABS: [Status, string][] = [['PENDENTE', 'A confirmar'], ['CONFIRMADO', 'Confirmados'], ['CANCELADO', 'Cancelados'], ['TODOS', 'Todos']]
const STATUS_BADGE: Record<string, string> = { PENDENTE: 'bg-amber-50 text-amber-800', CONFIRMADO: 'bg-green-50 text-green-700', CANCELADO: 'bg-gray-100 text-gray-500' }
const VIEW_KEY = 'fin.recebimentos.view'

// Lista/Cards lembrado por navegador (localStorage pode falhar em aba anônima/
// bloqueada — aí vale só a memória da aba).
let memView: View | null = null
const viewListeners = new Set<() => void>()
function readView(): View {
  if (memView) return memView
  try { return window.localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'lista' } catch { return 'lista' }
}
function writeView(v: View) {
  memView = v
  try { window.localStorage.setItem(VIEW_KEY, v) } catch { /* sem storage */ }
  viewListeners.forEach((l) => l())
}
const subscribeView = (cb: () => void) => { viewListeners.add(cb); return () => { viewListeners.delete(cb) } }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—')
const isCard = (r: Row) => [r.type, r.method].some((t) => t === 'CARTAO_CREDITO' || t === 'CARTAO_DEBITO')
const typeLabel = (r: Row) => `${TYPE[r.type] ?? r.type}${r.method ? ` · ${TYPE[r.method] ?? r.method}` : ''}${r.installments && r.installments > 1 ? ` · ${r.installments}x` : ''}`
const field = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

function spToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
function monthBounds(ymd: string) {
  const [y, m] = ymd.split('-').map(Number)
  return { from: `${ymd.slice(0, 7)}-01`, to: `${ymd.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` }
}

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_500_000) return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85))
    return b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file
  } catch { return file }
}

export default function RecebimentosPage() {
  const today = spToday()
  const [tab, setTab] = useState<Status>('PENDENTE')
  const view = useSyncExternalStore(subscribeView, readView, (): View => 'lista')
  const [q, setQ] = useState('')
  const [unitId, setUnitId] = useState('')
  const [dateBy, setDateBy] = useState<'vencimento' | 'pagamento'>('vencimento')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState('')
  const [bank, setBank] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [units, setUnits] = useState<{ id: string; name: string }[]>([])
  const [banks, setBanks] = useState<string[]>([])
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [auth, setAuth] = useState<Record<string, string>>({})
  const [paidAt, setPaidAt] = useState<Record<string, string>>({})
  const [products, setProducts] = useState<FiProduct[]>([])
  const [openFi, setOpenFi] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fiVersion, setFiVersion] = useState(0)

  const changeView = writeView

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ status: tab })
    if (q.trim()) qs.set('q', q.trim())
    if (unitId) qs.set('unitId', unitId)
    if (from || to) qs.set('dateBy', dateBy)
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    if (type) qs.set('type', type)
    if (bank) qs.set('bank', bank)
    const j = await fetch(`/api/finance/receivables?${qs}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) {
      setRows(j.data); setSummary(j.summary ?? { count: j.data.length, total: j.total, shown: j.data.length, byType: [] })
      setUnits(j.units ?? []); setBanks(j.banks ?? []); setProducts(j.products ?? []); setCanManage(!!j.canManage); setFiVersion((v) => v + 1)
    } else { setRows([]); setSummary(null); setMsg({ ok: false, text: j?.error ?? 'Falha ao carregar.' }) }
  }, [tab, q, unitId, dateBy, from, to, type, bank])
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t) }, [load, q])

  const presets = useMemo(() => [
    { label: 'Hoje', from: today, to: today },
    { label: '7 dias', from: addDays(today, -6), to: today },
    { label: 'Próx. 7 dias', from: today, to: addDays(today, 6) },
    { label: 'Mês atual', ...monthBounds(today) },
  ], [today])
  const hasFilters = !!(q || unitId || from || to || type || bank)
  const clearFilters = () => { setQ(''); setUnitId(''); setFrom(''); setTo(''); setType(''); setBank(''); setDateBy('vencimento') }

  const act = async (r: Row, action: 'CONFIRMAR' | 'CANCELAR' | 'REABRIR') => {
    if (action === 'CANCELAR' && !confirm('Cancelar este pagamento? Ele deixa de contar no saldo da negociação.')) return
    setBusy(r.id); setMsg(null)
    try {
      const body: Record<string, string> = { action }
      if (auth[r.id] !== undefined) body.authorizationCode = auth[r.id]
      if (action === 'CONFIRMAR') { const d = paidAt[r.id] ?? (r.dueDate ? r.dueDate.slice(0, 10) : ''); if (d) body.paidAt = d }
      const res = await fetch(`/api/finance/receivables/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `Erro ${res.status}`)
      setMsg({ ok: true, text: action === 'CONFIRMAR' ? 'Pagamento confirmado.' : action === 'CANCELAR' ? 'Pagamento cancelado.' : 'Pagamento voltou para pendente.' })
      await load()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const upload = async (r: Row, f: File) => {
    setBusy(r.id); setMsg(null)
    try {
      const fd = new FormData(); fd.append('file', await shrink(f))
      const res = await fetch(`/api/finance/receivables/${r.id}`, { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `Erro ${res.status}`)
      setMsg({ ok: true, text: j.needsAuthorization ? 'Comprovante anexado. Agora informe o código de autorização do cartão.' : 'Comprovante anexado.' })
      if (j.needsAuthorization) setExpanded(r.id)
      await load()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const st = (r: Row) => (r.status === 'CONFIRMADO' || r.status === 'CANCELADO' ? r.status : 'PENDENTE')
  const needAuthOf = (r: Row) => isCard(r) && r.receipts.length > 0 && !(auth[r.id] ?? r.authorizationCode)

  // ── Blocos de ação (iguais na Lista e nos Cards) ───────────────────────────
  const uploadBtn = (r: Row, compact = false) => (
    <label title="Anexar comprovante" className={cn('inline-flex cursor-pointer items-center gap-1 rounded-md border border-brand-300 font-medium text-brand-700 hover:bg-brand-50', compact ? 'p-1.5' : 'px-2 py-1', busy === r.id && 'pointer-events-none opacity-60')}>
      <Paperclip size={12} />{compact ? <span className="sr-only">Anexar comprovante</span> : 'Anexar comprovante'}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(r, f); e.target.value = '' }} />
    </label>
  )
  const receiptsBlock = (r: Row) => (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {r.receipts.map((a) => (
        <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noopener" className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700 hover:bg-gray-100"><Paperclip size={12} className="shrink-0" /><span className="truncate">{a.fileName}</span><ExternalLink size={11} className="shrink-0" /></a>
      ))}
      {!r.receipts.length && <span className="text-amber-700">Sem comprovante</span>}
      {canManage && st(r) === 'PENDENTE' && uploadBtn(r)}
    </div>
  )
  const fiBlock = (r: Row) => r.fi && (
    <div className="text-xs">
      <button type="button" onClick={() => setOpenFi((o) => (o === r.id ? null : r.id))} aria-expanded={openFi === r.id} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
        <Landmark size={12} />F&amp;I do contrato<ChevronDown size={12} className={cn('transition-transform', openFi === r.id && 'rotate-180')} />
      </button>
      {openFi === r.id && (
        <FiContractPanel
          key={`${r.id}-${fiVersion}`}
          paymentId={r.id} financed={r.value} bank={r.bank} installments={r.installments}
          fi={r.fi} products={products} canEdit={canManage}
          onSaved={(m) => { setMsg(m); if (m.ok) void load() }}
        />
      )}
    </div>
  )
  const confirmBlock = (r: Row) => {
    if (!canManage) return null
    if (st(r) !== 'PENDENTE') {
      return <button type="button" disabled={busy === r.id} onClick={() => void act(r, 'REABRIR')} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"><RotateCcw size={12} />Voltar para a confirmar</button>
    }
    const needAuth = needAuthOf(r)
    return (
      <div className="flex flex-wrap items-end gap-2 text-xs">
        {isCard(r) && (
          <label className="text-gray-600">Autorização do cartão{r.receipts.length ? <RequiredMark className="ml-0.5" /> : null}
            <input value={auth[r.id] ?? r.authorizationCode ?? ''} onChange={(e) => setAuth((a) => ({ ...a, [r.id]: e.target.value }))} placeholder="Nº de autorização" className={cn('mt-0.5 block w-44 rounded-md border px-2 py-1.5 text-sm', needAuth ? 'border-amber-400' : 'border-gray-300')} />
          </label>
        )}
        <label className="text-gray-600">Pago em
          <input type="date" value={paidAt[r.id] ?? (r.dueDate ? r.dueDate.slice(0, 10) : '')} onChange={(e) => setPaidAt((a) => ({ ...a, [r.id]: e.target.value }))} className="mt-0.5 block min-w-[10rem] rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
        <button type="button" disabled={busy === r.id || needAuth} title={needAuth ? 'Informe a autorização do cartão' : undefined} onClick={() => void act(r, 'CONFIRMAR')} className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}Confirmar recebimento
        </button>
        <button type="button" disabled={busy === r.id} onClick={() => void act(r, 'CANCELAR')} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"><XCircle size={13} />Cancelar</button>
      </div>
    )
  }
  const dealLink = (r: Row) => (
    <DealPeekLink dealId={r.deal.id} className="font-medium text-brand-700 hover:underline">Negociação {r.deal.number ?? ''}</DealPeekLink>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Recebimentos</h1>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Visualização">
          {([['lista', 'Lista', List], ['cards', 'Cards', LayoutGrid]] as const).map(([v, l, Icon]) => (
            <button key={v} type="button" onClick={() => changeView(v)} aria-pressed={view === v}
              className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', view === v ? 'bg-brand-700 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              <Icon size={14} />{l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map(([t, l]) => (
          <button key={t} type="button" onClick={() => { setRows(null); setTab(t) }} className={cn('rounded-full border px-3 py-1 text-xs', tab === t ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 bg-white text-gray-600')}>{l}</button>
        ))}
      </div>

      {/* Filtros */}
      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="relative min-w-0 flex-1 basis-full sm:basis-64">
            <span className="sr-only">Buscar</span>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, negociação, placa ou banco" className={cn(field, 'w-full pl-8')} />
          </label>
          {units.length > 1 && (
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-gray-600">Unidade
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={cn(field, 'min-w-[10rem] max-w-[16rem] truncate')}>
                <option value="">Todas</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          )}
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-gray-600">Forma
            <select value={type} onChange={(e) => setType(e.target.value)} className={cn(field, 'min-w-[10rem] max-w-[16rem] truncate')}>
              <option value="">Todas</option>
              {TYPE_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-gray-600">Banco / financeira
            <select value={bank} onChange={(e) => setBank(e.target.value)} className={cn(field, 'min-w-[10rem] max-w-[16rem] truncate')}>
              <option value="">Todos</option>
              {bank && !banks.includes(bank) && <option value={bank}>{bank}</option>}
              {banks.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Período por
            <select value={dateBy} onChange={(e) => setDateBy(e.target.value as 'vencimento' | 'pagamento')} className={cn(field, 'min-w-[9.5rem]')}>
              <option value="vencimento">Vencimento</option>
              <option value="pagamento">Pagamento</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">De
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={cn(field, 'min-w-[10rem]')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Até
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cn(field, 'min-w-[10rem]')} />
          </label>
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button key={p.label} type="button" onClick={() => { setFrom(p.from); setTo(p.to) }}
                className={cn('rounded-lg border px-3 py-2 text-xs font-medium', from === p.from && to === p.to ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
                {p.label}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"><X size={13} />Limpar filtros</button>
          )}
        </div>
      </div>

      {msg && <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{msg.text}</p>}

      {summary && summary.count > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
          <span><b className="text-gray-900">{summary.count}</b> pagamento(s) · total <b className="text-brand-700">{brl(summary.total)}</b></span>
          {summary.byType.length > 1 && summary.byType.map((t) => (
            <span key={t.type} className="rounded-full bg-gray-100 px-2 py-0.5">{TYPE[t.type] ?? t.type}: {t.count} · {brl(t.total)}</span>
          ))}
          {summary.shown < summary.count && <span className="text-amber-700">mostrando os {summary.shown} primeiros — refine os filtros</span>}
        </div>
      )}

      {!rows ? <Loader2 className="animate-spin text-gray-400" /> : !rows.length ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">{hasFilters ? 'Nenhum pagamento com esses filtros.' : 'Nada aqui.'}</p>
      ) : view === 'lista' ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['', 'Data', 'Forma', 'Negociação / cliente', 'Veículo', 'Unidade', 'Banco', 'Valor', 'Ações'].map((h, i) => (
                    <th key={i} className={cn('whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500', h === 'Valor' || h === 'Ações' ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const open = expanded === r.id
                  const s = st(r)
                  const needAuth = needAuthOf(r)
                  return (
                    <Fragment key={r.id}>
                      <tr className={cn('align-top hover:bg-gray-50/60', open && 'bg-brand-50/30')}>
                        <td className="px-2 py-2">
                          <button type="button" onClick={() => setExpanded(open ? null : r.id)} aria-expanded={open} aria-label={open ? 'Recolher detalhes' : 'Ver detalhes'} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                            <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-700">
                          {dt(r.dueDate)}
                          {r.paidAt && <span className="block text-[11px] text-green-700">pago {dt(r.paidAt)}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className="font-medium text-gray-900">{typeLabel(r)}</span>
                          {tab === 'TODOS' && <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', STATUS_BADGE[s])}>{s === 'PENDENTE' ? 'A confirmar' : s === 'CONFIRMADO' ? 'Confirmado' : 'Cancelado'}</span>}
                        </td>
                        <td className="max-w-[16rem] px-3 py-2 text-xs">
                          {dealLink(r)}
                          <span className="block truncate text-gray-600" title={r.deal.client ?? undefined}>{r.deal.client ?? '—'}</span>
                        </td>
                        <td className="max-w-[12rem] px-3 py-2 text-xs text-gray-600">
                          <span className="block truncate" title={r.deal.vehicle ?? undefined}>{r.deal.vehicle ?? '—'}</span>
                          {r.deal.plate && <span className="text-[11px] text-gray-500">{r.deal.plate}</span>}
                        </td>
                        <td className="max-w-[9rem] truncate px-3 py-2 text-xs text-gray-600" title={r.deal.unit ?? undefined}>{r.deal.unit ?? '—'}</td>
                        <td className="max-w-[9rem] truncate px-3 py-2 text-xs text-gray-600" title={r.bank ?? undefined}>{r.bank ?? '—'}{r.cardBrand ? ` · ${r.cardBrand}` : ''}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{brl(r.value)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1 text-xs">
                            {r.receipts.length > 0 ? (
                              <a href={r.receipts[0].url ?? '#'} target="_blank" rel="noopener" title={`Comprovante: ${r.receipts[0].fileName}${r.receipts.length > 1 ? ` (+${r.receipts.length - 1})` : ''}`} className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-1.5 text-gray-700 hover:bg-gray-100">
                                <Paperclip size={12} />{r.receipts.length > 1 ? r.receipts.length : null}
                              </a>
                            ) : canManage && s === 'PENDENTE' ? uploadBtn(r, true) : <span className="px-1 text-[11px] text-amber-700" title="Sem comprovante">—</span>}
                            {r.fi && (
                              <button type="button" title="F&I do contrato" onClick={() => { setExpanded(r.id); setOpenFi(r.id) }} className="rounded-md border border-gray-200 p-1.5 text-brand-700 hover:bg-brand-50"><Landmark size={12} /></button>
                            )}
                            {canManage && s === 'PENDENTE' && (
                              <>
                                <button type="button" disabled={busy === r.id || needAuth} onClick={() => (isCard(r) && !(auth[r.id] ?? r.authorizationCode) ? setExpanded(r.id) : void act(r, 'CONFIRMAR'))}
                                  title={needAuth ? 'Informe a autorização do cartão (abra os detalhes)' : isCard(r) && !(auth[r.id] ?? r.authorizationCode) ? 'Abrir detalhes para informar a autorização' : `Confirmar (pago em ${dt(paidAt[r.id] ?? r.dueDate)})`}
                                  className="rounded-md bg-green-600 p-1.5 text-white hover:bg-green-700 disabled:opacity-50">
                                  {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                </button>
                                <button type="button" disabled={busy === r.id} onClick={() => void act(r, 'CANCELAR')} title="Cancelar pagamento" className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"><XCircle size={12} /></button>
                              </>
                            )}
                            {canManage && s !== 'PENDENTE' && (
                              <button type="button" disabled={busy === r.id} onClick={() => void act(r, 'REABRIR')} title="Voltar para a confirmar" className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-100"><RotateCcw size={12} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-brand-50/20">
                          <td />
                          <td colSpan={8} className="space-y-2 px-3 pb-3 pt-1">
                            <p className="text-xs text-gray-600">
                              {dealLink(r)}{r.deal.client ? ` · ${r.deal.client}` : ''}{r.deal.vehicle ? ` · ${r.deal.vehicle}` : ''}{r.deal.plate ? ` (${r.deal.plate})` : ''}{r.deal.seller ? ` · vendedor ${r.deal.seller}` : ''}
                            </p>
                            {r.notes && <p className="text-xs italic text-gray-500">{r.notes}</p>}
                            {receiptsBlock(r)}
                            {fiBlock(r)}
                            {confirmBlock(r)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={7} className="px-3 py-2 text-xs font-semibold text-gray-600">{rows.length} na lista{summary && summary.count > rows.length ? ` de ${summary.count}` : ''}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{brl(rows.reduce((a, r) => a + r.value, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {rows.map((r) => {
            const s = st(r)
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{typeLabel(r)}</p>
                    <p className="text-xs text-gray-500">
                      Vencimento {dt(r.dueDate)}{r.paidAt ? ` · pago em ${dt(r.paidAt)}` : ''}
                      {tab === 'TODOS' && <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', STATUS_BADGE[s])}>{s === 'PENDENTE' ? 'A confirmar' : s === 'CONFIRMADO' ? 'Confirmado' : 'Cancelado'}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-bold tabular-nums text-brand-700">{brl(r.value)}</span>
                </div>
                <div className="text-xs text-gray-600">
                  {dealLink(r)}{r.deal.client ? ` · ${r.deal.client}` : ''}
                  <p className="text-gray-500">
                    {[r.deal.vehicle && `${r.deal.vehicle}${r.deal.plate ? ` (${r.deal.plate})` : ''}`, !r.deal.vehicle && r.deal.plate, r.deal.unit, r.bank, r.cardBrand, r.deal.seller && `vendedor ${r.deal.seller}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {r.notes && <p className="text-xs italic text-gray-400">{r.notes}</p>}
                {receiptsBlock(r)}
                {r.fi && <div className="border-t border-gray-100 pt-2">{fiBlock(r)}</div>}
                {canManage && <div className="mt-auto border-t border-gray-100 pt-2">{confirmBlock(r)}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
