'use client'

// =============================================================================
// /master/modules — Controle de módulos por tenant
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Package,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronDown,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TenantModuleEntry {
  tenantId: string
  module:   string
  active:   boolean
  enabledAt: string | null
  disabledAt: string | null
}

interface TenantWithModules {
  id:       string
  publicId: string
  name:     string
  plan:     string
  status:   string
  primaryColor: string | null
  modules:  TenantModuleEntry[]
}

const ALL_MODULES = [
  { key: 'dashboard',             label: 'Dashboard' },
  { key: 'pendencies',            label: 'Pendências' },
  { key: 'negotiations',          label: 'Negociações' },
  { key: 'commissions',           label: 'Comissões' },
  { key: 'communication',         label: 'Comunicação' },
  { key: 'documents',             label: 'Documentos' },
  { key: 'registrations',         label: 'Cadastros' },
  { key: 'settings',              label: 'Configurações' },
  { key: 'logs',                  label: 'Relatórios' },
]

// ── Página ────────────────────────────────────────────────────────────────────

export default function MasterModulesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tenants, setTenants] = useState<TenantWithModules[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [saving, setSaving]   = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  const load = useCallback(() => {
    if (session?.user?.role !== 'MASTER') return
    setLoading(true)
    fetch('/api/master/modules')
      .then((r) => r.json())
      .then((d) => setTenants(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session])

  useEffect(() => { load() }, [load])

  const toggleModule = async (tenantId: string, module: string, currentActive: boolean) => {
    const key = `${tenantId}:${module}`
    setSaving(key)
    try {
      await fetch('/api/master/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, module, active: !currentActive }),
      })
      setTenants((prev) =>
        prev.map((t) =>
          t.id !== tenantId ? t : {
            ...t,
            modules: t.modules.map((m) =>
              m.module !== module ? m : { ...m, active: !currentActive },
            ),
          },
        ),
      )
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(null)
    }
  }

  const filtered = tenants.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.publicId.includes(search),
  )

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package size={22} className="text-brand-700" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Módulos por Tenant</h1>
            <p className="text-sm text-gray-500">Ative ou desative módulos por cliente</p>
          </div>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Filtro */}
      <div className="card">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Buscar tenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Lista de tenants com módulos */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((tenant) => {
            const isOpen = expanded === tenant.id
            const activeCount = tenant.modules.filter((m) => m.active).length

            // Map modules for quick lookup
            const moduleMap: Record<string, TenantModuleEntry> = {}
            tenant.modules.forEach((m) => { moduleMap[m.module] = m })

            return (
              <div key={tenant.id} className="card overflow-hidden p-0">
                {/* Header tenant */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                  onClick={() => setExpanded(isOpen ? null : tenant.id)}
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: tenant.primaryColor ?? '#166534' }}
                  >
                    {tenant.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{tenant.name}</p>
                    <p className="text-xs text-gray-400">{tenant.publicId} · {activeCount}/{ALL_MODULES.length} módulos ativos</p>
                  </div>
                  <ChevronDown
                    size={15}
                    className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Módulos grid */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-4">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {ALL_MODULES.map((mod) => {
                        const entry = moduleMap[mod.key]
                        const active = entry?.active ?? false
                        const key = `${tenant.id}:${mod.key}`
                        const isSaving = saving === key

                        return (
                          <button
                            key={mod.key}
                            onClick={() => toggleModule(tenant.id, mod.key, active)}
                            disabled={isSaving}
                            className={`
                              flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm
                              transition-all duration-150
                              ${active
                                ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                                : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                              }
                              ${isSaving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                          >
                            {active
                              ? <CheckCircle2 size={13} className="shrink-0 text-green-600" />
                              : <XCircle     size={13} className="shrink-0 text-gray-400" />
                            }
                            <span className="text-xs font-medium truncate">{mod.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="card flex h-32 items-center justify-center text-gray-400 text-sm">
              Nenhum tenant encontrado
            </div>
          )}
        </div>
      )}
    </div>
  )
}
