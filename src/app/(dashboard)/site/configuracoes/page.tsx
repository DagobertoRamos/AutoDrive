'use client'

// =============================================================================
// Painel do Site — Configurações do site da loja (S1): publicação e endereço,
// identidade, contato, textos da página inicial e de "Quem somos", serviços.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Eye, ExternalLink, Globe, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SiteConfig } from '@/lib/site/config-core'
import { cleanGoogleTagId, cleanMetaPixelId } from '@/lib/site/tracking-core'
import { BrandingSection } from './BrandingSection'
import { DomainsSection } from './DomainsSection'
import { LayoutSection } from './LayoutSection'

interface ServiceDef { key: string; label: string; locked: boolean; available: boolean; hint: string }
interface Payload { config: SiteConfig; services: ServiceDef[]; stats: { total: number; published: number; comingSoon: number }; canManage: boolean; siteBaseDomain: string | null; hostingIntegration: boolean }

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50'
const label = 'mb-1 block text-xs font-medium text-gray-600'

const fetchConfig = () => fetch('/api/site-admin/config', { credentials: 'include' }).then((r) => r.json()).catch(() => null)

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {hint && <p className="mb-3 text-xs text-gray-500">{hint}</p>}
      <div className={cn(!hint && 'mt-3')}>{children}</div>
    </section>
  )
}

function Field({ l, children, className }: { l: string; children: React.ReactNode; className?: string }) {
  return <label className={cn('block', className)}><span className={label}>{l}</span>{children}</label>
}

