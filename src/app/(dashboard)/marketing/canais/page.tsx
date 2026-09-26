'use client'

// =============================================================================
// Marketing › Canais conectados
//   • Contas da loja: situação da CONEXÃO (conectado, reconectar, pendência)
//   • Catálogo: situação do CONECTOR (em avaliação → disponível) e nível de
//     verificação (testes locais, contrato, sandbox, produção) — separados
//   • Contatos, fuso, regra de venda e publicação automática (ativação expressa)
//   • Diagnóstico técnico de cada canal (fonte oficial e data de verificação)
// =============================================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Loader2, Plug, RefreshCw, Settings2, Unplug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ago, ChannelMark, Drawer, ErrorNote, inputCls, PubTabs, StatusPill, type Tone } from '@/components/publications/ui'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Channel = any
interface Connection { id: string; channel: string; label: string; externalAccountId: string; status: string; environment: string; maskedHints: Record<string, string> | null; config: Record<string, any> | null; tokenExpiresAt: string | null; throttledUntil: string | null; quota: any; lastCheckedAt: string | null; lastError: string | null; activePublications: number }

const CONN: Record<string, { label: string; tone: Tone }> = {
  NAO_CONECTADO: { label: 'Não conectado', tone: 'muted' }, CONECTADO: { label: 'Conectado', tone: 'success' },
  RECONECTAR: { label: 'Reconectar', tone: 'danger' }, PENDENCIA: { label: 'Com pendência', tone: 'warning' },
}
const DEV: Record<string, { label: string; tone: Tone }> = {
  EM_AVALIACAO: { label: 'Em avaliação', tone: 'muted' }, EM_DESENVOLVIMENTO: { label: 'Em desenvolvimento', tone: 'info' },
  AGUARDANDO_HOMOLOGACAO: { label: 'Aguardando homologação', tone: 'warning' }, DISPONIVEL: { label: 'Disponível', tone: 'success' },
}
const VERIFIED: Record<string, string> = { NENHUM: 'não verificado', TESTES_LOCAIS: 'testes locais', CONTRATO: 'teste de contrato (simulação)', SANDBOX: 'sandbox/homologação', PRODUCAO: 'produção' }
const CAP: Record<string, string> = { authenticate: 'Autenticar', testConnection: 'Testar', validate: 'Validar', publish: 'Publicar', get: 'Consultar', update: 'Atualizar', pause: 'Pausar', resume: 'Reativar', remove: 'Remover', limits: 'Limites', webhooks: 'Eventos' }
const OAUTH_SLUG: Record<string, string> = { MERCADO_LIVRE: 'mercado-livre', OLX: 'olx', META_PAGE: 'meta', INSTAGRAM: 'meta', MOBIAUTO: 'mobiauto' }
const OAUTH_KEY: Record<string, string> = { MERCADO_LIVRE: 'MERCADO_LIVRE', OLX: 'OLX', META_PAGE: 'META', INSTAGRAM: 'META', MOBIAUTO: 'MOBIAUTO' }

export default function ChannelsPage() {
  return <Suspense fallback={<Loader2 className="m-6 animate-spin text-gray-400" />}><Channels /></Suspense>
}

