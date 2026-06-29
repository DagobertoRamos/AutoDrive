'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Painel da Unidade — líder/gerente.
// Fila atual, clientes aguardando (chamar próximo), chamados ativos (timeout)
// e suspeitas. Faz polling. Ações com justificativa quando exigido.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { LayoutDashboard, RefreshCw, PhoneCall, Clock, Crown, ChevronUp, ChevronDown, Lock, Unlock, Pause, Play, UserMinus, UserPlus } from 'lucide-react'
import { queueStatusLabel } from '@/lib/seller-queue/labels'
import { cn } from '@/lib/utils'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
const dt = (s: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')

interface Entry { id: string; sellerId: string; sellerName: string; status: string; blocked: boolean }
interface Arrival { id: string; customerName: string | null; customerPhone: string | null; recurring: boolean; status: string; createdAt: string }
interface Att { id: string; sellerName: string; status: string; acceptDeadline: string | null; arrival: { customerName: string | null } | null }
interface PosVenda { sellerId: string; name: string; status: string; returnRequestedAt: string | null; since: string }
interface QEvent { id: string; type: string; sellerName: string | null; actorName: string | null; reason: string | null; createdAt: string }

const EVENT_LABEL: Record<string, string> = {
  CHECK_IN: 'Entrou na fila', CHECK_OUT: 'Saiu da fila', PAUSE: 'Pausou', RESUME: 'Voltou',
  CUSTOMER_ARRIVED: 'Cliente registrado', CALLED: 'Chamado', ACCEPTED: 'Aceitou', REJECTED: 'Recusou',
  TIMEOUT: 'Não aceitou (timeout)', SKIPPED: 'Pulado', ATTENDANCE_STARTED: 'Atendimento iniciado',
  ATTENDANCE_FINISHED: 'Atendimento finalizado', MOVED_TO_END: 'Foi pro fim', MANAGER_OVERRIDE: 'Override gerente',
  LEADER_OVERRIDE: 'Override líder', QUEUE_REORDERED: 'Fila reordenada', FRAUD_FLAGGED: '⚠️ Suspeita de fraude',
}

export default function PainelUnidadePage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const canManage = !!role && MANAGE_ROLES.includes(role)
  const [cur, setCur] = useState<{ entries: Entry[]; vendedorDaVez: { sellerName: string } | null; allowChooseSeller?: boolean } | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [arrivals, setArrivals] = useState<Arrival[]>([])
  const [active, setActive] = useState<Att[]>([])
  const [posVendas, setPosVendas] = useState<PosVenda[]>([])
  const [events, setEvents] = useState<QEvent[]>([])
  const [callable, setCallable] = useState<{ sellerId: string; name: string; inQueue: boolean; queueStatus: string | null }[]>([])
  const [addPick, setAddPick] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000) }

  const load = useCallback(async () => {
    try {
      const [cRes, aRes, atRes, pvRes] = await Promise.all([
        fetch('/api/seller-queue/current', { credentials: 'include' }),
        fetch('/api/seller-queue/customer-arrivals', { credentials: 'include' }),
        fetch('/api/seller-queue/attendances?active=true', { credentials: 'include' }),
        fetch('/api/seller-queue/pos-vendas', { credentials: 'include' }),
      ])
      fetch('/api/seller-queue/events?limit=80', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => { if (j?.success) setEvents(j.data ?? []) }).catch(() => {})
      fetch('/api/seller-queue/callable', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => { if (j?.success) setCallable(j.data ?? []) }).catch(() => {})
      if (cRes.status === 403 || cRes.status === 400) { const j = await cRes.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null)
      setCur((await cRes.json())?.data ?? null)
      setArrivals(((await aRes.json())?.data ?? []).filter((a: Arrival) => ['PENDING', 'CALLING'].includes(a.status)))
      setActive((await atRes.json())?.data ?? [])
      setPosVendas(pvRes.ok ? ((await pvRes.json())?.data ?? []) : [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i) }, [load])

  const callNext = async (a: Arrival, sellerId?: string) => {
    let body: { sellerId?: string; reason?: string } = {}
    if (sellerId) {
      const reason = prompt('Justificativa para escolher este vendedor (fura a ordem da fila — será auditado):')
      if (!reason?.trim()) return
      body = { sellerId, reason: reason.trim() }
    }
    setBusy(a.id)
    try {
      const res = await fetch(`/api/seller-queue/customer-arrivals/${a.id}/call-next`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({})); flash(res.ok ? (sellerId ? 'Vendedor escolhido foi chamado.' : 'Próximo vendedor chamado.') : (j?.error ?? 'Falha ao chamar.'), res.ok)
      setPick((p) => ({ ...p, [a.id]: '' })); await load()
    } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  const doTimeout = async (att: Att) => {
    setBusy(att.id)
    try {
      const res = await fetch(`/api/seller-queue/attendances/${att.id}/timeout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason: 'pulo pela gestão' }) })
      const j = await res.json().catch(() => ({})); flash(res.ok ? 'Pulado — próximo chamado.' : (j?.error ?? 'Falha.'), res.ok); await load()
    } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  const authorizeReturn = async (sellerId: string) => {
    setBusy(sellerId)
    try {
      const res = await fetch('/api/seller-queue/pos-vendas/authorize-return', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ sellerId }) })
      const j = await res.json().catch(() => ({})); flash(res.ok ? 'Retorno autorizado — voltou à fila.' : (j?.error ?? 'Falha.'), res.ok); await load()
    } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  const block = async (e: Entry) => {
    const reason = prompt(e.blocked ? 'Justificativa para liberar:' : 'Justificativa para bloquear:'); if (!reason) return
    setBusy(e.id)
    try { const res = await fetch(`/api/seller-queue/entries/${e.id}/block`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ blocked: !e.blocked, reason }) }); const j = await res.json().catch(() => ({})); flash(res.ok ? (e.blocked ? 'Vendedor liberado.' : 'Vendedor bloqueado.') : (j?.error ?? 'Falha.'), res.ok); await load() } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  const reorder = async (e: Entry, direction: 'up' | 'down') => {
    setBusy(e.id)
    try { const res = await fetch('/api/seller-queue/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ entryId: e.id, direction, reason: 'ajuste manual da gestão' }) }); const j = await res.json().catch(() => ({})); if (!res.ok) flash(j?.error ?? 'Falha.', false); await load() } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  // Transfere um atendimento ativo para outro vendedor (ele é chamado de novo).
  const transferAtt = async (attId: string, toSellerId: string) => {
    if (!toSellerId) return
    setBusy(attId)
    try { const res = await fetch(`/api/seller-queue/attendances/${attId}/manage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'transfer', toSellerId }) }); const j = await res.json().catch(() => ({})); flash(res.ok ? 'Atendimento transferido.' : (j?.error ?? 'Falha.'), res.ok); await load() } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  // Gestão controla a fila do vendedor: pausar / voltar / retirar / colocar.
  const manageSeller = async (sellerId: string, action: 'pause' | 'resume' | 'remove' | 'add', label: string) => {
    if (action === 'remove' && !confirm('Retirar este vendedor da fila?')) return
    setBusy(sellerId)
    try { const res = await fetch('/api/seller-queue/manage-seller', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ sellerId, action }) }); const j = await res.json().catch(() => ({})); flash(res.ok ? label : (j?.error ?? 'Falha.'), res.ok); await load() } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }

  const waiting = (cur?.entries ?? []).filter((e) => e.status === 'WAITING' && !e.blocked)
  const canChoose = canManage && cur?.allowChooseSeller !== false && waiting.length > 0

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><LayoutDashboard size={20} className="text-brand-600" />Painel da Unidade</h1>
          <p className="mt-0.5 text-sm text-gray-500">Vendedor da vez: {cur?.vendedorDaVez ? <span className="inline-flex items-center gap-1 text-brand-700"><Crown size={13} />{cur.vendedorDaVez.sellerName}</span> : '—'}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>
      {toast && <div className={cn('rounded-lg px-4 py-2 text-sm', toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{toast.msg}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-100 px-4 py-2.5"><p className="text-sm font-semibold text-gray-700">Clientes aguardando ({arrivals.length})</p></div>
          {arrivals.length === 0 ? <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhum cliente na espera.</p> : (
            <ul className="divide-y divide-gray-100">
              {arrivals.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium text-gray-900">{a.customerName || a.customerPhone || 'Cliente'}{a.recurring && <span className="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700">recorrente / retorno</span>}</p><p className="text-xs text-gray-400">{dt(a.createdAt)} · {queueStatusLabel(a.status)}</p></div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {canChoose && (
                      <select value={pick[a.id] ?? ''} onChange={(e) => setPick((p) => ({ ...p, [a.id]: e.target.value }))} disabled={busy === a.id} className="max-w-[9rem] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" title="Escolher o vendedor (opcional)">
                        <option value="">1º da fila</option>
                        {waiting.map((s) => <option key={s.sellerId} value={s.sellerId}>{s.sellerName}</option>)}
                      </select>
                    )}
                    <button onClick={() => callNext(a, pick[a.id] || undefined)} disabled={busy === a.id} className="btn-primary text-xs"><PhoneCall size={13} />{pick[a.id] ? 'Chamar escolhido' : 'Chamar'}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-100 px-4 py-2.5"><p className="text-sm font-semibold text-gray-700">Chamados ativos ({active.length})</p></div>
          {active.length === 0 ? <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhum chamado em andamento.</p> : (
            <ul className="divide-y divide-gray-100">
              {active.map((att) => (
                <li key={att.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium text-gray-900">{att.sellerName}</p><p className="text-xs text-gray-400">{queueStatusLabel(att.status)} · {att.arrival?.customerName ?? 'cliente'}</p></div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {canManage && callable.length > 0 && (
                      <select value="" onChange={(e) => { if (e.target.value) void transferAtt(att.id, e.target.value) }} disabled={busy === att.id} className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600" title="Transferir atendimento">
                        <option value="">Transferir…</option>
                        {callable.map((c) => <option key={c.sellerId} value={c.sellerId}>{c.name}</option>)}
                      </select>
                    )}
                    {att.status === 'CALLED' && <button onClick={() => doTimeout(att)} disabled={busy === att.id} className="btn-secondary text-xs text-amber-700"><Clock size={13} />Pular</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Pós-vendas — pausados / aguardando autorização de retorno */}
      {posVendas.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 shadow-card">
          <div className="border-b border-amber-100 px-4 py-2.5"><p className="text-sm font-semibold text-amber-800">Pós-vendas ({posVendas.length})</p></div>
          <ul className="divide-y divide-amber-100">
            {posVendas.map((pv) => (
              <li key={pv.sellerId} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{pv.name}</p>
                  <p className="text-xs text-gray-500">{pv.status === 'RETURN_REQUESTED' ? `🔔 pediu para voltar (${dt(pv.returnRequestedAt)})` : 'em pós-vendas (pausado)'}</p>
                </div>
                <button onClick={() => authorizeReturn(pv.sellerId)} disabled={busy === pv.sellerId}
                  className={cn('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60', pv.status === 'RETURN_REQUESTED' ? 'bg-brand-600 hover:bg-brand-700' : 'bg-gray-400 hover:bg-gray-500')}>
                  {busy === pv.sellerId ? '...' : 'Autorizar retorno'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-4 py-2.5"><p className="text-sm font-semibold text-gray-700">Fila atual {canManage && <span className="font-normal text-gray-400">— gerência: pausar/voltar/retirar/colocar/bloquear/reordenar</span>}</p></div>
        {canManage && (() => {
          const fora = callable.filter((c) => !c.inQueue || c.queueStatus === 'LEFT' || c.queueStatus === null)
          return fora.length > 0 ? (
            <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
              <UserPlus size={15} className="text-brand-600" />
              <select value={addPick} onChange={(e) => setAddPick(e.target.value)} className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm">
                <option value="">Colocar vendedor na fila…</option>
                {fora.map((c) => <option key={c.sellerId} value={c.sellerId}>{c.name}</option>)}
              </select>
              <button onClick={() => { if (addPick) { manageSeller(addPick, 'add', 'Vendedor colocado na fila.'); setAddPick('') } }} disabled={!addPick || busy === addPick} className="btn-primary text-xs">Adicionar</button>
            </div>
          ) : null
        })()}
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['#', 'Vendedor', 'Status', ''].map((h) => (<th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {(cur?.entries ?? []).length === 0 ? (<tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">Fila vazia.</td></tr>)
            : cur!.entries.map((e, i) => (
              <tr key={e.id} className={cn('hover:bg-gray-50', e.blocked && 'opacity-60')}>
                <td className="px-4 py-2 tabular-nums text-gray-500">{i + 1}</td>
                <td className="px-4 py-2 font-medium text-gray-900">{e.sellerName}{e.blocked && <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600"><Lock size={10} />bloqueado</span>}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{queueStatusLabel(e.status)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {canManage && <>
                    <button onClick={() => reorder(e, 'up')} disabled={busy === e.id || i === 0} className="inline-flex rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30" title="Subir"><ChevronUp size={14} /></button>
                    <button onClick={() => reorder(e, 'down')} disabled={busy === e.id || i === (cur!.entries.length - 1)} className="mr-1 inline-flex rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30" title="Descer"><ChevronDown size={14} /></button>
                    {['WAITING', 'NEXT'].includes(e.status) && <button onClick={() => manageSeller(e.sellerId, 'pause', 'Vendedor pausado.')} disabled={busy === e.id} className="inline-flex rounded p-1 text-gray-400 hover:bg-amber-50 hover:text-amber-600" title="Pausar"><Pause size={14} /></button>}
                    {e.status === 'PAUSED' && <button onClick={() => manageSeller(e.sellerId, 'resume', 'Vendedor de volta à fila.')} disabled={busy === e.id} className="inline-flex rounded p-1 text-green-600 hover:bg-green-50" title="Voltar à fila"><Play size={14} /></button>}
                    <button onClick={() => block(e)} disabled={busy === e.id} className={cn('inline-flex rounded p-1', e.blocked ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-red-50 hover:text-red-600')} title={e.blocked ? 'Liberar' : 'Bloquear'}>{e.blocked ? <Unlock size={14} /> : <Lock size={14} />}</button>
                    {e.status !== 'LEFT' && <button onClick={() => manageSeller(e.sellerId, 'remove', 'Vendedor retirado da fila.')} disabled={busy === e.id} className="inline-flex rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Retirar da fila"><UserMinus size={14} /></button>}
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Log / Auditoria da fila (antifraude) */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <button onClick={() => setShowLog((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">Log da fila — hoje ({events.length})</span>
          <span className="text-xs text-gray-400">{showLog ? 'ocultar' : 'mostrar'}</span>
        </button>
        {showLog && (
          events.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-400">Sem eventos hoje.</p> : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <div className="min-w-0">
                    <span className={cn('mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold', ev.type === 'FRAUD_FLAGGED' ? 'bg-red-100 text-red-700' : ev.type === 'TIMEOUT' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>{EVENT_LABEL[ev.type] ?? ev.type}</span>
                    <span className="text-gray-800">{ev.sellerName ?? '—'}</span>
                    {ev.actorName && ev.actorName !== ev.sellerName && <span className="text-xs text-gray-400"> · por {ev.actorName}</span>}
                    {ev.reason && <span className="text-xs text-gray-400"> · {ev.reason}</span>}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-gray-400">{dt(ev.createdAt)}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  )
}
