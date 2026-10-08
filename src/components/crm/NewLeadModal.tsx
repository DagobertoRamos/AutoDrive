'use client'

// =============================================================================
// CRM — Janela de cadastro de lead (modal central).
//   Contato (nome, telefone, e-mail opcional) · canal de entrada · tipo de
//   negociação · veículo de interesse (estoque ou só o modelo) · veículo na
//   troca (com atalho para iniciar a avaliação) · observações do atendimento.
//   Campos obrigatórios seguem a configuração da loja (e-mail nunca é).
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Car, ClipboardCheck, Loader2, Plus, Search, X } from 'lucide-react'
import { RequiredMark } from '@/components/ui/field'
import { isValidPhone, maskPhoneInput } from '@/lib/br-docs/phone'
import type { CrmSettings } from '@/lib/crm/settings-core'
import { cn } from '@/lib/utils'

interface StockVehicle { id: string; brand: string | null; model: string | null; version: string | null; plate: string | null; modelYear: number | null; stockStatus?: string | null }
interface Seller { id: string; name: string | null }

// Agrupamento do canal de entrada (os mais usados em loja de veículos primeiro).
const DIRECT = ['LIGACAO', 'WHATSAPP', 'CLIENTE_NA_LOJA', 'CARTEIRA', 'CLIENTE_LOJA', 'INDICACAO', 'FEIRAO', 'PLACA_FACHADA', 'POS_VENDA']
const ONLINE = ['SITE', 'WEBSITE', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'KWAI', 'GOOGLE_ADS', 'LINKEDIN', 'EMAIL']
const PORTALS = ['WEBMOTORS', 'OLX', 'ICARROS', 'MERCADO_LIVRE', 'MOBIAUTO', 'PORTAL']
// Códigos gravados só por integrações/fluxos automáticos — fora do cadastro manual.
const AUTOMATIC = new Set(['CRM_MANUAL', 'AUTOCONF', 'FILA_ATENDIMENTO', 'RD_STATION', 'OUTROS', 'SDR'])
const HIDDEN_STOCK = new Set(['VENDIDO', 'CANCELADO', 'DEVOLVIDO', 'BLOQUEADO'])

const INPUT = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/20 dark:bg-slate-800 dark:text-white'
const LABEL = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400'

const vehicleLabel = (v: StockVehicle) => [v.brand, v.model, v.version, v.modelYear].filter(Boolean).join(' ')

