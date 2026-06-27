'use client'

// =============================================================================
// Comercial › Fila de Atendimento — visão geral + "Chamar vendedor da vez".
// Botão de 1 toque (qualquer um com acesso à fila, sem check-in) chama o
// vendedor da vez. Auto-timeout: quando o prazo de aceite estoura, a própria
// tela chama o próximo. Quem aceita cadastra o cliente depois.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ListOrdered, DoorOpen, Bell, RefreshCw, Crown, Hand, Clock, UserSearch, X, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import QueueSelfCard from '@/components/seller-queue/QueueSelfCard'

interface Entry { id: string; sellerName: string; status: string; position: number; attendanceCount: number }
interface Data { entries: Entry[]; vendedorDaVez: { sellerName: string } | null; arrivalsPending: number; queue: unknown | null }
interface Att { id: string; sellerName: string; status: string; acceptDeadline: string | null; arrival: { customerName: string | null } | null }
interface Callable { sellerId: string; name: string; role: string; positionName: string | null; queueStatus: string | null; inQueue: boolean }

const ROLE_LABEL: Record<string, string> = { GERENTE_GERAL: 'Gerente Geral', GERENTE_ADMINISTRATIVO: 'Ger. Administrativo', GERENTE: 'Gerente', VENDEDOR_LIDER: 'Líder', VENDEDOR: 'Vendedor', FINANCEIRO: 'Financeiro', USUARIO_LIDER: 'Líder (apoio)', USUARIO: 'Auxiliar' }

const STATUS_CLS: Record<string, string> = { WAITING: 'bg-gray-100 text-gray-600', PAUSED: 'bg-amber-100 text-amber-700', CALLED: 'bg-blue-100 text-blue-700', IN_ATTENDANCE: 'bg-green-100 text-green-700', NEXT: 'bg-brand-100 text-brand-700' }

