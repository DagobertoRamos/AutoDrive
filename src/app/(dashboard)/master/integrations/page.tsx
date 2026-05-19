'use client'

// =============================================================================
// /master/integrations — Credenciais de integrações globais (MASTER only)
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession }                        from 'next-auth/react'
import { useRouter }                         from 'next/navigation'
import {
  Plug, Plus, Trash2, Loader2, AlertCircle, CheckCircle2,
  X, Save, Eye, EyeOff, RefreshCw, TestTube, ToggleRight,
  ToggleLeft, Star, Info,
} from 'lucide-react'
import {
  SERVICES as SERVICE_CATALOG,
  DEFAULT_FIELD_LABELS,
  SENSITIVE_FIELDS as CATALOG_SENSITIVE,
  getServiceDef,
  type FieldKey, type ServiceKey,
} from '@/lib/integrations/catalog'

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

// Labels e cores derivam do catálogo central (src/lib/integrations/catalog.ts)
const SERVICE_LABELS: Record<string, string> = Object.fromEntries(
  SERVICE_CATALOG.map((s) => [s.key, s.label]),
)
const SERVICE_COLOR: Record<string, string> = Object.fromEntries(
  SERVICE_CATALOG.map((s) => [s.key, s.badgeColor]),
)
// Apenas serviços não-legados aparecem no dropdown de criação.
const CREATABLE_SERVICES = SERVICE_CATALOG.filter((s) => !s.legacy)

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
  // Default sugerido: FIPE Parallelum (não-legado).
  const initialService: ServiceKey = (existing?.service as ServiceKey) ?? 'FIPE_PROVIDER'

  // ── State não-sensível ────────────────────────────────────────────────────
  const [service, setService]         = useState<ServiceKey>(initialService)
  const [name, setName]               = useState<string>(existing?.name        ?? '')
  const [description, setDescription] = useState<string>(existing?.description ?? '')
  const [apiUrl, setApiUrl]           = useState<string>(existing?.apiUrl      ?? '')
  const [username, setUsername]       = useState<string>(existing?.username    ?? '')
  const [notes, setNotes]             = useState<string>(existing?.notes       ?? '')
  const [isDefault, setIsDefault]     = useState<boolean>(existing?.isDefault  ?? false)

  // ── State sensível ────────────────────────────────────────────────────────
  // CRÍTICO: NÃO inicializamos com `existing?.apiKey` (que vem mascarado do GET).
  // Sempre começa vazio; valor vazio = "manter atual" no PATCH.
  const [secrets, setSecrets] = useState<Record<FieldKey, string>>({
    apiUrl:        '',  // não-sensível, mas mantido para tipagem; ignorado
    apiKey:        '',
    apiSecret:     '',
    token:         '',
    username:      '',
    webhookSecret: '',
  })
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // ── Definição do serviço ──────────────────────────────────────────────────
  const serviceDef = useMemo(() => getServiceDef(service), [service])

  // Quando troca de serviço (criação), aplica default URL automaticamente.
  // Mas NUNCA toca em campos sensíveis nem em username/notes.
  useEffect(() => {
    if (isEdit) return
    const def = getServiceDef(service)
    if (def?.defaultUrl && !apiUrl) setApiUrl(def.defaultUrl)
    // Reset secrets quando o usuário escolhe outro serviço (evita confusão)
    setSecrets({ apiUrl: '', apiKey: '', apiSecret: '', token: '', username: '', webhookSecret: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, isEdit])

  function setSecret(field: FieldKey, value: string) {
    setSecrets((p) => ({ ...p, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!service || !name.trim()) {
      setError('Serviço e nome são obrigatórios.')
      return
    }
    if (!serviceDef) {
      setError('Serviço inválido.')
      return
    }

    // Monta payload SOMENTE com os campos que o serviço usa.
    const fields = serviceDef.fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      service,
      name:        name.trim(),
      description: description.trim(),
      isDefault,
      notes:       notes.trim(),
    }
    if (fields.includes('apiUrl'))   payload.apiUrl   = apiUrl.trim() || null
    if (fields.includes('username')) payload.username = username.trim() || null

    // Sensíveis: enviar SOMENTE se o usuário digitou algo no input.
    // Em modo edit, vazio = "manter atual"; backend já entende isso.
    for (const f of CATALOG_SENSITIVE) {
      if (!fields.includes(f)) continue
      const v = secrets[f]
      if (v && v.trim()) payload[f] = v.trim()
    }

    setSaving(true)
    try {
      const url    = isEdit ? `/api/master/integrations/${existing!.id}` : '/api/master/integrations'
      const method = isEdit ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
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

  // ── Renderiza um campo sensível (apiKey/apiSecret/token/webhookSecret) ────
  function renderSecret(field: FieldKey) {
    if (!serviceDef?.fields.includes(field)) return null
    const label   = serviceDef.fieldLabels?.[field] ?? DEFAULT_FIELD_LABELS[field]
    const hint    = serviceDef.fieldHints?.[field]
    const required = serviceDef.fieldRequired?.[field]
    const hasSaved = isEdit && !!existing && !!existing[field as keyof Credential]
    return (
      <div key={field}>
        <label className={labelCls}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <input
            type={show[field] ? 'text' : 'password'}
            // ── Truques anti-autofill: name aleatório + autoComplete sintético ──
            name={`__sec_${field}_${existing?.id ?? 'new'}`}
            autoComplete="new-password"
            data-form-type="other"
            spellCheck={false}
            className={`${inputCls} pr-9 font-mono text-xs`}
            value={secrets[field]}
            onChange={(e) => setSecret(field, e.target.value)}
            placeholder={hasSaved ? 'Salvo · deixe vazio para manter o atual' : 'Cole o valor aqui'}
          />
          <button type="button" onClick={() => setShow((p) => ({ ...p, [field]: !p[field] }))}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {show[field] ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        {hint && <p className="mt-1 text-[10px] text-gray-500">{hint}</p>}
        {hasSaved && !secrets[field] && (
          <p className="mt-1 text-[10px] text-amber-700">Valor atual preservado. Digite um novo valor para substituir.</p>
        )}
      </div>
    )
  }

  function renderApiUrl() {
    if (!serviceDef?.fields.includes('apiUrl')) return null
    const hint  = serviceDef.fieldHints?.apiUrl
    const required = serviceDef.fieldRequired?.apiUrl
    return (
      <div>
        <label className={labelCls}>
          {serviceDef.fieldLabels?.apiUrl ?? DEFAULT_FIELD_LABELS.apiUrl}
          {required && <span className="text-red-500"> *</span>}
        </label>
        <input
          className={`${inputCls} font-mono text-xs`}
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder={serviceDef.defaultUrl ?? 'https://...'}
          autoComplete="off"
          spellCheck={false}
        />
        {hint && <p className="mt-1 text-[10px] text-gray-500">{hint}</p>}
      </div>
    )
  }

  function renderUsername() {
    if (!serviceDef?.fields.includes('username')) return null
    return (
      <div>
        <label className={labelCls}>{serviceDef.fieldLabels?.username ?? DEFAULT_FIELD_LABELS.username}</label>
        <input
          // Anti-autofill agressivo do Chrome para usuário/email
          name={`__user_${existing?.id ?? 'new'}`}
          autoComplete="off"
          className={inputCls}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Editar credencial' : 'Nova credencial'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={15} /></button>
        </div>

        {/* O autocomplete agressivo do browser também é atenuado por essa flag */}
        <form
          onSubmit={handleSubmit}
          autoComplete="off"
          className="space-y-4 px-5 py-5"
        >
          {/* Honeypots invisíveis para Chrome não usar este formulário como "login" */}
          <input type="text" name="username" autoComplete="username" className="hidden" tabIndex={-1} aria-hidden="true" defaultValue="" />
          <input type="password" name="password" autoComplete="new-password" className="hidden" tabIndex={-1} aria-hidden="true" defaultValue="" />

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={13} />{error}
            </div>
          )}

          {serviceDef?.description && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <Info size={13} className="mt-0.5 shrink-0" />{serviceDef.description}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Serviço *</label>
              <select
                className={inputCls}
                value={service}
                onChange={(e) => setService(e.target.value as ServiceKey)}
                disabled={isEdit}
              >
                {(isEdit ? SERVICE_CATALOG : CREATABLE_SERVICES).map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Nome amigável *</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={service === 'FIPE_PROVIDER' ? 'FIPE Parallelum' : 'Ex: Principal'}
                autoComplete="off"
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Descrição</label>
              <input
                className={inputCls}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional"
                autoComplete="off"
              />
            </div>
          </div>

          {renderApiUrl()}

          {/* Sensíveis — renderizados apenas se o serviço usa */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['apiKey', 'apiSecret', 'token', 'webhookSecret'] as FieldKey[]).map(renderSecret)}
          </div>

          {renderUsername()}

          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea
              className={inputCls}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Referência de contrato, link de docs, etc."
              autoComplete="off"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-brand-600"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <span className="text-sm text-gray-700 flex items-center gap-1">
              <Star size={12} className="text-amber-500" />
              Credencial padrão para este serviço
            </span>
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
