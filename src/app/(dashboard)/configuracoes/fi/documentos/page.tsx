'use client'

// =============================================================================
// Configurações da Loja > F&I > Documentos Obrigatórios (Fase 2b.3).
// Lista de documentos exigidos por perfil de proponente (ocupação) + comuns.
// Consome /api/settings/financing/settings/required_documents (GET/PUT).
// RBAC financing.config; tenant-scoped; MASTER bloqueado.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { FileCheck2, Plus, X, Save, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

const CONFIG_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO']
const PROFILES = [
  { key: 'TODOS', label: 'Todos os perfis', hint: 'Exigidos de qualquer proponente.' },
  { key: 'AUTONOMO', label: 'Autônomo', hint: '' },
  { key: 'CLT', label: 'CLT', hint: '' },
  { key: 'EMPRESARIO', label: 'Empresário', hint: '' },
  { key: 'APOSENTADO_PENSIONISTA', label: 'Aposentado / Pensionista', hint: '' },
] as const
type ProfileKey = (typeof PROFILES)[number]['key']
type Config = Record<ProfileKey, string[]>
const emptyConfig: Config = { TODOS: [], AUTONOMO: [], CLT: [], EMPRESARIO: [], APOSENTADO_PENSIONISTA: [] }

const inputCls = 'flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function FiDocumentsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || CONFIG_ROLES.includes(role)

  const [config, setConfig] = useState<Config>(emptyConfig)
  const [drafts, setDrafts] = useState<Record<ProfileKey, string>>({ TODOS: '', AUTONOMO: '', CLT: '', EMPRESARIO: '', APOSENTADO_PENSIONISTA: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/financing/settings/required_documents', { credentials: 'include' })
      const json = await res.json()
      setConfig({ ...emptyConfig, ...(json?.data ?? {}) })
    } catch { setConfig(emptyConfig) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (allowed) load() }, [allowed, load])

  const add = (p: ProfileKey) => {
    const v = drafts[p].trim()
    if (!v) return
    if (config[p].some((d) => d.toLowerCase() === v.toLowerCase())) { setDrafts((d) => ({ ...d, [p]: '' })); return }
    setConfig((c) => ({ ...c, [p]: [...c[p], v] }))
    setDrafts((d) => ({ ...d, [p]: '' }))
  }
  const remove = (p: ProfileKey, doc: string) => setConfig((c) => ({ ...c, [p]: c[p].filter((d) => d !== doc) }))

  const save = async () => {
    setSaving(true); setToast(null)
    try {
      const res = await fetch('/api/settings/financing/settings/required_documents', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(config) })
      const json = await res.json()
      if (!res.ok) { setToast({ ok: false, msg: json?.error ?? 'Erro ao salvar.' }); return }
      setToast({ ok: true, msg: 'Documentos obrigatórios salvos.' })
    } catch { setToast({ ok: false, msg: 'Erro de rede.' }) } finally { setSaving(false) }
  }

  if (session && !allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Configuração restrita</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">Os documentos obrigatórios são definidos pela loja (administração/gerência/financeiro).</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Documentos Obrigatórios</h1>
          <p className="mt-0.5 text-sm text-gray-500">Documentos exigidos por perfil do proponente na montagem da ficha.</p>
        </div>
        <button onClick={save} disabled={saving || loading} className="btn-primary text-sm disabled:opacity-50"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>

      {toast && (
        <div className={cn('rounded-lg border px-4 py-2.5 text-sm', toast.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}>{toast.msg}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />))}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROFILES.map((p) => (
            <div key={p.key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
              <div className="mb-2"><p className="font-semibold text-gray-900">{p.label}</p>{p.hint && <p className="text-xs text-gray-400">{p.hint}</p>}</div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {config[p.key].length === 0 ? (
                  <span className="text-xs text-gray-400">Nenhum documento.</span>
                ) : config[p.key].map((doc) => (
                  <span key={doc} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800">
                    {doc}
                    <button onClick={() => remove(p.key, doc)} className="text-brand-400 hover:text-brand-700" title="Remover"><X size={13} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input className={inputCls} value={drafts[p.key]} onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(p.key) } }} placeholder="Ex: RG, CPF, comprovante de renda..." />
                <button onClick={() => add(p.key)} className="btn-secondary px-2.5 text-sm" title="Adicionar"><Plus size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <FileCheck2 size={16} className="mt-0.5 shrink-0" />
        <span>Esta lista orienta quais documentos anexar na ficha. A exigência automática (bloquear envio sem os documentos) é ativada nas fases de fichas profissionais.</span>
      </div>
    </div>
  )
}