export function NewLeadModal({ settings, sellers, canAssign, onClose, onCreated }: {
  settings: CrmSettings
  sellers: Seller[]
  canAssign: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const router = useRouter()
  const req = settings.requiredFields.onCreate
  const activeTypes = settings.leadTypes.filter((t) => t.active)
  const typeRequired = req.includes('leadType') && activeTypes.length > 0
  const vehicleRequired = req.includes('vehicleId')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('')
  const [leadType, setLeadType] = useState('')
  const [temperature, setTemperature] = useState('')
  const [assignedTo, setAssignedTo] = useState('')

  // Veículo de interesse
  const [stockMode, setStockMode] = useState(true)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<StockVehicle[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<StockVehicle | null>(null)
  const [ivBrand, setIvBrand] = useState('')
  const [ivModel, setIvModel] = useState('')
  const [ivYear, setIvYear] = useState('')

  // Troca
  const [hasTrade, setHasTrade] = useState(false)
  const [tPlate, setTPlate] = useState('')
  const [tBrand, setTBrand] = useState('')
  const [tModel, setTModel] = useState('')
  const [tYear, setTYear] = useState('')
  const [tKm, setTKm] = useState('')

  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState<null | 'save' | 'eval'>(null)
  const [touched, setTouched] = useState(false)

  const sourceGroups = useMemo(() => {
    const avail = settings.sources.filter((s) => s.active && !AUTOMATIC.has(s.code))
    const pick = (codes: string[]) => codes.map((c) => avail.find((s) => s.code === c)).filter((s): s is NonNullable<typeof s> => !!s)
    const used = new Set([...DIRECT, ...ONLINE, ...PORTALS])
    return [
      { label: 'Atendimento direto', items: pick(DIRECT) },
      { label: 'Internet e redes', items: pick(ONLINE) },
      { label: 'Portais', items: pick(PORTALS) },
      { label: 'Outros', items: avail.filter((s) => !used.has(s.code)) },
    ].filter((g) => g.items.length)
  }, [settings.sources])

  // Fecha com Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  // Busca no estoque (debounce).
  const seq = useRef(0)
  useEffect(() => {
    if (!stockMode || picked || q.trim().length < 2) return
    const my = ++seq.current
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const qs = new URLSearchParams({ limit: '8', includeInactive: 'true', search: q.trim() })
        const j = await fetch(`/api/vehicles?${qs}`, { credentials: 'include' }).then((r) => r.json()).catch(() => null)
        if (my !== seq.current) return
        const list: StockVehicle[] = Array.isArray(j?.data) ? j.data : []
        setResults(list.filter((v) => !v.stockStatus || !HIDDEN_STOCK.has(v.stockStatus)))
      } finally { if (my === seq.current) setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, stockMode, picked])

  const shown = stockMode && !picked && q.trim().length >= 2 ? results : []
  const hasInterest = stockMode ? !!picked : !!ivModel.trim()
  const errors = {
    name: !name.trim(),
    phone: !isValidPhone(phone),
    email: !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    source: !source,
    leadType: typeRequired && !leadType,
    vehicle: vehicleRequired && !hasInterest,
    trade: hasTrade && !tModel.trim(),
  }
  const invalid = Object.values(errors).some(Boolean)
  const bad = (k: keyof typeof errors) => touched && errors[k] && 'border-red-400 dark:border-red-500'

  const submit = async (mode: 'save' | 'eval') => {
    setTouched(true)
    if (invalid) { setErr('Preencha os campos obrigatórios destacados.'); return }
    if (mode === 'eval' && !tPlate.trim()) { setErr('Informe a placa do veículo da troca para avaliar.'); return }
    setSaving(mode); setErr(null)
    try {
      const body = {
        name: name.trim(), phone, email: email.trim() || undefined, source,
        leadType: leadType || undefined,
        assignedToUserId: assignedTo || undefined,
        notes: notes.trim() || undefined,
        vehicleId: stockMode && picked ? picked.id : undefined,
        interestVehicle: !stockMode && ivModel.trim() ? { brand: ivBrand, model: ivModel, year: ivYear } : undefined,
        tradeIn: hasTrade ? { plate: tPlate, brand: tBrand, model: tModel, year: tYear, km: tKm } : undefined,
      }
      const res = await fetch('/api/crm/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null) as { error?: string; data?: { id: string } } | null
      if (!res.ok || !j?.data?.id) { setErr(j?.error ?? 'Não foi possível criar o lead.'); return }
      const leadId = j.data.id

      if (temperature) {
        await fetch(`/api/crm/leads/${leadId}/temperature`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ temperature }),
        }).catch(() => {})
      }

      if (mode === 'eval') {
        const er = await fetch(`/api/crm/leads/${leadId}/evaluations`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ plate: tPlate.trim().toUpperCase(), brand: tBrand || undefined, model: tModel || undefined, modelYear: tYear || undefined, km: tKm ? Number(tKm) : undefined, ownerName: name.trim() }),
        })
        const ej = await er.json().catch(() => null) as { error?: string; data?: { evaluation?: { id: string } } } | null
        const evalId = ej?.data?.evaluation?.id
        if (!er.ok || !evalId) {
          // Lead já existe: leva para ele, onde a avaliação pode ser refeita.
          setErr(`Lead criado, mas a avaliação não iniciou: ${ej?.error ?? 'erro'}.`)
          router.push(`/crm/leads/${leadId}`)
          return
        }
        router.push(`/estoque/avaliacao/${evalId}/inspecao`)
        return
      }
      onCreated()
    } finally { setSaving(null) }
  }

  return (
    <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/50 p-3 sm:p-4" onMouseDown={() => !saving && onClose()}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="new-lead-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/10">
          <h2 id="new-lead-title" className="text-base font-bold text-gray-900 dark:text-white">Novo lead</h2>
          <button onClick={onClose} disabled={!!saving} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700" aria-label="Fechar"><X size={16} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Contato */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={LABEL}>Nome <RequiredMark /></label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" className={cn(INPUT, bad('name'))} />
            </div>
            <div>
              <label className={LABEL}>Telefone <RequiredMark /></label>
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(maskPhoneInput(e.target.value))} placeholder="(11) 99999-9999" className={cn(INPUT, bad('phone'))} />
            </div>
            <div>
              <label className={LABEL}>E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" className={cn(INPUT, bad('email'))} />
            </div>
          </section>

          {/* Canal + tipo */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Canal de entrada <RequiredMark /></label>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={cn(INPUT, bad('source'))}>
                <option value="">— selecione —</option>
                {sourceGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            {activeTypes.length > 0 && (
              <div>
                <label className={LABEL}>Tipo de negociação{typeRequired && <> <RequiredMark /></>}</label>
                <select value={leadType} onChange={(e) => setLeadType(e.target.value)} className={cn(INPUT, bad('leadType'))}>
                  <option value="">{typeRequired ? '— selecione —' : 'Não definido'}</option>
                  {activeTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={LABEL}>Temperatura</label>
              <select value={temperature} onChange={(e) => setTemperature(e.target.value)} className={INPUT}>
                <option value="">Sem classificação</option>
                {settings.temperatures.filter((t) => t.active).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {canAssign && sellers.length > 0 && (
              <div>
                <label className={LABEL}>Responsável</label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={INPUT}>
                  <option value="">{settings.distribution.autoAssignNew ? 'Distribuição automática' : 'Eu mesmo'}</option>
                  {sellers.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
                </select>
              </div>
            )}
          </section>

          {/* Veículo de interesse */}
          <section className={cn('rounded-xl border p-3', touched && errors.vehicle ? 'border-red-300 dark:border-red-500/60' : 'border-gray-200 dark:border-white/10')}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200"><Car size={13} />Veículo de interesse{vehicleRequired && <> <RequiredMark /></>}</p>
              <div className="flex rounded-lg border border-gray-200 p-0.5 text-[11px] dark:border-white/10">
                {[[true, 'Do estoque'], [false, 'Outro modelo']].map(([v, l]) => (
                  <button key={String(v)} type="button" onClick={() => setStockMode(v as boolean)}
                    className={cn('rounded-md px-2 py-1 font-medium', stockMode === v ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-500')}>{l as string}</button>
                ))}
              </div>
            </div>
            {stockMode ? (
              picked ? (
                <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm dark:bg-brand-950/40">
                  <span className="text-gray-800 dark:text-gray-100">{vehicleLabel(picked)}{picked.plate && <span className="ml-2 text-[11px] text-gray-500">{picked.plate}</span>}</span>
                  <button type="button" onClick={() => { setPicked(null); setQ('') }} className="text-[11px] font-medium text-red-600 hover:underline">Trocar</button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por modelo, marca ou placa" className={cn(INPUT, 'pl-9')} />
                  {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                  {shown.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-800">
                      {shown.map((v) => (
                        <li key={v.id}>
                          <button type="button" onClick={() => { setPicked(v); setResults([]) }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-slate-700">
                            <span>{vehicleLabel(v)}</span><span className="text-[11px] text-gray-400">{v.plate}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!searching && q.trim().length >= 2 && shown.length === 0 && (
                    <p className="mt-1 text-[11px] text-gray-400">Nada no estoque. Use “Outro modelo”.</p>
                  )}
                </div>
              )
            ) : (
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_90px]">
                <input value={ivBrand} onChange={(e) => setIvBrand(e.target.value)} placeholder="Marca" className={INPUT} />
                <input value={ivModel} onChange={(e) => setIvModel(e.target.value)} placeholder="Modelo" className={INPUT} />
                <input value={ivYear} onChange={(e) => setIvYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="Ano" className={INPUT} />
              </div>
            )}
          </section>

          {/* Troca */}
          <section className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={hasTrade} onChange={(e) => setHasTrade(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
              Tem veículo na troca?
            </label>
            {hasTrade && (
              <div className="mt-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-[110px_1fr_1.4fr]">
                  <input value={tPlate} onChange={(e) => setTPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))} placeholder="Placa" className={INPUT} />
                  <input value={tBrand} onChange={(e) => setTBrand(e.target.value)} placeholder="Marca" className={INPUT} />
                  <input value={tModel} onChange={(e) => setTModel(e.target.value)} placeholder="Modelo *" className={cn(INPUT, bad('trade'))} />
                </div>
                <div className="grid gap-2 sm:grid-cols-[110px_140px_1fr] sm:items-center">
                  <input value={tYear} onChange={(e) => setTYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="Ano" className={INPUT} />
                  <input value={tKm} onChange={(e) => setTKm(e.target.value.replace(/\D/g, '').slice(0, 7))} inputMode="numeric" placeholder="KM" className={INPUT} />
                  <button type="button" onClick={() => void submit('eval')} disabled={!!saving}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    {saving === 'eval' ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />}Criar lead e avaliar a troca
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">Sem avaliar agora, o veículo fica registrado no lead para avaliar depois.</p>
              </div>
            )}
          </section>

          {/* Alimentar o lead */}
          <section>
            <label className={LABEL}>Observações do atendimento</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="O que o cliente procura, forma de pagamento, entrada, prazo, melhor horário para contato…"
              className={cn(INPUT, 'resize-y')} />
          </section>
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3 dark:border-white/10">
          {err && <p className="mr-auto text-xs text-red-600 dark:text-red-400">{err}</p>}
          <button onClick={onClose} disabled={!!saving} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => void submit('save')} disabled={!!saving} className="btn-primary text-sm">
            {saving === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Criar lead
          </button>
        </div>
      </div>
    </div>
  )
}

