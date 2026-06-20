'use client'

// =============================================================================
// /master/modules — Liberação de funcionalidades por tenant (MASTER).
// Item por item: escolhe a loja e liga/desliga cada funcionalidade do AutoDrive.
// Desligar esconde do menu E bloqueia a API (requireModule). Default = ligado.
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Package, RefreshCw, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MODULE_CATALOG } from '@/lib/modules-catalog'

interface TenantModuleEntry { module: string; active: boolean }
interface TenantWithModules { id: string; name: string; plan: string; status: string; modules: TenantModuleEntry[] }

export default function MasterModulesPage() {
  const { data: session } = useSession()
  const isMaster = (session?.user as { role?: string })?.role === 'MASTER'

  const [tenants, setTenants] = useState<TenantWithModules[]>([])
  const [sel, setSel] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/master/modules', { credentials: 'include' }).then((x) => x.json())
      const list: TenantWithModules[] = r?.data ?? []
      setTenants(list)
      setSel((s) => s || list[0]?.id || '')
    } catch { setTenants([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const tenant = tenants.find((t) => t.id === sel)
  // Mapa de active por módulo (default = true quando não há registro).
  const stateOf = (key: string): boolean => {
    const row = tenant?.modules?.find((m) => m.module === key)
    return row ? row.active : true
  }

  const toggle = async (key: string, current: boolean) => {
    if (!tenant) return
    const id = `${tenant.id}:${key}`
    setBusy(id)
    // otimista
    setTenants((ts) => ts.map((t) => t.id !== tenant.id ? t : {
      ...t, modules: [...t.modules.filter((m) => m.module !== key), { module: key, active: !current }],
    }))
    try {
      const res = await fetch('/api/master/modules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ tenantId: tenant.id, module: key, active: !current }) })
      if (!res.ok) await load()
    } catch { await load() } finally { setBusy(null) }
  }

  if (session && !isMaster) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p><p className="mt-1 text-sm text-gray-500">A liberação de funcionalidades por loja é controlada pela plataforma.</p></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Package size={20} className="text-brand-600" />Funcionalidades por Loja</h1>
          <p className="mt-0.5 text-sm text-gray-500">Ligue/desligue cada item do AutoDrive para a loja. Desligado some do menu e é bloqueado nas APIs.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : !tenant ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Nenhuma loja encontrada.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {MODULE_CATALOG.map((group) => (
            <div key={group.area} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
              <div className="border-b border-gray-100 px-4 py-2.5"><p className="text-sm font-semibold text-gray-700">{group.area}</p></div>
              <ul className="divide-y divide-gray-100">
                {group.features.map((f) => {
                  const active = stateOf(f.key)
                  const id = `${tenant.id}:${f.key}`
                  return (
                    <li key={f.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-800">{f.label}</p>
                        <p className="font-mono text-[10px] text-gray-400">{f.key}</p>
                      </div>
                      <button
                        onClick={() => toggle(f.key, active)}
                        disabled={busy === id}
                        role="switch" aria-checked={active}
                        className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', active ? 'bg-brand-600' : 'bg-gray-300', busy === id && 'opacity-50')}
                        title={active ? 'Ativo — clique p/ desativar' : 'Inativo — clique p/ ativar'}
                      >
                        <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', active ? 'translate-x-5' : 'translate-x-0.5')} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
