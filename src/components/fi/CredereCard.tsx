'use client'

// Cartão "Credere (reserva)" em Configurações › F&I › Credenciais.
// A loja conecta a conta Credere DELA (login OAuth). Sem conexão direta com um
// banco, as fichas para aquele banco vão pela Credere.
import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, Unlink, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint } from '@/components/ui/help-hint'

interface Status {
  appConfigured: boolean; cryptoReady: boolean; connected: boolean; ready: boolean; readable: boolean | null
  userName: string | null; storeId: string | null; storeName: string | null; sellerOk: boolean
  stores: { id: string; name: string; city: string; uf: string }[]
  webhookUrl: string; webhookSigned: boolean
}

const RETURN_MSG: Record<string, { ok: boolean; msg: string }> = {
  ok: { ok: true, msg: 'Credere conectada.' },
  'sem-loja': { ok: false, msg: 'Credere conectada, mas a conta não tem loja. Crie a loja na Credere e escolha abaixo.' },
  cancelado: { ok: false, msg: 'Conexão com a Credere cancelada.' },
  sessao: { ok: false, msg: 'A volta da Credere não bateu com a sua sessão. Tente conectar de novo.' },
  cripto: { ok: false, msg: 'Criptografia não configurada (FINANCE_ENCRYPTION_KEY).' },
  'sem-app': { ok: false, msg: 'O aplicativo AutoDrive ainda não foi liberado pela Credere (CREDERE_CLIENT_ID).' },
  erro: { ok: false, msg: 'A Credere não concluiu a conexão. Tente de novo.' },
}

export function CredereCard() {
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null)
  const [secret, setSecret] = useState('')

  const load = useCallback(async () => {
    try { const r = await fetch('/api/settings/financing/credere', { credentials: 'include' }).then((x) => x.json()); setS(r?.data ?? null) } catch { setS(null) }
  }, [])
  useEffect(() => {
    const ret = new URLSearchParams(window.location.search).get('credere')
    const t = setTimeout(() => { if (ret && RETURN_MSG[ret]) setNote(RETURN_MSG[ret]); void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const pickStore = async (storeId: string) => {
    setBusy(true)
    const r = await fetch('/api/settings/financing/credere', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ storeId }) }).then((x) => x.json()).catch(() => null)
    setNote(r?.success ? { ok: true, msg: 'Loja da Credere atualizada.' } : { ok: false, msg: r?.error ?? 'Não foi possível trocar a loja.' })
    setBusy(false); await load()
  }
  const saveSecret = async (value: string) => {
    setBusy(true)
    const r = await fetch('/api/settings/financing/credere', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ webhookSecret: value }) }).then((x) => x.json()).catch(() => null)
    setNote(r?.success ? { ok: true, msg: value ? 'Secret salvo: só avisos assinados pela Credere serão aceitos.' : 'Secret removido.' } : { ok: false, msg: r?.error ?? 'Não foi possível salvar o secret.' })
    if (r?.success) setSecret('')
    setBusy(false); await load()
  }
  const copyUrl = () => { if (s?.webhookUrl) { void navigator.clipboard?.writeText(s.webhookUrl); setNote({ ok: true, msg: 'URL copiada.' }) } }
  const disconnect = async () => {
    if (!confirm('Desconectar a Credere desta loja?')) return
    setBusy(true)
    await fetch('/api/settings/financing/credere', { method: 'DELETE', credentials: 'include' }).catch(() => null)
    setBusy(false); setNote({ ok: true, msg: 'Credere desconectada.' }); await load()
  }

  if (!s) return null
  const tone = s.ready ? 'bg-green-100 text-green-700' : s.connected ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
  const label = s.ready ? 'Conectada' : s.connected ? 'Falta configurar' : 'Não conectada'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-900">Credere (reserva)</h2>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', tone)}>{label}</span>
            <HelpHint text="Quando a loja não tem conexão direta com um banco, a ficha para esse banco vai pela Credere da loja. Os bancos precisam estar cadastrados na conta Credere da loja." size={12} />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {s.connected ? <>Conta: <b>{s.userName || '—'}</b>{s.storeName ? <> · Loja: <b>{s.storeName}</b></> : null}</> : 'Bancos sem conexão direta passam a enviar pela Credere.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {s.connected ? (
            <>
              <a href="/api/settings/financing/credere/connect" className="btn-secondary text-sm"><RefreshCw size={14} />Reconectar</a>
              <button onClick={disconnect} disabled={busy} className="btn-secondary text-sm text-red-600"><Unlink size={14} />Desconectar</button>
            </>
          ) : (
            <a href={s.appConfigured && s.cryptoReady ? '/api/settings/financing/credere/connect' : undefined} aria-disabled={!s.appConfigured || !s.cryptoReady}
              className={cn('btn-primary text-sm', (!s.appConfigured || !s.cryptoReady) && 'pointer-events-none opacity-50')}><Link2 size={14} />Conectar Credere</a>
          )}
        </div>
      </div>

      {!s.appConfigured && <p className="mt-2 text-xs text-amber-700">Aguardando a liberação do aplicativo AutoDrive pela Credere (api@meucredere.com.br).</p>}
      {s.connected && s.readable === false && <p className="mt-2 text-xs text-red-600">Não foi possível ler a conexão salva. Reconecte.</p>}
      {s.connected && !s.sellerOk && <p className="mt-2 text-xs text-amber-700">A conta que conectou não tem CPF de vendedor na Credere. Reconecte com um usuário vendedor.</p>}
      {s.connected && s.stores.length > 1 && (
        <div className="mt-3 max-w-sm">
          <label className="mb-1 block text-xs font-medium text-gray-700">Loja da Credere usada no envio</label>
          <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={s.storeId ?? ''} disabled={busy} onChange={(e) => void pickStore(e.target.value)}>
            {!s.storeId && <option value="">Selecione...</option>}
            {s.stores.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` — ${x.city}/${x.uf}` : ''}</option>)}
          </select>
        </div>
      )}
      {s.connected && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-gray-700">Avisos da Credere</p>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', s.webhookSigned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>{s.webhookSigned ? 'Assinatura conferida' : 'Sem assinatura'}</span>
            <HelpHint text="No formulário da loja na Credere (seção de webhooks, ao final), cadastre esta URL e cole aqui o secret que a Credere mostra abaixo dela. Com o secret, avisos falsos são recusados e não gastam o limite de consultas." size={12} />
          </div>
          <div className="mt-2 flex max-w-xl items-center gap-2">
            <input readOnly value={s.webhookUrl} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={copyUrl} className="btn-secondary text-xs"><Copy size={13} />Copiar</button>
          </div>
          <div className="mt-2 flex max-w-xl items-center gap-2">
            <input type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={s.webhookSigned ? 'Secret salvo (em branco = manter)' : 'Secret da URL na Credere'} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
            <button type="button" onClick={() => void saveSecret(secret.trim())} disabled={busy || !secret.trim()} className="btn-primary text-xs">Salvar</button>
            {s.webhookSigned && <button type="button" onClick={() => { if (confirm('Remover o secret? Avisos sem assinatura voltam a ser aceitos (só disparam consulta).')) void saveSecret('') }} disabled={busy} className="btn-secondary text-xs text-red-600">Remover</button>}
          </div>
        </div>
      )}
      {note && <p className={cn('mt-2 text-xs', note.ok ? 'text-green-700' : 'text-red-600')}>{note.msg}</p>}
    </div>
  )
}
