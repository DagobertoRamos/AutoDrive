'use client'

// =============================================================================
// Cadastros › Fornecedores — todos os fornecedores da loja por tipo (veículos,
// peças, oficinas, despachante, material de escritório…). PF/PJ pelo documento;
// CNPJ e CEP preenchem os dados. Fornecedor de veículos sai nos contratos.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { AlertCircle, Loader2, Pencil, Plus, Save, Search, Truck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccessModule } from '@/lib/permissions'
import { SUPPLIER_KINDS, SUPPLIER_KIND_LABEL, personTypeOf, supplierData } from '@/lib/stock/suppliers'
import { formatCPF } from '@/lib/br-docs/cpf'
import { formatCNPJ, isValidCNPJ } from '@/lib/br-docs/cnpj'
import { formatPhone } from '@/lib/br-docs/phone'
import { formatCEP } from '@/lib/br-docs/cep'

interface Supplier {
  id: string; name: string; legalName: string | null; kind: string; personType: string; document: string | null
  rg: string | null; stateRegistration: string | null; repName: string | null; repCpf: string | null
  phone: string | null; whatsapp: string | null; email: string | null
  cep: string | null; street: string | null; number: string | null; complement: string | null; district: string | null; city: string | null; state: string | null
  commission: string | null; pixKey: string | null; bankInfo: string | null; notes: string | null
  active: boolean; _count?: { services: number; vehicles: number }
}
const FIELDS = ['kind', 'document', 'name', 'legalName', 'rg', 'stateRegistration', 'repName', 'repCpf', 'whatsapp', 'phone', 'email', 'cep', 'street', 'number', 'complement', 'district', 'city', 'state', 'commission', 'pixKey', 'bankInfo', 'notes'] as const
type Key = (typeof FIELDS)[number]
type Form = Record<Key, string>
const EMPTY = Object.fromEntries(FIELDS.map((k) => [k, ''])) as Form
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const digits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '')
const fmtDoc = (s: string | null | undefined) => { const d = digits(s); return d.length > 11 ? formatCNPJ(d) : formatCPF(d) }

