'use client'

// =============================================================================
// /master/security — Política de segurança global (MASTER only)
// =============================================================================

import { useState, useEffect } from 'react'
import { useSession }          from 'next-auth/react'
import { useRouter }           from 'next/navigation'
import {
  ShieldCheck, Loader2, AlertCircle, CheckCircle2, Save,
  Lock, Clock, Users, Key, Globe, Info,
} from 'lucide-react'

interface Policy {
  id:                    string
  minPasswordLength:     number
  requireUppercase:      boolean
  requireNumber:         boolean
  requireSpecialChar:    boolean
  passwordExpiryDays:    number
  sessionMaxAgeSecs:     number
  inactivityTimeoutSecs: number
  maxActiveSessions:     number
  maxLoginAttempts:      number
  lockoutDurationMins:   number
  require2FA:            boolean
  require2FAForMaster:   boolean
  masterIpAllowlist:     string[]
  dataRetentionDays:     number
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

function Toggle({ checked, onChange, label, sublabel }: { checked: boolean; onChange: (v: boolean) => void; label: string; sublabel?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="relative mt-0.5 flex-shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-gray-300'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      </div>
    </label>
  )
}

export default function SecurityPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [policy,  setPolicy]  = useState<Partial<Policy>>({})
  const [ipInput, setIpInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') router.replace('/inicio')
  }, [session, status, router])

  useEffect(() => {
    if (session?.user?.role !== 'MASTER') return
    fetch('/api/master/security')
      .then(r => r.json())
      .then(d => { setPolicy(d.data ?? {}); setIpInput((d.data?.masterIpAllowlist ?? []).join('\n')) })
      .catch(() => setError('Erro ao carregar política.'))
      .finally(() => setLoading(false))
  }, [session])

  function setNum(k: keyof Policy) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setPolicy(p => ({ ...p, [k]: Number(e.target.value) }))
  }

  function setFlag(k: keyof Policy) {
    return (v: boolean) =>
      setPolicy(p => ({ ...p, [k]: v }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    setSaving(true)
    try {
      const ips = ipInput.split('\n').map(s => s.trim()).filter(Boolean)
      const res  = await fetch('/api/master/security', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...policy, masterIpAllowlist: ips }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro.')
      setPolicy(data.data)
      setSuccess('Política de segurança atualizada com sucesso.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800">
          <ShieldCheck size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Segurança Global</h1>
          <p className="text-xs text-gray-400">Políticas de senha, sessão, bloqueio e 2FA para toda a plataforma</p>
        </div>
      </div>

      {error   && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={15} />{error}</div>}
      {success && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={15} />{success}</div>}

      <form onSubmit={handleSave} className="space-y-5">

        {/* Senha */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm"><Lock size={14} className="text-slate-600" />Política de Senha</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Comprimento mínimo</label>
              <input type="number" min={6} max={32} className={inputCls}
                value={policy.minPasswordLength ?? 8}
                onChange={setNum('minPasswordLength')}
              />
            </div>
            <div>
              <label className={labelCls}>Expiração (dias, 0 = nunca)</label>
              <input type="number" min={0} max={365} className={inputCls}
                value={policy.passwordExpiryDays ?? 0}
                onChange={setNum('passwordExpiryDays')}
              />
            </div>
          </div>
          <div className="space-y-3">
            <Toggle
              checked={policy.requireUppercase ?? true}
              onChange={setFlag('requireUppercase')}
              label="Exigir letra maiúscula"
            />
            <Toggle
              checked={policy.requireNumber ?? true}
              onChange={setFlag('requireNumber')}
              label="Exigir número"
            />
            <Toggle
              checked={policy.requireSpecialChar ?? false}
              onChange={setFlag('requireSpecialChar')}
              label="Exigir caractere especial"
            />
          </div>
        </div>

        {/* Sessão */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm"><Clock size={14} className="text-slate-600" />Sessão</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Duração máxima (segundos)</label>
              <input type="number" min={900} max={604800} className={inputCls}
                value={policy.sessionMaxAgeSecs ?? 28800}
                onChange={setNum('sessionMaxAgeSecs')}
              />
              <p className="mt-1 text-xs text-gray-400">{Math.round((policy.sessionMaxAgeSecs ?? 28800) / 3600)}h</p>
            </div>
            <div>
              <label className={labelCls}>Timeout por inatividade (seg, 0 = sem timeout)</label>
              <input type="number" min={0} max={86400} className={inputCls}
                value={policy.inactivityTimeoutSecs ?? 0}
                onChange={setNum('inactivityTimeoutSecs')}
              />
            </div>
            <div>
              <label className={labelCls}>Máximo de sessões simultâneas</label>
              <input type="number" min={1} max={50} className={inputCls}
                value={policy.maxActiveSessions ?? 5}
                onChange={setNum('maxActiveSessions')}
              />
            </div>
          </div>
        </div>

        {/* Bloqueio por tentativas */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm"><Users size={14} className="text-slate-600" />Bloqueio por Tentativas</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Máximo de tentativas de login</label>
              <input type="number" min={3} max={20} className={inputCls}
                value={policy.maxLoginAttempts ?? 5}
                onChange={setNum('maxLoginAttempts')}
              />
            </div>
            <div>
              <label className={labelCls}>Duração do bloqueio (minutos)</label>
              <input type="number" min={1} max={1440} className={inputCls}
                value={policy.lockoutDurationMins ?? 15}
                onChange={setNum('lockoutDurationMins')}
              />
            </div>
          </div>
        </div>

        {/* 2FA */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm"><Key size={14} className="text-slate-600" />Autenticação 2FA</h2>
          <div className="space-y-3">
            <Toggle
              checked={policy.require2FAForMaster ?? true}
              onChange={setFlag('require2FAForMaster')}
              label="2FA obrigatório para MASTER"
              sublabel="Recomendado: sempre habilitado"
            />
            <Toggle
              checked={policy.require2FA ?? false}
              onChange={setFlag('require2FA')}
              label="2FA obrigatório para todos os usuários"
              sublabel="Afeta todos os roles, incluindo ADM, GERENTE e VENDEDOR"
            />
          </div>
        </div>

        {/* IP Allowlist */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm"><Globe size={14} className="text-slate-600" />IP Allowlist para MASTER</h2>
          <div>
            <label className={labelCls}>IPs permitidos (um por linha, vazio = todos os IPs)</label>
            <textarea
              rows={4}
              className={`${inputCls} font-mono text-xs`}
              value={ipInput}
              onChange={e => setIpInput(e.target.value)}
              placeholder={"192.168.1.0/24\n203.0.113.5"}
            />
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
              <Info size={11} />
              Suporte a IPs individuais e ranges CIDR. Deixe vazio para permitir acesso de qualquer IP.
            </p>
          </div>
        </div>

        {/* Retenção de dados */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">Retenção de Dados</h2>
          <div className="max-w-[200px]">
            <label className={labelCls}>Retenção de logs de auditoria (dias)</label>
            <input type="number" min={30} max={3650} className={inputCls}
              value={policy.dataRetentionDays ?? 365}
              onChange={setNum('dataRetentionDays')}
            />
            <p className="mt-1 text-xs text-gray-400">{Math.round((policy.dataRetentionDays ?? 365) / 365)} ano(s)</p>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Salvando...' : 'Salvar política de segurança'}
          </button>
        </div>
      </form>
    </div>
  )
}
