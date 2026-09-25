'use client'
/* eslint-disable @next/next/no-img-element -- fotos do estoque */

// =============================================================================
// Marketing › Publicações › Nova — fluxo principal:
//   1 Veículos · 2 Fotos (capa e ordem, aprovação) · 3 Conteúdo · 4 Canais ·
//   5 Revisão (prévia + pendências com "como resolver") · Publicar agora / Agendar
// Depois disso o envio segue sozinho em segundo plano (fila no servidor).
// =============================================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Rocket, Save, Search, Star, Wand2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ChannelMark, ErrorNote, inputCls, money, PubTabs, Thumb } from '@/components/publications/ui'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Veh { id: string; title: string; plate: string | null; year: number | null; modelYear: number | null; km: number | null; cover: string | null; photos: number; price: number | null; publishable: boolean; stockStatus: string | null; photosStatus: string; mediaApproved: boolean; mediaPending: boolean; channels: Array<{ channel: string; status: string }>; unit: string | null }
interface Conn { id: string; channel: string; label: string; status: string }
interface ChannelInfo { id: string; name: string; campaigns: boolean; publishable: boolean; devStatus: string; group: string }
interface Content { title: string; description: string; conditions: string; price: string }

const STEPS = ['Veículos', 'Fotos', 'Conteúdo', 'Canais', 'Revisão'] as const

export default function NovaPublicacaoPage() {
  return <Suspense fallback={<div className="p-6"><Loader2 className="animate-spin text-gray-400" /></div>}><Wizard /></Suspense>
}

