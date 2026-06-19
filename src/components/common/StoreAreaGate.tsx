'use client'

// =============================================================================
// StoreAreaGate — área da loja (tenant-scoped). Para o MASTER (sem loja), mostra
// um seletor de "loja ativa" no topo e só libera os filhos após escolher. A
// escolha vai no cookie `acting_tenant` (enviado às APIs; validado no backend
// por resolveActingTenant). Transparente para não-MASTER.
// Reutilizável em qualquer layout de área da loja (Marketing, F&I config, ...).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Store, AlertCircle } from 'lucide-react'

const COOKIE = 'acting_tenant'
const readCookie = () => { const m = (typeof document !== 'undefined' ? document.cookie : '').match(/(?:^|;\s*)acting_tenant=([^;]+)/); return m ? decodeURIComponent(m[1]) : '' }
const writeCookie = (v: string) => { document.cookie = `${COOKIE}=${encodeURIComponent(v)}; path=/; max-age=${60 * 60 * 12}; samesite=lax` }

interface Tenant { id: string; name: string }

export function StoreAreaGate({ children, area = 'esta área' }: { children: React.ReactNode; area?: string }) {
  const { data: session, status } = useSession()
  const role = (session?.user as { role?: string })?.role
  const isMaster = role === 'MASTER'

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (isMaster) setSelected(readCookie()) }, [isMaster])

  const loadTenants = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/master/tenants?limit=200', { credentials: 'include' }).then((x) => x.json())
      setTenants((r?.data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })))
    } catch { setTenants([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) loadTenants() }, [isMaster, loadTenants])

  const change = (id: string) => { writeCookie(id); setSelected(id); window.location.reload() }

  if (status === 'loading' || !isMaster) return <>{children}</>

  const current = tenants.find((t) => t.id === selected)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-3">
        <Store size={18} className="text-brand-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">Operando como MASTER</p>
          <p className="text-xs text-gray-500">{`${area.charAt(0).toUpperCase()}${area.slice(1)} é da loja. Escolha a loja para operar.`}</p>
        </div>
        <select
          value={selected}
          onChange={(e) => change(e.target.value)}
          disabled={loading}
          className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">{loading ? 'Carregando lojas...' : 'Selecione uma loja...'}</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {selected && current ? children : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><AlertCircle size={22} /></div>
          <p className="text-sm font-medium text-gray-700">{`Selecione uma loja acima para operar ${area}.`}</p>
          <p className="max-w-md text-xs text-gray-500">As configurações são por loja. A camada técnica global fica nos painéis do MASTER.</p>
        </div>
      )}
    </div>
  )
}
