'use client'
/* eslint-disable @next/next/no-img-element -- miniaturas do estoque */

// =============================================================================
// Marketing › Publicações › Painel — página inicial da Central.
// Indicadores da semana + quadro (kanban) em 5 colunas, no padrão dos grandes
// gerenciadores de redes: Rascunhos · Agendados · Publicando · Publicados ·
// Precisam de atenção. Cada cartão é um post (o anúncio do veículo num
// formato/campanha, com a situação em cada canal, ou um post avulso) com
// Visualizar, Retomar, Tentar de novo e Excluir. Atualiza sozinho.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarClock, CheckCircle2, Clapperboard, Download, Eye, FileText, ImagePlus, Info, Loader2, Play, Plus, RefreshCw, RotateCcw, Send, Trash2, TrendingUp, Wand2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ChannelMark, DOT, Drawer, ErrorNote, PubTabs, STATUS_LABEL, STATUS_TONE } from '@/components/publications/ui'
import { PublicationDetail } from '@/components/publications/PublicationDetail'
import { loadPreview, PreviewView } from '@/components/publications/PublishedPreview'
import { StoredPreview } from '@/components/publications/AvulsaPreview'
import { AdPackageButton } from '@/components/publications/AdPackage'
import type { PreviewFormat } from '@/components/publications/PostPreview'
import { BOARD_COLUMNS, COLUMN_INFO, type BoardColumn } from '@/lib/publications/board-core'
import type { BoardCard, BoardChannel } from '@/app/api/publications/board/route'
import { isSocialChannel } from '@/lib/publications/channels'

