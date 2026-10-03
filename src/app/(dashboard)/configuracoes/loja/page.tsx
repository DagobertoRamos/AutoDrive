'use client'

// =============================================================================
// Configuração da Loja — AutoDrive
// O ADM edita os dados cadastrais da PRÓPRIA loja (tenant). Campos de contrato
// (plano, status, limites, teste/cortesia) são exclusivos do MASTER → mostrados
// aqui apenas como leitura. Consome /api/settings/store.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Building2, Save, RefreshCw, CheckCircle, AlertCircle, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RequiredMark } from '@/components/ui/field'
import { isValidCNPJ } from '@/lib/br-docs/cnpj'
import { isValidPhone } from '@/lib/br-docs/phone'
import { isValidCEP } from '@/lib/br-docs/cep'

interface StoreForm {
  nomeFantasia: string; razaoSocial: string; cnpj: string; inscricaoEstadual: string
  isentoInscricaoEstadual: boolean
  logradouro: string; numero: string; complemento: string; bairro: string; city: string; state: string; zipCode: string
  phone: string; email: string
  responsavel: string; responsavelEmail: string; responsavelPhone: string
  slogan: string
}
const EMPTY: StoreForm = {
  nomeFantasia: '', razaoSocial: '', cnpj: '', inscricaoEstadual: '', isentoInscricaoEstadual: false,
  logradouro: '', numero: '', complemento: '', bairro: '', city: '', state: '', zipCode: '',
  phone: '', email: '', responsavel: '', responsavelEmail: '', responsavelPhone: '', slogan: '',
}

const PLAN_LABEL: Record<string, string> = { BASICO: 'Básico', PRO: 'Pro', ENTERPRISE: 'Enterprise', TESTE: 'Teste' }
const STATUS_LABEL: Record<string, string> = { ATIVO: 'Ativo', TESTE: 'Em teste', SUSPENSO: 'Suspenso', BLOQUEADO: 'Bloqueado', CANCELADO: 'Cancelado', CORTESIA: 'Cortesia' }

function inputCls(extra?: string) {
  return cn('w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500', extra)
}
function Field({ label, value, onChange, ph, span, required }: { label: string; value: string; onChange: (v: string) => void; ph?: string; span?: boolean; required?: boolean }) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}{required && <> <RequiredMark /></>}</label>
      <input className={inputCls()} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} />
    </div>
  )
}