export default function FilaOverviewPage() {
  const [data, setData] = useState<Data | null>(null)
  const [active, setActive] = useState<Att[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)
  const [calling, setCalling] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [now, setNow] = useState(0)
  const firedTimeouts = useRef<Set<string>>(new Set())
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000) }

  const load = useCallback(async () => {
    try {
      const [cRes, aRes] = await Promise.all([
        fetch('/api/seller-queue/current', { credentials: 'include' }),
        fetch('/api/seller-queue/attendances?active=true', { credentials: 'include' }),
      ])
      if (cRes.status === 403 || cRes.status === 400) { const j = await cRes.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null)
      setData((await cRes.json())?.data ?? null)
      const atts: Att[] = (await aRes.json())?.data ?? []
      setActive(atts.filter((a) => ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'].includes(a.status)))

      // Auto-timeout: chamado cujo prazo estourou → chama o próximo (1x por id).
      const nowMs = Date.now()
      for (const att of atts) {
        if (att.status === 'CALLED' && att.acceptDeadline && new Date(att.acceptDeadline).getTime() < nowMs && !firedTimeouts.current.has(att.id)) {
          firedTimeouts.current.add(att.id)
          fetch(`/api/seller-queue/attendances/${att.id}/timeout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason: 'tempo de aceite esgotado' }) })
            .then(() => { setTimeout(() => { void load() }, 800) }).catch(() => {})
        }
      }
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i) }, [load])
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const callDaVez = async () => {
    setCalling(true)
    try {
      const res = await fetch('/api/seller-queue/quick-call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flash(j?.error ?? 'Falha ao chamar.', false) }
      else if (j?.data?.call?.ok) { flash('Vendedor da vez chamado! 🔔', true) }
      else { flash(j?.data?.call?.reason ?? 'Nenhum vendedor disponível na fila.', false) }
      await load()
    } catch { flash('Erro de rede.', false) } finally { setCalling(false) }
  }

  // ── Chamar colaborador específico (responsável / pós-vendas / superior) ──────
  const [pickerOpen, setPickerOpen] = useState(false)
  const [callable, setCallable] = useState<Callable[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [callingId, setCallingId] = useState<string | null>(null)
  const [posVendaMode, setPosVendaMode] = useState(false)

  const openPicker = async () => {
    setPickerOpen(true); setSearch(''); setPosVendaMode(false); setPickerLoading(true)
    try {
      const res = await fetch('/api/seller-queue/callable', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (res.ok) setCallable(j?.data ?? [])
    } catch { /* noop */ } finally { setPickerLoading(false) }
  }
  const callSpecific = async (c: Callable) => {
    setCallingId(c.sellerId)
    try {
      if (posVendaMode) {
        const res = await fetch('/api/seller-queue/pos-vendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ sellerId: c.sellerId }) })
        const j = await res.json().catch(() => ({}))
        if (res.ok) { flash(`${c.name} em pós-vendas (pausado).`, true); setPickerOpen(false) } else flash(j?.error ?? 'Não foi possível.', false)
      } else {
        const res = await fetch('/api/seller-queue/call-specific', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ sellerId: c.sellerId }) })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) flash(j?.error ?? 'Falha ao chamar.', false)
        else if (j?.data?.call?.ok) { flash(`${c.name} chamado! 🔔`, true); setPickerOpen(false) }
        else flash(j?.data?.call?.reason ?? 'Não foi possível chamar.', false)
      }
      await load()
    } catch { flash('Erro de rede.', false) } finally { setCallingId(null) }
  }
  const filteredCallable = callable.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.positionName ?? '').toLowerCase().includes(search.toLowerCase()))

  const called = active.filter((a) => a.status === 'CALLED')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><ListOrdered size={20} className="text-brand-600" />Fila de Atendimento</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${data?.entries?.length ?? 0} na fila · ${data?.arrivalsPending ?? 0} cliente(s) aguardando`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <QueueSelfCard />

      {/* Chamar vendedor da vez — 1 toque, qualquer pessoa com acesso à fila */}
      {!denied && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Vendedor da vez: {data?.vendedorDaVez ? <span className="inline-flex items-center gap-1 text-brand-700"><Crown size={14} />{data.vendedorDaVez.sellerName}</span> : <span className="text-gray-400">— ninguém na fila</span>}</p>
          </div>
          <button
            onClick={callDaVez}
            disabled={calling}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            <Hand size={20} />{calling ? 'Chamando...' : 'Chamar vendedor da vez'}
          </button>
          <button
            onClick={openPicker}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
          >
            <UserSearch size={16} />Chamar responsável / específico
          </button>
          <p className="mt-2 text-center text-xs text-gray-500">O vendedor da vez é alertado na hora; se não aceitar no prazo, o próximo é chamado automaticamente. Para retorno/pós-vendas, use "chamar responsável".</p>

          {called.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {called.map((a) => {
                const secs = a.acceptDeadline ? Math.max(0, Math.floor((new Date(a.acceptDeadline).getTime() - now) / 1000)) : null
                return (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
                    <span className="font-medium text-blue-800">🔔 Chamando {a.sellerName}…</span>
                    {secs !== null && <span className="inline-flex items-center gap-1 tabular-nums text-blue-600"><Clock size={13} />{secs}s</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/vendedor-da-vez/minha-fila" className="rounded-xl border border-gray-200 bg-white p-4 shadow-card hover:border-brand-300"><DoorOpen size={20} className="mb-2 text-brand-600" /><p className="font-semibold text-gray-900">Minha Fila</p><p className="text-xs text-gray-500">Entrar, pausar, atender</p></Link>
        <Link href="/vendedor-da-vez/cliente-na-loja" className="rounded-xl border border-gray-200 bg-white p-4 shadow-card hover:border-brand-300"><Bell size={20} className="mb-2 text-brand-600" /><p className="font-semibold text-gray-900">Cliente na Loja</p><p className="text-xs text-gray-500">Registrar com nome/telefone</p></Link>
      </div>

      {denied ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-4 py-2.5">
          <p className="text-sm font-semibold text-gray-700">Fila ({data?.entries?.length ?? 0})</p>
        </div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['#', 'Vendedor', 'Status', 'Atend.'].map((h) => (<th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {(data?.entries ?? []).length === 0 ? (<tr><td colSpan={4} className="py-10 text-center text-sm text-gray-400">Fila vazia.</td></tr>)
            : data!.entries.map((e, i) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 tabular-nums text-gray-500">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{e.sellerName}</td>
                <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[e.status] ?? 'bg-gray-100 text-gray-500')}>{e.status}</span></td>
                <td className="px-4 py-2.5 tabular-nums text-gray-500">{e.attendanceCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {toast && (
        <div className={cn('fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg', toast.ok ? 'bg-brand-600' : 'bg-red-600')}>{toast.msg}</div>
      )}

      {/* Modal — escolher colaborador específico (responsável / pós-vendas / superior) */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setPickerOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-base font-bold text-gray-900">Chamar colaborador</h2>
              <button onClick={() => setPickerOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="space-y-2 border-b border-gray-100 p-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou cargo…" className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={posVendaMode} onChange={(e) => setPosVendaMode(e.target.checked)} className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                <span>É <strong>pós-vendas</strong> (pausa o colaborador na fila até liberação do gestor)</span>
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {pickerLoading ? (
                <p className="py-8 text-center text-sm text-gray-400">Carregando…</p>
              ) : filteredCallable.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Nenhum colaborador encontrado.</p>
              ) : filteredCallable.map((c) => {
                const busy = c.queueStatus === 'CALLED' || c.queueStatus === 'ACCEPTED' || c.queueStatus === 'IN_ATTENDANCE'
                return (
                  <button key={c.sellerId} onClick={() => callSpecific(c)} disabled={callingId !== null || busy}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.positionName ?? ROLE_LABEL[c.role] ?? c.role}{c.inQueue ? ' · na fila' : c.queueStatus ? ` · ${c.queueStatus.toLowerCase()}` : ' · fora da fila'}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white', posVendaMode ? 'bg-amber-600' : 'bg-brand-600')}>{callingId === c.sellerId ? '...' : posVendaMode ? 'Pós-vendas' : busy ? 'ocupado' : 'Chamar'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
