'use client'

// =============================================================================
// Conexões da loja: para cada área (RENAVE, notas, transferência, consulta
// veicular), o provedor ativo e — sob demanda — a lista de indicados, as
// credenciais da conta da loja, o teste e a ativação. Segredos nunca voltam.
// =============================================================================

import { useState } from 'react'
import { CheckCircle2, ChevronRight, Copy, ExternalLink } from 'lucide-react'
import { FieldLabel } from '@/components/ui/field'
import type { ConnectorDomain, ProviderEntry } from '@/lib/automotive/providers-catalog'
import { btn, Drawer, ErrorLine, fmtDateTime, Hint, input, postJson, StatusBadge } from './ui'

export interface Connection {
  id: string; domain: string; providerId: string; unitId: string | null; environment: string; status: string
  hints: Record<string, string>; settings: Record<string, unknown>; lastTestAt: string | null; lastTestOk: boolean | null; lastError: string | null; webhookUrl: string
}

const DOMAINS: { key: ConnectorDomain; hint: Parameters<typeof Hint>[0]['term'] }[] = [
  { key: 'RENAVE', hint: 'RENAVE' },
  { key: 'FISCAL', hint: 'NFE_OPERACAO' },
  { key: 'TRANSFER', hint: 'TRANSFERENCIA_STATUS' },
  { key: 'VEHICLE_DATA', hint: 'CONSULTA_VEICULAR' },
]
const MODE_TEXT: Record<string, string> = { API: 'Conector pronto', PARCEIRO: 'Conector AutoDrive', MANUAL: 'Registro manual' }
const STATUS_TONE: Record<string, 'ok' | 'attention' | 'critical' | 'neutral'> = { ACTIVE: 'ok', DRAFT: 'attention', ERROR: 'critical', DISABLED: 'neutral' }
const STATUS_TEXT: Record<string, string> = { ACTIVE: 'Ativa', DRAFT: 'Não testada', ERROR: 'Com erro', DISABLED: 'Desativada' }

