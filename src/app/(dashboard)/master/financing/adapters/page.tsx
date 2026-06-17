'use client'

// =============================================================================
// Master > F&I > Adaptadores de API (Fase Master). MASTER-only. Read-only.
// Diagnóstico da camada de adapters: estado por provedor (operante/preparado/
// não configurado), capacidades do adapter e flags do provedor.
// Consome /api/master/financing/adapters.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plug, RefreshCw, Lock, CheckCircle2, Clock3, MinusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type State = 'OPERANTE' | 'PREPARADO' | 'NAO_CONFIGURADO'
interface Caps { simulate: boolean; submit: boolean; status: boolean; webhook: boolean }
interface Row { id: string; name: string; kind: string; active: boolean; hasUrl: boolean; state: State; adapterCapabilities: Caps; providerFlags: Caps }

const KIND_LABEL: Record<string, string> = { CREDERE: 'Credere', BANCO_DIRETO: 'Banco direto', INTEGRADOR: 'Integrador', MANUAL: 'Manual', OUTRO: 'Outro' }
const STATE: Record<State, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  OPERANTE: { label: 'Operante', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  PREPARADO: { label: 'Preparado', cls: 'bg-amber-100 text-amber-700', icon: Clock3 },
  NAO_CONFIGURADO: { label: 'Não configurado', cls: 'bg-gray-100 text-gray-500', icon: MinusCircle },
}
const CAP_KEYS: (keyof Caps)[] = ['simulate', 'submit', 'status', 'webhook']
const CAP_LABEL: Record<keyof Caps, string> = { simulate: 'Simulação', submit: 'Envio', status: 'Status', webhook: 'Webhook' }

export default function MasterAdaptersPage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'

  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/master/financing/adapters', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  if (session && !isMaster) {
    return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Plug size={20} className="text-brand-600" />Adaptadores de API</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : 'Estado da camada de adapters por provedor.'}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
        Os adapters reais (chamadas à API do banco) só operam com documentação e credenciais oficiais homologadas — sem isso, ficam “preparados”. O <strong>Manual</strong> é sempre operante (registro supervisionado). Nenhuma automação oculta de tela de banco.
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />))}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-14 text-center shadow-card"><Plug size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum provedor cadastrado. Cadastre em Provedores F&amp;I.</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => {
            const st = STATE[r.state]
            return (
              <div key={r.id} className={cn('rounded-xl border border-gray-200 bg-white p-4 shadow-card', !r.active && 'opacity-60')}>
                <div className="mb-2 flex items-center justify-between">
                  <div><p className="font-semibold text-gray-900">{r.name}</p><p className="text-xs text-gray-500">{KIND_LABEL[r.kind] ?? r.kind}</p></div>
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', st.cls)}><st.icon size={12} />{st.label}</span>
                </div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Adapter</p>
                <div className="mb-2 flex flex-wrap gap-1">
                  {CAP_KEYS.map((k) => (<span key={k} className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', r.adapterCapabilities[k] ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-400 line-through')}>{CAP_LABEL[k]}</span>))}
                </div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Provedor habilita</p>
                <div className="flex flex-wrap gap-1">
                  {CAP_KEYS.filter((k) => r.providerFlags[k]).map((k) => (<span key={k} className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">{CAP_LABEL[k]}</span>))}
                  {!CAP_KEYS.some((k) => r.providerFlags[k]) && <span className="text-xs text-gray-400">—</span>}
                </div>
                {!r.hasUrl && r.kind !== 'MANUAL' && r.kind !== 'OUTRO' && <p className="mt-2 text-[11px] text-amber-600">Sem base URL configurada.</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
