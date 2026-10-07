'use client'

// =============================================================================
// F&I › Bancos — bancos da loja ativa e o estado da conexão de cada um.
// Credenciais nunca aparecem; só se existem. Cada loja/filial tem os seus.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Landmark, Plug, Plus } from 'lucide-react'
import { FieldLabel } from '@/components/ui/field'
import { HelpHint } from '@/components/ui/help-hint'
import { Alert, api, btnPrimary, btnSecondary, dateTimeBR, Drawer, EmptyState, inputClass, Modal, PageHeader, StatusBadge } from '@/components/fi/ui'

interface Conn {
  id: string; name: string; code: string | null; active: boolean; adapterKey: string | null
  channel: { name: string; kind: string } | null; state: string; label: string; tone: string; hint: string
  hasCredential?: boolean; lastCommunicationAt: string | null; lastTestStatus?: string | null
}
interface Provider { key: string; name: string; channel: string }
interface Payload { data: Conn[]; store: string | null; environment: string; canConfig: boolean; providers?: Provider[] }

const ENV_LABEL: Record<string, string> = { PRODUCAO: 'Produção', HOMOLOGACAO: 'Homologação (testes)' }

export default function BancosPage() {
  const [p, setP] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Conn | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const r = await api<Conn[]>('/api/financing/connections')
    if (!r.ok) { setError(r.error); return }
    const j = r.json as unknown as Payload
    setP({ data: r.data ?? [], store: j.store, environment: j.environment, canConfig: j.canConfig, providers: j.providers })
    setError(null)
  }, [])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <PageHeader title="Bancos" subtitle={p?.store ?? undefined} actions={p?.canConfig ? <button className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} />Adicionar banco</button> : undefined} />
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {p && p.data.length === 0 ? <EmptyState icon={<Landmark size={28} />} text="Nenhum banco cadastrado nesta loja." /> : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2.5 font-medium">Banco</th><th className="px-4 py-2.5 font-medium">Situação</th><th className="px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1">Canal<HelpHint term="CANAL_INTEGRACAO" size={11} /></span></th><th className="px-4 py-2.5 font-medium">Última comunicação</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {(p?.data ?? []).map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setOpen(c)}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}{!c.active && <span className="ml-2 text-xs font-normal text-gray-500">(inativo)</span>}</td>
                  <td className="px-4 py-2.5"><StatusBadge meta={{ label: c.label, tone: c.tone }} /></td>
                  <td className="px-4 py-2.5 text-gray-700">{c.channel?.name ?? 'Acompanhamento manual'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{c.lastCommunicationAt ? dateTimeBR(c.lastCommunicationAt) : '—'}</td>
                </tr>
              ))}
              {!p && Array.from({ length: 3 }).map((_, i) => <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-5 animate-pulse rounded bg-gray-100" /></td></tr>)}
            </tbody>
          </table>
        )}
      </div>
      {open && p && <BankDrawer conn={open} payload={p} onClose={() => setOpen(null)} onChanged={() => { load(); setOpen(null) }} />}
      {adding && p && <AddBank providers={p.providers ?? []} onClose={() => setAdding(false)} onDone={load} />}
    </div>
  )
}