/* eslint-disable @typescript-eslint/no-explicit-any */
const COL_STYLE: Record<BoardColumn, { bar: string; badge: string; icon: LucideIcon }> = {
  rascunhos: { bar: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700', icon: FileText },
  agendados: { bar: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700', icon: CalendarClock },
  publicando: { bar: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700', icon: Send },
  publicados: { bar: 'bg-green-500', badge: 'bg-green-50 text-green-700', icon: CheckCircle2 },
  atencao: { bar: 'bg-red-500', badge: 'bg-red-50 text-red-700', icon: AlertTriangle },
}
const LIST_STATUS: Partial<Record<BoardColumn, string>> = { agendados: 'AGENDADO', publicados: 'PUBLICADO', atencao: 'FALHA', publicando: 'EM_ANALISE' }
const FAILED = new Set(['FALHA', 'REJEITADO'])

/** "hoje 19:05", "amanhã 12:00", "ontem 08:10" ou "03/10 19:05" no fuso da loja. */
function whenLabel(iso: string | null, tz: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz })
  const hm = d.toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  const today = day(new Date())
  const diff = Math.round((Date.parse(day(d)) - Date.parse(today)) / 86_400_000)
  if (diff === 0) return `hoje ${hm}`
  if (diff === 1) return `amanhã ${hm}`
  if (diff === -1) return `ontem ${hm}`
  return `${d.toLocaleDateString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' })} ${hm}`
}

export default function PainelPage() {
  const router = useRouter()
  const [data, setData] = useState<any | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [at, setAt] = useState<number>(0)
  const [now, setNow] = useState(0)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<BoardCard | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [avulso, setAvulso] = useState<{ post: any; conns: any[] } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api('/api/publications/board')); setErr(null); setAt(Date.now()) } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [])
  // Atualiza sozinho a cada 10 s com a aba visível (os cartões mudam de coluna conforme publicam).
  useEffect(() => {
    const t0 = setTimeout(() => void load(), 0)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void load(); setNow(Date.now()) }, 10_000)
    const vis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearTimeout(t0); clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [load])

  const tz: string = data?.timezone ?? 'America/Sao_Paulo'
  const can = data?.can ?? {}
  const k = data?.kpis

  const resume = (c: BoardCard) => {
    if (c.kind === 'ASSISTENTE') return router.push('/marketing/publicacoes/nova')
    if (c.kind === 'AVULSO') return router.push(`/marketing/avulsa?editar=${c.postId}`)
    // Abre a Nova publicação já montada com o rascunho (etapa Revisão), sem refazer nada.
    const q = new URLSearchParams({ rascunho: c.channels.map((x) => x.pubId).filter(Boolean).join(',') })
    router.push(`/marketing/publicacoes/nova?${q}`)
  }

  const run = async (c: BoardCard, what: 'EXCLUIR' | 'REENVIAR') => {
    const live = c.channels.some((x) => x.status === 'PUBLICADO')
    // Card com erro: "Excluir" apaga só as redes que falharam (o que deu certo segue no ar).
    const failedOnly = c.kind === 'VEICULO' && c.column === 'atencao' && c.channels.some((x) => FAILED.has(x.status) || x.status === 'ACAO_MANUAL')
    if (what === 'EXCLUIR' && !confirm(
      c.kind === 'ASSISTENTE' ? 'Descartar a publicação em andamento?'
      : c.kind === 'AVULSO' ? `Excluir o post "${c.title}" do sistema?${live ? '\n\nO que já está no ar continua nas redes.' : ''}`
      : failedOnly ? `Excluir as falhas de "${c.title} · ${c.format}"?${live ? '\n\nOs canais onde já está no ar continuam no ar.' : ''}`
      : /story/i.test(c.format ?? '') ? `Excluir "${c.title} · ${c.format}"?${live ? '\n\nO Story some sozinho da rede em até 24 h.' : ''}`
      : live ? `Excluir "${c.title} · ${c.format}"?\n\nOs canais onde já está no ar serão retirados; os demais, apagados.` : `Excluir "${c.title} · ${c.format}"?`)) return
    setBusy(c.key); setMsg(null)
    try {
      if (c.kind === 'ASSISTENTE') await api('/api/publications/wizard', { method: 'DELETE' })
      else if (c.kind === 'AVULSO' && what === 'REENVIAR') await api(`/api/publications/avulsa/${c.postId}/retry`, { method: 'POST' })
      else if (c.kind === 'AVULSO') await api(`/api/publications/avulsa/${c.postId}?permanente=1`, { method: 'DELETE' })
      else if (what === 'EXCLUIR' && failedOnly) {
        const ids = c.channels.filter((x) => x.pubId && (FAILED.has(x.status) || x.status === 'ACAO_MANUAL')).map((x) => x.pubId!)
        const j = await api('/api/publications/actions', { method: 'POST', json: { ids, action: 'APAGAR_REGISTRO' } })
        const bad = (j.results as Array<{ ok: boolean; message: string }>).filter((r) => !r.ok)
        if (bad.length) throw new Error(bad.map((r) => r.message).join(' · '))
      } else {
        const ids = c.channels.filter((x) => x.pubId && (what === 'EXCLUIR' || FAILED.has(x.status))).map((x) => x.pubId!)
        const j = await api('/api/publications/actions', { method: 'POST', json: { ids, action: what } })
        const bad = (j.results as Array<{ ok: boolean; message: string }>).filter((r) => !r.ok)
        if (bad.length) throw new Error(bad.map((r) => r.message).join(' · '))
      }
      setMsg({ ok: true, text: what === 'REENVIAR' ? 'Enviado de novo para a fila.' : 'Excluído.' })
      await load()
    } catch (e) {
      // No celular a faixa de aviso fica fora da tela: o erro aparece também em alerta.
      setMsg({ ok: false, text: (e as Error).message })
      alert((e as Error).message)
    } finally { setBusy(null) }
  }

  const download = async (c: BoardCard) => {
    if (!c.postId) return
    setBusy(c.key); setMsg(null)
    try {
      const j = await api(`/api/publications/avulsa/${c.postId}/download`)
      const { caption, files } = j.data as { caption: string; files: Array<{ index: number }> }
      if (!files.length) throw new Error('Este post não tem arquivo para baixar.')
      if (caption) await navigator.clipboard?.writeText(caption).catch(() => undefined)
      for (const f of files) {
        const a = document.createElement('a')
        a.href = `/api/publications/avulsa/${c.postId}/download?i=${f.index}`
        a.download = ''
        document.body.appendChild(a); a.click(); a.remove()
        await new Promise((r) => setTimeout(r, 400))
      }
      setMsg({ ok: true, text: caption ? 'Download iniciado. Legenda copiada.' : 'Download iniciado.' })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const view = async (c: BoardCard) => {
    if (c.kind === 'AVULSO') {
      setBusy(c.key)
      try {
        const [p, cn] = await Promise.all([api('/api/publications/avulsa'), api('/api/publications/connections')])
        const post = (p.data as any[]).find((x) => x.id === c.postId)
        if (!post) throw new Error('Post não encontrado.')
        setAvulso({ post, conns: cn.data.connections })
      } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
      return
    }
    if (c.socialFormat && c.channels.some((x) => isSocialChannel(x.channel))) setPreview(c)
    else setDetail(c.channels[0]?.pubId ?? null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Central de Publicações</h1>
          <p className="text-sm text-gray-500">Site, portais e redes sociais num só lugar — o quadro se atualiza sozinho conforme os posts saem.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-[11px] text-gray-400 sm:inline">{at ? `Atualizado ${Math.max(now, at) - at < 15_000 ? 'agora' : `há ${Math.round((now - at) / 1000)} s`}` : ''}</span>
          <button onClick={() => void load()} className="btn-secondary px-3 py-2 text-xs" aria-label="Atualizar"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
          {can.prepare && <Link href="/marketing/avulsa?formato=REELS" className="btn-secondary px-3 py-2 text-xs"><Clapperboard size={14} />Subir vídeo</Link>}
          {can.prepare && <Link href="/marketing/avulsa" className="btn-secondary px-3 py-2 text-xs"><ImagePlus size={14} />Post avulso</Link>}
          {can.prepare && <Link href="/marketing/publicacoes/nova" className="btn-primary px-3 py-2 text-xs"><Plus size={14} />Nova publicação</Link>}
        </div>
      </div>
      <PubTabs />

      {err && <ErrorNote message={err} />}
      {msg && <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{msg.text}</p>}
      {k?.reconectar > 0 && (
        <Link href="/marketing/canais" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 hover:bg-amber-100"><AlertTriangle size={14} /><span><b>{k.reconectar}</b> canal(is) precisam ser reconectados — os posts desses canais não saem até lá. <u>Resolver</u></span></Link>
      )}

      {/* Indicadores */}
      {!data ? <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi icon={CheckCircle2} tone="text-green-700 bg-green-50" label="Publicados" sub="últimos 7 dias" value={k.publicados7} />
            <Kpi icon={CalendarClock} tone="text-sky-700 bg-sky-50" label="Agendados" sub={k.proximo ? `Próximo: ${whenLabel(k.proximo.when, tz)} · ${k.proximo.title}` : 'próximos 7 dias'} value={k.agendados7} />
            <Kpi icon={Send} tone="text-indigo-700 bg-indigo-50" label="Publicando agora" sub="na fila ou processando" value={k.publicando} />
            <Kpi icon={AlertTriangle} tone={k.atencao ? 'text-red-700 bg-red-50' : 'text-gray-500 bg-gray-50'} label="Precisam de atenção" sub={k.atencao ? 'erro ou ação da loja' : 'tudo certo'} value={k.atencao} onClick={k.atencao ? () => document.getElementById('col-atencao')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }) : undefined} />
            <Kpi icon={TrendingUp} tone="text-brand-700 bg-brand-50" label="Taxa de sucesso" sub={`${k.conectados} canal(is) conectado(s)${k.pausados ? ` · ${k.pausados} pausado(s)` : ''}`} value={k.sucesso == null ? '—' : `${k.sucesso}%`} className="col-span-2 lg:col-span-1" />
          </div>

          {/* Quadro */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 xl:mx-0 xl:grid xl:grid-cols-5 xl:overflow-visible xl:px-0">
            {BOARD_COLUMNS.map((col) => {
              const cards: BoardCard[] = data.columns[col]
              const total: number = data.totals[col]
              const st = COL_STYLE[col]
              return (
                <section key={col} id={`col-${col}`} aria-label={COLUMN_INFO[col].label} className="flex w-[82vw] shrink-0 snap-start flex-col rounded-xl border border-gray-200 bg-gray-50/70 sm:w-72 xl:w-auto">
                  <div className={cn('h-1 rounded-t-xl', st.bar)} />
                  <header className="flex items-center gap-2 px-3 py-2">
                    <st.icon size={14} className="text-gray-500" />
                    <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-700">{COLUMN_INFO[col].label}</h2>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', st.badge)}>{total}</span>
                    <span title={COLUMN_INFO[col].hint} className="text-gray-400"><Info size={13} /></span>
                  </header>
                  <div className="flex max-h-[68vh] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
                    {!cards.length && <p className="px-2 py-6 text-center text-[11px] text-gray-400">{col === 'atencao' ? 'Nenhum problema. 👍' : col === 'rascunhos' ? 'Nenhum rascunho.' : col === 'publicando' ? 'Nada saindo agora.' : 'Nada por aqui.'}</p>}
                    {cards.map((c) => <Card key={c.key} c={c} col={col} tz={tz} can={can} busy={busy === c.key} onView={() => void view(c)} onResume={() => resume(c)} onRetry={() => void run(c, 'REENVIAR')} onDownload={() => void download(c)} onDelete={() => void run(c, 'EXCLUIR')} onDetail={(id) => setDetail(id)} />)}
                    {total > cards.length && LIST_STATUS[col] && <Link href={`/marketing/publicacoes/lista?status=${LIST_STATUS[col]}`} className="py-1 text-center text-[11px] font-medium text-brand-700 hover:underline">Ver todos ({total})</Link>}
                  </div>
                </section>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400">Pausados, vendidos e retirados ficam em <Link href="/marketing/publicacoes/lista" className="underline">Anúncios</Link>; o registro completo, em <Link href="/marketing/historico" className="underline">Histórico</Link>.</p>
        </>
      )}

      {preview && <SocialPreviewDrawer card={preview} onClose={() => setPreview(null)} onDetail={(id) => { setPreview(null); setDetail(id) }} />}
      {avulso && <StoredPreview post={avulso.post} conns={avulso.conns} onClose={() => setAvulso(null)} />}
      <PublicationDetail id={detail} onClose={() => setDetail(null)} onChanged={() => void load()} />
    </div>
  )
}

function Kpi({ icon: Icon, tone, label, sub, value, onClick, className }: { icon: LucideIcon; tone: string; label: string; sub: string; value: number | string; onClick?: () => void; className?: string }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cn('flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left', onClick && 'hover:border-red-300', className)}>
      <span className={cn('rounded-lg p-2', tone)}><Icon size={16} /></span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-tight text-gray-900">{value}</span>
        <span className="block text-xs font-medium text-gray-700">{label}</span>
        <span className="block truncate text-[11px] text-gray-500" title={sub}>{sub}</span>
      </span>
    </Tag>
  )
}

function ChannelDot({ ch }: { ch: BoardChannel }) {
  const tone = STATUS_TONE[ch.status] ?? 'neutral'
  const label = `${ch.name}${ch.account ? ` · ${ch.account}` : ''}: ${STATUS_LABEL[ch.status] ?? ch.status}${ch.error ? ` — ${ch.error}` : ''}`
  const inner = <><ChannelMark channel={ch.channel} className="h-5 min-w-5 text-[9px]" /><span className={cn('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white', DOT[tone])} /></>
  return ch.url
    ? <a href={ch.url} target="_blank" rel="noreferrer" title={label} aria-label={label} className="relative inline-flex">{inner}</a>
    : <span title={label} aria-label={label} className="relative inline-flex">{inner}</span>
}

function Card({ c, col, tz, can, busy, onView, onResume, onRetry, onDownload, onDelete, onDetail }: { c: BoardCard; col: BoardColumn; tz: string; can: any; busy: boolean; onView: () => void; onResume: () => void; onRetry: () => void; onDownload: () => void; onDelete: () => void; onDetail: (id: string) => void }) {
  const err = c.channels.find((x) => x.error && (FAILED.has(x.status) || x.status === 'ACAO_MANUAL'))
  const failing = (c.kind === 'VEICULO' || c.kind === 'AVULSO') && c.channels.some((x) => FAILED.has(x.status))
  const manual = c.channels.find((x) => x.status === 'ACAO_MANUAL' && x.pubId)
  const Icon = c.kind === 'AVULSO' ? ImagePlus : c.kind === 'ASSISTENTE' ? Wand2 : FileText
  return (
    <article className={cn('rounded-lg border bg-white p-2.5 shadow-sm transition hover:shadow', col === 'atencao' ? 'border-red-200' : 'border-gray-200')}>
      <div className="flex gap-2.5">
        {c.cover ? <img src={c.cover} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-md object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700"><Icon size={18} /></span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-gray-900" title={c.title}>{c.title}</p>
          {c.subtitle && <p className="truncate text-[11px] text-gray-500">{c.subtitle}</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {c.format && <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">{c.format}</span>}
        {c.when && <span className={cn('text-gray-500', col === 'agendados' && 'font-medium text-sky-700')}>{col === 'agendados' ? '⏰ ' : ''}{whenLabel(c.when, tz)}</span>}
      </div>
      {c.channels.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{c.channels.slice(0, 8).map((ch, i) => <ChannelDot key={`${ch.connectionId ?? ch.channel}-${i}`} ch={ch} />)}{c.channels.length > 8 && <span className="text-[11px] text-gray-500">+{c.channels.length - 8}</span>}</div>}
      {err && <p className="mt-1.5 line-clamp-2 text-[11px] text-red-700" title={err.error!}>{err.error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-1.5 text-[11px]">
        {busy ? <Loader2 size={13} className="animate-spin text-gray-400" /> : (
          <>
            {c.kind !== 'ASSISTENTE' && <button type="button" onClick={onView} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><Eye size={12} />Visualizar</button>}
            {col === 'rascunhos' && can.prepare && <button type="button" onClick={onResume} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><Play size={12} />Retomar</button>}
            {failing && can.publish && <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><RotateCcw size={12} />Tentar de novo</button>}
            {c.kind === 'AVULSO' && col !== 'rascunhos' && <button type="button" onClick={onDownload} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline" title="Baixar o arquivo original e copiar a legenda para postar fora"><Download size={12} />Baixar</button>}
            {c.kind === 'VEICULO' && c.vehicleId && <AdPackageButton vehicleId={c.vehicleId} title={c.title} className="font-medium" />}
            {manual && <button type="button" onClick={() => onDetail(manual.pubId!)} className="inline-flex items-center gap-1 font-medium text-amber-700 hover:underline"><AlertTriangle size={12} />Resolver</button>}
            {(can.publish || (c.kind === 'ASSISTENTE' && can.prepare)) && <button type="button" onClick={onDelete} className="ml-auto inline-flex items-center gap-1 text-gray-500 hover:text-red-700"><Trash2 size={12} />Excluir</button>}
          </>
        )}
      </div>
    </article>
  )
}

/** Prévia de um post de rede do quadro: uma aba por conta; publicado = mídia real. */
function SocialPreviewDrawer({ card, onClose, onDetail }: { card: BoardCard; onClose: () => void; onDetail: (pubId: string) => void }) {
  const social = useMemo(() => card.channels.filter((x) => isSocialChannel(x.channel) && x.connectionId && x.pubId), [card])
  const [cur, setCur] = useState(social[0]?.pubId ?? '')
  const ch = social.find((x) => x.pubId === cur)
  const [res, setRes] = useState<{ key: string; data?: any; err?: string } | null>(null)
  useEffect(() => {
    if (!ch) return
    let live = true
    loadPreview({ publicationId: ch.pubId!, connectionId: ch.connectionId!, vehicleId: card.vehicleId, overrides: card.overrides, published: ch.status === 'PUBLICADO' })
      .then((data) => { if (live) setRes({ key: cur, data }) }).catch((e) => { if (live) setRes({ key: cur, err: (e as Error).message }) })
    return () => { live = false }
  }, [ch, cur, card])
  const r = res?.key === cur ? res : null
  return (
    <Drawer open onClose={onClose} title={`${card.format ?? 'Post'} · ${card.title}`} subtitle="Como fica no celular — aperte ▶ para tocar">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Conta">
          {social.map((x) => <button key={x.pubId} role="tab" aria-selected={cur === x.pubId} onClick={() => setCur(x.pubId!)} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs', cur === x.pubId ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-gray-200 text-gray-600')}><span className={cn('h-1.5 w-1.5 rounded-full', DOT[STATUS_TONE[x.status] ?? 'neutral'])} />{x.name} · {x.account}</button>)}
        </div>
        {r?.err && <ErrorNote message={r.err} />}
        {!r ? <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div> : r.data && <PreviewView key={cur} data={r.data} format={(card.socialFormat ?? 'POST') as PreviewFormat} />}
        {ch && <button type="button" onClick={() => onDetail(ch.pubId!)} className="btn-secondary w-full justify-center px-3 py-1.5 text-xs">Detalhes e histórico desta conta</button>}
      </div>
    </Drawer>
  )
}
