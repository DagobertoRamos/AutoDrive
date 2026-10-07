'use client'

// =============================================================================
// Configurações › F&I › Permissões — quem pode cada ação do F&I nesta loja.
// Mostra a regra EFETIVA (com os padrões seguros) e salva a matriz completa.
// O servidor confere em cada ação; esta tela só configura.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Lock, Save } from 'lucide-react'
import { HelpHint } from '@/components/ui/help-hint'
import { effectiveMatrix, FI_CAPABILITIES, type FiCapability } from '@/lib/finance/fi-permissions-core'
import { FI_ROLES } from '@/lib/finance/settings'
import { Alert, api, btnPrimary, PageHeader } from '@/components/fi/ui'

const CONFIG_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO']
const ROLE_LABEL: Record<string, string> = {
  ADM: 'Administrador', GERENTE_GERAL: 'Gerente geral', GERENTE_ADMINISTRATIVO: 'Gerente administrativo',
  GERENTE: 'Gerente', VENDEDOR_LIDER: 'Vendedor líder', VENDEDOR: 'Vendedor', FINANCEIRO: 'Financeiro',
}
type Matrix = Record<FiCapability, string[]>

export default function FiPermissionsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || CONFIG_ROLES.includes(role)
  const [matrix, setMatrix] = useState<Matrix | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const r = await api<Record<string, unknown>>('/api/settings/financing/settings/permissions')
    setMatrix(effectiveMatrix(r.ok ? r.data : {}))
    if (!r.ok) setMsg({ ok: false, text: r.error ?? 'Não foi possível carregar.' })
  }, [])
  useEffect(() => { if (!allowed) return; const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [allowed, load])

  const toggle = (cap: FiCapability, r: string) => setMatrix((m) => m && ({ ...m, [cap]: m[cap].includes(r) ? m[cap].filter((x) => x !== r) : [...m[cap], r] }))
  const save = async () => {
    if (!matrix) return
    setSaving(true); setMsg(null)
    const r = await api('/api/settings/financing/settings/permissions', { method: 'PUT', body: { _v: 2, ...matrix } })
    setSaving(false)
    setMsg(r.ok ? { ok: true, text: 'Permissões salvas.' } : { ok: false, text: r.error ?? 'Erro ao salvar.' })
  }

  if (session && !allowed) {
    return <div className="flex flex-col items-center gap-3 py-20 text-center"><Lock size={28} className="text-gray-300" /><p className="text-sm text-gray-500">Configuração restrita.</p></div>
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Permissões do F&I" actions={<button className={btnPrimary} onClick={save} disabled={saving || !matrix}><Save size={15} />{saving ? 'Salvando…' : 'Salvar'}</button>} />
      {msg && <Alert tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Alert>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr><th className="px-4 py-2.5 text-left font-medium">Ação</th>{FI_ROLES.map((r) => <th key={r} className="px-3 py-2.5 text-center font-medium">{ROLE_LABEL[r]}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {FI_CAPABILITIES.map((c) => (
              <tr key={c.key}>
                <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 font-medium text-gray-900">{c.label}<HelpHint text={c.hint} size={11} /></span></td>
                {FI_ROLES.map((r) => (
                  <td key={r} className="px-3 py-2.5 text-center">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300" aria-label={`${c.label} — ${ROLE_LABEL[r]}`} disabled={!matrix} checked={!!matrix?.[c.key].includes(r)} onChange={() => toggle(c.key, r)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
