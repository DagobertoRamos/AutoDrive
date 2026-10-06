'use client'

// =============================================================================
// Painel do Site — Domínios (padrão Shopify/Vercel): endereço grátis da loja,
// conectar domínio próprio (raiz + www), registros DNS exatos com "copiar",
// status em tempo real ("Verificar agora"), domínio principal e ajuda por
// provedor.
// =============================================================================

import { useState } from 'react'
import { Check, ChevronDown, Copy, ExternalLink, Globe, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DomainStatus, SiteDomain } from '@/lib/site/domains-core'
import { RequiredMark } from '@/components/ui/field'
import { HelpHint } from '@/components/ui/help-hint'
import { opsHint } from '@/lib/glossary-ops'

const STATUS: Record<DomainStatus, { label: string; cls: string }> = {
  PENDING_DNS: { label: 'Aguardando DNS', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  PENDING_VERIFICATION: { label: 'Verificar posse', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  DNS_OK: { label: 'DNS OK · aguardando ativação', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  CONNECTED: { label: 'Conectado · SSL ativo', cls: 'bg-green-50 text-green-700 border-green-200' },
  ERROR: { label: 'Erro', cls: 'bg-red-50 text-red-700 border-red-200' },
}

const PROVIDERS: { name: string; steps: string }[] = [
  { name: 'Registro.br', steps: 'Entre em registro.br → clique no domínio → “DNS” → “Editar zona” (se aparecer “Configurar endereçamento”, escolha usar os servidores DNS do Registro.br) → “Nova entrada” → preencha Tipo, Nome e Valor → “Salvar alterações”.' },
  { name: 'GoDaddy', steps: '“Meus produtos” → ao lado do domínio, “DNS” → “Adicionar novo registro”. Para o registro A com Nome “@”, já existe um: clique no lápis e troque o valor em vez de criar outro.' },
  { name: 'Hostinger', steps: 'hPanel → “Domínios” → “Gerenciar” → “DNS / Nameservers”. Apague o registro A ou CNAME que já tenha o mesmo nome e crie o novo.' },
  { name: 'Cloudflare', steps: '“DNS” → “Records” → “Add record”. Deixe a nuvem CINZA (“DNS only”). Com a nuvem laranja, o cadeado (HTTPS) não é emitido.' },
  { name: 'HostGator / UOL / Locaweb', steps: 'No painel, procure “Zona DNS” ou “Gerenciar DNS”. Apague o A ou CNAME antigo que tenha o mesmo nome e crie o novo.' },
]

/** Em que passo o domínio está: 1 = apontar DNS, 2 = ativar na hospedagem, 3 = pronto. */
function stepOf(s: DomainStatus): 1 | 2 | 3 {
  if (s === 'CONNECTED') return 3
  if (s === 'DNS_OK') return 2
  return 1
}

function Steps({ status }: { status: DomainStatus }) {
  const cur = stepOf(status)
  const items = ['Apontar o DNS no provedor', 'Ativar na hospedagem', 'Site no ar com cadeado']
  return (
    <ol className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      {items.map((label, i) => {
        const n = i + 1
        const done = n < cur || cur === 3
        return (
          <li key={label} className={cn('inline-flex items-center gap-1', done ? 'text-green-700' : n === cur ? 'font-semibold text-gray-900' : 'text-gray-400')}>
            <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold', done ? 'bg-green-100' : n === cur ? 'bg-brand-100 text-brand-700' : 'bg-gray-100')}>
              {done ? <Check size={10} /> : n}
            </span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

function nameHint(name: string): string | null {
  if (name === '@') return '@ = o próprio domínio (se não aceitar, deixe em branco).'
  return null
}

function FakeField({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] font-semibold text-gray-600">{label}</span>
        <span className="min-w-0 flex-1 break-all rounded border border-gray-300 bg-white px-2 py-1 font-mono text-[12px] font-semibold text-gray-900">{value}</span>
        <CopyValue value={value} />
      </div>
      {hint && <p className="ml-14 mt-0.5 text-[10px] text-gray-500">{hint}</p>}
    </div>
  )
}

function CopyValue({ value }: { value: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }) }}
      className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50" aria-label={`Copiar ${value}`}>
      {ok ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}{ok ? 'Copiado' : 'Copiar'}
    </button>
  )
}

export function DomainsSection({ domains, slug, siteBaseDomain, hostingIntegration, canManage, onChange }: {
  domains: SiteDomain[]; slug: string; siteBaseDomain: string | null; hostingIntegration: boolean; canManage: boolean
  onChange: (d: SiteDomain[]) => void
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [help, setHelp] = useState(false)

  const call = async (key: string, url: string, init: RequestInit) => {
    setBusy(key); setErr(null)
    try {
      const r = await fetch(url, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j?.error ?? 'Não foi possível concluir.'); return false }
      onChange(j.data as SiteDomain[]); return true
    } catch { setErr('Erro de rede.'); return false } finally { setBusy(null) }
  }
  const add = async () => { if (input.trim() && await call('add', '/api/site-admin/domains', { method: 'POST', body: JSON.stringify({ domain: input }) })) setInput('') }
  const check = (host?: string) => call(host ?? 'all', '/api/site-admin/domains/check', { method: 'POST', body: JSON.stringify(host ? { host } : {}) })
  const makePrimary = (host: string) => call(`p:${host}`, '/api/site-admin/domains', { method: 'PATCH', body: JSON.stringify({ primary: host }) })
  const remove = (host: string) => { if (confirm(`Desconectar ${host} do site?`)) void call(`d:${host}`, `/api/site-admin/domains?host=${encodeURIComponent(host)}`, { method: 'DELETE' }) }

  const freeUrl = siteBaseDomain ? `${slug}.${siteBaseDomain}` : null
  const primary = domains.find((d) => d.primary)
  const allRecords = domains.flatMap((d) => d.records.map((r) => ({ ...r, host: d.host })))

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Globe size={15} className="text-brand-600" />Domínios<HelpHint {...opsHint('DOMINIO')} /></h2>
        {domains.length > 0 && canManage && (
          <button onClick={() => void check()} disabled={!!busy} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(busy === 'all' && 'animate-spin')} />Verificar todos</button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-3 text-sm">
        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Endereço grátis</span>
        {freeUrl
          ? <a href={`https://${freeUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">{freeUrl}<ExternalLink size={12} /></a>
          : <span className="text-gray-600">{`/s/${slug}`}</span>}
      </div>

      {canManage && (
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-gray-600">Conectar domínio próprio <RequiredMark /></label>
          <div className="flex flex-wrap gap-2">
            <input className="min-w-[220px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="sualoja.com.br" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
            <button onClick={() => void add()} disabled={!input.trim() || !!busy} className="btn-primary text-sm">{busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : null}Conectar domínio</button>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Conecta com e sem “www” (www fica como principal).</p>
        </div>
      )}
      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

      <div className="mt-4 space-y-3">
        {domains.map((d) => {
          const st = STATUS[d.status]
          return (
            <div key={d.host} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-gray-900">{d.host}</span>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', st.cls)}>{st.label}</span>
                {d.primary
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700"><Star size={10} />Principal</span>
                  : primary && <span className="text-[11px] text-gray-400">redireciona para {primary.host}</span>}
                <div className="ml-auto flex items-center gap-2">
                  {canManage && !d.primary && <button onClick={() => void makePrimary(d.host)} disabled={!!busy} className="text-[11px] font-semibold text-brand-700 hover:underline">Tornar principal</button>}
                  {canManage && <button onClick={() => void check(d.host)} disabled={!!busy} className="btn-secondary px-2 py-1 text-[11px]"><RefreshCw size={12} className={cn(busy === d.host && 'animate-spin')} />Verificar agora</button>}
                  {canManage && <button onClick={() => remove(d.host)} disabled={!!busy} className="text-gray-400 hover:text-red-600" aria-label={`Remover ${d.host}`}><Trash2 size={14} /></button>}
                </div>
              </div>
              <Steps status={d.status} />
              {d.status === 'DNS_OK' ? (
                <p className="mt-2 rounded-md bg-green-50 px-2.5 py-1.5 text-xs text-green-800">
                  DNS correto.{' '}
                  {hostingIntegration
                    ? 'Ativação na hospedagem em andamento; verifique em alguns minutos.'
                    : 'Aguardando ativação na hospedagem pelo administrador.'}
                </p>
              ) : d.message && <p className={cn('mt-2 text-xs', d.status === 'CONNECTED' ? 'text-green-700' : d.status === 'ERROR' ? 'text-red-700' : 'text-gray-600')}>{d.message}</p>}

              {d.status !== 'CONNECTED' && d.status !== 'DNS_OK' && (
                <div className="mt-2 overflow-x-auto">
                  <p className="mb-1 flex items-center gap-1 text-[11px] text-gray-600">Crie no provedor do domínio: <HelpHint title="Registros DNS" text="No painel onde o domínio foi comprado (Registro.br, GoDaddy, Hostinger…), em DNS, crie cada registro abaixo com o mesmo tipo, nome e valor. A propagação pode levar de minutos a algumas horas." /></p>
                  <table className="w-full min-w-[460px] text-xs">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-400"><th className="py-1 pr-3">Tipo</th><th className="py-1 pr-3">Nome / Host</th><th className="py-1 pr-3">Valor / Aponta para</th><th /></tr></thead>
                    <tbody>
                      {d.records.map((r) => (
                        <tr key={`${r.type}-${r.name}`} className="border-t border-gray-100">
                          <td className="py-1.5 pr-3 font-mono font-semibold">{r.type}</td>
                          <td className="py-1.5 pr-3 font-mono">{r.name} <CopyValue value={r.name} /></td>
                          <td className="py-1.5 pr-3 font-mono break-all">{r.value}</td>
                          <td className="py-1.5"><CopyValue value={r.value} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {d.found && d.found.length > 0 && d.status !== 'CONNECTED' && d.status !== 'DNS_OK' && (
                <p className="mt-1 text-[11px] text-gray-400">DNS atual: <span className="font-mono">{d.found.join(' · ')}</span></p>
              )}
              {d.lastCheckedAt && <p className="mt-1 text-[10px] text-gray-400">Última verificação: {new Date(d.lastCheckedAt).toLocaleString('pt-BR')}</p>}
            </div>
          )
        })}
      </div>

      {domains.length > 0 && (
        <div className="mt-3 rounded-lg border border-gray-100">
          <button type="button" onClick={() => setHelp((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-gray-700">
            Como configurar o DNS <ChevronDown size={14} className={cn('transition', help && 'rotate-180')} />
          </button>
          {help && (
            <div className="space-y-4 border-t border-gray-100 px-3 py-3 text-xs text-gray-700">
              <div className="grid gap-2 md:grid-cols-2">
                {allRecords.map((r) => (
                  <div key={`${r.host}-${r.type}-${r.name}`} className="rounded-lg border border-brand-200 bg-brand-50/40 p-2.5">
                    <p className="mb-1.5 font-semibold text-gray-900">{r.host}</p>
                    <div className="space-y-1.5">
                      <FakeField label="Tipo" value={r.type} />
                      <FakeField label="Nome" value={r.name} hint={nameHint(r.name)} />
                      <FakeField label="Valor" value={r.value} />
                    </div>
                  </div>
                ))}
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>Apague ou edite registros antigos com o mesmo Tipo e Nome. Não altere registros MX (e-mail).</li>
                <li>TTL: mantenha o padrão.</li>
                <li>A propagação pode levar até 2 horas; depois clique em <b>Verificar agora</b>.</li>
              </ul>

              <details className="rounded-lg border border-gray-100 px-2.5 py-1.5">
                <summary className="cursor-pointer font-semibold text-gray-800">DNS por provedor</summary>
                <div className="mt-1.5 space-y-1">
                  {PROVIDERS.map((p) => <p key={p.name}><b>{p.name}:</b> {p.steps}</p>)}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {!hostingIntegration && domains.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <p>Ativação na hospedagem desligada: o administrador precisa configurar <span className="font-mono">VERCEL_API_TOKEN</span> e <span className="font-mono">VERCEL_PROJECT_ID</span>.</p>
        </div>
      )}
    </section>
  )
}