function BankDrawer({ conn, payload, onClose, onChanged }: { conn: Conn; payload: Payload; onClose: () => void; onChanged: () => void }) {
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [config, setConfig] = useState(false)
  const [adapterKey, setAdapterKey] = useState(conn.adapterKey ?? '')
  const [active, setActive] = useState(conn.active)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTest = async () => {
    setTesting(true); setTest(null)
    const r = await api<{ ok: boolean; message: string }>(`/api/financing/banks/${conn.id}/test`, { method: 'POST', body: {} })
    setTesting(false)
    setTest(r.ok && r.data ? r.data : { ok: false, message: r.error ?? 'Erro.' })
  }
  const save = async () => {
    setBusy(true); setError(null)
    const r = await api(`/api/financing/banks/${conn.id}`, { method: 'PATCH', body: { adapterKey: adapterKey || null, active } })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onChanged()
  }

  return (
    <Drawer title={conn.name} onClose={onClose} footer={payload.canConfig ? (config ? <><button className={btnSecondary} onClick={() => setConfig(false)}>Voltar</button><button className={btnPrimary} onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></> : <><button className={btnSecondary} onClick={() => setConfig(true)}>Configurações</button><button className={btnPrimary} onClick={runTest} disabled={testing}><Plug size={15} />{testing ? 'Testando…' : 'Testar conexão'}</button></>) : undefined}>
      {!config ? (
        <dl className="space-y-3 text-sm">
          <Row label="Situação"><StatusBadge meta={{ label: conn.label, tone: conn.tone }} size="md" /></Row>
          <p className="text-xs text-gray-500">{conn.hint}</p>
          <Row label="Loja">{payload.store ?? '—'}</Row>
          <Row label="Canal" hint="CANAL_INTEGRACAO">{conn.channel?.name ?? 'Acompanhamento manual'}</Row>
          {payload.canConfig && <Row label="Credenciamento" hint="CREDENCIAL_BANCO">{conn.hasCredential ? 'Credencial cadastrada' : 'Sem credencial'}</Row>}
          <Row label="Ambiente" hint="AMBIENTE_FI">{ENV_LABEL[payload.environment] ?? payload.environment}</Row>
          <Row label="Última comunicação">{conn.lastCommunicationAt ? dateTimeBR(conn.lastCommunicationAt) : '—'}</Row>
          {test && <Alert tone={test.ok ? 'success' : 'warning'}>{test.message}</Alert>}
        </dl>
      ) : (
        <div className="space-y-4">
          <div>
            <FieldLabel helpTerm="CANAL_INTEGRACAO">Canal</FieldLabel>
            <select className={inputClass} value={adapterKey} onChange={(e) => setAdapterKey(e.target.value)}>
              <option value="">Acompanhamento manual</option>
              {(payload.providers ?? []).map((pv) => <option key={pv.key} value={pv.key}>{pv.name}{pv.channel === 'AGREGADOR' ? ' (agregador)' : pv.channel === 'TESTE' ? ' (somente testes)' : ''}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={active} onChange={(e) => setActive(e.target.checked)} />Banco ativo nesta loja</label>
          <p className="text-sm"><Link href="/configuracoes/fi/integracoes" className="font-medium text-brand-700 hover:underline">Cadastrar ou trocar a credencial</Link><HelpHint term="CREDENCIAL_BANCO" size={12} className="ml-1" /></p>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>
      )}
    </Drawer>
  )
}

function Row({ label, hint, children }: { label: string; hint?: 'CANAL_INTEGRACAO' | 'CREDENCIAL_BANCO' | 'AMBIENTE_FI'; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-gray-50 pb-2"><dt className="flex items-center gap-1 text-gray-500">{label}{hint && <HelpHint term={hint} size={11} />}</dt><dd className="text-right font-medium text-gray-900">{children}</dd></div>
}

function AddBank({ providers, onClose, onDone }: { providers: Provider[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [adapterKey, setAdapterKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (name.trim().length < 2) { setError('Informe o nome do banco.'); return }
    setBusy(true); setError(null)
    const r = await api('/api/financing/banks', { method: 'POST', body: { name: name.trim(), code: code.trim() || null, adapterKey: adapterKey || null, active: true } })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone(); onClose()
  }
  return (
    <Modal title="Adicionar banco" onClose={onClose} footer={<><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Adicionar'}</button></>}>
      <div className="space-y-3">
        <div><FieldLabel required>Nome</FieldLabel><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div><FieldLabel>Código do banco</FieldLabel><input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} /></div>
        <div><FieldLabel helpTerm="CANAL_INTEGRACAO">Canal</FieldLabel>
          <select className={inputClass} value={adapterKey} onChange={(e) => setAdapterKey(e.target.value)}>
            <option value="">Acompanhamento manual</option>
            {providers.map((pv) => <option key={pv.key} value={pv.key}>{pv.name}{pv.channel === 'AGREGADOR' ? ' (agregador)' : pv.channel === 'TESTE' ? ' (somente testes)' : ''}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}
