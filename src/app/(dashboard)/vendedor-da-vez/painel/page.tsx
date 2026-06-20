'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Painel da Unidade — líder/gerente.
// Fila atual, clientes aguardando (chamar próximo), chamados ativos (timeout)
// e suspeitas. Faz polling. Ações com justificativa quando exigido.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { LayoutDashboard, RefreshCw, PhoneCall, Clock, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

const dt = (s: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')

interface Entry { id: string; sellerName: string; status: string }
interface Arrival { id: string; customerName: string | null; customerPhone: string | null; recurring: boolean; status: string; createdAt: string }
interface Att { id: string; sellerName: string; status: string; acceptDeadline: string | null; arrival: { customerName: string | null } | null }

export default function PainelUnidadePage() {
  const [cur, setCur] = useState<{ entries: Entry[]; vendedorDaVez: { sellerName: string } | null } | null>(null)
  const [arrivals, setArrivals] = useState<Arrival[]>([])
  const [active, setActive] = useState<Att[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000) }

  const load = useCallback(async () => {
    try {
      const [cRes, aRes, atRes] = await Promise.all([
        fetch('/api/seller-queue/current', { credentials: 'include' }),
        fetch('/api/seller-queue/customer-arrivals', { credentials: 'include' }),
        fetch('/api/seller-queue/attendances?active=true', { credentials: 'include' }),
      ])
      if (cRes.status === 403 || cRes.status === 400) { const j = await cRes.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null)
      setCur((await cRes.json())?.data ?? null)
      setArrivals(((await aRes.json())?.data ?? []).filter((a: Arrival) => ['PENDING', 'CALLING'].includes(a.status)))
      setActive((await atRes.json())?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i) }, [load])

  const callNext = async (a: Arrival) => {
    setBusy(a.id)
    try {
      const res = await fetch(`/api/seller-queue/customer-arrivals/${a.id}/call-next`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({}) })
      const j = await res.json().catch(() => ({})); flash(res.ok ? 'Próximo vendedor chamado.' : (j?.error ?? 'Falha ao chamar.'), res.ok); await load()
    } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  const doTimeout = async (att: Att) => {
    setBusy(att.id)
    try {
      const res = await fetch(`/api/seller-queue/attendances/${att.id}/timeout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason: 'pulo pela gestão' }) })
      const j = await res.json().catch(() => ({})); flash(res.ok ? 'Pulado — próximo chamado.' : (j?.error ?? 'Falha.'), res.ok); await load()
    } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }

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
                <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium text-gray-900">{a.customerName || a.customerPhone || 'Cliente'}{a.recurring && <span className="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700">recorrente</span>}</p><p className="text-xs text-gray-400">{dt(a.createdAt)} · {a.status}</p></div>
                  <button onClick={() => callNext(a)} disabled={busy === a.id} className="btn-primary shrink-0 text-xs"><PhoneCall size={13} />Chamar</button>
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
                  <div className="min-w-0"><p className="truncate font-medium text-gray-900">{att.sellerName}</p><p className="text-xs text-gray-400">{att.status} · {att.arrival?.customerName ?? 'cliente'}</p></div>
                  {att.status === 'CALLED' && <button onClick={() => doTimeout(att)} disabled={busy === att.id} className="btn-secondary shrink-0 text-xs text-amber-700"><Clock size={13} />Pular</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-4 py-2.5"><p className="text-sm font-semibold text-gray-700">Fila atual</p></div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['#', 'Vendedor', 'Status'].map((h) => (<th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {(cur?.entries ?? []).length === 0 ? (<tr><td colSpan={3} className="py-8 text-center text-sm text-gray-400">Fila vazia.</td></tr>)
            : cur!.entries.map((e, i) => (<tr key={e.id} className="hover:bg-gray-50"><td className="px-4 py-2 tabular-nums text-gray-500">{i + 1}</td><td className="px-4 py-2 font-medium text-gray-900">{e.sellerName}</td><td className="px-4 py-2 text-xs text-gray-500">{e.status}</td></tr>))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
