'use client'

// =============================================================================
// Marketing › Histórico — controle do que foi anunciado/postado, por veículo,
// placa, canal e unidade da loja. Rascunhos somem em 2 dias e posts enviados
// perdem mídia e texto; este registro fica para consulta e exportação.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Download, ExternalLink, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ChannelMark, ErrorNote, inputCls, PubTabs, STATUS_LABEL, STATUS_TONE, StatusPill } from '@/components/publications/ui'
import { PublicationDetail } from '@/components/publications/PublicationDetail'
import { RETENTION_NOTICE } from '@/lib/publications/retention-core'

/* eslint-disable @typescript-eslint/no-explicit-any */
const AVULSO_LABEL: Record<string, string> = { RASCUNHO: 'Rascunho', AGENDADO: 'Agendado', ENVIANDO: 'Enviando', PUBLICADO: 'Publicado', FALHA: 'Com erro', CANCELADO: 'Cancelado' }
const AVULSO_TONE: Record<string, any> = { RASCUNHO: 'neutral', AGENDADO: 'info', ENVIANDO: 'progress', PUBLICADO: 'success', FALHA: 'danger', CANCELADO: 'muted' }

export default function HistoricoPage() {
  const [type, setType] = useState<'veiculos' | 'avulsos'>('veiculos')
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState('')
  const [unitId, setUnitId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<any | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)

  const params = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ type, page: String(page), ...extra })
    if (q.trim()) p.set('q', q.trim())
    if (channel) p.set('channel', channel)
    if (unitId) p.set('unitId', unitId)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return p.toString()
  }, [type, page, q, channel, unitId, from, to])

  useEffect(() => {
    const t = setTimeout(() => { setErr(null); api(`/api/publications/history?${params()}`).then(setData).catch((e) => setErr((e as Error).message)) }, 300)
    return () => clearTimeout(t)
  }, [params])

  const tz = data?.timezone ?? 'America/Sao_Paulo'
  const d = (x: string | null) => (x ? new Date(x).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }) : '—')
  const reset = (fn: () => void) => { fn(); setPage(1) }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Histórico de publicações</h1>
        <p className="text-sm text-gray-500">Controle do que foi anunciado e postado: por veículo, placa, canal e unidade da loja.</p>
      </div>
      <PubTabs />
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{RETENTION_NOTICE} Este histórico continua disponível.</p>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tipo">
        {([['veiculos', 'Anúncios de veículos'], ['avulsos', 'Posts avulsos']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={type === k} onClick={() => reset(() => setType(k))} className={cn('rounded-full border px-3 py-1 text-xs', type === k ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-600')}>{l}</button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr,1fr,1fr,1fr,1fr,auto]">
        <label className="relative block text-xs text-gray-600">
          <span className="sr-only">Buscar</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={cn(inputCls, 'pl-8')} value={q} onChange={(e) => reset(() => setQ(e.target.value))} placeholder={type === 'veiculos' ? 'Veículo ou placa' : 'Nome ou texto do post'} />
        </label>
        <select className={inputCls} value={channel} onChange={(e) => reset(() => setChannel(e.target.value))} aria-label="Canal">
          <option value="">Todos os canais</option>
          {(data?.channels ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={inputCls} value={unitId} onChange={(e) => reset(() => setUnitId(e.target.value))} aria-label="Unidade" disabled={type === 'avulsos'}>
          <option value="">Todas as unidades</option>
          {(data?.units ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="date" className={inputCls} value={from} onChange={(e) => reset(() => setFrom(e.target.value))} aria-label="De" />
        <input type="date" className={inputCls} value={to} onChange={(e) => reset(() => setTo(e.target.value))} aria-label="Até" />
        <a href={`/api/publications/history?${params({ format: 'csv' })}`} className="btn-secondary justify-center px-3 py-2 text-sm"><Download size={15} />Exportar</a>
      </div>

      {err && <ErrorNote message={err} />}
      {!data ? <Loader2 className="animate-spin text-gray-400" /> : !data.data.length ? <p className="text-xs text-gray-500">Nada encontrado com esses filtros.</p> : (
        <>
          <p className="text-xs text-gray-500">{data.total} {type === 'veiculos' ? 'anúncio(s)' : 'post(s)'}</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">{type === 'veiculos' ? 'Veículo' : 'Post'}</th>
                  {type === 'veiculos' && <><th className="px-3 py-2">Placa</th><th className="px-3 py-2">Unidade</th></>}
                  <th className="px-3 py-2">Canal / conta</th>
                  <th className="px-3 py-2">Formato</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2">Publicado</th>
                  <th className="px-3 py-2">Última movimentação</th>
                  <th className="px-3 py-2"><span className="sr-only">Link</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.data.map((r: any) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2 font-medium text-gray-800">{r.kind === 'VEICULO' ? <button type="button" onClick={() => setDetail(r.id)} className="text-left hover:underline">{r.title}</button> : r.title}</td>
                    {type === 'veiculos' && <><td className="px-3 py-2 font-mono text-gray-700">{r.plate ?? '—'}</td><td className="px-3 py-2 text-gray-600">{r.unit ?? '—'}</td></>}
                    <td className="px-3 py-2"><span className="flex items-center gap-1.5"><ChannelMark channel={r.channel} /><span><span className="text-gray-800">{r.channelName}</span>{r.account && <span className="block text-[11px] text-gray-500">{r.account}</span>}</span></span></td>
                    <td className="px-3 py-2 text-gray-600">{r.format ?? 'Anúncio'}</td>
                    <td className="px-3 py-2">
                      {r.kind === 'VEICULO' ? <StatusPill tone={STATUS_TONE[r.status] ?? 'neutral'} label={STATUS_LABEL[r.status] ?? r.status} /> : <StatusPill tone={AVULSO_TONE[r.status] ?? 'neutral'} label={AVULSO_LABEL[r.status] ?? r.status} />}
                      {r.endReason && <span className="mt-0.5 block text-[11px] text-gray-500">{r.endReason} em {d(r.endedAt)}</span>}
                      {r.error && <span className="mt-0.5 block max-w-[220px] text-[11px] text-red-700">{r.error}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{d(r.publishedAt)}</td>
                    <td className="px-3 py-2 text-gray-600">{d(r.updatedAt)}</td>
                    <td className="px-3 py-2">{r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand-700 hover:underline">abrir<ExternalLink size={11} /></a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-2 text-xs">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary px-3 py-1.5 text-xs">Anterior</button>
              <span className="text-gray-600">Página {data.page} de {data.pages}</span>
              <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="btn-secondary px-3 py-1.5 text-xs">Próxima</button>
            </div>
          )}
        </>
      )}
      <PublicationDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
