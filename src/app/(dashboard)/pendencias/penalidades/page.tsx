'use client'

// =============================================================================
// Pendências > Penalidades — painel do gestor. Lista quem está penalizado (por
// pendência crítica não tratada), desde quando, motivo e a pendência que causou.
// O gestor pode REMOVER com justificativa obrigatória. Gate: gestor+.
// Decisão de produto: penalidade só AVISA/marca — NÃO suspende a fila de leads.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { ShieldAlert, Lock, RefreshCw, Clock, Undo2, History } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

const MANAGER_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

interface Penalty {
  id: string; sellerName: string; unitName: string | null; type: string; reason: string | null
  active: boolean; since: string; removedAt: string | null; removedReason: string | null
  pendency: { id: string; customerName: string; plate: string | null; type: string | null; status: string; dueDate: string | null } | null
}

function since(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `há ${mins}min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export default function PendencyPenaltiesPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || MANAGER_ROLES.includes(role)

  const [items, setItems] = useState<Penalty[]>([])
  const [loading, setLoading] = useState(true)
  const [includeRemoved, setIncludeRemoved] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/pendencies/penalties${includeRemoved ? '?includeRemoved=1' : ''}`, { credentials: 'include' }).then((x) => x.json())
      setItems(r?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [includeRemoved])

  useEffect(() => { if (allowed) load() }, [allowed, load])

  const remove = async (p: Penalty) => {
    const reason = window.prompt(`Remover a penalidade de ${p.sellerName}? Informe a justificativa (mín. 5 caracteres):`)
    if (reason === null) return
    if (reason.trim().length < 5) { alert('Justificativa muito curta.'); return }
    setBusy(p.id)
    try {
      const res = await fetch(`/api/pendencies/penalties/${p.id}/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason: reason.trim() }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert(j?.error ?? 'Falha ao remover.'); return }
      await load()
    } catch { alert('Erro de rede.') } finally { setBusy(null) }
  }

  if (session && !allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div><p className="text-lg font-semibold text-gray-800">Painel restrito</p><p className="mt-1 max-w-md text-sm text-gray-500">As penalidades são geridas pela administração da loja.</p></div>
      </div>
    )
  }

  const active = items.filter((i) => i.active)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><ShieldAlert size={20} className="text-red-600" />Penalidades</h1>
          <p className="mt-0.5 text-sm text-gray-500">Vendedores com pendência crítica não tratada. A penalidade <b>avisa e marca no relatório</b> — não bloqueia a fila de leads.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIncludeRemoved((v) => !v)} className="btn-secondary text-xs"><History size={14} />{includeRemoved ? 'Só ativas' : 'Ver histórico'}</button>
          <button onClick={() => load()} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={14} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center"><p className="text-2xl font-black text-red-700 tabular-nums">{active.length}</p><p className="text-[10px] font-bold uppercase tracking-wider text-red-600">Penalizados agora</p></div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center"><p className="text-2xl font-black text-gray-700 tabular-nums">{new Set(active.map((i) => i.sellerName)).size}</p><p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Vendedores</p></div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Vendedor', 'Motivo', 'Pendência', 'Desde', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center"><ShieldAlert size={28} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Ninguém penalizado. 🎉</p></td></tr>
              ) : items.map((p) => (
                <tr key={p.id} className={cn('hover:bg-gray-50', !p.active && 'opacity-55')}>
                  <td className="px-4 py-3"><p className="font-medium text-gray-900">{p.sellerName}</p>{p.unitName && <p className="text-[11px] text-gray-400">{p.unitName}</p>}</td>
                  <td className="px-4 py-3 text-gray-600">{p.reason ?? '—'}</td>
                  <td className="px-4 py-3">{p.pendency ? (<span className="text-gray-700">{p.pendency.type ?? 'Pendência'} — {p.pendency.customerName}{p.pendency.plate ? ` · ${p.pendency.plate}` : ''}</span>) : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500"><span className="inline-flex items-center gap-1"><Clock size={12} />{since(p.since)}</span></td>
                  <td className="px-4 py-3">{p.active ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Ativa</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Removida{p.removedAt ? ` ${formatDate(new Date(p.removedAt))}` : ''}</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {p.active ? (
                      <button onClick={() => remove(p)} disabled={busy === p.id} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Undo2 size={13} />Remover</button>
                    ) : p.removedReason ? (<span className="text-[11px] italic text-gray-400" title={p.removedReason}>&quot;{p.removedReason.slice(0, 40)}&quot;</span>) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
