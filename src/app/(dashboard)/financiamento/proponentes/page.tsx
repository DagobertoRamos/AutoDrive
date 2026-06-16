'use client'

// =============================================================================
// Financiamento — Proponentes (cadastro profissional) — AutoDrive
// Lista + modal com seções condicionais por ocupação, CEP/CNPJ automático,
// campos obrigatórios e "outras rendas" dinâmicas.
// Consome /api/financing/proponents (+[id]); CEP /api/address/lookup-by-cep;
// CNPJ /api/companies/lookup.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Users, X, Save, Loader2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskBRL, parseBRL, maskCPF, maskCNPJ, maskPhone, maskCEP } from '@/lib/masks'
import SearchBox from '@/components/reports/SearchBox'

type Occ = 'AUTONOMO' | 'CLT' | 'EMPRESARIO' | 'APOSENTADO_PENSIONISTA'
interface Row { id: string; nomeCompleto: string; cpf: string | null; celular: string | null; occupation: Occ | null; cidade: string | null; estado: string | null; renda: number; proposals: number }
interface OutraRenda { descricao: string; valor: number }
interface Form {
  nomeCompleto: string; dataNascimento: string; cpf: string; rg: string; nomeMae: string; nomePai: string
  email: string; celular: string; telefoneFixo: string
  cep: string; logradouro: string; bairro: string; cidade: string; estado: string; numero: string; complemento: string
  occupation: Occ | ''; cargo: string; renda: number; outrasRendas: OutraRenda[]; numeroBeneficio: string
  empresaNome: string; empresaCnpj: string; empresaTelefone: string
  empresaCep: string; empresaLogradouro: string; empresaBairro: string; empresaCidade: string; empresaEstado: string; empresaNumero: string; empresaComplemento: string
  notes: string
}

const emptyForm: Form = {
  nomeCompleto: '', dataNascimento: '', cpf: '', rg: '', nomeMae: '', nomePai: '', email: '', celular: '', telefoneFixo: '',
  cep: '', logradouro: '', bairro: '', cidade: '', estado: '', numero: '', complemento: '',
  occupation: '', cargo: '', renda: 0, outrasRendas: [], numeroBeneficio: '',
  empresaNome: '', empresaCnpj: '', empresaTelefone: '', empresaCep: '', empresaLogradouro: '', empresaBairro: '', empresaCidade: '', empresaEstado: '', empresaNumero: '', empresaComplemento: '', notes: '',
}

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const fmtMoney = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const OCC_LABEL: Record<string, string> = { AUTONOMO: 'Autônomo', CLT: 'CLT', EMPRESARIO: 'Empresário', APOSENTADO_PENSIONISTA: 'Aposentado/Pensionista' }
const CARGOS = ['Vendedor(a)', 'Motorista', 'Pedreiro', 'Autônomo', 'Comerciante', 'Cabeleireiro(a)', 'Mecânico', 'Eletricista', 'Pintor', 'Diarista', 'Costureira', 'Garçom', 'Cozinheiro(a)', 'Professor(a)', 'Técnico', 'Representante comercial']

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}
function MoneyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="text" inputMode="numeric" className={inputCls} value={maskBRL(value ? Math.round(value * 100).toString() : '')} onChange={(e) => onChange(parseBRL(maskBRL(e.target.value)) ?? 0)} placeholder="0,00" />
}