export default function FornecedoresPage() {
  const { data: session } = useSession()
  const role = session?.user?.role
  const canEdit = canAccessModule(role, 'stock.manage') || canAccessModule(role, 'finance')
  const [rows, setRows] = useState<Supplier[] | null>(null)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('')
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null)
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [lookup, setLookup] = useState<'' | 'cnpj' | 'cep'>('')

  // ?tipo=VEICULOS (links de outras telas)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tipo')?.toUpperCase()
    if (t && SUPPLIER_KIND_LABEL[t]) setTimeout(() => setTipo(t), 0)
  }, [])

  const load = useCallback(async () => {
    const qs = new URLSearchParams()
    if (q.trim()) qs.set('q', q.trim())
    if (tipo) qs.set('tipo', tipo)
    const j = await fetch(`/api/suppliers?${qs}`).then((r) => r.json()).catch(() => null)
    if (j?.success) setRows(j.data); else { setErr(j?.error ?? 'Falha ao carregar.'); setRows([]) }
  }, [q, tipo])
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t) }, [load])

  const f = editing?.form
  const pt = f ? personTypeOf(f.document) : null
  const isVeh = f?.kind === 'VEICULOS'
  const set = (k: Key, v: string) => { setFormErr(''); setEditing((e) => e && { ...e, form: { ...e.form, [k]: v } }) }
  const fill = (patch: Partial<Form>) => setEditing((e) => e && { ...e, form: { ...e.form, ...Object.fromEntries(Object.entries(patch).filter(([k, v]) => v && !e.form[k as Key])) } })

  function open(s?: Supplier) {
    setFormErr('')
    setEditing(s
      ? { id: s.id, form: Object.fromEntries(FIELDS.map((k) => [k, k === 'name' && s.personType === 'PJ' && s.legalName === s.name ? '' : String((s as unknown as Record<string, unknown>)[k] ?? '')])) as Form }
      : { id: null, form: { ...EMPTY, kind: tipo } })
  }

  async function onDocument(v: string) {
    const d = digits(v).slice(0, 14)
    set('document', d)
    if (d.length !== 14 || !isValidCNPJ(d)) return
    setLookup('cnpj')
    const j = await fetch(`/api/integrations/brasilapi/cnpj/${d}`).then((r) => r.json()).catch(() => null)
    setLookup('')
    const x = j?.data
    if (!x) return
    fill({ legalName: x.razaoSocial, name: x.nomeFantasia, email: String(x.email ?? '').toLowerCase(), phone: digits(x.telefone1), cep: digits(x.cep), street: x.logradouro, number: x.numero, complement: x.complemento, district: x.bairro, city: x.cidade, state: x.estado })
  }

  async function onCep(v: string) {
    const d = digits(v).slice(0, 8)
    set('cep', d)
    if (d.length !== 8) return
    setLookup('cep')
    const j = await fetch(`/api/address/lookup-by-cep?cep=${d}`).then((r) => r.json()).catch(() => null)
    setLookup('')
    const x = j?.data
    if (x) setEditing((e) => e && { ...e, form: { ...e.form, street: x.logradouro || e.form.street, district: x.bairro || e.form.district, city: x.cidade || e.form.city, state: x.estado || e.form.state } })
  }

  async function save() {
    if (!editing) return
    const check = supplierData(editing.form)
    if (!check.ok) { setFormErr(check.error); return }
    setSaving(true); setFormErr('')
    const r = await fetch(editing.id ? `/api/suppliers/${editing.id}` : '/api/suppliers', { method: editing.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing.form) })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setFormErr(j.error ?? 'Falha ao salvar.'); return }
    setEditing(null); void load()
  }
  const toggle = async (s: Supplier) => { await fetch(`/api/suppliers/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !s.active }) }); void load() }

  const counts = useMemo(() => rows?.length ?? 0, [rows])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Truck size={20} /></div>
          <div><h1 className="text-xl font-bold text-gray-900">Fornecedores</h1><p className="text-sm text-gray-500">{rows ? `${counts} cadastrado(s)` : ' '}</p></div>
        </div>
        {canEdit && <button onClick={() => open()} className="btn-primary text-sm"><Plus size={15} />Novo fornecedor</button>}
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={cn(inputCls, 'mt-0 w-auto')}>
          <option value="">Todos os tipos</option>
          {SUPPLIER_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, CPF/CNPJ ou cidade" className={cn(inputCls, 'mt-0 pl-9')} />
        </div>
      </div>

      {err && <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={15} />{err}</p>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr><th className="px-4 py-2.5">Fornecedor</th><th className="px-4 py-2.5">Tipo</th><th className="px-4 py-2.5">CPF/CNPJ</th><th className="px-4 py-2.5">Cidade</th><th className="px-4 py-2.5">Contato</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!rows ? (
                <tr><td colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto animate-spin text-gray-400" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">Nenhum fornecedor.</td></tr>
              ) : rows.map((s) => (
                <tr key={s.id} className={cn('hover:bg-gray-50', !s.active && 'opacity-50')}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    {s.legalName && s.legalName !== s.name && <p className="text-xs text-gray-500">{s.legalName}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{SUPPLIER_KIND_LABEL[s.kind] ?? s.kind}{s.kind === 'VEICULOS' && s._count?.vehicles ? <span className="ml-1 text-xs text-gray-400">· {s._count.vehicles} carro(s)</span> : null}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-600">{s.document ? fmtDoc(s.document) : <span className="text-amber-600">pendente</span>}</td>
                  <td className="px-4 py-2.5 text-gray-600">{[s.city, s.state].filter(Boolean).join('/') || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{s.whatsapp || s.phone ? formatPhone(s.whatsapp || s.phone) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {canEdit && <>
                      <button onClick={() => open(s)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => void toggle(s)} className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">{s.active ? 'Desativar' : 'Ativar'}</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && f && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-lg font-bold text-gray-900">{editing.id ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
              <button onClick={() => setEditing(null)} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="space-y-5 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <L label="Tipo" req><select className={inputCls} value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="">Selecione</option>{SUPPLIER_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></L>
                <L label="CPF/CNPJ" req hint={lookup === 'cnpj' ? 'consultando…' : pt === 'PJ' ? 'Pessoa jurídica' : pt === 'PF' ? 'Pessoa física' : undefined}>
                  <input className={inputCls} inputMode="numeric" value={fmtDoc(f.document)} onChange={(e) => void onDocument(e.target.value)} />
                </L>
              </div>

              {pt && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {pt === 'PJ' ? <>
                    <L label="Razão social" req><input className={inputCls} value={f.legalName} onChange={(e) => set('legalName', e.target.value)} /></L>
                    <L label="Nome fantasia"><input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} /></L>
                    <L label="Inscrição estadual"><input className={inputCls} value={f.stateRegistration} onChange={(e) => set('stateRegistration', e.target.value)} /></L>
                  </> : <>
                    <L label="Nome completo" req><input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} /></L>
                    <L label="RG"><input className={inputCls} value={f.rg} onChange={(e) => set('rg', e.target.value)} /></L>
                  </>}
                </div>
              )}

              <Section title="Contato">
                <L label="WhatsApp" req={!f.phone}><input className={inputCls} inputMode="tel" value={formatPhone(f.whatsapp)} onChange={(e) => set('whatsapp', digits(e.target.value).slice(0, 11))} /></L>
                <L label="Telefone" req={!f.whatsapp}><input className={inputCls} inputMode="tel" value={formatPhone(f.phone)} onChange={(e) => set('phone', digits(e.target.value).slice(0, 11))} /></L>
                <div className="sm:col-span-2"><L label="E-mail"><input className={inputCls} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></L></div>
              </Section>

              <Section title="Endereço">
                <L label="CEP" req={isVeh} hint={lookup === 'cep' ? 'consultando…' : undefined}><input className={inputCls} inputMode="numeric" value={formatCEP(f.cep)} onChange={(e) => void onCep(e.target.value)} /></L>
                <L label="Logradouro" req={isVeh}><input className={inputCls} value={f.street} onChange={(e) => set('street', e.target.value)} /></L>
                <L label="Número" req={isVeh}><input className={inputCls} value={f.number} onChange={(e) => set('number', e.target.value)} /></L>
                <L label="Complemento"><input className={inputCls} value={f.complement} onChange={(e) => set('complement', e.target.value)} /></L>
                <L label="Bairro" req={isVeh}><input className={inputCls} value={f.district} onChange={(e) => set('district', e.target.value)} /></L>
                <div className="grid grid-cols-[1fr_88px] gap-3">
                  <L label="Cidade" req={isVeh}><input className={inputCls} value={f.city} onChange={(e) => set('city', e.target.value)} /></L>
                  <L label="UF" req={isVeh}><select className={inputCls} value={f.state} onChange={(e) => set('state', e.target.value)}><option value="" />{UFS.map((u) => <option key={u}>{u}</option>)}</select></L>
                </div>
              </Section>

              {pt === 'PJ' && (
                <Section title="Representante legal">
                  <L label="Nome" req={isVeh}><input className={inputCls} value={f.repName} onChange={(e) => set('repName', e.target.value)} /></L>
                  <L label="CPF" req={isVeh}><input className={inputCls} inputMode="numeric" value={formatCPF(f.repCpf)} onChange={(e) => set('repCpf', digits(e.target.value).slice(0, 11))} /></L>
                </Section>
              )}

              {isVeh && (
                <Section title="Intermediação">
                  <div className="sm:col-span-2"><L label="Remuneração da loja"><input className={inputCls} value={f.commission} onChange={(e) => set('commission', e.target.value)} placeholder="Ex.: 8% do valor da venda" /></L></div>
                </Section>
              )}

              <Section title="Pagamento">
                <L label="Chave PIX"><input className={inputCls} value={f.pixKey} onChange={(e) => set('pixKey', e.target.value)} /></L>
                <L label="Dados bancários"><input className={inputCls} value={f.bankInfo} onChange={(e) => set('bankInfo', e.target.value)} placeholder="Banco, agência, conta" /></L>
                <div className="sm:col-span-2"><L label="Observações"><textarea rows={2} className={inputCls} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></L></div>
              </Section>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
              <p className="min-h-5 text-sm text-red-600">{formErr}</p>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Cancelar</button>
                <button onClick={() => void save()} disabled={saving} className="btn-primary text-sm">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function L({ label, req, hint, children }: { label: string; req?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-700">
      <span className="flex items-center justify-between">{label}{req && <span className="text-red-500"> *</span>}<span className="ml-auto font-normal text-gray-400">{hint}</span></span>
      {children}
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}
