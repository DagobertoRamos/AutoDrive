'use client'

// =============================================================================
// Marketing › Publicações — cada veículo com a situação em cada canal.
// Filtros (veículo, canal, situação, loja, período), ações em lote com
// resultado por item, detalhe com histórico e diagnóstico.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, Filter, Loader2, Pause, Play, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PublicationDetail } from '@/components/publications/PublicationDetail'
import { MappingReview } from '@/components/publications/MappingReview'
import { api, ago, ChannelMark, Empty, inputCls, money, PubTabs, StatusPill, STATUS_LABEL, STATUS_TONE, Thumb, type Tone } from '@/components/publications/ui'

interface PubItem { id: string; channel: string; channelName: string; account: string | null; campaign: string | null; status: string; statusLabel: string; tone: Tone; remoteUrl: string | null; lastVerifiedAt: string | null; lastError: string | null; hint: string | null; manualAction: string | null; scheduledAt: string | null; archiveReason: string | null }
interface Row { vehicle: { id: string; title: string; plate: string | null; year: number | null; modelYear: number | null; km: number | null; stockStatus: string | null; cover: string | null; unit: string | null; price: number | null; oldPrice: number | null }; publications: PubItem[]; summary: string; lastSync: string | null }
interface Can { prepare: boolean; approve: boolean; publish: boolean; connections: boolean }

const CHANNELS = [['SITE', 'Site próprio'], ['WEBMOTORS', 'Webmotors'], ['OLX', 'OLX'], ['MERCADO_LIVRE', 'Mercado Livre'], ['CHAVES_NA_MAO', 'Chaves na Mão'], ['MOBIAUTO', 'Mobiauto'], ['META_PAGE', 'Facebook'], ['INSTAGRAM', 'Instagram'], ['MANUAL_SOCIAL', 'Manual']] as const
const QUICK: Array<[string, string]> = [['', 'Todas'], ['PUBLICADO', 'Publicadas'], ['EM_ANALISE', 'Em análise'], ['AGENDADO', 'Agendadas'], ['FALHA', 'Com falha'], ['REJEITADO', 'Rejeitadas'], ['ACAO_MANUAL', 'Ação manual'], ['PAUSADO', 'Pausadas']]