export default function ProponentesPage() {
  const [items, setItems] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cepLoading, setCepLoading] = useState<'res' | 'emp' | null>(null)
  const [cnpjLoading, setCnpjLoading] = useState(false)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams(); if (q) qs.set('q', q)
      const res = await fetch(`/api/financing/proponents?${qs}`, { credentials: 'include' })
      const json = await res.json(); setItems(json?.data ?? [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [q])
  useEffect(() => { load() }, [load])

  const openNew = () => { setEditingId(null); setForm(emptyForm); setError(null); setModal(true) }
  const openEdit = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/financing/proponents/${id}`, { credentials: 'include' })
      const json = await res.json()
      const p = json?.data
      if (!p) return
      setForm({
        ...emptyForm, ...p,
        dataNascimento: p.dataNascimento ? String(p.dataNascimento).slice(0, 10) : '',
        cpf: p.cpf ?? '', renda: Number(p.renda) || 0, outrasRendas: Array.isArray(p.outrasRendas) ? p.outrasRendas : [],
        occupation: p.occupation ?? '',
        telefoneFixo: p.telefoneFixo ?? '', complemento: p.complemento ?? '', cargo: p.cargo ?? '', numeroBeneficio: p.numeroBeneficio ?? '',
        empresaNome: p.empresaNome ?? '', empresaCnpj: p.empresaCnpj ?? '', empresaTelefone: p.empresaTelefone ?? '',
        empresaCep: p.empresaCep ?? '', empresaLogradouro: p.empresaLogradouro ?? '', empresaBairro: p.empresaBairro ?? '',
        empresaCidade: p.empresaCidade ?? '', empresaEstado: p.empresaEstado ?? '', empresaNumero: p.empresaNumero ?? '', empresaComplemento: p.empresaComplemento ?? '',
        notes: p.notes ?? '',
      })
      setEditingId(id); setModal(true)
    } catch { setError('Erro ao carregar proponente.') }
  }

  const lookupCep = async (which: 'res' | 'emp', raw: string) => {
    const cep = raw.replace(/\D/g, ''); if (cep.length !== 8) return
    setCepLoading(which)
    try {
      const res = await fetch(`/api/address/lookup-by-cep?cep=${cep}`, { credentials: 'include' })
      const d = await res.json()
      if (d?.success !== false && (d?.logradouro || d?.cidade)) {
        if (which === 'res') setForm((f) => ({ ...f, logradouro: d.logradouro || f.logradouro, bairro: d.bairro || f.bairro, cidade: d.cidade || f.cidade, estado: d.estado || f.estado }))
        else setForm((f) => ({ ...f, empresaLogradouro: d.logradouro || f.empresaLogradouro, empresaBairro: d.bairro || f.empresaBairro, empresaCidade: d.cidade || f.empresaCidade, empresaEstado: d.estado || f.empresaEstado }))
      }
    } catch { /* ignora */ } finally { setCepLoading(null) }
  }
  const lookupCnpj = async (raw: string) => {
    const cnpj = raw.replace(/\D/g, ''); if (cnpj.length !== 14) return
    setCnpjLoading(true)
    try {
      const res = await fetch(`/api/companies/lookup?cnpj=${cnpj}`, { credentials: 'include' })
      const d = await res.json()
      if (d?.found) setForm((f) => ({ ...f, empresaNome: d.razaoSocial || d.nomeFantasia || f.empresaNome, empresaCep: d.cep ? maskCEP(d.cep) : f.empresaCep, empresaLogradouro: d.logradouro || f.empresaLogradouro, empresaBairro: d.bairro || f.empresaBairro, empresaCidade: d.cidade || f.empresaCidade, empresaEstado: d.estado || f.empresaEstado, empresaNumero: d.numero || f.empresaNumero }))
    } catch { /* ignora */ } finally { setCnpjLoading(false) }
  }

  const addRenda = () => set('outrasRendas', [...form.outrasRendas, { descricao: '', valor: 0 }])
  const updRenda = (i: number, patch: Partial<OutraRenda>) => set('outrasRendas', form.outrasRendas.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const delRenda = (i: number) => set('outrasRendas', form.outrasRendas.filter((_, idx) => idx !== i))

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const payload = { ...form, renda: form.renda || null, dataNascimento: form.dataNascimento || null, outrasRendas: form.outrasRendas.filter((r) => r.descricao.trim()) }
      const url = editingId ? `/api/financing/proponents/${editingId}` : '/api/financing/proponents'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Erro ao salvar. Verifique os campos obrigatórios.'); return }
      setModal(false); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }
  const remove = async (r: Row) => {
    if (!confirm(`Excluir o proponente "${r.nomeCompleto}"? As fichas dele também serão removidas.`)) return
    await fetch(`/api/financing/proponents/${r.id}`, { method: 'DELETE', credentials: 'include' }); await load()
  }

  const showEmpresa = form.occupation === 'CLT' || form.occupation === 'EMPRESARIO' || form.occupation === 'AUTONOMO'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Proponentes</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} proponentes`}</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar nome, CPF, e-mail..." className="w-64" />
          <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Novo proponente</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Nome', 'CPF', 'Celular', 'Ocupação', 'Cidade/UF', 'Renda', 'Fichas', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center"><Users size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum proponente. Cadastre o primeiro.</p></td></tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.nomeCompleto}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{r.cpf ? maskCPF(r.cpf) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.celular ? maskPhone(r.celular) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.occupation ? OCC_LABEL[r.occupation] : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{[r.cidade, r.estado].filter(Boolean).join('/') || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{r.renda ? fmtMoney(r.renda) : '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-gray-500">{r.proposals}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => openEdit(r.id)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => remove(r)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-4 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar proponente' : 'Novo proponente'}</h2>
              <button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
            </div>

            {/* Dados pessoais */}
            <h3 className="mb-2 text-sm font-semibold text-brand-700">Dados pessoais</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-2"><Field label="Nome completo" required><input className={inputCls} value={form.nomeCompleto} onChange={(e) => set('nomeCompleto', e.target.value)} /></Field></div>
              <Field label="Data de nascimento" required><input type="date" className={inputCls} value={form.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} /></Field>
              <Field label="CPF" required><input className={inputCls} value={maskCPF(form.cpf)} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" /></Field>
              <Field label="RG" required><input className={inputCls} value={form.rg} onChange={(e) => set('rg', e.target.value)} /></Field>
              <Field label="E-mail" required><input className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@exemplo.com" /></Field>
              <Field label="Nome da mãe" required><input className={inputCls} value={form.nomeMae} onChange={(e) => set('nomeMae', e.target.value)} /></Field>
              <Field label="Nome do pai" required><input className={inputCls} value={form.nomePai} onChange={(e) => set('nomePai', e.target.value)} /></Field>
              <Field label="Celular" required><input className={inputCls} value={maskPhone(form.celular)} onChange={(e) => set('celular', e.target.value)} placeholder="(00) 00000-0000" /></Field>
              <Field label="Telefone fixo"><input className={inputCls} value={maskPhone(form.telefoneFixo)} onChange={(e) => set('telefoneFixo', e.target.value)} placeholder="(00) 0000-0000" /></Field>
            </div>

            {/* Endereço */}
            <h3 className="mb-2 mt-5 text-sm font-semibold text-brand-700">Endereço residencial</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="CEP" required><div className="relative"><input className={inputCls} value={maskCEP(form.cep)} onChange={(e) => { set('cep', e.target.value); lookupCep('res', e.target.value) }} placeholder="00000-000" />{cepLoading === 'res' && <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}</div></Field>
              <div className="col-span-2"><Field label="Logradouro" required><input className={inputCls} value={form.logradouro} onChange={(e) => set('logradouro', e.target.value)} /></Field></div>
              <Field label="Bairro" required><input className={inputCls} value={form.bairro} onChange={(e) => set('bairro', e.target.value)} /></Field>
              <Field label="Cidade" required><input className={inputCls} value={form.cidade} onChange={(e) => set('cidade', e.target.value)} /></Field>
              <Field label="UF" required><input className={inputCls} maxLength={2} value={form.estado} onChange={(e) => set('estado', e.target.value.toUpperCase())} placeholder="SP" /></Field>
              <Field label="Número" required><input className={inputCls} value={form.numero} onChange={(e) => set('numero', e.target.value)} /></Field>
              <div className="col-span-2"><Field label="Complemento"><input className={inputCls} value={form.complemento} onChange={(e) => set('complemento', e.target.value)} placeholder="Apto, bloco..." /></Field></div>
            </div>

            {/* Ocupação */}
            <h3 className="mb-2 mt-5 text-sm font-semibold text-brand-700">Ocupação e renda</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Ocupação" required><select className={inputCls} value={form.occupation} onChange={(e) => set('occupation', e.target.value as Occ)}><option value="">Selecione...</option><option value="AUTONOMO">Autônomo</option><option value="CLT">CLT</option><option value="EMPRESARIO">Empresário</option><option value="APOSENTADO_PENSIONISTA">Aposentado/Pensionista</option></select></Field>
              <Field label="Renda" required><MoneyInput value={form.renda} onChange={(v) => set('renda', v)} /></Field>
              {form.occupation === 'AUTONOMO' && (
                <Field label="Cargo / atividade" required hint="Selecione ou digite">
                  <input className={inputCls} list="cargos-list" value={form.cargo} onChange={(e) => set('cargo', e.target.value)} placeholder="Ex: Pedreiro" />
                  <datalist id="cargos-list">{CARGOS.map((c) => <option key={c} value={c} />)}</datalist>
                </Field>
              )}
              {form.occupation === 'APOSENTADO_PENSIONISTA' && (
                <Field label="Número do benefício" required><input className={inputCls} value={form.numeroBeneficio} onChange={(e) => set('numeroBeneficio', e.target.value)} /></Field>
              )}
            </div>

            {/* Empresa (condicional) */}
            {showEmpresa && (
              <>
                <h3 className="mb-1 mt-5 text-sm font-semibold text-brand-700">Empresa {form.occupation === 'AUTONOMO' && <span className="font-normal text-gray-400">(opcional)</span>}</h3>
                {form.occupation === 'AUTONOMO' && <p className="mb-2 flex items-center gap-1 text-[11px] text-amber-600"><Info size={12} /> Recomendado preencher para fortalecer a ficha.</p>}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {form.occupation === 'EMPRESARIO' && (
                    <Field label="CNPJ" required><div className="relative"><input className={inputCls} value={maskCNPJ(form.empresaCnpj)} onChange={(e) => { set('empresaCnpj', e.target.value); lookupCnpj(e.target.value) }} placeholder="00.000.000/0000-00" />{cnpjLoading && <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}</div></Field>
                  )}
                  <div className="col-span-2"><Field label="Nome da empresa" required={form.occupation === 'CLT' || form.occupation === 'EMPRESARIO'}><input className={inputCls} value={form.empresaNome} onChange={(e) => set('empresaNome', e.target.value)} /></Field></div>
                  <Field label="Telefone da empresa"><input className={inputCls} value={maskPhone(form.empresaTelefone)} onChange={(e) => set('empresaTelefone', e.target.value)} placeholder="(00) 0000-0000" /></Field>
                  <Field label="CEP da empresa"><div className="relative"><input className={inputCls} value={maskCEP(form.empresaCep)} onChange={(e) => { set('empresaCep', e.target.value); lookupCep('emp', e.target.value) }} placeholder="00000-000" />{cepLoading === 'emp' && <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}</div></Field>
                  <div className="col-span-2"><Field label="Logradouro"><input className={inputCls} value={form.empresaLogradouro} onChange={(e) => set('empresaLogradouro', e.target.value)} /></Field></div>
                  <Field label="Bairro"><input className={inputCls} value={form.empresaBairro} onChange={(e) => set('empresaBairro', e.target.value)} /></Field>
                  <Field label="Cidade"><input className={inputCls} value={form.empresaCidade} onChange={(e) => set('empresaCidade', e.target.value)} /></Field>
                  <Field label="UF"><input className={inputCls} maxLength={2} value={form.empresaEstado} onChange={(e) => set('empresaEstado', e.target.value.toUpperCase())} /></Field>
                  <Field label="Número"><input className={inputCls} value={form.empresaNumero} onChange={(e) => set('empresaNumero', e.target.value)} /></Field>
                  <div className="col-span-2"><Field label="Complemento"><input className={inputCls} value={form.empresaComplemento} onChange={(e) => set('empresaComplemento', e.target.value)} /></Field></div>
                </div>
              </>
            )}

            {/* Outras rendas */}
            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-700">Outras rendas <span className="font-normal text-gray-400">(opcional)</span></h3>
              <button type="button" onClick={addRenda} className="text-xs font-medium text-brand-600 hover:underline">+ Adicionar</button>
            </div>
            {form.outrasRendas.length > 0 && (
              <div className="mt-2 space-y-2">
                {form.outrasRendas.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className={cn(inputCls, 'flex-1')} value={r.descricao} onChange={(e) => updRenda(i, { descricao: e.target.value })} placeholder="Ex: Aluguel, pensão..." />
                    <div className="w-40"><MoneyInput value={r.valor} onChange={(v) => updRenda(i, { valor: v })} /></div>
                    <button type="button" onClick={() => delRenda(i)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Observações */}
            <div className="mt-5"><Field label="Observações"><textarea className={cn(inputCls, 'min-h-[60px] resize-y')} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field></div>

            {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar proponente'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
