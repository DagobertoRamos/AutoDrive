'use client'

// =============================================================================
// Configurações da Loja > F&I > Prioridades de Envio (Fase 2b.2).
// Define a ORDEM em que as fichas são enviadas aos bancos da loja.
// Consome /api/settings/financing/priorities (GET/PUT). RBAC financing.config.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { ListOrdered, ArrowUp, ArrowDown, Save, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

const CONFIG_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO']

interface Row { bankId: string; bankName: string; code: string | null; priority: number | null; active: boolean }

export default function FiPrioritiesPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || CONFIG_ROLES.includes(role)
  const isMaster = role === 'MASTER'

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/financing/priorities', { credentials: 'include' })
      const json = await res.json()
      setRows(json?.data ?? [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (allowed && !isMaster) load() }, [allowed, isMaster, load])

  const move = (i: number, dir: -1 | 1) => {
    setRows((rs) => {
      const j = i + dir
      if (j < 0 || j >= rs.length) return rs
      const copy = [...rs]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }
  const toggle = (bankId: string) => setRows((rs) => rs.map((r) => (r.bankId === bankId ? { ...r, active: !r.active } : r)))

  const save = async () => {
    setSaving(true); setToast(null)
    try {
      const items = rows.map((r, idx) => ({ bankId: r.bankId, priority: idx + 1, active: r.active }))
      const res = await fetch('/api/settings/financing/priorities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ items }) })
      const json = await res.json()
      if (!res.ok) { setToast({ ok: false, msg: json?.error ?? 'Erro ao salvar.' }); return }
      setToast({ ok: true, msg: 'Prioridades salvas.' }); await load()
    } catch { setToast({ ok: false, msg: 'Erro de rede.' }) } finally { setSaving(false) }
  }

  if (session && (!allowed || isMaster)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Configuração restrita</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">As prioridades de envio são definidas pela loja (administração/gerência/financeiro).</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Prioridades de Envio</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : 'Ordene os bancos: as fichas seguem de cima para baixo.'}</p>
        </div>
        <button onClick={save} disabled={saving || loading || rows.length === 0} className="btn-primary text-sm disabled:opacity-50"><Save size={15} />{saving ? 'Salvando...' : 'Salvar ordem'}</button>
      </div>

      {toast && (
        <div className={cn('rounded-lg border px-4 py-2.5 text-sm', toast.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}>{toast.msg}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        {loading ? (
          <div className="divide-y divide-gray-100">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="px-4 py-3"><div className="h-5 animate-pulse rounded bg-gray-200" /></div>))}</div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center"><ListOrdered size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum banco ativo. Cadastre bancos em Configurações &gt; F&amp;I &gt; Bancos da Loja.</p></div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <li key={r.bankId} className={cn('flex items-center gap-3 px-4 py-3', !r.active && 'opacity-50')}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{r.bankName}</p>
                  {r.code && <p className="font-mono text-[11px] text-gray-400">{r.code}</p>}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-500"><input type="checkbox" checked={r.active} onChange={() => toggle(r.bankId)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativo</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30" title="Subir"><ArrowUp size={15} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30" title="Descer"><ArrowDown size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
