'use client'

// =============================================================================
// /master/integrations — Credenciais de integrações globais (MASTER only)
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession }                        from 'next-auth/react'
import { useRouter }                         from 'next/navigation'
import {
  Plug, Plus, Trash2, Loader2, AlertCircle, CheckCircle2,
  X, Save, Eye, EyeOff, RefreshCw, TestTube, ToggleRight,
  ToggleLeft, Star,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Credential {
  id:            string
  service:       string
  name:          string
  description:   string | null
  apiUrl:        string | null
  apiKey:        string | null
  apiSecret:     string | null
  token:         string | null
  username:      string | null
  webhookSecret: string | null
  active:        boolean
  isDefault:     boolean
  lastTestedAt:  string | null
  lastTestOk:    boolean
  lastTestMsg:   string | null
  notes:         string | null
  createdAt:     string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MASKED = '••••••••'

const SERVICE_LABELS: Record<string, string> = {
  FIPE:            'Consulta FIPE',
  PLATE_LOOKUP:    'Consulta por Placa',
  RENAVAM:         'RENAVAM / SERPRO',
  CNPJ_LOOKUP:     'Consulta CNPJ',
  CEP:             'Consulta CEP',
  STORAGE:         'Storage (S3 / R2 / GCS)',
  PAYMENT_GATEWAY: 'Gateway de Pagamento',
  DIGITAL_SIGN:    'Assinatura Digital',
  MAPS:            'Mapas / Geolocalização',
  OTHER:           'Outro',
}

const SERVICE_COLOR: Record<string, string> = {
  FIPE:            'bg-blue-50 text-blue-700 border-blue-200',
  PLATE_LOOKUP:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  RENAVAM:         'bg-purple-50 text-purple-700 border-purple-200',
  CNPJ_LOOKUP:     'bg-cyan-50 text-cyan-700 border-cyan-200',
  CEP:             'bg-teal-50 text-teal-700 border-teal-200',
  STORAGE:         'bg-orange-50 text-orange-700 border-orange-200',
  PAYMENT_GATEWAY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DIGITAL_SIGN:    'bg-violet-50 text-violet-700 border-violet-200',
  MAPS:            'bg-red-50 text-red-700 border-red-200',
  OTHER:           'bg-gray-100 text-gray-600 border-gray-200',
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

// ── Modal ─────────────────────────────────────────────────────────────────────

function CredentialModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Credential | null
  onClose:  () => void
  onSaved:  () => void
}) {
  const isEdit = !!existing
  const [form, setForm] = useState({
    service:       existing?.service       ?? 'FIPE',
    name:          existing?.name          ?? '',
    description:   existing?.description   ?? '',
    apiUrl:        existing?.apiUrl        ?? '',
    apiKey:        existing?.apiKey        ?? '',
    apiSecret:     existing?.apiSecret     ?? '',
    token:         existing?.token         ?? '',
    username:      existing?.username      ?? '',
    webhookSecret: existing?.webhookSecret ?? '',
    isDefault:     existing?.isDefault     ?? false,
    notes:         existing?.notes         ?? '',
  })
  const [show, setShow] = useState({ apiKey: false, apiSecret: false, token: false, webhookSecret: false })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.service || !form.name.trim()) { setError('Serviço e nome são obrigatórios.'); return }
    setSaving(true)
    try {
      const url    = isEdit ? `/api/master/integrations/${existing!.id}` : '/api/master/integrations'
      const method = isEdit ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro.')
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  const SecretField = ({ field, label }: { field: 'apiKey' | 'apiSecret' | 'token' | 'webhookSecret'; label: string }) => (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <input
          type={show[field] ? 'text' : 'password'}
          className={`${inputCls} pr-9 font-mono text-xs`}
          value={form[field]}
          onChange={set(field)}
          placeholder={isEdit ? MASKED : 'Cole o valor aqui'}
        />
        <button type="button" onClick={() => setShow(p => ({ ...p, [field]: !p[field] }))}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show[field] ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Editar credencial' : 'Nova credencial'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={15} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={13} />{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Serviço *</label>
              <select className={inputCls} value={form.service} onChange={set('service')} disabled={isEdit}>
                {Object.entries(SERVICE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Nome amigável *</label>
              <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Ex: FIPE Principal" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Descrição</label>
              <input className={inputCls} value={form.description} onChange={set('description')} placeholder="Opcional" />
            </div>
          </div>

          <div>
            <label className={labelCls}>URL base da API</label>
            <input className={`${inputCls} font-mono text-xs`} value={form.apiUrl} onChange={set('apiUrl')} placeholder="https://parallelum.com.br/fipe/api/v1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SecretField field="apiKey"        label="API Key" />
            <SecretField field="apiSecret"     label="API Secret" />
            <SecretField field="token"         label="Token / Bearer" />
            <SecretField field="webhookSecret" label="Webhook Secret" />
          </div>

          <div>
            <label className={labelCls}>Usuário (se autenticação básica)</label>
            <input className={inputCls} value={form.username} onChange={set('username')} />
          </div>

          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea className={inputCls} rows={2} value={form.notes} onChange={set('notes')} placeholder="Referência de contrato, link de docs, etc." />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
              checked={form.isDefault}
              onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))}
            />
            <span className="text-sm text-gray-700 flex items-center gap-1"><Star size={12} className="text-amber-500" />Credencial padrão para este serviço</span>
          </label>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {isEdit ? 'Salvar' : 'Criar credencial'}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [creds,     setCreds]     = useState<Credential[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editCred,  setEditCred]  = useState<Credential | null>(null)
  const [testing,   setTesting]   = useState<string | null>(null)
  const [filterSvc, setFilterSvc] = useState('')

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') router.replace('/inicio')
  }, [session, status, router])

  const load = useCallback(async () => {
    if (session?.user?.role !== 'MASTER') return
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/master/integrations')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCreds(data.data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { load() }, [load])

  async function toggleActive(cred: Credential) {
    await fetch(`/api/master/integrations/${cred.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ active: !cred.active }),
    })
    load()
  }

  async function handleDelete(cred: Credential) {
    if (!confirm(`Excluir "${cred.name}"?`)) return
    await fetch(`/api/master/integrations/${cred.id}`, { method: 'DELETE' })
    load()
  }

  async function handleTest(cred: Credential) {
    setTesting(cred.id)
    try {
      const res  = await fetch(`/api/master/integrations/${cred.id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'TEST' }),
      })
      const data = await res.json()
      setSuccess(data.message ?? 'Teste concluído.')
      setTimeout(() => setSuccess(''), 4000)
      load()
    } finally {
      setTesting(null)
    }
  }

  function handleSaved() {
    setShowModal(false)
    setEditCred(null)
    setSuccess('Credencial salva com sucesso.')
    setTimeout(() => setSuccess(''), 3000)
    load()
  }

  const filtered = filterSvc ? creds.filter(c => c.service === filterSvc) : creds

  // Agrupar por serviço
  const groups = filtered.reduce<Record<string, Credential[]>>((acc, c) => {
    if (!acc[c.service]) acc[c.service] = []
    acc[c.service].push(c)
    return acc
  }, {})

  if (status === 'loading' || loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>
  }

  return (
    <div className="max-w-4xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-600">
            <Plug size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Integrações Globais</h1>
            <p className="text-xs text-gray-400">{creds.length} credenciais cadastradas</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus size={15} />Nova credencial
        </button>
      </div>

      {error   && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={15} />{error}</div>}
      {success && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={15} />{success}</div>}

      {/* Filtro */}
      <div className="flex items-center gap-3">
        <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          value={filterSvc}
          onChange={e => setFilterSvc(e.target.value)}
        >
          <option value="">Todos os serviços</option>
          {Object.entries(SERVICE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={load} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Lista agrupada */}
      {Object.keys(groups).length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
          <Plug size={24} />
          <p className="text-sm">Nenhuma credencial cadastrada</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([svc, list]) => (
            <div key={svc}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-semibold ${SERVICE_COLOR[svc] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                  {SERVICE_LABELS[svc] ?? svc}
                </span>
              </div>
              <div className="space-y-2">
                {list.map(cred => (
                  <div key={cred.id} className={`rounded-xl border bg-white p-4 ${!cred.active ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900 text-sm">{cred.name}</p>
                          {cred.isDefault && (
                            <span className="flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              <Star size={9} />Padrão
                            </span>
                          )}
                          {!cred.active && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">Inativa</span>
                          )}
                        </div>
                        {cred.description && <p className="text-xs text-gray-400 mt-0.5">{cred.description}</p>}
                        {cred.apiUrl && <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{cred.apiUrl}</p>}
                        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-400">
                          {cred.lastTestedAt && (
                            <span className={`flex items-center gap-1 ${cred.lastTestOk ? 'text-emerald-600' : 'text-red-500'}`}>
                              {cred.lastTestOk ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                              Testado {new Date(cred.lastTestedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleTest(cred)} disabled={testing === cred.id} title="Testar conexão"
                          className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
                        >
                          {testing === cred.id ? <Loader2 size={13} className="animate-spin" /> : <TestTube size={13} />}
                        </button>
                        <button onClick={() => setEditCred(cred)} title="Editar"
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Save size={13} />
                        </button>
                        <button onClick={() => toggleActive(cred)} title={cred.active ? 'Desativar' : 'Ativar'}>
                          {cred.active
                            ? <ToggleRight size={20} className="text-brand-600" />
                            : <ToggleLeft  size={20} className="text-gray-300" />
                          }
                        </button>
                        <button onClick={() => handleDelete(cred)} title="Excluir"
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(showModal || editCred) && (
        <CredentialModal
          existing={editCred}
          onClose={() => { setShowModal(false); setEditCred(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
