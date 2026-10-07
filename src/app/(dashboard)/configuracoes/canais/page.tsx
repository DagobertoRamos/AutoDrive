'use client'

// =============================================================================
// Configurações › Canais e integrações — Hub único dos canais da loja.
// Cada card mostra o estado REAL (Conectado / Configuração necessária /
// Atenção / Desconectado). O assistente leva às telas de conexão já existentes
// (Central de Publicações, canais de captação, WhatsApp, site, telefonia).
// =============================================================================

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Loader2, Search, Settings2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint } from '@/components/ui/help-hint'
import {
  AVAILABILITY_LABEL, CAPABILITY_LABEL, HUB_CATEGORY_LABEL, searchHub,
  type Availability, type Capability, type CapState, type ConnectionState, type HubCategory, type HubItem,
} from '@/lib/integrations/hub/catalog-core'

interface Part { kind: string; state: ConnectionState; message: string; lastActivityAt?: string | null; action?: { label: string; href: string }; detail?: string }
interface Item {
  id: string; name: string; category: HubCategory; color: string; hint: string; prerequisites: string[]
  caps: Partial<Record<Capability, CapState>>; availability: Availability; state: ConnectionState; stateLabel: string
  summary: string; lastActivityAt: string | null; parts: Part[]
}
interface HubData { items: Item[]; attention: { id: string; name: string; message: string; action?: { label: string; href: string } }[] }

const STATE_TONE: Record<ConnectionState, string> = {
  CONECTADO: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  CONFIGURACAO_NECESSARIA: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  ATENCAO: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
  DESCONECTADO: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-white/5 dark:text-gray-400 dark:border-white/10',
}

const CAP_TEXT: Record<CapState, string> = { SIM: 'Sim', HOMOLOGACAO: 'Em homologação', CONTRATO: 'Requer contrato', EM_BREVE: 'Em breve', NAO: 'Não' }
const CAP_TONE: Record<CapState, string> = { SIM: 'text-emerald-600', HOMOLOGACAO: 'text-amber-600', CONTRATO: 'text-gray-500', EM_BREVE: 'text-gray-400', NAO: 'text-gray-300' }

/** Principais canais para quem está começando. */
const STARTER = ['webmotors', 'olx', 'mercado_livre', 'whatsapp', 'facebook', 'instagram', 'tiktok', 'google_ads']

function ago(iso: string | null): string {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  if (m < 1440) return `há ${Math.floor(m / 60)} h`
  return `há ${Math.floor(m / 1440)} d`
}

function Logo({ name, color }: { name: string; color: string }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: color }}>{name.slice(0, 1)}</span>
}