function Wizard() {
  const params = useSearchParams()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string[]>(() => (params.get('veiculos') ?? '').split(',').filter(Boolean))
  const [vehicles, setVehicles] = useState<Record<string, Veh>>({})
  const [current, setCurrent] = useState<string | null>(null)
  const [conns, setConns] = useState<Conn[]>([])
  const [channels, setChannels] = useState<Record<string, ChannelInfo>>({})
  const [targets, setTargets] = useState<Set<string>>(new Set())
  const [campaign, setCampaign] = useState('principal')
  const [can, setCan] = useState({ prepare: false, approve: false, publish: false, connections: false })
  const [err, setErr] = useState<string | null>(null)
  const [tz, setTz] = useState('America/Sao_Paulo')

  useEffect(() => {
    api('/api/publications/connections').then((j) => {
      setConns(j.data.connections.filter((c: Conn) => c.status !== 'NAO_CONECTADO'))
      setChannels(Object.fromEntries(j.data.channels.map((c: ChannelInfo) => [c.id, c])))
      setCan(j.data.can)
    }).catch((e) => setErr((e as Error).message))
    api('/api/publications/settings').then((j) => setTz(j.data.timezone)).catch(() => undefined)
  }, [])

  const loadVehicles = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    const j = await api(`/api/publications/vehicles?ids=${ids.join(',')}`)
    setVehicles((v) => ({ ...v, ...Object.fromEntries(j.data.map((x: Veh) => [x.id, x])) }))
  }, [])
  useEffect(() => { const t = setTimeout(() => void loadVehicles(selected).catch(() => undefined), 0); return () => clearTimeout(t) }, [selected, loadVehicles])
  const cur = current && selected.includes(current) ? current : selected[0] ?? null

  const go = (n: number) => { setErr(null); setStep(Math.max(0, Math.min(STEPS.length - 1, n))) }
  const canNext = step === 0 ? selected.length > 0 : step === 3 ? targets.size > 0 : true

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/marketing/publicacoes" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft size={13} />Publicações</Link>
          <h1 className="text-xl font-bold text-gray-900">Nova publicação</h1>
        </div>
      </div>
      <PubTabs />

      <ol className="flex flex-wrap gap-1.5" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button onClick={() => (i <= step || (i === step + 1 && canNext) ? go(i) : undefined)} aria-current={i === step ? 'step' : undefined}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600', i === step ? 'border-brand-700 bg-brand-700 text-white' : i < step ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-gray-200 text-gray-500')}>
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[10px]', i < step ? 'bg-brand-600 text-white' : 'bg-white/30')}>{i < step ? <Check size={10} /> : i + 1}</span>{s}
            </button>
          </li>
        ))}
      </ol>

      {err && <ErrorNote message={err} />}

      {step === 0 && <StepVehicles selected={selected} setSelected={setSelected} vehicles={vehicles} onLoaded={(list) => setVehicles((v) => ({ ...v, ...Object.fromEntries(list.map((x) => [x.id, x])) }))} />}
      {step >= 1 && step <= 2 && selected.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Veículo em edição">
          {selected.map((id) => <button key={id} role="tab" aria-selected={cur === id} onClick={() => setCurrent(id)} className={cn('flex items-center gap-2 rounded-lg border px-2 py-1 text-xs', cur === id ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-gray-200 text-gray-600')}><Thumb src={vehicles[id]?.cover} className="h-6 w-8" />{vehicles[id]?.title ?? '…'}{vehicles[id]?.mediaApproved && <CheckCircle2 size={12} className="text-green-600" />}</button>)}
        </div>
      )}
      {step === 1 && cur && <StepPhotos key={cur} vehicleId={cur} canApprove={can.approve} onApproved={() => loadVehicles([cur])} />}
      {step === 2 && cur && <StepContent key={cur} vehicleId={cur} />}
      {step === 3 && <StepChannels conns={conns} channels={channels} targets={targets} setTargets={setTargets} campaign={campaign} setCampaign={setCampaign} />}
      {step === 4 && <StepReview vehicleIds={selected} connectionIds={[...targets]} vehicles={vehicles} campaign={campaign} channels={channels} conns={conns} can={can} tz={tz} goTo={go} onDone={() => router.push('/marketing/publicacoes')} />}

      {step < 4 && (
        <div className="sticky bottom-2 z-10 flex items-center justify-between rounded-xl border border-gray-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <button onClick={() => go(step - 1)} disabled={step === 0} className="btn-secondary px-3 py-1.5 text-xs"><ChevronLeft size={14} />Voltar</button>
          <span className="text-xs text-gray-500">{selected.length} veículo(s){targets.size ? ` · ${targets.size} destino(s)` : ''}</span>
          <button onClick={() => go(step + 1)} disabled={!canNext} className="btn-primary px-3 py-1.5 text-xs">Continuar<ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  )
}

// ── 1. Veículos ──────────────────────────────────────────────────────────────
function StepVehicles({ selected, setSelected, vehicles, onLoaded }: { selected: string[]; setSelected: (f: (s: string[]) => string[]) => void; vehicles: Record<string, Veh>; onLoaded: (l: Veh[]) => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<Veh[] | null>(null)
  useEffect(() => {
    const t = setTimeout(() => { api(`/api/publications/vehicles${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then((j) => { setList(j.data); onLoaded(j.data) }).catch(() => setList([])) }, 250)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  return (
    <section className="space-y-3">
      <div className="relative sm:max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no estoque (marca, modelo, placa)" className={cn(inputCls, 'pl-9')} aria-label="Buscar no estoque" /></div>
      {selected.length > 0 && <div className="flex flex-wrap gap-1.5">{selected.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-900">{vehicles[id]?.title ?? id}<button onClick={() => toggle(id)} aria-label="Remover"><X size={12} /></button></span>)}</div>}
      {!list ? <Loader2 className="animate-spin text-gray-400" /> : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => {
            const on = selected.includes(v.id)
            return (
              <li key={v.id}>
                <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-2.5 focus-within:ring-2 focus-within:ring-brand-600', on ? 'border-brand-500 bg-brand-50/40' : 'border-gray-200 hover:border-gray-300', !v.publishable && 'opacity-60')}>
                  <input type="checkbox" checked={on} onChange={() => toggle(v.id)} disabled={!v.publishable} className="rounded border-gray-300 text-brand-600" />
                  <Thumb src={v.cover} className="h-12 w-16" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{v.title}</span>
                    <span className="block text-xs text-gray-500">{[v.plate, v.modelYear, money(v.price)].filter(Boolean).join(' · ')}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                      <span className={cn('rounded px-1', v.photos ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-700')}>{v.photos} foto(s)</span>
                      {v.photosStatus === 'TRATADA' && <span className="rounded bg-violet-50 px-1 text-violet-700">tratadas</span>}
                      {v.mediaApproved ? <span className="rounded bg-green-50 px-1 text-green-700">fotos aprovadas</span> : v.mediaPending ? <span className="rounded bg-amber-50 px-1 text-amber-700">aprovação pendente</span> : null}
                      {v.channels.length > 0 && <span className="rounded bg-gray-100 px-1 text-gray-600">{v.channels.length} canal(is)</span>}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
          {!list.length && <li className="text-sm text-gray-500">Nenhum veículo disponível encontrado.</li>}
        </ul>
      )}
    </section>
  )
}

// ── 2. Fotos ─────────────────────────────────────────────────────────────────
function StepPhotos({ vehicleId, canApprove, onApproved }: { vehicleId: string; canApprove: boolean; onApproved: () => void }) {
  const [data, setData] = useState<any>(null)
  const [order, setOrder] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    api(`/api/publications/drafts/${vehicleId}`).then((j) => {
      setData(j.data)
      const approved = Array.isArray(j.data.draft?.photos) ? (j.data.draft.photos as string[]).filter((u) => j.data.gallery.includes(u) || j.data.originals.includes(u)) : []
      setOrder(approved.length ? approved : j.data.gallery)
    }).catch((e) => setMsg({ ok: false, text: (e as Error).message }))
  }, [vehicleId])
  const pool = useMemo(() => (data ? [...new Set<string>([...data.gallery, ...data.originals])].filter((u) => !order.includes(u)) : []), [data, order])
  const move = (i: number, d: number) => setOrder((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n })
  const cover = (i: number) => setOrder((o) => [o[i], ...o.filter((_, k) => k !== i)])
  const approve = async () => {
    setBusy(true); setMsg(null)
    try {
      const j = await api(`/api/publications/drafts/${vehicleId}`, { method: 'POST', json: { action: 'aprovar', photos: order } })
      setMsg({ ok: true, text: `Fotos aprovadas.${j.updates ? ` ${j.updates} anúncio(s) serão atualizados.` : ''}${j.autoPublished?.length ? ` Regra automática: ${j.autoPublished.length} destino(s) na fila.` : ''}` }); onApproved()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  if (!data) return <Loader2 className="animate-spin text-gray-400" />
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{data.vehicle.title}</p>
          <p className="text-xs text-gray-500">A 1ª foto é a capa. Use as setas para ordenar. {data.vehicle.photosStatus === 'TRATADA' ? 'Fotos tratadas no estúdio; as originais ficam preservadas abaixo.' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {data.draft?.approvedAt && <span className="text-xs text-green-700">Aprovadas em {new Date(data.draft.approvedAt).toLocaleDateString('pt-BR')}</span>}
          {canApprove ? <button onClick={approve} disabled={busy || !order.length} className="btn-primary px-3 py-1.5 text-xs">{busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Aprovar fotos</button> : <span className="text-xs text-amber-700">Aprovação: gestor</span>}
        </div>
      </div>
      {msg && <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{msg.text}</p>}
      {!order.length && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Sem fotos. <Link className="underline" href={`/estoque/${vehicleId}`}>Envie as fotos no estoque</Link>.</p>}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {order.map((u, i) => (
          <li key={u} className={cn('overflow-hidden rounded-xl border bg-white', i === 0 ? 'border-brand-500 ring-1 ring-brand-500' : 'border-gray-200')}>
            <div className="relative aspect-[4/3] bg-gray-100"><img src={u} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />{i === 0 && <span className="absolute left-1 top-1 rounded bg-brand-700 px-1.5 text-[10px] font-semibold text-white">Capa</span>}</div>
            <div className="flex items-center justify-between px-1 py-1">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="Mover para a esquerda"><ArrowLeft size={14} /></button>
              <button onClick={() => cover(i)} disabled={i === 0} className="rounded p-1 text-gray-500 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-30" aria-label="Usar como capa"><Star size={14} /></button>
              <button onClick={() => setOrder((o) => o.filter((x) => x !== u))} className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Não usar esta foto"><X size={14} /></button>
              <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="Mover para a direita"><ArrowRight size={14} /></button>
            </div>
          </li>
        ))}
      </ul>
      {pool.length > 0 && (
        <details className="rounded-xl border border-gray-200 p-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-600">Fotos não usadas / originais ({pool.length})</summary>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">{pool.map((u) => <li key={u}><button onClick={() => setOrder((o) => [...o, u])} className="block w-full overflow-hidden rounded-lg border border-gray-200 hover:border-brand-500" aria-label="Adicionar foto"><img src={u} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" /></button></li>)}</ul>
        </details>
      )}
    </section>
  )
}

// ── 3. Conteúdo ──────────────────────────────────────────────────────────────
function StepContent({ vehicleId }: { vehicleId: string }) {
  const [data, setData] = useState<any>(null)
  const [c, setC] = useState<Content>({ title: '', description: '', conditions: '', price: '' })
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const dirty = useRef(false)
  useEffect(() => {
    api(`/api/publications/drafts/${vehicleId}`).then((j) => {
      setData(j.data)
      setC({ title: j.data.draft?.title ?? '', description: j.data.draft?.description ?? '', conditions: j.data.draft?.conditions ?? '', price: j.data.draft?.price != null ? String(j.data.draft.price) : '' })
    }).catch((e) => setMsg((e as Error).message))
  }, [vehicleId])
  const save = useCallback(async () => {
    if (!dirty.current) return
    setState('saving')
    try { await api(`/api/publications/drafts/${vehicleId}`, { method: 'PUT', json: { ...c, price: c.price ? Number(c.price) : null } }); dirty.current = false; setState('saved') } catch (e) { setState('error'); setMsg((e as Error).message) }
  }, [c, vehicleId])
  // Salva ao sair da etapa (ou trocar de veículo) — não a cada tecla.
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save }, [save])
  useEffect(() => () => { void saveRef.current() }, [])
  const set = (p: Partial<Content>) => { dirty.current = true; setState('idle'); setC((x) => ({ ...x, ...p })) }
  if (!data) return msg ? <ErrorNote message={msg} /> : <Loader2 className="animate-spin text-gray-400" />
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr,18rem]">
      <div className="space-y-3">
        <label className="block text-xs font-medium text-gray-600">Título<input className={inputCls} value={c.title} placeholder={data.suggestions.title} onChange={(e) => set({ title: e.target.value })} maxLength={150} /></label>
        <label className="block text-xs font-medium text-gray-600">
          <span className="flex items-center justify-between">Descrição<button type="button" onClick={() => set({ description: data.suggestions.description })} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Wand2 size={12} />Usar texto sugerido</button></span>
          <textarea rows={8} className={inputCls} value={c.description} placeholder={data.suggestions.description} onChange={(e) => set({ description: e.target.value })} />
          <span className="text-[11px] text-gray-400">Vazio = texto gerado só com a ficha do estoque. Não inclua opcionais, garantia ou financiamento que não existam.</span>
        </label>
        <label className="block text-xs font-medium text-gray-600">Condições comerciais<textarea rows={3} className={inputCls} value={c.conditions} placeholder="Ex.: Aceita troca. Documentação em dia." onChange={(e) => set({ conditions: e.target.value })} maxLength={1000} /></label>
        <label className="block text-xs font-medium text-gray-600">Preço anunciado<input inputMode="numeric" className={inputCls} value={c.price} placeholder={data.vehicle.price != null ? `${money(data.vehicle.price)} (estoque)` : 'Defina no estoque'} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        <div className="flex items-center gap-2"><button onClick={save} className="btn-secondary px-3 py-1.5 text-xs"><Save size={14} />Salvar</button><span className="text-xs text-gray-500" role="status">{state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Salvo' : state === 'error' ? msg : ''}</span></div>
      </div>
      <aside className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        <p className="font-semibold text-gray-800">Ficha do estoque</p>
        <p>{[data.vehicle.brand, data.vehicle.model, data.vehicle.version].filter(Boolean).join(' ')}</p>
        <p>{data.vehicle.year ?? '—'}/{data.vehicle.modelYear ?? '—'} · {data.vehicle.km != null ? `${data.vehicle.km.toLocaleString('pt-BR')} km` : 'km —'}</p>
        <p>{[data.vehicle.fuel, data.vehicle.transmission, data.vehicle.color].filter(Boolean).join(' · ') || '—'}</p>
        <p>Placa {data.vehicle.plate ?? '—'} · {data.vehicle.doors ?? '—'} portas</p>
        {data.options?.length > 0 && <p>Opcionais: {data.options.join(', ')}</p>}
        <Link href={`/estoque/${vehicleId}`} className="inline-block font-medium text-brand-700 hover:underline">Corrigir a ficha no estoque</Link>
      </aside>
    </section>
  )
}

// ── 4. Canais ────────────────────────────────────────────────────────────────
function StepChannels({ conns, channels, targets, setTargets, campaign, setCampaign }: { conns: Conn[]; channels: Record<string, ChannelInfo>; targets: Set<string>; setTargets: (s: Set<string>) => void; campaign: string; setCampaign: (s: string) => void }) {
  const usable = conns.filter((c) => channels[c.channel]?.publishable)
  const hasSocial = [...targets].some((id) => channels[conns.find((c) => c.id === id)?.channel ?? '']?.campaigns)
  const toggle = (id: string) => { const n = new Set(targets); if (n.has(id)) n.delete(id); else n.add(id); setTargets(n) }
  return (
    <section className="space-y-3">
      <p className="text-sm text-gray-600">Escolha os destinos. Só aparecem contas conectadas da sua loja.</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {usable.map((c) => {
          const ch = channels[c.channel]
          const ok = c.status === 'CONECTADO'
          return (
            <li key={c.id}>
              <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 focus-within:ring-2 focus-within:ring-brand-600', targets.has(c.id) ? 'border-brand-500 bg-brand-50/40' : 'border-gray-200', !ok && 'cursor-not-allowed opacity-60')}>
                <input type="checkbox" checked={targets.has(c.id)} onChange={() => toggle(c.id)} disabled={!ok} className="rounded border-gray-300 text-brand-600" />
                <ChannelMark channel={c.channel} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-900">{ch?.name}</span><span className="block truncate text-xs text-gray-500">{c.label}{!ok ? ` · ${c.status === 'RECONECTAR' ? 'reconectar' : 'com pendência'}` : ''}</span></span>
                {ch?.devStatus === 'AGUARDANDO_HOMOLOGACAO' && <span className="rounded bg-amber-50 px-1.5 text-[10px] text-amber-700" title="Conector implementado pelo contrato oficial; ainda sem homologação com o portal.">homologação</span>}
              </label>
            </li>
          )
        })}
      </ul>
      {!usable.length && <p className="text-sm text-gray-500">Nenhuma conta conectada.</p>}
      <Link href="/marketing/canais" className="inline-block text-xs font-medium text-brand-700 hover:underline">Conectar mais canais</Link>
      {hasSocial && (
        <label className="block max-w-sm text-xs font-medium text-gray-600">Nome da campanha (redes sociais)
          <input className={inputCls} value={campaign} onChange={(e) => setCampaign(e.target.value.slice(0, 60))} />
          <span className="text-[11px] text-gray-400">Use outro nome para um novo post do mesmo carro (ex.: “promoção-outubro”).</span>
        </label>
      )}
    </section>
  )
}

// ── 5. Revisão + publicar ───────────────────────────────────────────────────
function StepReview({ vehicleIds, connectionIds, vehicles, campaign, channels, conns, can, tz, goTo, onDone }: { vehicleIds: string[]; connectionIds: string[]; vehicles: Record<string, Veh>; campaign: string; channels: Record<string, ChannelInfo>; conns: Conn[]; can: { prepare: boolean; publish: boolean }; tz: string; goTo: (n: number) => void; onDone: () => void }) {
  const [items, setItems] = useState<any[] | null>(null)
  const [checks, setChecks] = useState<Record<string, any[]>>({})
  const [err, setErr] = useState<string | null>(null)
  const [when, setWhen] = useState('')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<any[] | null>(null)
  const requestKey = useRef<string>(crypto.randomUUID())
  const load = useCallback(() => {
    setItems(null)
    api('/api/publications/preview', { method: 'POST', json: { vehicleIds, connectionIds, checkPhotos: true } }).then((j) => { setItems(j.items); setChecks(j.photoChecks ?? {}) }).catch((e) => setErr((e as Error).message))
  }, [vehicleIds, connectionIds])
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  const blocked = items?.filter((i) => i.blocked).length ?? 0
  const submit = async (mode: 'AGORA' | 'AGENDAR' | 'RASCUNHO') => {
    if (sending) return // clique duplo
    setSending(true); setErr(null)
    try {
      const targets = vehicleIds.flatMap((v) => connectionIds.map((c) => ({ vehicleId: v, connectionId: c, campaignKey: campaign })))
      const j = await api('/api/publications', { method: 'POST', json: { targets, mode, scheduledLocal: mode === 'AGENDAR' ? when : undefined, requestKey: requestKey.current } })
      setResults(j.results)
    } catch (e) { setErr((e as Error).message); requestKey.current = crypto.randomUUID() } finally { setSending(false) }
  }
  const fixStep = (field: string) => (field === 'photos' || field === 'media' ? 1 : field === 'connection' ? 3 : 2)
  const connName = (id: string) => { const c = conns.find((x) => x.id === id); return c ? `${channels[c.channel]?.name ?? c.channel} · ${c.label}` : id }

  if (results) {
    const ok = results.filter((r) => ['ENFILEIRADO', 'AGENDADO', 'JA_NA_FILA', 'RASCUNHO'].includes(r.status)).length
    return (
      <section className="space-y-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800"><b>{ok} de {results.length}</b> registrado(s). O envio segue em segundo plano; a situação muda para “Publicado” só quando o canal confirmar.</div>
        <ul className="space-y-1 text-xs">{results.map((r, i) => <li key={i} className={['ERRO', 'BLOQUEADO'].includes(r.status) ? 'text-red-700' : 'text-gray-700'}>{['ERRO', 'BLOQUEADO'].includes(r.status) ? '✕' : '✓'} {vehicles[r.vehicleId]?.title ?? r.vehicleId} · {connName(r.connectionId)} — {r.message}</li>)}</ul>
        <button onClick={onDone} className="btn-primary px-3 py-1.5 text-xs">Acompanhar publicações</button>
      </section>
    )
  }
  return (
    <section className="space-y-4">
      {err && <ErrorNote message={err} />}
      {!items ? <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" />Montando a prévia e conferindo as fotos…</div> : (
        <>
          <p className="text-sm text-gray-700">{items.length - blocked} pronto(s) · <span className={blocked ? 'font-semibold text-red-700' : ''}>{blocked} com pendência</span></p>
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={`${it.vehicleId}:${it.connectionId}`} className={cn('rounded-xl border bg-white p-3', it.blocked ? 'border-red-200' : 'border-gray-200')}>
                <div className="flex flex-wrap items-start gap-3">
                  <Thumb src={it.payload.photos[0]} className="h-14 w-20" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs text-gray-500"><ChannelMark channel={it.channel} />{it.channelName}</p>
                    <p className="truncate text-sm font-semibold text-gray-900">{it.payload.title}</p>
                    <p className="text-xs text-gray-600">{money(it.payload.price)} · {it.payload.photos.length} foto(s)</p>
                  </div>
                  {it.blocked ? <span className="text-xs font-medium text-red-700">Pendente</span> : <span className="text-xs font-medium text-green-700">Pronto</span>}
                </div>
                {it.issues.length > 0 && <ul className="mt-2 space-y-1">{it.issues.map((i: any, k: number) => <li key={k} className={cn('flex flex-wrap items-center gap-1 text-[11px]', i.severity === 'error' ? 'text-red-700' : 'text-amber-700')}>• {i.message} <span className="text-gray-500">{i.hint}</span>{i.severity === 'error' && <button onClick={() => goTo(fixStep(i.field))} className="font-medium text-brand-700 underline">Corrigir</button>}</li>)}</ul>}
                <details className="mt-1"><summary className="cursor-pointer text-[11px] text-gray-500">Ver texto</summary><p className="mt-1 whitespace-pre-line text-xs text-gray-600">{it.channel === 'INSTAGRAM' || it.channel === 'META_PAGE' || it.channel === 'MANUAL_SOCIAL' ? it.payload.caption : it.payload.description}</p></details>
              </li>
            ))}
          </ul>
          {Object.entries(checks).map(([vid, list]) => list.some((c: any) => !c.ok) && (
            <div key={vid} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p className="font-semibold">Fotos de {vehicles[vid]?.title ?? vid}</p><ul>{list.filter((c: any) => !c.ok).map((c: any, i: number) => <li key={i}>• {c.problem}</li>)}</ul><button onClick={() => goTo(1)} className="mt-1 font-medium underline">Revisar fotos</button></div>
          ))}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
            {can.publish && <button onClick={() => submit('AGORA')} disabled={sending || items.length === blocked} className="btn-primary px-4 py-2 text-sm">{sending ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}Publicar agora</button>}
            {can.publish && (
              <div className="flex items-end gap-2">
                <label className="text-xs text-gray-600">Agendar ({tz.replace('_', ' ')})<input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></label>
                <button onClick={() => submit('AGENDAR')} disabled={sending || !when || items.length === blocked} className="btn-secondary px-3 py-2 text-sm"><CalendarClock size={15} />Agendar</button>
              </div>
            )}
            {can.prepare && <button onClick={() => submit('RASCUNHO')} disabled={sending} className="btn-secondary ml-auto px-3 py-2 text-sm"><Save size={15} />Salvar como rascunho</button>}
            {!can.publish && <p className="w-full text-xs text-gray-500">Publicar e agendar: permissão de gestor. Salve como rascunho para aprovação.</p>}
          </div>
          {blocked > 0 && <p className="text-xs text-gray-500">Destinos com pendência não são enviados; os demais seguem normalmente.</p>}
        </>
      )}
    </section>
  )
}
