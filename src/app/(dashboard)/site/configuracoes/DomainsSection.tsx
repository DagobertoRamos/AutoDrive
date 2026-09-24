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

function recordPurpose(r: { type: string; name: string; host: string }): string {
  if (r.type === 'TXT') return `prova que o ${r.host} é seu`
  return `faz o ${r.host} abrir o site`
}

function nameHint(name: string): string {
  if (name === '@') return 'Digite só o símbolo @ (arroba). Se não aceitar, deixe em branco.'
  if (name.includes('.')) return `Digite exatamente: ${name}`
  return `Digite só “${name}”, sem o resto do domínio e sem ponto.`
}

function FakeField({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] font-semibold text-gray-600">{label}</span>
        <span className="min-w-0 flex-1 break-all rounded border border-gray-300 bg-white px-2 py-1 font-mono text-[12px] font-semibold text-gray-900">{value}</span>
        <CopyValue value={value} />
      </div>
      <p className="ml-14 mt-0.5 text-[10px] text-gray-500">{hint}</p>
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
  const allDnsDone = domains.length > 0 && domains.every((d) => stepOf(d.status) >= 2)
  const exampleApex = domains.find((d) => !d.host.startsWith('www.'))?.host ?? domains[0]?.host.replace(/^www\./, '') ?? 'sualoja.com.br'

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Globe size={15} className="text-brand-600" />Domínios</h2>
          <p className="text-xs text-gray-500">Use o endereço grátis da loja ou conecte o domínio que você já tem.</p>
        </div>
        {domains.length > 0 && canManage && (
          <button onClick={() => void check()} disabled={!!busy} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(busy === 'all' && 'animate-spin')} />Verificar todos</button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-3 text-sm">
        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Endereço grátis</span>
        {freeUrl
          ? <a href={`https://${freeUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">{freeUrl}<ExternalLink size={12} /></a>
          : <span className="text-gray-600">{`/s/${slug}`} <span className="text-xs text-gray-400">(o subdomínio público é ativado na publicação do SaaS)</span></span>}
        {!primary && <span className="text-xs text-gray-400">· é o endereço principal enquanto não houver domínio próprio conectado</span>}
      </div>

      {canManage && (
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-gray-600">Conectar domínio próprio</label>
          <div className="flex flex-wrap gap-2">
            <input className="min-w-[220px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="sualoja.com.br" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
            <button onClick={() => void add()} disabled={!input.trim() || !!busy} className="btn-primary text-sm">{busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : null}Conectar domínio</button>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Digite o domínio que você comprou (Registro.br, GoDaddy, Hostinger…). Conectamos com e sem “www”; o endereço com www fica como principal.</p>
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
                  <b>Sua parte está feita.</b> O DNS está certo e não precisa mexer mais no provedor.{' '}
                  {hostingIntegration
                    ? 'Estamos ativando o domínio na hospedagem. Clique em “Verificar agora” daqui a alguns minutos.'
                    : 'Falta o domínio ser ativado na hospedagem, que é feito pelo administrador do sistema (veja o aviso no fim desta seção).'}
                </p>
              ) : d.message && <p className={cn('mt-2 text-xs', d.status === 'CONNECTED' ? 'text-green-700' : d.status === 'ERROR' ? 'text-red-700' : 'text-gray-600')}>{d.message}</p>}

              {d.status !== 'CONNECTED' && d.status !== 'DNS_OK' && (
                <div className="mt-2 overflow-x-auto">
                  <p className="mb-1 text-[11px] text-gray-600">No site onde você comprou o domínio, crie <b>{d.records.length === 1 ? 'este registro' : 'estes registros'}</b> (copie cada campo exatamente como está):</p>
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
                <p className="mt-1 text-[11px] text-gray-400">Encontrado hoje no DNS: <span className="font-mono">{d.found.join(' · ')}</span></p>
              )}
              {d.lastCheckedAt && <p className="mt-1 text-[10px] text-gray-400">Última verificação: {new Date(d.lastCheckedAt).toLocaleString('pt-BR')}</p>}
            </div>
          )
        })}
      </div>

      {domains.length > 0 && (
        <div className="mt-3 rounded-lg border border-gray-100">
          <button type="button" onClick={() => setHelp((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-gray-700">
            Não sei configurar o DNS: me explica passo a passo <ChevronDown size={14} className={cn('transition', help && 'rotate-180')} />
          </button>
          {help && (
            <div className="space-y-4 border-t border-gray-100 px-3 py-3 text-xs text-gray-700">
              {allDnsDone && (
                <p className="rounded-md bg-green-50 px-2.5 py-2 text-green-800"><b>Você já fez esta parte.</b> Todos os domínios estão com o passo 1 verde. O que está aqui embaixo é só para consulta ou para um domínio novo.</p>
              )}

              <div>
                <p className="mb-1 text-sm font-semibold text-gray-900">Para que serve isso?</p>
                <p>O DNS é como uma agenda de contatos da internet. Quando alguém digita o nome do seu site, a internet olha nessa agenda para saber para onde ir. Você só vai escrever na agenda: “meu site está no AutoDrive”.</p>
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold text-gray-900">Passo 1: entre no site onde você comprou o domínio</p>
                <p>Exemplo: se você comprou o <span className="font-mono">{exampleApex}</span> no Registro.br, entre em <b>registro.br</b> com o seu login. Depois clique no domínio e procure o botão <b>DNS</b> (pode se chamar “Editar zona”, “Zona DNS” ou “Gerenciar DNS”).</p>
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold text-gray-900">Passo 2: crie {allRecords.length === 1 ? 'este registro' : `estes ${allRecords.length} registros`}</p>
                <p className="mb-2">Lá vai ter um botão como <b>“Nova entrada”</b> ou <b>“Adicionar registro”</b>. Clique nele e vai aparecer um formulário com 3 campos: <b>Tipo</b>, <b>Nome</b> e <b>Valor</b>. Preencha igual aos cartões abaixo, um cartão de cada vez:</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {allRecords.map((r, i) => (
                    <div key={`${r.host}-${r.type}-${r.name}`} className="rounded-lg border border-brand-200 bg-brand-50/40 p-2.5">
                      <p className="mb-1.5 font-semibold text-gray-900">Registro {i + 1}: {recordPurpose(r)}</p>
                      <div className="space-y-1.5">
                        <FakeField label="Tipo" value={r.type} hint={r.type === 'A' ? 'Escolha “A” na lista.' : `Escolha “${r.type}” na lista.`} />
                        <FakeField label="Nome" value={r.name} hint={nameHint(r.name)} />
                        <FakeField label="Valor" value={r.value} hint="Clique em Copiar e cole no campo (pode se chamar “Dados”, “Aponta para” ou “Destino”)." />
                      </div>
                      <p className="mt-1.5 text-[11px] text-gray-500">Se aparecer um campo <b>TTL</b>, deixe como está. Depois clique em <b>Salvar</b>.</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 px-2.5 py-2 text-amber-900">
                <p className="mb-0.5 font-semibold">E o tal do “@”?</p>
                <p>O <b>@</b> (arroba, a mesma do e-mail) quer dizer <b>“o próprio domínio, sem nada na frente”</b>. No campo <b>Nome</b>, digite só o símbolo <span className="font-mono font-bold">@</span> (no teclado: Shift + 2). Não escreva mais nada junto.</p>
                <p className="mt-1">Se o site não aceitar o @, <b>deixe o campo Nome em branco</b>, que dá no mesmo. No Registro.br, por exemplo, o campo já mostra “.{exampleApex}” do lado. Para o @, deixe vazio. Para o www, escreva só <span className="font-mono">www</span>.</p>
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold text-gray-900">Passo 3: já tinha um registro igual?</p>
                <p>Se já existir na lista um registro com o <b>mesmo Tipo e o mesmo Nome</b> (por exemplo, um “A” com Nome “@” apontando para outro número), <b>apague o antigo</b> ou clique no lápis e troque o Valor. Não podem ficar dois iguais. Não mexa nos registros do tipo <b>MX</b>: eles são do seu e-mail.</p>
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold text-gray-900">Passo 4: volte aqui e confira</p>
                <p>Clique em <b>Verificar agora</b> no domínio. Quando aparecer o ✓ verde em “Apontar o DNS no provedor”, deu certo. Se não aparecer, espere uns 30 minutos e tente de novo: a internet pode demorar até 2 horas para perceber a mudança.</p>
              </div>

              <details className="rounded-lg border border-gray-100 px-2.5 py-1.5">
                <summary className="cursor-pointer font-semibold text-gray-800">Onde fica o DNS em cada provedor</summary>
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
          <p><b>Passo 2 (ativar na hospedagem) ainda não está ligado.</b> Isso não depende da loja nem do provedor do domínio.</p>
          <p className="mt-0.5">O administrador do sistema precisa configurar as variáveis <span className="font-mono">VERCEL_API_TOKEN</span> e <span className="font-mono">VERCEL_PROJECT_ID</span> na publicação. Depois disso, clique em “Verificar todos”: os domínios com DNS certo são ativados e ganham o cadeado (HTTPS) sozinhos.</p>
        </div>
      )}
    </section>
  )
}
