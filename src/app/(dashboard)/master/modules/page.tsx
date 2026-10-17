'use client'

// =============================================================================
// /master/modules — Módulos e ferramentas por loja (MASTER).
// Escolhe a loja e liga/desliga módulo inteiro, parte ou ferramenta, com
// "Ligar tudo / Desligar tudo". Cascata (modules-catalog): desligar o módulo
// desliga tudo dentro; ligar uma ferramenta liga o módulo. Desligar esconde do
// menu E bloqueia a API (requireModule). Sem registro = ligado.
// =============================================================================

import { HelpHint } from '@/components/ui/help-hint'
import { opsHint } from '@/lib/glossary-ops'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Package, RefreshCw, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALL_FEATURE_KEYS, applyModuleChanges, effectiveDisabled } from '@/lib/modules-catalog'
import { ModuleToggleBoard } from '@/components/modules/ModuleToggleBoard'

interface TenantModuleEntry { module: string; active: boolean }
interface TenantWithModules { id: string; name: string; plan: string; status: string; modules: TenantModuleEntry[] }

export default function MasterModulesPage() {
  const { data: session } = useSession()
  const isMaster = (session?.user as { role?: string })?.role === 'MASTER'

  const [tenants, setTenants] = useState<TenantWithModules[]>([])
  const [sel, setSel] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

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
  const explicitOff = useMemo(() => (tenant?.modules ?? []).filter((m) => !m.active).map((m) => m.module), [tenant])
  const enabled = useMemo(() => {
    const off = new Set(effectiveDisabled(explicitOff))
    return new Set(ALL_FEATURE_KEYS.filter((k) => !off.has(k)))
  }, [explicitOff])

  const change = async (changes: Record<string, boolean>) => {
    if (!tenant) return
    setBusy(true); setMsg(null)
    // otimista: aplica a mesma cascata do servidor
    const nextOff = applyModuleChanges(explicitOff, changes)
    setTenants((ts) => ts.map((t) => t.id !== tenant.id ? t : { ...t, modules: ALL_FEATURE_KEYS.map((k) => ({ module: k, active: !nextOff.has(k) })) }))
    try {
      const res = await fetch('/api/master/modules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ tenantId: tenant.id, changes }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: j?.error ?? 'Não foi possível salvar.' }); await load(); return }
      setTenants((ts) => ts.map((t) => t.id !== tenant.id ? t : { ...t, modules: j.data.modules }))
      const on = j.data.turnedOn?.length ?? 0, off = j.data.turnedOff?.length ?? 0
      setMsg({ ok: true, text: on || off ? `Salvo: ${on} ligada(s), ${off} desligada(s).` : 'Nada a mudar.' })
    } catch { await load() } finally { setBusy(false) }
  }

  if (session && !isMaster) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Package size={20} className="text-brand-600" />Módulos por Loja<HelpHint className="ml-1" {...opsHint('MODULO')} /></h1>
          <p className="mt-0.5 text-xs text-gray-500">Desligar o módulo desliga tudo dentro dele; ligar uma ferramenta liga o módulo.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={sel} onChange={(e) => { setSel(e.target.value); setMsg(null) }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      </div>

      {msg && <div className={cn('rounded-lg border px-4 py-2 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>{msg.text}</div>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : !tenant ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Nenhuma loja encontrada.</div>
      ) : (
        <ModuleToggleBoard enabled={enabled} onChange={change} disabled={busy} showKeys />
      )}
    </div>
  )
}
