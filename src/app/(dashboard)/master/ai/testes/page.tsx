'use client'

// =============================================================================
// Master > IA > Testes de IA. MASTER-only.
// Testa a conexão de cada provedor (via adapter). MockAI responde OK sem custo;
// provedores reais retornam "não configurado" até integração oficial.
// Consome /api/master/ai/providers (lista) e /providers/[id]/test.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { FlaskConical, Zap, Lock, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Provider { id: string; name: string; code: string; kind: string; active: boolean; environment: string }
interface TestState { ok: boolean; msg: string }

export default function MasterAiTestsPage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'
  const [items, setItems] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, TestState>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/master/ai/providers', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  const test = async (p: Provider) => {
    setTesting(p.id)
    try { const r = await fetch(`/api/master/ai/providers/${p.id}/test`, { method: 'POST', credentials: 'include' }).then((x) => x.json()); setResults((s) => ({ ...s, [p.id]: { ok: !!r?.success, msg: r?.message ?? r?.error ?? 'Sem resposta.' } })) }
    catch { setResults((s) => ({ ...s, [p.id]: { ok: false, msg: 'Erro de rede.' } })) } finally { setTesting(null) }
  }

  if (session && !isMaster) return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><FlaskConical size={20} className="text-brand-600" />Testes de IA</h1>
        <p className="mt-0.5 text-sm text-gray-500">Teste a conexão dos provedores. O MockAI responde sem custo; provedores reais exigem integração oficial.</p>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />))}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-14 text-center shadow-card"><FlaskConical size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum provedor. Cadastre um em Provedores / Conectores.</p></div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => {
            const r = results[p.id]
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-card">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">{p.name} <span className="ml-1 font-mono text-[11px] text-gray-400">{p.code}</span></p>
                  <p className="text-xs text-gray-500">{p.kind} · {p.environment} · {p.active ? 'ativo' : 'inativo'}</p>
                  {r && <p className={cn('mt-1 inline-flex items-center gap-1 text-xs', r.ok ? 'text-green-700' : 'text-red-600')}>{r.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{r.msg}</p>}
                </div>
                <button onClick={() => test(p)} disabled={testing === p.id} className="btn-secondary text-sm disabled:opacity-50"><Zap size={15} />{testing === p.id ? 'Testando...' : 'Testar conexão'}</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