export function ConnectionsPanel({ catalog, labels, connections, units, onChanged }: { catalog: ProviderEntry[]; labels: Record<string, string>; connections: Connection[]; units: { id: string; name: string }[]; onChanged: () => void }) {
  const [domain, setDomain] = useState<ConnectorDomain | null>(null)
  return (
    <div className="divide-y divide-gray-100">
      {DOMAINS.map((d) => {
        const active = connections.find((c) => c.domain === d.key && c.status === 'ACTIVE')
        const entry = active ? catalog.find((p) => p.domain === d.key && p.id === active.providerId) : null
        const pending = !active && connections.some((c) => c.domain === d.key && (c.status === 'DRAFT' || c.status === 'ERROR'))
        return (
          <button key={d.key} onClick={() => setDomain(d.key)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-gray-50/60">
            <span className="inline-flex items-center gap-1 text-sm text-gray-700">{labels[d.key]}<Hint term={d.hint} /></span>
            <span className="inline-flex items-center gap-2 text-sm">
              {active ? <><span className="font-medium text-gray-800">{entry?.name ?? active.providerId}</span><CheckCircle2 className="h-4 w-4 text-emerald-500" /></>
                : pending ? <span className="text-amber-700">Configuração pendente</span>
                : <span className="text-gray-400">Manual</span>}
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </span>
          </button>
        )
      })}
      <DomainDrawer domain={domain} onClose={() => setDomain(null)} catalog={catalog} labels={labels} connections={connections} units={units} onChanged={onChanged} />
    </div>
  )
}

function DomainDrawer({ domain, onClose, catalog, labels, connections, units, onChanged }: { domain: ConnectorDomain | null; onClose: () => void; catalog: ProviderEntry[]; labels: Record<string, string>; connections: Connection[]; units: { id: string; name: string }[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<ProviderEntry | null>(null)
  if (!domain) return null
  const list = catalog.filter((p) => p.domain === domain && p.mode !== 'MANUAL').sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended))
  const mine = connections.filter((c) => c.domain === domain)
  return (
    <Drawer open title={labels[domain]} onClose={() => { setEditing(null); onClose() }}>
      {editing ? (
        <ConnectionForm entry={editing} existing={mine.find((c) => c.providerId === editing.id) ?? null} units={units} onBack={() => setEditing(null)} onChanged={onChanged} />
      ) : (
        <>
          {mine.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white">
              {mine.map((c) => {
                const e = catalog.find((p) => p.domain === domain && p.id === c.providerId)
                return (
                  <button key={c.id} onClick={() => e && setEditing(e)} className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-0 hover:bg-gray-50">
                    <span>
                      <span className="block text-sm font-medium text-gray-800">{e?.name ?? c.providerId}</span>
                      <span className="text-xs text-gray-400">{c.environment === 'HOMOLOGACAO' ? 'Homologação' : 'Produção'}{c.unitId ? ` · ${units.find((u) => u.id === c.unitId)?.name ?? 'filial'}` : ''}</span>
                    </span>
                    <StatusBadge tone={STATUS_TONE[c.status] ?? 'neutral'}>{STATUS_TEXT[c.status] ?? c.status}</StatusBadge>
                  </button>
                )
              })}
            </div>
          )}
          <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Indicados</p>
          <div className="space-y-2">
            {list.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      {p.name}
                      {p.note && <Hint term="PROVEDOR_INTEGRACAO" size={11} />}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{p.covers.join(' · ')}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className={p.mode === 'API' ? 'font-medium text-emerald-700' : 'text-gray-500'}>{MODE_TEXT[p.mode]}</span>
                      {p.recommended && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">Indicado</span>}
                      {p.site && <a href={p.site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-gray-500 hover:text-gray-800">Site<ExternalLink className="h-3 w-3" /></a>}
                    </p>
                  </div>
                  <button className={btn.secondary} onClick={() => setEditing(p)}>{mine.some((c) => c.providerId === p.id) ? 'Abrir' : 'Conectar'}</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Drawer>
  )
}

function ConnectionForm({ entry, existing, units, onBack, onChanged }: { entry: ProviderEntry; existing: Connection | null; units: { id: string; name: string }[]; onBack: () => void; onChanged: () => void }) {
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries(entry.fields.filter((f) => !f.secret).map((f) => [f.key, String(existing?.settings?.[f.key] ?? '')])))
  const [environment, setEnvironment] = useState(existing?.environment ?? (entry.environments.includes('HOMOLOGACAO') ? 'HOMOLOGACAO' : 'PRODUCAO'))
  const [unitId, setUnitId] = useState(existing?.unitId ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [conn, setConn] = useState<Connection | null>(existing)

  const run = async (label: string, body: Record<string, unknown>) => {
    setBusy(label); setError(null); setInfo(null)
    const r = await postJson<any>('/api/settings/operations', body)
    setBusy(null)
    if (!r.ok) { setError(r.error); return null }
    return r.data
  }
  const save = async () => {
    const d = await run('save', { action: 'connection.save', domain: entry.domain, providerId: entry.id, environment, unitId: unitId || null, fields })
    if (d) { setConn({ ...(conn ?? ({} as Connection)), id: d.id, webhookUrl: d.webhookUrl, status: 'DRAFT', lastTestOk: null } as Connection); setInfo('Salvo. Teste a conexão.'); onChanged() }
  }
  const test = async () => {
    if (!conn?.id) return
    const d = await run('test', { action: 'connection.test', id: conn.id })
    if (d) {
      setConn({ ...conn, lastTestOk: d.ok, status: d.ok ? conn.status : 'ERROR' })
      setInfo(d.ok ? (d.webhookRegistered === false ? 'Conexão ok. Cadastre o endereço de aviso no painel do provedor.' : 'Conexão ok.') : null)
      if (!d.ok) setError(d.message)
      onChanged()
    }
  }
  const activate = async () => { if (conn?.id && await run('activate', { action: 'connection.activate', id: conn.id }) !== null) { setConn({ ...conn, status: 'ACTIVE' }); setInfo('Conexão ativa.'); onChanged() } }
  const disable = async () => { if (conn?.id && await run('disable', { action: 'connection.disable', id: conn.id }) !== null) { setConn({ ...conn, status: 'DISABLED' }); onChanged() } }

  return (
    <div className="space-y-4">
      <button className={btn.link} onClick={onBack}>← Voltar</button>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-gray-900">{entry.name}</p>
          {conn?.status && <StatusBadge tone={STATUS_TONE[conn.status] ?? 'neutral'}>{STATUS_TEXT[conn.status] ?? conn.status}</StatusBadge>}
        </div>
        {entry.docsUrl && <a href={entry.docsUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">Documentação<ExternalLink className="h-3 w-3" /></a>}
        <div className="mt-4 space-y-3">
          {entry.environments.length > 1 && (
            <div>
              <FieldLabel>Ambiente</FieldLabel>
              <select className={input} value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                <option value="HOMOLOGACAO">Homologação (testes)</option>
                <option value="PRODUCAO">Produção</option>
              </select>
            </div>
          )}
          {units.length > 1 && (
            <div>
              <FieldLabel>Vale para</FieldLabel>
              <select className={input} value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!!existing}>
                <option value="">Todas as lojas</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          {entry.fields.map((f) => (
            <div key={f.key}>
              <FieldLabel required={f.required && !(f.secret && existing?.hints?.[f.key])} helpText={f.help}>{f.label}</FieldLabel>
              <input className={input} type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.secret ? existing?.hints?.[f.key] ?? '' : ''}
                value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
        {conn?.id && entry.mode !== 'MANUAL' && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3">
            <p className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">Endereço de aviso (webhook)<Hint term="WEBHOOK_LOJA" size={11} /></p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs text-gray-700">{conn.webhookUrl || '—'}</code>
              {conn.webhookUrl && <button className="text-gray-400 hover:text-gray-700" onClick={() => navigator.clipboard?.writeText(conn.webhookUrl)} aria-label="Copiar"><Copy className="h-4 w-4" /></button>}
            </div>
          </div>
        )}
        {conn?.lastTestAt && <p className="mt-3 text-xs text-gray-400">Último teste: {fmtDateTime(conn.lastTestAt)}{conn.lastTestOk ? ' · ok' : ''}</p>}
        <ErrorLine text={error} />
        {info && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={btn.primary} disabled={!!busy} onClick={save}>{busy === 'save' ? 'Salvando…' : 'Salvar'}</button>
          {conn?.id && <button className={btn.secondary} disabled={!!busy} onClick={test}>{busy === 'test' ? 'Testando…' : 'Testar conexão'}</button>}
          {conn?.id && conn.lastTestOk && conn.status !== 'ACTIVE' && <button className={btn.secondary} disabled={!!busy} onClick={activate}>Ativar</button>}
          {conn?.status === 'ACTIVE' && <button className={btn.link} disabled={!!busy} onClick={disable}>Desativar</button>}
        </div>
      </div>
    </div>
  )
}
