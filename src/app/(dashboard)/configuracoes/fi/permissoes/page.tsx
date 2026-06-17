'use client'

// =============================================================================
// Configurações da Loja > F&I > Permissões F&I (Fase 2b.3).
// Define quais papéis podem: enviar ficha, aprovar, alterar retorno.
// Consome /api/settings/financing/settings/permissions (GET/PUT).
// RBAC financing.config; tenant-scoped; MASTER bloqueado.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { ShieldCheck, Save, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

const CONFIG_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO']
const ROLES = [
  { key: 'ADM', label: 'Administrador' },
  { key: 'GERENTE_GERAL', label: 'Gerente Geral' },
  { key: 'GERENTE_ADMINISTRATIVO', label: 'Gerente Administrativo' },
  { key: 'GERENTE', label: 'Gerente' },
  { key: 'VENDEDOR_LIDER', label: 'Vendedor Líder' },
  { key: 'VENDEDOR', label: 'Vendedor' },
  { key: 'FINANCEIRO', label: 'Financeiro' },
] as const
type RoleKey = (typeof ROLES)[number]['key']
const CAPS = [
  { key: 'enviarFicha', label: 'Enviar ficha', hint: 'Submeter a ficha aos bancos.' },
  { key: 'aprovar', label: 'Aprovar / Recusar', hint: 'Marcar a proposta como aprovada ou recusada.' },
  { key: 'alterarRetorno', label: 'Alterar retorno', hint: 'Editar % / valor de retorno do banco.' },
] as const
type CapKey = (typeof CAPS)[number]['key']
type Config = Record<CapKey, RoleKey[]>
const emptyConfig: Config = { enviarFicha: [], aprovar: [], alterarRetorno: [] }

export default function FiPermissionsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || CONFIG_ROLES.includes(role)
  const isMaster = role === 'MASTER'

  const [config, setConfig] = useState<Config>(emptyConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/financing/settings/permissions', { credentials: 'include' })
      const json = await res.json()
      setConfig({ ...emptyConfig, ...(json?.data ?? {}) })
    } catch { setConfig(emptyConfig) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (allowed && !isMaster) load() }, [allowed, isMaster, load])

  const toggle = (cap: CapKey, r: RoleKey) => setConfig((c) => ({ ...c, [cap]: c[cap].includes(r) ? c[cap].filter((x) => x !== r) : [...c[cap], r] }))

  const save = async () => {
    setSaving(true); setToast(null)
    try {
      const res = await fetch('/api/settings/financing/settings/permissions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(config) })
      const json = await res.json()
      if (!res.ok) { setToast({ ok: false, msg: json?.error ?? 'Erro ao salvar.' }); return }
      setToast({ ok: true, msg: 'Permissões salvas.' })
    } catch { setToast({ ok: false, msg: 'Erro de rede.' }) } finally { setSaving(false) }
  }

  if (session && (!allowed || isMaster)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Configuração restrita</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">As permissões de F&amp;I são definidas pela loja (administração/gerência/financeiro).</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Permissões F&amp;I</h1>
          <p className="mt-0.5 text-sm text-gray-500">Quem pode enviar ficha, aprovar e alterar retorno na sua loja.</p>
        </div>
        <button onClick={save} disabled={saving || loading} className="btn-primary text-sm disabled:opacity-50"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>

      {toast && (
        <div className={cn('rounded-lg border px-4 py-2.5 text-sm', toast.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}>{toast.msg}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        {loading ? (
          <div className="p-4"><div className="h-40 animate-pulse rounded bg-gray-100" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Papel</th>
                  {CAPS.map((c) => (<th key={c.key} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500" title={c.hint}>{c.label}</th>))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ROLES.map((r) => (
                  <tr key={r.key} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{r.label}</td>
                    {CAPS.map((c) => (
                      <td key={c.key} className="px-4 py-3 text-center">
                        <input type="checkbox" checked={config[c.key].includes(r.key)} onChange={() => toggle(c.key, r.key)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" />
        <span>Aplicada no fluxo: papéis fora da lista são bloqueados ao enviar ficha, aprovar/recusar ou alterar retorno (além do RBAC base). <strong>Deixar uma capacidade sem nenhum papel = sem restrição extra</strong> (todos com permissão base podem). Tudo auditado.</span>
      </div>
    </div>
  )
}
