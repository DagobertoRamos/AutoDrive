'use client'

// =============================================================================
// /master/drive — Google Drive da plataforma (MASTER only)
// Arquivos de avaliações, documentos dos veículos e documentos pessoais vão
// para AutoDrive/<Loja>/... no Drive da conta conectada (economia de banco).
// =============================================================================

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, Copy, ExternalLink, FolderUp, HardDrive, Loader2, Plug, RefreshCw, Unplug } from 'lucide-react'
import { RequiredMark } from '@/components/ui/field'

interface DriveInfo {
  clientConfigured: boolean
  clientId: string
  connected: boolean
  account: string
  connectedAt: string
  redirectUri: string
  pending: { evaluationFiles: number; vehicleFiles: number; privateFiles: number; pendingReceipts: number } | null
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'
const btn = 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50'

export default function MasterDrivePage() {
  return <Suspense><DriveSettings /></Suspense>
}

function DriveSettings() {
  const sp = useSearchParams()
  const [info, setInfo] = useState<DriveInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(
    sp.get('ok') ? { type: 'ok', text: 'Google Drive conectado. A pasta "AutoDrive" foi criada na conta.' }
      : sp.get('erro') ? { type: 'error', text: sp.get('erro')! } : null,
  )
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/master/drive', { cache: 'no-store' })
      const j = await r.json()
      if (j.success) { setInfo(j.data); setClientId((c) => c || j.data.clientId || '') }
      else setMsg({ type: 'error', text: j.error ?? 'Erro ao carregar.' })
    } catch (e) { setMsg({ type: 'error', text: String(e) }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveClient() {
    setBusy('save'); setMsg(null)
    try {
      const r = await fetch('/api/master/drive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error)
      setClientSecret('')
      setMsg({ type: 'ok', text: 'Credencial salva. Agora clique em "Conectar conta Google".' })
      await load()
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) }) }
    finally { setBusy(null) }
  }

  async function post(path: string, label: string, method = 'POST') {
    setBusy(label); setMsg(null)
    try {
      const r = await fetch(path, { method })
      const j = await r.json()
      if (!j.success) throw new Error(j.error)
      return j.data
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) }); return null }
    finally { setBusy(null) }
  }

  async function test() {
    const d = await post('/api/master/drive/test', 'test')
    if (d) setMsg({ type: 'ok', text: 'Conexão OK. Pasta AutoDrive pronta.' })
  }

  async function migrate() {
    const d = await post('/api/master/drive/migrate', 'migrate')
    if (d) {
      const left = d.pending.evaluationFiles + d.pending.vehicleFiles + d.pending.privateFiles + d.pending.pendingReceipts
      setMsg({ type: d.failed ? 'error' : 'ok', text: `${d.migrated} arquivo(s) levados ao Drive${d.failed ? `, ${d.failed} com erro (${d.errors[0] ?? ''})` : ''}. ${left ? `Faltam ${left} — clique de novo para continuar.` : 'Nada mais no banco.'}` })
      await load()
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar o Google Drive? Os arquivos que já estão lá continuam lá, mas o sistema não consegue abri-los enquanto estiver desconectado.')) return
    const d = await post('/api/master/drive', 'disconnect', 'DELETE')
    if (d) { setMsg({ type: 'ok', text: 'Google Drive desconectado.' }); await load() }
  }

  const pendingTotal = info?.pending ? info.pending.evaluationFiles + info.pending.vehicleFiles + info.pending.privateFiles + info.pending.pendingReceipts : 0

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <HardDrive className="h-6 w-6 text-brand-600" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Google Drive</h1>
          <p className="text-sm text-gray-500">Arquivos do sistema guardados no Drive, organizados por loja.</p>
        </div>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${msg.type === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {msg.type === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {loading && !info ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : info && (
        <>
          {/* Status */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{info.connected ? 'Conectado' : 'Não conectado'}</p>
                <p className="text-sm text-gray-500">
                  {info.connected ? `${info.account || 'Conta Google'} · desde ${new Date(info.connectedAt).toLocaleString('pt-BR')}` : 'Sem conexão, os arquivos continuam sendo gravados no banco.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {info.clientConfigured && (
                  <a href="/api/master/drive/connect" className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
                    <Plug className="h-4 w-4" /> {info.connected ? 'Reconectar' : 'Conectar conta Google'}
                  </a>
                )}
                {info.connected && (
                  <>
                    <button onClick={test} disabled={!!busy} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>
                      {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Testar
                    </button>
                    <button onClick={disconnect} disabled={!!busy} className={`${btn} border border-red-200 text-red-700 hover:bg-red-50`}>
                      <Unplug className="h-4 w-4" /> Desconectar
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Migração */}
          {info.connected && (
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Arquivos ainda fora do Drive</p>
                  <p className="text-sm text-gray-500">
                    {info.pending ? `${info.pending.evaluationFiles} de avaliações · ${info.pending.vehicleFiles} de veículos · ${info.pending.privateFiles} de negociações/F&I/financeiro${info.pending.pendingReceipts ? ` · ${info.pending.pendingReceipts} comprovante(s) p/ organizar` : ""}` : "—"}
                    {' '}· a cada 6 h o sistema leva o que faltar.
                  </p>
                </div>
                <button onClick={migrate} disabled={!!busy || !pendingTotal} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
                  {busy === 'migrate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderUp className="h-4 w-4" />} Migrar agora
                </button>
              </div>
            </section>
          )}

          {/* Credencial OAuth */}
          <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-900">Credencial do Google Cloud (OAuth)</p>
            <div>
              <span className={labelCls}>URI de redirecionamento autorizado (cadastre no Google Cloud)</span>
              <div className="flex gap-2">
                <input readOnly value={info.redirectUri} className={`${inputCls} bg-gray-50 font-mono text-xs`} />
                <button onClick={() => navigator.clipboard.writeText(info.redirectUri)} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`} title="Copiar"><Copy className="h-4 w-4" /></button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Client ID <RequiredMark /></label>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Client secret {!info.clientConfigured && <RequiredMark />}</label>
              <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={info.clientConfigured ? '•••••••• (deixe vazio para manter)' : 'GOCSPX-…'} className={inputCls} autoComplete="off" />
            </div>
            <div className="flex justify-end">
              <button onClick={saveClient} disabled={!!busy || !clientId.trim()} className={`${btn} bg-gray-900 text-white hover:bg-gray-800`}>
                {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />} Salvar credencial
              </button>
            </div>
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              Abrir credenciais no Google Cloud <ExternalLink className="h-3 w-3" />
            </a>
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <p className="mb-1 font-medium text-gray-800">Organização no Drive</p>
            <p className="font-mono text-xs leading-6">
              AutoDrive / &lt;Loja&gt; / Avaliações / &lt;MM-AAAA&gt; / &lt;Marca Modelo - PLACA&gt;<br />
              AutoDrive / &lt;Loja&gt; / Documentos dos veículos / &lt;MM-AAAA&gt; / &lt;Marca Modelo - PLACA&gt;<br />
              AutoDrive / &lt;Loja&gt; / Documentos pessoais / &lt;MM-AAAA&gt; / &lt;Nome - Marca Modelo - PLACA&gt;<br />
              AutoDrive / &lt;Loja&gt; / Negociações / &lt;MM-AAAA&gt; / &lt;Cliente - Marca Modelo - PLACA&gt;<br />
              AutoDrive / &lt;Loja&gt; / Financeiro / &lt;MM-AAAA&gt;
            </p>
          </section>
        </>
      )}
    </div>
  )
}
