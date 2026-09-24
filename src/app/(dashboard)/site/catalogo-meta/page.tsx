'use client'
/* eslint-disable @next/next/no-img-element -- miniaturas do feed */

// =============================================================================
// Painel do Site — Catálogo Meta (porta de Configurações → Integrações → Meta
// do dagobertoeasycar). Feed CSV com os carros publicados, que a Meta busca
// sozinha (Facebook, Instagram e catálogo do WhatsApp). Mostra o que entra, o
// que fica de fora e por quê.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Copy, Download, Loader2, RefreshCw, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Issue { id: string; title: string; code: 'SEM_FOTO' | 'SEM_PRECO' | 'LINK_SEM_HTTPS'; message: string }
interface Report {
  enabled: boolean; siteEnabled: boolean; catalog: { enabled: boolean; city: string; state: string }; feedUrl: string
  total: number; exported: number; ignored: number; issues: Issue[]
  items: { id: string; title: string; price: string; sale_price: string; image_link: string; link: string }[]
}

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const brl = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—' }

export default function SiteMetaCatalogPage() {
  const [r, setR] = useState<Report | null>(null)
  const [city, setCity] = useState('')
  const [uf, setUf] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = useCallback((j: { data?: Report } | null) => {
    if (!j?.data) return
    setR(j.data); setCity(j.data.catalog.city); setUf(j.data.catalog.state)
  }, [])
  const fetchReport = () => fetch('/api/site-admin/meta-feed', { credentials: 'include' }).then((x) => x.json()).catch(() => null)
  const load = useCallback(async () => apply(await fetchReport()), [apply])
  useEffect(() => {
    let alive = true
    void fetchReport().then((j) => { if (alive) apply(j) })
    return () => { alive = false }
  }, [apply])

  const save = async (patch: Partial<Report['catalog']>) => {
    if (!r) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/site-admin/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ catalog: { ...r.catalog, city, state: uf, ...patch } }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao salvar.' }); return }
      await load(); setMsg({ ok: true, text: 'Catálogo atualizado.' })
    } finally { setBusy(false) }
  }

  if (!r) return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
  const noHttps = r.issues.some((i) => i.code === 'LINK_SEM_HTTPS')
  const left = r.issues.filter((i) => i.code !== 'LINK_SEM_HTTPS')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><ShoppingBag size={20} className="text-brand-600" />Catálogo Meta</h1>
          <p className="text-sm text-gray-500">Seus carros no Facebook, Instagram e no catálogo do WhatsApp, atualizados sozinhos a partir do estoque.</p>
        </div>
        <button onClick={() => void load()} className="btn-secondary text-xs"><RefreshCw size={13} />Atualizar</button>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Feed do catálogo</h2>
            <p className="text-xs text-gray-500">Com o feed ligado, a Meta busca a lista de carros nesta URL. Entram só os carros publicados (com fotos e preço).</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={r.catalog.enabled} disabled={busy} onChange={(e) => void save({ enabled: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Feed ligado
          </label>
        </div>
        {!r.siteEnabled && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">O site está fora do ar: o feed só responde com o site ligado (<Link href="/site/configuracoes" className="underline">Configurações do site</Link>).</p>}
        {r.catalog.enabled && (
          <div className="mt-3">
            <span className="mb-1 block text-xs font-medium text-gray-600">URL do feed (cole na Meta)</span>
            <div className="flex gap-2">
              <input readOnly value={r.feedUrl} className={cn(input, 'font-mono text-xs')} onFocus={(e) => e.currentTarget.select()} />
              <button onClick={() => { void navigator.clipboard.writeText(r.feedUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} className="btn-secondary shrink-0 text-xs">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copiado' : 'Copiar'}</button>
              <a href="/api/site-admin/meta-feed?download=1" className="btn-secondary shrink-0 text-xs"><Download size={13} />CSV</a>
            </div>
            {noHttps && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle size={13} className="mt-0.5 shrink-0" />O site ainda está no endereço de teste (sem https). A Meta só aceita o feed depois que o site estiver no domínio publicado.</p>}
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_90px_auto] sm:items-end">
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Cidade dos anúncios</span><input className={input} value={city} maxLength={80} placeholder="Ex.: Osasco" onChange={(e) => setCity(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">UF</span><input className={input} value={uf} maxLength={2} placeholder="SP" onChange={(e) => setUf(e.target.value.toUpperCase())} /></label>
          <button onClick={() => void save({})} disabled={busy || (city === r.catalog.city && uf === r.catalog.state)} className="btn-primary text-sm">{busy && <Loader2 size={14} className="animate-spin" />}Salvar</button>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Vazio = usa a cidade do endereço da loja.</p>
        {msg && <p className={cn('mt-2 text-xs', msg.ok ? 'text-green-700' : 'text-red-600')}>{msg.text}</p>}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {[['Carros no site', r.total], ['No catálogo', r.exported], ['Fora do catálogo', r.ignored]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card"><p className="text-xs text-gray-500">{l}</p><p className="text-2xl font-bold tabular-nums text-gray-900">{v}</p></div>
        ))}
      </div>

      {left.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Fora do catálogo</h2>
          <ul className="space-y-1.5 text-sm">
            {left.map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2"><span className="text-gray-800">{i.title}</span><span className="flex items-center gap-2 text-xs text-amber-800">{i.message}<Link href={`/estoque/${i.id}`} className="font-medium underline">Abrir no estoque</Link></span></li>)}
          </ul>
        </section>
      )}

      {r.items.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">No catálogo</h2>
          <ul className="divide-y divide-gray-100">
            {r.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <img src={i.image_link} alt="" className="h-10 w-14 shrink-0 rounded bg-gray-100 object-cover" />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{i.title}</span>
                <span className="text-xs text-gray-600">{i.sale_price ? <><s className="text-gray-400">{brl(i.price)}</s> <b>{brl(i.sale_price)}</b></> : <b>{brl(i.price)}</b>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-card">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Como ligar na Meta</h2>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-600">
          <li>No Gerenciador de Commerce da Meta, abra (ou crie) o catálogo da loja.</li>
          <li>Vá em <b>Fontes de dados → Adicionar itens → Feed de dados → URL programada</b>.</li>
          <li>Cole a URL do feed acima e escolha atualização <b>diária</b> (ou a cada hora).</li>
          <li>Moeda BRL. A Meta importa e depois busca sozinha os carros novos, vendidos e as promoções.</li>
          <li>Para o WhatsApp, conecte o mesmo catálogo à conta do WhatsApp Business.</li>
        </ol>
      </section>
    </div>
  )
}