export default function PublicationsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([])
  const [can, setCan] = useState<Can | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [f, setF] = useState({ q: '', channel: '', status: '', unitId: '', from: '', to: '', archived: false })
  const [showFilters, setShowFilters] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<string | null>(null)
  const [bulk, setBulk] = useState<{ busy: boolean; results?: Array<{ id: string; ok: boolean; message: string }>; summary?: string } | null>(null)
  const [pendingMaps, setPendingMaps] = useState(0)
  const [showMaps, setShowMaps] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const p = new URLSearchParams({ page: String(page) })
      if (f.q.trim()) p.set('q', f.q.trim())
      for (const k of ['channel', 'status', 'unitId', 'from', 'to'] as const) if (f[k]) p.set(k, f[k])
      if (f.archived) p.set('archived', '1')
      const [j, m] = await Promise.all([api(`/api/publications?${p}`), api('/api/publications/mappings').catch(() => ({ data: [] }))])
      setRows(j.data); setCounts(j.counts ?? {}); setUnits(j.units ?? []); setCan(j.can); setTotal(j.total ?? 0)
      setPendingMaps((m.data ?? []).length)
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [f, page])
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t) }, [load])

  const allPubIds = useMemo(() => rows.flatMap((r) => r.publications.map((p) => p.id)), [rows])
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleVehicle = (r: Row) => setSel((s) => {
    const ids = r.publications.map((p) => p.id); const n = new Set(s)
    const all = ids.every((i) => n.has(i)); ids.forEach((i) => (all ? n.delete(i) : n.add(i))); return n
  })

  const runBulk = async (action: string) => {
    if (!sel.size) return
    if (action === 'RETIRAR' && !confirm(`Retirar ${sel.size} anúncio(s) dos canais?`)) return
    setBulk({ busy: true })
    try {
      const j = await api<{ results: Array<{ id: string; ok: boolean; message: string }>; summary: string }>('/api/publications/actions', { method: 'POST', json: { ids: [...sel], action } })
      setBulk({ busy: false, results: j.results, summary: j.summary }); setSel(new Set()); await load()
    } catch (e) { setBulk({ busy: false, summary: (e as Error).message }) }
  }

  const pubName = (id: string) => { for (const r of rows) for (const p of r.publications) if (p.id === id) return `${r.vehicle.title} · ${p.channelName}`; return id }
  const liveTotal = Object.entries(counts).filter(([k]) => k !== 'REMOVIDO').reduce((n, [, v]) => n + v, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Central de Publicações</h1>
          <p className="text-sm text-gray-500">Anúncios do estoque no site, portais e redes — com confirmação de cada canal.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="btn-secondary px-3 py-2 text-xs" aria-label="Atualizar"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /><span className="hidden sm:inline">Atualizar</span></button>
          {can?.prepare && <Link href="/marketing/publicacoes/nova" className="btn-primary px-3 py-2 text-xs"><Plus size={14} />Nova publicação</Link>}
        </div>
      </div>
      <PubTabs />

      {pendingMaps > 0 && (
        <button onClick={() => setShowMaps(true)} className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 hover:bg-amber-100">
          <AlertTriangle size={14} /><span><b>{pendingMaps}</b> correspondência(s) de marca/modelo/versão precisam de revisão antes de publicar. <u>Revisar</u></span>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Situação">
        {QUICK.map(([k, l]) => (
          <button key={k} onClick={() => { setPage(1); setF((x) => ({ ...x, status: k })) }} aria-pressed={f.status === k}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600', f.status === k ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
            {l}{k && counts[k] ? <span className="ml-1 opacity-70">{counts[k]}</span> : !k ? <span className="ml-1 opacity-70">{liveTotal}</span> : null}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={f.q} onChange={(e) => { setPage(1); setF((x) => ({ ...x, q: e.target.value })) }} placeholder="Marca, modelo ou placa" className={cn(inputCls, 'pl-9')} aria-label="Buscar veículo" />
        </div>
        <button onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} className="btn-secondary px-3 py-2 text-xs"><Filter size={14} />Filtros</button>
      </div>

      {showFilters && (
        <div className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-gray-600">Canal<select className={inputCls} value={f.channel} onChange={(e) => { setPage(1); setF((x) => ({ ...x, channel: e.target.value })) }}><option value="">Todos</option>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-xs text-gray-600">Situação<select className={inputCls} value={f.status} onChange={(e) => { setPage(1); setF((x) => ({ ...x, status: e.target.value })) }}><option value="">Todas</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-xs text-gray-600">Loja<select className={inputCls} value={f.unitId} onChange={(e) => { setPage(1); setF((x) => ({ ...x, unitId: e.target.value })) }}><option value="">Todas</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label className="text-xs text-gray-600">De<input type="date" className={inputCls} value={f.from} onChange={(e) => { setPage(1); setF((x) => ({ ...x, from: e.target.value })) }} /></label>
          <label className="text-xs text-gray-600">Até<input type="date" className={inputCls} value={f.to} onChange={(e) => { setPage(1); setF((x) => ({ ...x, to: e.target.value })) }} /></label>
          <label className="flex items-center gap-2 text-xs text-gray-600 sm:col-span-2"><input type="checkbox" checked={f.archived} onChange={(e) => { setPage(1); setF((x) => ({ ...x, archived: e.target.checked })) }} className="rounded border-gray-300 text-brand-600" />Mostrar arquivados (vendidos e retirados)</label>
        </div>
      )}

      {sel.size > 0 && can?.publish && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs shadow-sm" role="toolbar" aria-label="Ações em lote">
          <b className="text-brand-900">{sel.size} selecionada(s)</b>
          <button onClick={() => runBulk('VERIFICAR')} className="btn-secondary px-2.5 py-1 text-xs"><RefreshCw size={13} />Conferir</button>
          <button onClick={() => runBulk('SINCRONIZAR')} className="btn-secondary px-2.5 py-1 text-xs"><RefreshCw size={13} />Sincronizar</button>
          <button onClick={() => runBulk('PAUSAR')} className="btn-secondary px-2.5 py-1 text-xs"><Pause size={13} />Pausar</button>
          <button onClick={() => runBulk('RETOMAR')} className="btn-secondary px-2.5 py-1 text-xs"><Play size={13} />Reativar</button>
          <button onClick={() => runBulk('RETIRAR')} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 font-medium text-red-700 hover:bg-red-50"><Trash2 size={13} />Retirar</button>
          <button onClick={() => setSel(new Set())} className="ml-auto text-gray-500 hover:text-gray-800">Limpar</button>
        </div>
      )}

      {bulk && (
        <div role="status" className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
          <div className="flex items-center justify-between"><b>{bulk.busy ? 'Processando…' : `Resultado: ${bulk.summary ?? ''}`}</b>{!bulk.busy && <button onClick={() => setBulk(null)} className="text-gray-500 hover:text-gray-800">Fechar</button>}</div>
          {bulk.results && <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">{bulk.results.map((r) => <li key={r.id} className={r.ok ? 'text-green-700' : 'text-red-700'}>{r.ok ? '✓' : '✕'} {pubName(r.id)} — {r.message}</li>)}</ul>}
        </div>
      )}

      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

      {loading && !rows.length ? <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}</div>
        : !rows.length ? <Empty>{f.q || f.channel || f.status || f.unitId || f.from ? 'Nenhuma publicação com esses filtros.' : <>Nenhum veículo publicado ainda. {can?.prepare && <Link href="/marketing/publicacoes/nova" className="font-medium text-brand-700 underline">Preparar a primeira publicação</Link>}</>}</Empty>
        : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const ids = r.publications.map((p) => p.id); const allSel = ids.length > 0 && ids.every((i) => sel.has(i))
              return (
                <li key={r.vehicle.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-card">
                  <div className="flex flex-wrap items-start gap-3">
                    {can?.publish && <input type="checkbox" checked={allSel} onChange={() => toggleVehicle(r)} className="mt-1 rounded border-gray-300 text-brand-600" aria-label={`Selecionar ${r.vehicle.title}`} />}
                    <Thumb src={r.vehicle.cover} className="h-16 w-24" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900">{r.vehicle.title}</p>
                      <p className="text-xs text-gray-500">{[r.vehicle.plate, r.vehicle.year || r.vehicle.modelYear ? `${r.vehicle.year ?? '—'}/${r.vehicle.modelYear ?? '—'}` : null, r.vehicle.unit].filter(Boolean).join(' · ')}</p>
                      <p className="text-sm">{r.vehicle.oldPrice != null && <s className="mr-1 text-xs text-gray-400">{money(r.vehicle.oldPrice)}</s>}<b className="text-gray-800">{money(r.vehicle.price)}</b></p>
                    </div>
                    <div className="flex w-full flex-wrap items-baseline gap-x-3 text-xs sm:block sm:w-auto sm:text-right">
                      <p className="font-medium text-gray-700">{r.summary || '—'}</p>
                      <p className="text-gray-400">Sincronizado {ago(r.lastSync)}</p>
                      {can?.prepare && <Link href={`/marketing/publicacoes/nova?veiculos=${r.vehicle.id}`} className="mt-1 inline-block font-medium text-brand-700 hover:underline">Editar / mais canais</Link>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.publications.map((p) => (
                      <div key={p.id} className={cn('flex items-center gap-1.5 rounded-lg border px-2 py-1', sel.has(p.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-200')}>
                        {can?.publish && <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600" aria-label={`Selecionar ${p.channelName}`} />}
                        <button onClick={() => setDetail(p.id)} className="flex items-center gap-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" title={p.lastError ? `${p.lastError}${p.hint ? ` — ${p.hint}` : ''}` : p.manualAction ?? undefined}>
                          <ChannelMark channel={p.channel} />
                          <span className="text-xs text-gray-700">{p.channelName}{p.campaign && p.campaign !== 'principal' ? ` · ${p.campaign}` : ''}</span>
                          <StatusPill tone={STATUS_TONE[p.status] ?? p.tone} label={p.archiveReason === 'VENDIDO' ? 'Vendido' : p.statusLabel} />
                        </button>
                        {p.remoteUrl && <a href={p.remoteUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-brand-700" aria-label={`Abrir anúncio em ${p.channelName}`}><ExternalLink size={13} /></a>}
                      </div>
                    ))}
                  </div>
                  {r.publications.filter((p) => p.lastError && ['FALHA', 'REJEITADO'].includes(p.status)).slice(0, 2).map((p) => <p key={p.id} className="mt-1.5 text-[11px] text-red-700">{p.channelName}: {p.lastError}{p.hint && <span className="text-gray-500"> — {p.hint}</span>}</p>)}
                </li>
              )
            })}
          </ul>
        )}

      {total > 30 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary px-3 py-1.5 text-xs">Anterior</button>
          <span className="text-gray-500">Página {page} de {Math.ceil(total / 30)}</span>
          <button disabled={page >= Math.ceil(total / 30)} onClick={() => setPage((p) => p + 1)} className="btn-secondary px-3 py-1.5 text-xs">Próxima</button>
        </div>
      )}
      {loading && rows.length > 0 && <p className="flex items-center gap-1 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" />Atualizando…</p>}
      <p className="sr-only" aria-live="polite">{allPubIds.length} publicações listadas</p>

      <PublicationDetail id={detail} onClose={() => setDetail(null)} onChanged={() => void load()} />
      {showMaps && <MappingReview onClose={() => { setShowMaps(false); void load() }} canConfirm={!!can?.approve} />}
    </div>
  )
}