function Channels() {
  const params = useSearchParams()
  const [data, setData] = useState<{ channels: Channel[]; connections: Connection[]; oauth: Record<string, boolean>; can: any } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(() => params.get('ok') ? { ok: true, text: params.get('ok')! } : params.get('erro') ? { ok: false, text: params.get('erro')! } : null)
  const [busy, setBusy] = useState<string | null>(null)
  const [connectFor, setConnectFor] = useState<Channel | null>(null)
  const [configFor, setConfigFor] = useState<Connection | null>(null)
  const [group, setGroup] = useState<string>('')
  const [diag, setDiag] = useState<Channel | null>(null)
  const [pending, setPending] = useState<Channel | null>(null)
  // Aviso sempre à vista (quem clica lá embaixo no catálogo também vê).
  useEffect(() => { if (flash) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [flash])

  const load = useCallback(async () => { try { const j = await api('/api/publications/connections'); setData(j.data) } catch (e) { setErr((e as Error).message) } }, [])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const test = async (c: Connection) => {
    setBusy(c.id); setFlash(null)
    try { const j = await api(`/api/publications/connections/${c.id}`, { method: 'POST', json: { action: 'testar' } }); setFlash({ ok: j.ok, text: `${c.label}: ${j.message}` }) } catch (e) { setFlash({ ok: false, text: (e as Error).message }) } finally { setBusy(null); void load() }
  }
  const disconnect = async (c: Connection) => {
    if (!confirm(`Desconectar ${c.label}?\n\nEnvios pendentes serão cancelados. Anúncios já publicados CONTINUAM no portal e deixam de ser atualizados ou retirados automaticamente.`)) return
    setBusy(c.id)
    try { const j = await api(`/api/publications/connections/${c.id}`, { method: 'DELETE' }); setFlash({ ok: true, text: `${c.label} desconectada. ${j.message}` }) } catch (e) { setFlash({ ok: false, text: (e as Error).message }) } finally { setBusy(null); void load() }
  }
  const startConnect = (ch: Channel) => {
    if (ch.connect === 'OAUTH') {
      if (!data?.oauth[OAUTH_KEY[ch.id]]) { setPending(ch); return }
      window.location.assign(`/api/publications/oauth/${OAUTH_SLUG[ch.id]}/start`)
    } else setConnectFor(ch)
  }

  const specOf = (id: string) => data?.channels.find((c) => c.id === id)
  const catalog = useMemo(() => (data?.channels ?? []).filter((c) => !group || c.group === group), [data, group])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-sm text-gray-500">Cada loja conecta as próprias contas. Segredos ficam cifrados no servidor.</p>
      </div>
      <PubTabs />
      {flash && <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', flash.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{flash.text}</p>}
      {err && <ErrorNote message={err} />}
      {!data ? <Loader2 className="animate-spin text-gray-400" /> : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-800">Contas da loja</h2>
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {data.connections.map((c) => {
                const spec = specOf(c.channel); const st = CONN[c.status] ?? CONN.PENDENCIA
                return (
                  <li key={c.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-card">
                    <div className="flex items-start gap-2">
                      <ChannelMark channel={c.channel} />
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-900">{spec?.name ?? c.channel}</p><p className="truncate text-xs text-gray-500">{c.label}{c.environment === 'HOMOLOGACAO' ? ' · homologação' : ''}</p></div>
                      <StatusPill tone={st.tone} label={st.label} />
                    </div>
                    <p className="mt-2 text-[11px] text-gray-500">{c.activePublications} publicação(ões) · conferida {ago(c.lastCheckedAt)}{c.throttledUntil && new Date(c.throttledUntil) > new Date() ? ' · aguardando limite do canal' : ''}</p>
                    {c.maskedHints && <p className="text-[11px] text-gray-400">{Object.entries(c.maskedHints).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
                    {c.lastError && <p className="mt-1 text-[11px] text-red-700">{c.lastError}</p>}
                    {c.status === 'RECONECTAR' && <p className="mt-1 text-[11px] text-red-700">A autorização expirou ou foi revogada. Envios desta conta estão parados até reconectar.</p>}
                    {data.can.connections && c.channel !== 'SITE' && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button onClick={() => test(c)} disabled={busy === c.id} className="btn-secondary px-2 py-1 text-xs">{busy === c.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Testar</button>
                        <button onClick={() => setConfigFor(c)} className="btn-secondary px-2 py-1 text-xs"><Settings2 size={13} />Configurar</button>
                        {(c.status === 'RECONECTAR' || c.status === 'NAO_CONECTADO') && spec && <button onClick={() => startConnect(spec)} className="btn-primary px-2 py-1 text-xs"><Plug size={13} />Reconectar</button>}
                        {c.status !== 'NAO_CONECTADO' && <button onClick={() => disconnect(c)} disabled={busy === c.id} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"><Unplug size={13} />Desconectar</button>}
                      </div>
                    )}
                    {c.channel === 'SITE' && <p className="mt-2 text-[11px] text-gray-500">Integrado ao estoque. Ativação e domínio em Site › Configurações.</p>}
                  </li>
                )
              })}
            </ul>
          </section>

          <SettingsForm connections={data.connections} channels={data.channels} canEdit={!!data.can.connections} />

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-800">Catálogo de canais</h2>
              <div className="flex gap-1.5" role="group" aria-label="Grupo">{[['', 'Todos'], ['PORTAL', 'Portais'], ['SOCIAL', 'Redes'], ['PROPRIO', 'Próprio'], ['MANUAL', 'Manual']].map(([k, l]) => <button key={k} aria-pressed={group === k} onClick={() => setGroup(k)} className={cn('rounded-full border px-2.5 py-0.5 text-xs', group === k ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-600')}>{l}</button>)}</div>
            </div>
            <p className="text-xs text-gray-500">Estar no catálogo não significa que o conector já opera. “Aguardando homologação” = implementado pelo contrato oficial, falta credencial/homologação do portal.</p>
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {catalog.map((ch) => {
                const dev = DEV[ch.devStatus]; const connected = data.connections.filter((c) => c.channel === ch.id && c.status === 'CONECTADO').length
                return (
                  <li key={ch.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-3">
                    <div className="flex items-start gap-2">
                      <ChannelMark channel={ch.id} />
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-900">{ch.name}</p><p className="text-[11px] text-gray-500">{ch.mechanism === 'FEED' ? 'Feed consultado pelo portal' : ch.mechanism === 'MANUAL' ? 'Publicação manual' : ch.mechanism === 'INTERNO' ? 'Integrado' : ch.mechanism === 'A_DEFINIR' ? 'Mecanismo a definir' : `Envio por ${ch.mechanism === 'WEBSERVICE' ? 'webservice' : 'API'}`} · verificado: {VERIFIED[ch.verified]}</p></div>
                      <StatusPill tone={dev.tone} label={dev.label} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">{Object.entries(ch.capabilities).filter(([k]) => ['publish', 'get', 'update', 'pause', 'remove'].includes(k)).map(([k, v]) => <span key={k} className={cn('rounded px-1.5 py-0.5 text-[10px]', v === 'SIM' ? 'bg-green-50 text-green-700' : v === 'MANUAL' ? 'bg-amber-50 text-amber-700' : v === 'NAO' ? 'bg-gray-100 text-gray-400 line-through' : 'bg-gray-50 text-gray-400')}>{CAP[k]}</span>)}</div>
                    <p className="mt-2 flex-1 text-[11px] text-gray-500">{ch.source.notes}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {data.can.connections && ch.connect !== 'NENHUMA' && ch.devStatus !== 'EM_AVALIACAO' && (ch.connect === 'OAUTH' && !data.oauth[OAUTH_KEY[ch.id]]
                        ? <button onClick={() => startConnect(ch)} className="btn-secondary px-2 py-1 text-xs"><AlertTriangle size={13} className="text-amber-600" />Como conectar</button>
                        : <button onClick={() => startConnect(ch)} className="btn-primary px-2 py-1 text-xs"><Plug size={13} />{connected ? 'Conectar outra conta' : 'Conectar'}</button>)}
                      {connected > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-green-700"><CheckCircle2 size={12} />{connected} conectada(s)</span>}
                      <button onClick={() => setDiag(ch)} className="ml-auto text-[11px] font-medium text-brand-700 hover:underline">Detalhes técnicos</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
      {pending && (
        <Drawer open onClose={() => setPending(null)} title={`Conectar ${pending.name}`} subtitle="Ainda não disponível nesta plataforma">
          <div className="space-y-3 text-sm text-gray-700">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">A conexão com {pending.name} usa a autorização oficial do canal. O aplicativo oficial do AutoDrive neste canal ainda está em homologação, por isso o botão não abre a tela de login do {pending.name} por enquanto.</p>
            <div><p className="text-xs font-semibold text-gray-800">O que a sua loja vai precisar</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{pending.dependencies.map((d: string) => <li key={d}>{d.replace(' — plataforma', ' (feito pelo AutoDrive)')}</li>)}</ul></div>
            <p className="text-xs text-gray-600">{pending.commercial}</p>
            <p className="text-xs text-gray-500">Quando a homologação terminar, este botão passa a abrir o login oficial do {pending.name} e a conta da loja fica conectada aqui. Enquanto isso, publique no Site próprio e nos canais já disponíveis.</p>
            <div className="flex justify-end gap-2"><button onClick={() => { setDiag(pending); setPending(null) }} className="btn-secondary px-3 py-1.5 text-xs">Detalhes técnicos</button><button autoFocus onClick={() => setPending(null)} className="btn-primary px-3 py-1.5 text-xs">Entendi</button></div>
          </div>
        </Drawer>
      )}
      {connectFor && <ConnectForm channel={connectFor} onClose={() => setConnectFor(null)} onDone={(t) => { setConnectFor(null); setFlash(t); void load() }} />}
      {configFor && <ConfigForm conn={configFor} spec={specOf(configFor.channel)} onClose={() => setConfigFor(null)} onDone={(t) => { setConfigFor(null); setFlash(t); void load() }} />}
      {diag && (
        <Drawer open onClose={() => setDiag(null)} title={diag.name} subtitle={`Verificado em ${new Date(`${diag.source.verifiedAt}T12:00:00`).toLocaleDateString('pt-BR')} · ${VERIFIED[diag.verified]}`}>
          <dl className="space-y-3 text-xs">
            {[['Fonte oficial', diag.source.url], ['Autenticação', diag.auth], ['Protocolo e operações', diag.protocol], ['Mecanismo', `${diag.mechanism} · ${diag.direction === 'CONSULTA' ? 'o portal consulta um feed' : diag.direction === 'ENVIO' ? 'o AutoDrive envia' : diag.direction.toLowerCase()}`], ['Requisitos comerciais', diag.commercial], ['Limites', diag.limits], ['Ambiente de testes', diag.sandbox], ['Fotos', `${diag.media.min}–${diag.media.max} · ${diag.media.formats.join('/')}${diag.media.aspect ? ` · ${diag.media.aspect}` : ''} · marca-d’água: ${diag.media.watermark.toLowerCase().replace('_', ' ')}${diag.media.notes ? ` · ${diag.media.notes}` : ''}`], ['Dependências', diag.dependencies.join(' · ') || '—'], ['Observações', diag.source.notes]].map(([k, v]) => (
              <div key={k}><dt className="font-semibold text-gray-700">{k}</dt><dd className="mt-0.5 break-words text-gray-600">{String(v).startsWith('http') ? <a href={String(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline">{String(v)}<ExternalLink size={11} /></a> : v}</dd></div>
            ))}
            <div><dt className="font-semibold text-gray-700">Capacidades declaradas</dt><dd className="mt-1 flex flex-wrap gap-1">{Object.entries(diag.capabilities).map(([k, v]) => <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{CAP[k]}: {String(v).toLowerCase().replace('_', ' ')}</span>)}</dd></div>
          </dl>
        </Drawer>
      )}
    </div>
  )
}

function ConnectForm({ channel, onClose, onDone }: { channel: Channel; onClose: () => void; onDone: (f: { ok: boolean; text: string }) => void }) {
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [env, setEnv] = useState('PRODUCAO')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true); setErr(null)
    try { const j = await api('/api/publications/connections', { method: 'POST', json: { channel: channel.id, credentials: creds, environment: env, label } }); onDone({ ok: j.ok, text: `${channel.name}: ${j.message}` }) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Drawer open onClose={onClose} title={`Conectar ${channel.name}`} subtitle="Use as credenciais de INTEGRAÇÃO fornecidas pelo portal — nunca senha pessoal.">
      <div className="space-y-3">
        <label className="block text-xs text-gray-600">Nome da conta (opcional)<input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${channel.name} — loja`} /></label>
        {channel.credentialFields.map((f: any) => (
          <label key={f.key} className="block text-xs text-gray-600">{f.label}<input className={inputCls} type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.placeholder} value={creds[f.key] ?? ''} onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))} />{f.help && <span className="text-[11px] text-gray-400">{f.help}</span>}</label>
        ))}
        <label className="block text-xs text-gray-600">Ambiente<select className={inputCls} value={env} onChange={(e) => setEnv(e.target.value)}><option value="PRODUCAO">Produção</option><option value="HOMOLOGACAO">Homologação (testes do portal)</option></select></label>
        {err && <ErrorNote message={err} />}
        <p className="text-[11px] text-gray-500">Ao salvar, testamos a conexão. Autenticação aprovada ainda não comprova publicação.</p>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">Cancelar</button><button onClick={submit} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{busy && <Loader2 size={13} className="animate-spin" />}Salvar e testar</button></div>
      </div>
    </Drawer>
  )
}

const CONFIG_FIELDS: Record<string, Array<{ key: string; label: string; help?: string }>> = {
  WEBMOTORS: [
    { key: 'modalidade', label: 'Código da modalidade do pacote', help: 'Veja as modalidades em "Testar" (lista do seu pacote).' },
    { key: 'motivoVendido', label: 'Código do motivo de exclusão — vendido', help: 'Informado pela Webmotors na homologação (formato F05).' },
    { key: 'motivoRetirado', label: 'Código do motivo de exclusão — retirado' },
  ],
  MERCADO_LIVRE: [
    { key: 'listingTypeId', label: 'Tipo de anúncio do pacote (listing_type_id)', help: 'Ex.: silver — conforme o pacote contratado. Nunca compramos pacote.' },
    { key: 'cityId', label: 'Cidade (id de localização do Mercado Livre)', help: 'Ex.: BR-SP-56 ou o id retornado pela API de localização.' },
    { key: 'addressLine', label: 'Endereço (rua e número)' },
  ],
  MOBIAUTO: [{ key: 'planId', label: 'Plano de anúncios (dealPlanId) — opcional', help: 'Vazio = o primeiro plano com anúncios disponíveis (veja em Testar).' }],
  CHAVES_NA_MAO: [{ key: 'baseUrl', label: 'Endereço da API de homologação (opcional)', help: 'Só se o Chaves na Mão indicar outro endereço de testes.' }],
}

function ConfigForm({ conn, spec, onClose, onDone }: { conn: Connection; spec: Channel; onClose: () => void; onDone: (f: { ok: boolean; text: string }) => void }) {
  const [cfg, setCfg] = useState<Record<string, any>>(conn.config ?? {})
  const [label, setLabel] = useState(conn.label)
  const [env, setEnv] = useState(conn.environment)
  const [busy, setBusy] = useState(false)
  const fields = CONFIG_FIELDS[conn.channel] ?? []
  const save = async () => {
    setBusy(true)
    try { await api(`/api/publications/connections/${conn.id}`, { method: 'PATCH', json: { label, environment: env, config: cfg } }); onDone({ ok: true, text: `${conn.label}: configuração salva.` }) } catch (e) { onDone({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  const quota = conn.quota
  return (
    <Drawer open onClose={onClose} title={`Configurar ${spec?.name ?? conn.channel}`} subtitle={conn.label}>
      <div className="space-y-3">
        <label className="block text-xs text-gray-600">Nome<input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="block text-xs text-gray-600">Ambiente<select className={inputCls} value={env} onChange={(e) => setEnv(e.target.value)}><option value="PRODUCAO">Produção</option><option value="HOMOLOGACAO">Homologação</option></select></label>
        {fields.map((f) => <label key={f.key} className="block text-xs text-gray-600">{f.label}<input className={inputCls} value={cfg[f.key] ?? ''} onChange={(e) => setCfg((c) => ({ ...c, [f.key]: e.target.value }))} />{f.help && <span className="text-[11px] text-gray-400">{f.help}</span>}</label>)}
        {conn.channel === 'WEBMOTORS' && (
          <fieldset className="rounded-lg border border-gray-200 p-2 text-xs text-gray-600">
            <legend className="px-1 font-medium">Informações do anúncio (S/N) — marque só o que for verdade para os carros da loja</legend>
            {['IpvaPago', 'Licenciado', 'UnicoDono', 'RevisoesEmConcessionaria', 'GarantiaDeFabrica', 'Blindado', 'Alienado', 'NaoAceitaTroca'].map((k) => <label key={k} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={cfg.flags?.[k] === 'S'} onChange={(e) => setCfg((c) => ({ ...c, flags: { ...(c.flags ?? {}), [k]: e.target.checked ? 'S' : 'N' } }))} />{k.replace(/([A-Z])/g, ' $1').trim()}</label>)}
          </fieldset>
        )}
        {quota && <details className="rounded-lg border border-gray-200 p-2 text-xs"><summary className="cursor-pointer font-medium text-gray-600">Limites/cota lidos do portal</summary><pre className="mt-1 max-h-48 overflow-auto text-[11px]">{JSON.stringify(quota, null, 2)}</pre></details>}
        {!fields.length && conn.channel !== 'WEBMOTORS' && <p className="text-xs text-gray-500">Nada a configurar neste canal.</p>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">Cancelar</button><button onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{busy && <Loader2 size={13} className="animate-spin" />}Salvar</button></div>
      </div>
    </Drawer>
  )
}

function SettingsForm({ connections, channels, canEdit }: { connections: Connection[]; channels: Channel[]; canEdit: boolean }) {
  const [s, setS] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { api('/api/publications/settings').then((j) => setS(j.data)).catch(() => undefined) }, [])
  if (!s) return null
  const set = (path: string, v: unknown) => setS((x: any) => { const n = structuredClone(x); const ks = path.split('.'); let o = n; for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)!] = v; return n })
  const save = async () => {
    if (s.autoPublish.enabled && !confirm('Ligar a publicação automática?\n\nQuando um gestor aprovar as fotos de um veículo disponível, ele será publicado sozinho nos destinos marcados.')) return
    setBusy(true); setMsg(null)
    try { const j = await api('/api/publications/settings', { method: 'PUT', json: s }); setS(j.data); setMsg({ ok: true, text: 'Salvo.' }) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  const eligible = connections.filter((c) => c.status === 'CONECTADO' && channels.find((ch) => ch.id === c.channel)?.publishable && c.channel !== 'MANUAL_SOCIAL')
  return (
    <details className="group rounded-xl border border-gray-200 bg-white" open={false}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800">Contatos e regras da loja <ChevronDown size={16} className="transition-transform group-open:rotate-180" /></summary>
      <fieldset disabled={!canEdit} className="grid gap-4 border-t border-gray-100 p-4 lg:grid-cols-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">Contatos nos anúncios</p>
          {[['contacts.whatsapp', 'WhatsApp', '(11) 90000-0000'], ['contacts.phone', 'Telefone', ''], ['contacts.email', 'E-mail', ''], ['contacts.instagram', 'Instagram', '@sualoja'], ['contacts.site', 'Site', 'www.sualoja.com.br'], ['contacts.contactName', 'Nome de contato', '']].map(([k, l, ph]) => (
            <label key={k} className="block text-xs text-gray-600">{l}<input className={inputCls} value={k.split('.').reduce((o: any, x) => o?.[x], s) ?? ''} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></label>
          ))}
          <p className="text-[11px] text-gray-400">Portais que penalizam contato na descrição recebem esses dados só nos campos próprios.</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">Venda × anúncios</p>
          <label className="block text-xs text-gray-600">Pausar os anúncios quando
            <select className={inputCls} value={s.sale.pauseOn} onChange={(e) => set('sale.pauseOn', e.target.value)}><option value="NEGOCIACAO">A venda é registrada (negociação aberta)</option><option value="APROVACAO">A venda é aprovada</option></select>
          </label>
          <label className="block text-xs text-gray-600">Canal que não permite pausar
            <select className={inputCls} value={s.sale.whenNoPause} onChange={(e) => set('sale.whenNoPause', e.target.value)}><option value="RETIRAR">Retirar e republicar se a venda cair</option><option value="AVISAR">Manter no ar e avisar (ação manual)</option></select>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={s.sale.resumeOnCancel} onChange={(e) => set('sale.resumeOnCancel', e.target.checked)} />Reativar sozinho se a negociação for cancelada</label>
          <p className="text-[11px] text-gray-500">Negociação finalizada: agendamentos cancelados, anúncios retirados e arquivados como “Vendido”.</p>
          <label className="block text-xs text-gray-600">Fuso horário<input className={inputCls} value={s.timezone} onChange={(e) => set('timezone', e.target.value)} /></label>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">Publicação automática</p>
          <label className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" className="mt-0.5" checked={s.autoPublish.enabled} onChange={(e) => set('autoPublish.enabled', e.target.checked)} /><span>Publicar sozinho quando as fotos do veículo forem <b>aprovadas</b>.</span></label>
          {s.autoPublish.enabledAt && <p className="text-[11px] text-gray-500">Ligada por {s.autoPublish.enabledByName ?? '—'} em {new Date(s.autoPublish.enabledAt).toLocaleString('pt-BR')}.</p>}
          <p className="text-[11px] text-gray-500">Destinos:</p>
          {eligible.map((c) => <label key={c.id} className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={s.autoPublish.connectionIds.includes(c.id)} onChange={(e) => set('autoPublish.connectionIds', e.target.checked ? [...s.autoPublish.connectionIds, c.id] : s.autoPublish.connectionIds.filter((x: string) => x !== c.id))} />{channels.find((ch) => ch.id === c.channel)?.name} · {c.label}</label>)}
          {!eligible.length && <p className="text-[11px] text-gray-400">Conecte um canal para escolher.</p>}
          {s.autoPublish.enabled && !s.autoPublish.connectionIds.length && <p className="flex items-center gap-1 text-[11px] text-amber-700"><AlertTriangle size={12} />Escolha ao menos um destino.</p>}
        </div>
        <div className="flex items-center gap-2 lg:col-span-3">
          {canEdit ? <button onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{busy && <Loader2 size={13} className="animate-spin" />}Salvar</button> : <p className="text-xs text-gray-500">Somente gestores alteram estas regras.</p>}
          {msg && <span role="status" className={cn('text-xs', msg.ok ? 'text-green-700' : 'text-red-700')}>{msg.text}</span>}
        </div>
      </fieldset>
    </details>
  )
}