export default function ConfiguracaoLojaPage() {
  const [form, setForm] = useState<StoreForm>(EMPTY)
  const [meta, setMeta] = useState<{ publicId?: string; plan?: string; status?: string }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3500) }
  const set = <K extends keyof StoreForm>(k: K, v: StoreForm[K]) => setForm((p) => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/store', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { flash(false, json?.error ?? 'Erro ao carregar.'); return }
      const d = json.data ?? {}
      setMeta({ publicId: d.publicId, plan: d.plan, status: d.status })
      setForm({
        nomeFantasia: d.nomeFantasia ?? '', razaoSocial: d.razaoSocial ?? '', cnpj: d.cnpj ?? '',
        inscricaoEstadual: d.inscricaoEstadual ?? '', isentoInscricaoEstadual: !!d.isentoInscricaoEstadual,
        logradouro: d.logradouro ?? '', numero: d.numero ?? '', complemento: d.complemento ?? '',
        bairro: d.bairro ?? '', city: d.city ?? '', state: d.state ?? '', zipCode: d.zipCode ?? '',
        phone: d.phone ?? '', email: d.email ?? '', responsavel: d.responsavel ?? '',
        responsavelEmail: d.responsavelEmail ?? '', responsavelPhone: d.responsavelPhone ?? '', slogan: d.slogan ?? '',
      })
    } catch { flash(false, 'Erro ao carregar.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const validate = (): string | null => {
    const req: [keyof StoreForm, string][] = [
      ['nomeFantasia', 'Informe o nome fantasia.'],
      ['razaoSocial', 'Informe a razão social.'],
      ['cnpj', 'Informe o CNPJ.'],
      ['phone', 'Informe o telefone.'],
      ['email', 'Informe o e-mail.'],
      ['zipCode', 'Informe o CEP.'],
      ['logradouro', 'Informe o logradouro.'],
      ['numero', 'Informe o número.'],
      ['bairro', 'Informe o bairro.'],
      ['city', 'Informe a cidade.'],
      ['state', 'Informe a UF.'],
    ]
    for (const [k, m] of req) if (!String(form[k] ?? '').trim()) return m
    if (!isValidCNPJ(form.cnpj)) return 'CNPJ inválido.'
    if (!isValidPhone(form.phone)) return 'Telefone inválido.'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'E-mail inválido.'
    if (!isValidCEP(form.zipCode)) return 'CEP inválido.'
    return null
  }

  const save = async () => {
    const invalid = validate()
    if (invalid) { flash(false, invalid); return }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/store', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Erro ao salvar')
      flash(true, 'Dados da loja salvos!')
    } catch (err) { flash(false, err instanceof Error ? err.message : 'Erro ao salvar.') } finally { setSaving(false) }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Configuração da Loja</h1>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />Recarregar
        </button>
      </div>

      {msg && (
        <div className={cn('flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {msg.ok ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{msg.text}
        </div>
      )}

      {/* Contrato (somente leitura — MASTER) */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <Lock size={14} className="text-gray-400" />
        <span className="text-gray-600">Contrato:</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-700">ID {meta.publicId ?? '—'}</span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Plano: {meta.plan ? (PLAN_LABEL[meta.plan] ?? meta.plan) : '—'}</span>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Status: {meta.status ? (STATUS_LABEL[meta.status] ?? meta.status) : '—'}</span>
      </div>

      <div className="card">
        <div className="section-header"><Building2 size={16} className="text-brand-700" /><h2 className="text-sm font-semibold text-gray-800">Dados da loja</h2></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nome fantasia" required value={form.nomeFantasia} onChange={(v) => set('nomeFantasia', v)} />
          <Field label="Razão social" required value={form.razaoSocial} onChange={(v) => set('razaoSocial', v)} />
          <Field label="CNPJ" required value={form.cnpj} onChange={(v) => set('cnpj', v)} ph="00.000.000/0000-00" />
          <Field label="Inscrição estadual" value={form.inscricaoEstadual} onChange={(v) => set('inscricaoEstadual', v)} />
          <Field label="Telefone" required value={form.phone} onChange={(v) => set('phone', v)} />
          <Field label="E-mail" required value={form.email} onChange={(v) => set('email', v)} ph="contato@loja.com" />
          <Field label="Slogan" value={form.slogan} onChange={(v) => set('slogan', v)} span />
        </div>
      </div>

      <div className="card">
        <div className="section-header"><Building2 size={16} className="text-brand-700" /><h2 className="text-sm font-semibold text-gray-800">Endereço</h2></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="CEP" required value={form.zipCode} onChange={(v) => set('zipCode', v)} />
          <Field label="Logradouro" required value={form.logradouro} onChange={(v) => set('logradouro', v)} />
          <Field label="Número" required value={form.numero} onChange={(v) => set('numero', v)} />
          <Field label="Complemento" value={form.complemento} onChange={(v) => set('complemento', v)} />
          <Field label="Bairro" required value={form.bairro} onChange={(v) => set('bairro', v)} />
          <Field label="Cidade" required value={form.city} onChange={(v) => set('city', v)} />
          <Field label="UF" required value={form.state} onChange={(v) => set('state', v)} />
        </div>
      </div>

      <div className="card">
        <div className="section-header"><Building2 size={16} className="text-brand-700" /><h2 className="text-sm font-semibold text-gray-800">Responsável</h2></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nome do responsável" value={form.responsavel} onChange={(v) => set('responsavel', v)} />
          <Field label="E-mail do responsável" value={form.responsavelEmail} onChange={(v) => set('responsavelEmail', v)} />
          <Field label="Telefone do responsável" value={form.responsavelPhone} onChange={(v) => set('responsavelPhone', v)} />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving || loading} className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
          <Save size={15} />{saving ? 'Salvando...' : 'Salvar dados da loja'}
        </button>
      </div>
    </div>
  )
}
