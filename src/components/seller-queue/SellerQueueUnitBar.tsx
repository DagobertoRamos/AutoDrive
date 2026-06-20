'use client'

// =============================================================================
// SellerQueueUnitBar — seletor de unidade para quem NÃO tem unidade própria
// (MASTER/usuário de plataforma). Grava a escolha no cookie `sq_unit` (lido no
// backend por unitFromRequest). Transparente para vendedores/líderes/gerentes
// que já têm unitId (não renderiza).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Building2 } from 'lucide-react'

const readCookie = () => { const m = (typeof document !== 'undefined' ? document.cookie : '').match(/(?:^|;\s*)sq_unit=([^;]+)/); return m ? decodeURIComponent(m[1]) : '' }
const writeCookie = (v: string) => { document.cookie = `sq_unit=${encodeURIComponent(v)}; path=/; max-age=${60 * 60 * 12}; samesite=lax` }

export function SellerQueueUnitBar() {
  const { data: session, status } = useSession()
  const unitId = (session?.user as { unitId?: string | null })?.unitId
  const [units, setUnits] = useState<{ id: string; name: string }[]>([])
  const [sel, setSel] = useState('')

  useEffect(() => { setSel(readCookie()) }, [])
  const load = useCallback(async () => {
    try { const r = await fetch('/api/seller-queue/units', { credentials: 'include' }).then((x) => x.json()); setUnits(r?.data ?? []) } catch { setUnits([]) }
  }, [])
  useEffect(() => { if (status !== 'loading' && !unitId) load() }, [status, unitId, load])

  if (status === 'loading' || unitId) return null // usuário com unidade própria não precisa
  const change = (id: string) => { writeCookie(id); setSel(id); window.location.reload() }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
      <Building2 size={15} className="text-gray-400" />
      <span className="text-gray-600">Unidade ativa:</span>
      <select value={sel} onChange={(e) => change(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
        <option value="">Selecione a unidade...</option>
        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      {!sel && <span className="text-xs text-amber-600">escolha uma unidade para operar</span>}
    </div>
  )
}