export default function CanaisPage() {
  const [data, setData] = useState<HubData | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<HubCategory | 'TODOS'>('TODOS')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/integrations/hub', { cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Erro'); setData(j.data) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Não foi possível carregar os canais.'))
  }, [])

  const visible = useMemo(() => {
    if (!data) return []
    const found = searchHub(data.items as unknown as HubItem[], q) as unknown as Item[]
    return cat === 'TODOS' ? found : found.filter((i) => i.category === cat)
  }, [data, q, cat])

  const nothingConnected = !!data && data.items.every((i) => i.state === 'DESCONECTADO' || i.id === 'site')
  const open = data?.items.find((i) => i.id === openId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-1.5 text-xl font-bold text-gray-900 dark:text-white">
          Canais e integrações
          <HelpHint text="Conecte os portais, redes, mensagens e anúncios que a loja usa. O estoque sai daqui para os canais e os leads e mensagens entram no CRM." />
        </h1>
        <Link href="/configuracoes/canais/tecnico" className="btn-secondary text-xs"><Settings2 size={12} />Detalhes técnicos</Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <div className="flex justify-center p-10"><Loader2 size={20} className="animate-spin text-gray-400" /></div>}

      {data && data.attention.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300"><AlertTriangle size={14} />Precisa da sua atenção</p>
          <ul className="mt-1.5 space-y-1">
            {data.attention.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-200">
                <span className="font-medium">{a.name}:</span><span>{a.message}</span>
                {a.action && <Link href={a.action.href} className="font-semibold underline">{a.action.label}</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && nothingConnected && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Conecte seus canais</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STARTER.map((id) => data.items.find((i) => i.id === id)).filter(Boolean).map((i) => (
              <button key={i!.id} onClick={() => setOpenId(i!.id)} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-left text-sm hover:border-brand-300 dark:border-white/10">
                <Logo name={i!.name} color={i!.color} /><span className="flex-1 truncate">{i!.name}</span><span className="text-xs font-semibold text-brand-600">Conectar</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">Você pode configurar só os que usa e voltar depois.</p>
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar canal" className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm focus:border-brand-400 focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-white" />
            </div>
            <div className="flex flex-wrap gap-1">
              {(['TODOS', ...Object.keys(HUB_CATEGORY_LABEL)] as (HubCategory | 'TODOS')[]).map((c) => (
                <button key={c} onClick={() => setCat(c)} className={cn('rounded-full px-2.5 py-1 text-xs font-medium', cat === c ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300')}>
                  {c === 'TODOS' ? 'Todos' : HUB_CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((i) => (
              <button key={i.id} onClick={() => setOpenId(i.id)} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-brand-300 hover:shadow-sm dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center gap-2.5">
                  <Logo name={i.name} color={i.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{i.name}</p>
                    <p className="text-[11px] text-gray-400">{HUB_CATEGORY_LABEL[i.category]}</p>
                  </div>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', STATE_TONE[i.state])}>{i.stateLabel}</span>
                </div>
                <p className="line-clamp-2 text-xs text-gray-600 dark:text-gray-300">{i.summary}</p>
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span>{i.availability !== 'DISPONIVEL' ? AVAILABILITY_LABEL[i.availability] : i.lastActivityAt ? `Última atividade ${ago(i.lastActivityAt)}` : ''}</span>
                  <ChevronRight size={14} />
                </div>
              </button>
            ))}
            {!visible.length && <p className="text-sm text-gray-500">Nenhum canal encontrado.</p>}
          </div>
        </>
      )}

      {open && <Assistant item={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}

/** Assistente: pré-requisitos → conectar (cada parte) → recursos → testar. */
function Assistant({ item, onClose }: { item: Item; onClose: () => void }) {
  const caps = Object.entries(item.caps) as [Capability, CapState][]
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md space-y-5 overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <Logo name={item.name} color={item.color} />
          <div className="flex-1">
            <p className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white">{item.name}<HelpHint text={item.hint} /></p>
            <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', STATE_TONE[item.state])}>{item.stateLabel}</span>
          </div>
          <button onClick={onClose} aria-label="Fechar"><X size={18} className="text-gray-400" /></button>
        </div>

        {item.prerequisites.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold uppercase text-gray-400">1. Antes de começar</p>
            <ul className="mt-1.5 space-y-1 text-sm text-gray-700 dark:text-gray-300">
              {item.prerequisites.map((p) => <li key={p}>• {p}</li>)}
            </ul>
          </section>
        )}

        <section>
          <p className="text-[11px] font-semibold uppercase text-gray-400">{item.prerequisites.length ? '2. ' : '1. '}Conectar</p>
          <div className="mt-1.5 space-y-2">
            {item.parts.map((p, idx) => (
              <div key={idx} className="rounded-lg border border-gray-200 p-2.5 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', p.state === 'CONECTADO' ? 'bg-emerald-500' : p.state === 'ATENCAO' ? 'bg-red-500' : p.state === 'CONFIGURACAO_NECESSARIA' ? 'bg-amber-500' : 'bg-gray-300')} />
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{p.message}</span>
                  {p.detail && <HelpHint title="Detalhe" text={p.detail} />}
                </div>
                {p.action && <Link href={p.action.href} className="mt-2 inline-flex text-xs font-semibold text-brand-600 hover:underline">{p.action.label}</Link>}
              </div>
            ))}
            {!item.parts.length && <p className="text-sm text-gray-500">{AVAILABILITY_LABEL[item.availability]}. Nada a configurar agora.</p>}
          </div>
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase text-gray-400">Recursos</p>
          <ul className="mt-1.5 divide-y divide-gray-100 text-sm dark:divide-white/5">
            {caps.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between py-1.5">
                <span className="text-gray-700 dark:text-gray-300">{CAPABILITY_LABEL[k]}</span>
                <span className={cn('text-xs font-medium', CAP_TONE[v])}>{CAP_TEXT[v]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