export default function SiteConfigPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const apply = useCallback((j: { data?: Payload } | null) => {
    if (j?.data) { setData(j.data); setCfg(j.data.config); setDirty(false) }
  }, [])
  const load = useCallback(async () => apply(await fetchConfig()), [apply])
  useEffect(() => {
    let alive = true
    void fetchConfig().then((j) => { if (alive) apply(j) })
    return () => { alive = false }
  }, [apply])

  if (!data || !cfg) return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
  const dis = !data.canManage
  const set = (patch: Partial<SiteConfig>) => { setCfg({ ...cfg, ...patch }); setDirty(true); setMsg(null) }
  const setIn = <K extends 'identity' | 'contact' | 'home' | 'about' | 'seo' | 'tracking'>(k: K, patch: Partial<SiteConfig[K]>) => set({ [k]: { ...cfg[k], ...patch } } as Partial<SiteConfig>)

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/site-admin/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ...cfg, banners: undefined, testimonials: undefined, catalog: undefined, emails: undefined }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao salvar.' }); return }
      await load(); setMsg({ ok: true, text: 'Site salvo.' })
    } catch { setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setSaving(false) }
  }

  // Pré-visualizar: manda o rascunho e abre o site com ele (sem salvar). A janela
  // abre antes do fetch para o navegador não bloquear como pop-up.
  const preview = async () => {
    const w = window.open('about:blank', 'site-preview')
    setPreviewing(true); setMsg(null)
    try {
      const r = await fetch('/api/site-admin/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ...cfg, banners: undefined, testimonials: undefined, catalog: undefined, emails: undefined }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { w?.close(); setMsg({ ok: false, text: j?.error ?? 'Não foi possível pré-visualizar.' }); return }
      if (w) w.location.href = j.url; else window.open(j.url, 'site-preview')
      setMsg({ ok: true, text: 'Pré-visualização aberta em outra aba. Nada foi salvo ainda.' })
    } catch { w?.close(); setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setPreviewing(false) }
  }

  const previewUrl = `/s/${cfg.slug}`
  const publicUrl = data.siteBaseDomain ? `https://${cfg.slug}.${data.siteBaseDomain}` : null

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Globe size={20} className="text-brand-600" />Site da loja</h1>
          <p className="text-sm text-gray-500">Vitrine pública do seu estoque. Os contatos feitos no site chegam no CRM.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="btn-secondary text-xs"><RefreshCw size={13} />Atualizar</button>
          {cfg.enabled && <a href={previewUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs"><ExternalLink size={13} />Ver site</a>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[['Carros no site', data.stats.total], ['Publicados (com fotos)', data.stats.published], ['Em breve (aguardando fotos)', data.stats.comingSoon]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card"><p className="text-xs text-gray-500">{l}</p><p className="text-2xl font-bold tabular-nums text-gray-900">{v}</p></div>
        ))}
      </div>

      <Section title="Publicação e endereço" hint="Todo carro Disponível no estoque aparece no site como “Em breve”; quando ganha fotos no estoque, é publicado automaticamente.">
        <label className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-800">
          <input type="checkbox" disabled={dis} checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          Site no ar
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Field l="Endereço grátis da loja (subdomínio)">
            <div className="flex items-center gap-1">
              <input disabled={dis} className={input} value={cfg.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
              {data.siteBaseDomain && <span className="whitespace-nowrap text-xs text-gray-500">.{data.siteBaseDomain}</span>}
            </div>
            <span className="mt-1 block text-[11px] text-gray-400">{publicUrl ? `Endereço público: ${publicUrl}` : `Teste agora em ${previewUrl} (o subdomínio público é ativado na publicação).`}</span>
          </Field>
        </div>
      </Section>

      <DomainsSection domains={cfg.domains} slug={cfg.slug} siteBaseDomain={data.siteBaseDomain} hostingIntegration={data.hostingIntegration} canManage={data.canManage}
        onChange={(domains) => setCfg({ ...cfg, domains })} />

      <BrandingSection identity={cfg.identity} canManage={data.canManage} onApply={(patch) => setIn('identity', patch)} />

      <Section title="Serviços do site" hint="Os padrões já vêm ligados. Os demais você ativa quando quiser.">
        <div className="grid gap-2 md:grid-cols-2">
          {data.services.map((s) => (
            <label key={s.key} className={cn('flex items-start gap-2 rounded-lg border border-gray-100 p-2.5 text-sm', !s.available && 'opacity-60')}>
              <input type="checkbox" disabled={dis || s.locked || !s.available} checked={cfg.services[s.key as keyof SiteConfig['services']]}
                onChange={(e) => set({ services: { ...cfg.services, [s.key]: e.target.checked } })} className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span><span className="font-medium text-gray-800">{s.label}</span>{s.locked && <span className="ml-1 text-[10px] text-gray-400">sempre ligado</span>}{!s.available && <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">em breve</span>}<span className="block text-xs text-gray-500">{s.hint}</span></span>
            </label>
          ))}
        </div>
      </Section>

      <LayoutSection cfg={cfg} dis={dis} onChange={set} />

      <Section title="Nome e frase">
        <div className="grid gap-3 md:grid-cols-2">
          <Field l="Nome da loja no site"><input disabled={dis} className={input} value={cfg.identity.name} onChange={(e) => setIn('identity', { name: e.target.value })} /></Field>
          <Field l="Frase curta (rodapé)"><input disabled={dis} className={input} value={cfg.identity.tagline} onChange={(e) => setIn('identity', { tagline: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="Contato">
        <div className="grid gap-3 md:grid-cols-2">
          <Field l="WhatsApp (com DDD)"><input disabled={dis} className={input} placeholder="11999999999" value={cfg.contact.whatsapp} onChange={(e) => setIn('contact', { whatsapp: e.target.value })} /></Field>
          <Field l="Telefone exibido"><input disabled={dis} className={input} placeholder="(11) 99999-9999" value={cfg.contact.phone} onChange={(e) => setIn('contact', { phone: e.target.value })} /></Field>
          <Field l="E-mail"><input disabled={dis} className={input} value={cfg.contact.email} onChange={(e) => setIn('contact', { email: e.target.value })} /></Field>
          <Field l="Horário de atendimento"><input disabled={dis} className={input} placeholder="Seg a sex 9h–18h, sáb 9h–13h" value={cfg.contact.hours} onChange={(e) => setIn('contact', { hours: e.target.value })} /></Field>
          <Field l="Endereço (linha 1)"><input disabled={dis} className={input} value={cfg.contact.addressLine1} onChange={(e) => setIn('contact', { addressLine1: e.target.value })} /></Field>
          <Field l="Endereço (linha 2)"><input disabled={dis} className={input} value={cfg.contact.addressLine2} onChange={(e) => setIn('contact', { addressLine2: e.target.value })} /></Field>
          <Field l="Link do Google Maps"><input disabled={dis} className={input} value={cfg.contact.mapsUrl} onChange={(e) => setIn('contact', { mapsUrl: e.target.value })} /></Field>
          <Field l="Link do Waze"><input disabled={dis} className={input} value={cfg.contact.wazeUrl} onChange={(e) => setIn('contact', { wazeUrl: e.target.value })} /></Field>
          <Field l="Mapa incorporado (URL de “Incorporar mapa” do Google)" className="md:col-span-2"><input disabled={dis} className={input} placeholder="https://www.google.com/maps/embed?..." value={cfg.contact.mapsEmbedUrl} onChange={(e) => setIn('contact', { mapsEmbedUrl: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="Página inicial">
        <div className="grid gap-3 md:grid-cols-2">
          <Field l="Chamada pequena"><input disabled={dis} className={input} value={cfg.home.heroEyebrow} onChange={(e) => setIn('home', { heroEyebrow: e.target.value })} /></Field>
          <Field l="Título principal"><input disabled={dis} className={input} value={cfg.home.heroTitle} onChange={(e) => setIn('home', { heroTitle: e.target.value })} /></Field>
          <Field l="Texto principal" className="md:col-span-2"><textarea disabled={dis} rows={2} className={input} value={cfg.home.heroText} onChange={(e) => setIn('home', { heroText: e.target.value })} /></Field>
          <Field l="Selos de confiança (um por linha, até 4)" className="md:col-span-2"><textarea disabled={dis} rows={3} className={input} value={cfg.home.trust.join('\n')} onChange={(e) => setIn('home', { trust: e.target.value.split('\n') })} /></Field>
          <Field l="Título da vitrine"><input disabled={dis} className={input} value={cfg.home.showcaseTitle} onChange={(e) => setIn('home', { showcaseTitle: e.target.value })} /></Field>
          <Field l="Texto da vitrine"><input disabled={dis} className={input} value={cfg.home.showcaseText} onChange={(e) => setIn('home', { showcaseText: e.target.value })} /></Field>
        </div>
        <h3 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Diferenciais (até 4)</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {cfg.home.benefits.map((b, i) => (
            <div key={i} className="flex gap-1 rounded-lg border border-gray-100 p-2">
              <div className="flex-1 space-y-1">
                <input disabled={dis} className={input} placeholder="Título" value={b.title} onChange={(e) => setIn('home', { benefits: cfg.home.benefits.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                <input disabled={dis} className={input} placeholder="Texto" value={b.text} onChange={(e) => setIn('home', { benefits: cfg.home.benefits.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
              </div>
              {!dis && <button onClick={() => setIn('home', { benefits: cfg.home.benefits.filter((_, j) => j !== i) })} className="px-1 text-gray-400 hover:text-red-600" aria-label="Remover diferencial"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
        {!dis && cfg.home.benefits.length < 4 && <button onClick={() => setIn('home', { benefits: [...cfg.home.benefits, { title: '', text: '' }] })} className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus size={12} />Adicionar diferencial</button>}
        <h3 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Perguntas frequentes</h3>
        <div className="space-y-2">
          {cfg.home.faq.map((f, i) => (
            <div key={i} className="flex gap-1 rounded-lg border border-gray-100 p-2">
              <div className="flex-1 space-y-1">
                <input disabled={dis} className={input} placeholder="Pergunta" value={f.q} onChange={(e) => setIn('home', { faq: cfg.home.faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x) })} />
                <textarea disabled={dis} rows={2} className={input} placeholder="Resposta" value={f.a} onChange={(e) => setIn('home', { faq: cfg.home.faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x) })} />
              </div>
              {!dis && <button onClick={() => setIn('home', { faq: cfg.home.faq.filter((_, j) => j !== i) })} className="px-1 text-gray-400 hover:text-red-600" aria-label="Remover pergunta"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
        {!dis && cfg.home.faq.length < 8 && <button onClick={() => setIn('home', { faq: [...cfg.home.faq, { q: '', a: '' }] })} className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus size={12} />Adicionar pergunta</button>}
      </Section>

      <Section title="Quem somos">
        <div className="grid gap-3 md:grid-cols-2">
          <Field l="Chamada pequena"><input disabled={dis} className={input} value={cfg.about.eyebrow} onChange={(e) => setIn('about', { eyebrow: e.target.value })} /></Field>
          <Field l="Título"><input disabled={dis} className={input} value={cfg.about.title} onChange={(e) => setIn('about', { title: e.target.value })} /></Field>
          <Field l="Introdução" className="md:col-span-2"><textarea disabled={dis} rows={2} className={input} value={cfg.about.intro} onChange={(e) => setIn('about', { intro: e.target.value })} /></Field>
        </div>
        <div className="mt-3 space-y-2">
          {cfg.about.sections.map((s, i) => (
            <div key={i} className="flex gap-1 rounded-lg border border-gray-100 p-2">
              <div className="flex-1 space-y-1">
                <input disabled={dis} className={input} placeholder="Título do bloco" value={s.title} onChange={(e) => setIn('about', { sections: cfg.about.sections.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                <textarea disabled={dis} rows={3} className={input} placeholder="Texto" value={s.text} onChange={(e) => setIn('about', { sections: cfg.about.sections.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
              </div>
              {!dis && <button onClick={() => setIn('about', { sections: cfg.about.sections.filter((_, j) => j !== i) })} className="px-1 text-gray-400 hover:text-red-600" aria-label="Remover bloco"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
        {!dis && cfg.about.sections.length < 8 && <button onClick={() => setIn('about', { sections: [...cfg.about.sections, { title: '', text: '' }] })} className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus size={12} />Adicionar bloco</button>}
      </Section>

      <Section title="Google e aviso legal">
        <div className="grid gap-3 md:grid-cols-2">
          <Field l="Título no Google"><input disabled={dis} className={input} value={cfg.seo.title} onChange={(e) => setIn('seo', { title: e.target.value })} /></Field>
          <Field l="Descrição no Google"><input disabled={dis} className={input} value={cfg.seo.description} onChange={(e) => setIn('seo', { description: e.target.value })} /></Field>
          <Field l="Aviso legal (rodapé)" className="md:col-span-2"><textarea disabled={dis} rows={2} className={input} value={cfg.legalNote} onChange={(e) => set({ legalNote: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="Páginas por marca e cidade (Google)" hint="Com o serviço “Páginas por marca e cidade” ligado, o site cria sozinho uma página para cada marca com carro no estoque e uma para cada cidade abaixo, além do sitemap para o Google.">
        <Field l={`Cidades que a loja atende (uma por linha; opcional: “Cidade | texto da página”) — até 12`}>
          <textarea disabled={dis} rows={4} className={input}
            value={cfg.seoCities.map((c) => (c.text ? `${c.name} | ${c.text}` : c.name)).join('\n')}
            placeholder={'Osasco | A poucos minutos da loja, com visita combinada pelo WhatsApp.\nBarueri\nCarapicuíba'}
            onChange={(e) => set({ seoCities: e.target.value.split('\n').map((l) => { const [name, ...t] = l.split('|'); return { name: name.trimStart(), slug: '', text: t.join('|').trim() } }).slice(0, 13) })} />
        </Field>
        {!cfg.services.seoLandings && <p className="mt-1 text-[11px] text-amber-700">Ligue o serviço “Páginas por marca e cidade” em Serviços do site para publicar as páginas.</p>}
      </Section>

      <Section title="Medição de anúncios (Pixel da Meta e Google)" hint="Com os IDs preenchidos, o site mostra o aviso de cookies e, com o aceite do visitante, mede visitas, carros vistos, contatos pelo WhatsApp e formulários enviados (Lead). Nenhum dado pessoal do cliente é enviado.">
        <div className="grid gap-3 md:grid-cols-2">
          {([
            ['metaPixelId', 'ID do Pixel da Meta', '1234567890123456', 'Gerenciador de Eventos da Meta → Fontes de dados → seu Pixel (só números).', cleanMetaPixelId],
            ['googleTagId', 'ID da tag do Google', 'G-XXXXXXXXXX ou AW-XXXXXXXXX', 'Google Analytics (G-…) ou Google Ads (AW-…). Use uma tag por site.', cleanGoogleTagId],
          ] as const).map(([k, l, ph, help, clean]) => {
            const v = cfg.tracking[k]
            const bad = v.trim() !== '' && !clean(v)
            return (
              <Field key={k} l={l}>
                <input disabled={dis} className={cn(input, bad && 'border-red-300')} value={v} placeholder={ph} onChange={(e) => setIn('tracking', { [k]: e.target.value.trim() })} />
                <span className={cn('mt-1 block text-[11px]', bad ? 'text-red-600' : v ? 'text-green-700' : 'text-gray-400')}>{bad ? 'Formato inválido: não será salvo.' : v ? 'Ativo no site.' : help}</span>
              </Field>
            )
          })}
        </div>
      </Section>

      {data.canManage && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64 pr-24">
          <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
            {msg && <span className={cn('text-sm', msg.ok ? 'text-green-600' : 'text-red-600')}>{msg.text}</span>}
            <button onClick={() => void preview()} disabled={previewing} className="btn-secondary text-sm" title="Ver o site com as alterações, sem salvar"><Eye size={15} />{previewing ? 'Abrindo…' : 'Pré-visualizar'}</button>
            <button onClick={save} disabled={saving || !dirty} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando…' : 'Salvar site'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
