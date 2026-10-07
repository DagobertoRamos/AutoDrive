'use client'

// =============================================================================
// Ficha cadastral completa do F&I (PF e PJ) — a mesma tela para a loja e para
// o cliente (link seguro). Segue as fichas cadastrais de veículos dos bancos:
// dados pessoais, documento, filiação, contato, endereço, ocupação/renda,
// empresa onde trabalha, cônjuge, patrimônio e referências; PJ com sócios (%).
// Máscaras, busca de CEP/CNPJ, seções condicionais e obrigatórios da ficha
// completa marcados. Salva só o que mudou; o servidor valida campo a campo.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { FieldLabel } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { maskCEP, maskCNPJ, maskCPF, maskPhone } from '@/lib/masks'
import { COM_CONJUGE, commonRequiredFor, FIELD_BY_KEY, isFilled, missingFields, socioTotal, type PersonType } from '@/lib/finance/fi/fields-core'
import { FIELD_INPUT, LIST_SHAPE, SELECT_OPTIONS } from '@/lib/finance/fi/field-input'

type Values = Record<string, unknown>
type Row = Record<string, unknown>

export interface CepInfo { logradouro?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null }
export interface CnpjInfo extends CepInfo {
  razaoSocial?: string | null; nomeFantasia?: string | null; cep?: string | null; numero?: string | null; complemento?: string | null
  dataAbertura?: string | null; naturezaJuridica?: string | null; atividade?: string | null; capitalSocial?: number | null
  telefone?: string | null; email?: string | null; socios?: { nome: string; cargo: string }[]
}
export interface CadastroEndpoints {
  load: () => Promise<{ ok: boolean; error?: string | null; personType?: PersonType; values?: Values; locked?: string[] }>
  save: (fields: Values) => Promise<{ ok: boolean; error?: string | null; fieldErrors?: Record<string, string> }>
  cep: (cep: string) => Promise<CepInfo | null>
  cnpj?: (cnpj: string) => Promise<CnpjInfo | null>
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const cls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500'
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const PAI_ND = 'NÃO DECLARADO'

/** Natureza jurídica da Receita → opção da ficha. */
function naturezaFrom(t: string | null | undefined): string | null {
  const s = (t ?? '').toLowerCase()
  if (!s) return null
  if (s.includes('microempreendedor')) return 'MEI'
  if (s.includes('unipessoal')) return 'SLU'
  if (s.includes('eireli') || s.includes('individual de responsabilidade')) return 'EIRELI'
  if (s.includes('limitada')) return 'LTDA'
  if (s.includes('anônima') || s.includes('anonima')) return 'SA'
  if (s.includes('empresário') || s.includes('empresario')) return 'EI'
  return 'OUTRA'
}

interface Layout { title: string; keys: string[]; show?: (v: Values) => boolean; wide?: string[] }

const PF_LAYOUT: Layout[] = [
  { title: 'Dados pessoais', keys: ['nomeCompleto', 'cpf', 'dataNascimento', 'sexo', 'estadoCivil', 'nacionalidade', 'naturalidade', 'naturalidadeUf', 'escolaridade', 'dependentes', 'pep'], wide: ['nomeCompleto'] },
  { title: 'Documento de identidade', keys: ['rg', 'rgOrgao', 'rgUf', 'rgDataEmissao', 'cnh'] },
  { title: 'Filiação', keys: ['nomeMae', 'nomePai'], wide: ['nomeMae', 'nomePai'] },
  { title: 'Contato', keys: ['celular', 'email', 'telefoneFixo'] },
  { title: 'Endereço residencial', keys: ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'tipoResidencia', 'tempoResidenciaMeses', 'valorAluguel'], wide: ['logradouro'] },
  { title: 'Ocupação e renda', keys: ['occupation', 'profissao', 'renda', 'comprovanteRenda', 'numeroBeneficio', 'outrasRendas'] },
  { title: 'Empresa onde trabalha', keys: ['empresaCnpj', 'empresaNome', 'cargo', 'dataAdmissao', 'participacaoEmpresa', 'empresaTelefone', 'empresaCep', 'empresaLogradouro', 'empresaNumero', 'empresaComplemento', 'empresaBairro', 'empresaCidade', 'empresaEstado'], wide: ['empresaNome', 'empresaLogradouro'], show: (v) => ['CLT', 'EMPRESARIO', 'AUTONOMO'].includes(String(v.occupation ?? '')) },
  { title: 'Cônjuge', keys: ['conjugeNome', 'conjugeCpf', 'conjugeDataNascimento', 'conjugeOcupacao', 'conjugeRenda', 'conjugeCelular'], wide: ['conjugeNome'], show: (v) => COM_CONJUGE.includes(String(v.estadoCivil ?? '')) },
  { title: 'Patrimônio e referências', keys: ['patrimonio', 'referenciasBancarias', 'referencias'] },
]
const PJ_LAYOUT: Layout[] = [
  { title: 'Dados da empresa', keys: ['cnpj', 'razaoSocial', 'nomeFantasia', 'dataFundacao', 'naturezaJuridica', 'atividade', 'inscricaoEstadual', 'capitalSocial', 'faturamentoMensal', 'faturamentoAnual', 'numeroFuncionarios'], wide: ['razaoSocial', 'atividade'] },
  { title: 'Contato', keys: ['celular', 'email', 'telefoneFixo'] },
  { title: 'Endereço da sede', keys: ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado'], wide: ['logradouro'] },
  { title: 'Sócios e representante legal', keys: ['socios', 'representanteNome', 'representanteCpf'] },
  { title: 'Patrimônio e referências', keys: ['patrimonio', 'referenciasBancarias', 'referenciasComerciais'] },
]

/** Campo visível conforme as respostas (ex.: benefício só para aposentado). */
function visible(key: string, v: Values): boolean {
  const occ = String(v.occupation ?? '')
  if (key === 'numeroBeneficio') return occ === 'APOSENTADO_PENSIONISTA'
  if (key === 'participacaoEmpresa' || key === 'empresaCnpj') return occ === 'EMPRESARIO' || (key === 'empresaCnpj' && occ !== 'APOSENTADO_PENSIONISTA')
  if (key === 'dataAdmissao') return occ === 'CLT' || occ === 'EMPRESARIO'
  if (key === 'valorAluguel') return ['ALUGADA', 'FINANCIADA'].includes(String(v.tipoResidencia ?? ''))
  return true
}

const LABEL_OVERRIDE: Record<string, Record<string, string>> = {
  PJ: { celular: 'Celular / WhatsApp', telefoneFixo: 'Telefone comercial', email: 'E-mail da empresa' },
}

export function CadastroForm({ endpoints, mode = 'interno', onSaved, highlight }: { endpoints: CadastroEndpoints; mode?: 'interno' | 'cliente'; onSaved?: () => void; highlight?: boolean }) {
  const [type, setType] = useState<PersonType>('PF')
  const [initial, setInitial] = useState<Values>({})
  const [draft, setDraft] = useState<Values>({})
  const [locked, setLocked] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [looking, setLooking] = useState<string | null>(null)
  const top = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const r = await endpoints.load()
    setLoading(false)
    if (!r.ok) { setLoadError(r.error ?? 'Não foi possível carregar.'); return }
    const vals = r.values ?? {}
    setType(r.personType ?? 'PF'); setInitial(vals); setDraft(vals); setLocked(r.locked ?? []); setLoadError(null)
  }, [endpoints])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])


  const lockedSet = useMemo(() => new Set(locked), [locked])
  // Para o "falta": campos travados contam como informados (no link do cliente o valor não volta).
  const effective = useMemo(() => ({ ...draft, ...Object.fromEntries(locked.map((k) => [k, isFilled(k, draft[k]) ? draft[k] : 'x'])) }), [draft, locked])
  const required = useMemo(() => new Set(commonRequiredFor(effective, type)), [effective, type])
  const missing = useMemo(() => missingFields(effective, [...required], type), [effective, required, type])
  const dirty = useMemo(() => Object.keys(draft).filter((k) => !same(draft[k], initial[k])), [draft, initial])

  const set = (k: string, v: unknown) => { setDraft((d) => ({ ...d, [k]: v })); setErrors((e) => (e[k] ? { ...e, [k]: '' } : e)); setMsg(null) }
  const fillEmpty = (patch: Values) => setDraft((d) => {
    const out = { ...d }
    for (const [k, v] of Object.entries(patch)) if (v != null && v !== '' && !lockedSet.has(k) && !isFilled(k, d[k])) out[k] = v
    return out
  })

  const lookupCep = async (which: 'res' | 'emp', raw: string) => {
    const cep = digits(raw); if (cep.length !== 8) return
    setLooking(which === 'res' ? 'cep' : 'empresaCep')
    const d = await endpoints.cep(cep).catch(() => null)
    setLooking(null)
    if (!d) return
    const p = which === 'res' ? { logradouro: d.logradouro, bairro: d.bairro, cidade: d.cidade, estado: d.estado } : { empresaLogradouro: d.logradouro, empresaBairro: d.bairro, empresaCidade: d.cidade, empresaEstado: d.estado }
    setDraft((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(p).filter(([k, v]) => v && !lockedSet.has(k))) }))
  }

  const lookupCnpj = async (which: 'pj' | 'emp', raw: string) => {
    const cnpj = digits(raw); if (cnpj.length !== 14 || !endpoints.cnpj) return
    setLooking(which === 'pj' ? 'cnpj' : 'empresaCnpj')
    const d = await endpoints.cnpj(cnpj).catch(() => null)
    setLooking(null)
    if (!d) return
    if (which === 'emp') {
      fillEmpty({ empresaNome: d.razaoSocial || d.nomeFantasia, empresaTelefone: d.telefone, empresaCep: digits(d.cep), empresaLogradouro: d.logradouro, empresaNumero: d.numero, empresaComplemento: d.complemento, empresaBairro: d.bairro, empresaCidade: d.cidade, empresaEstado: d.estado })
      return
    }
    fillEmpty({
      razaoSocial: d.razaoSocial, nomeFantasia: d.nomeFantasia, dataFundacao: d.dataAbertura?.slice(0, 10), naturezaJuridica: naturezaFrom(d.naturezaJuridica),
      atividade: d.atividade, capitalSocial: d.capitalSocial && d.capitalSocial > 0 ? d.capitalSocial : null, telefoneFixo: d.telefone, email: d.email,
      cep: digits(d.cep), logradouro: d.logradouro, numero: d.numero, complemento: d.complemento, bairro: d.bairro, cidade: d.cidade, estado: d.estado,
      socios: d.socios?.length ? d.socios.map((s) => ({ nome: s.nome, cargo: s.cargo, assina: /administrador|s[óo]cio-gerente|diretor|presidente|titular/i.test(s.cargo) ? 'SIM' : 'NAO' })) : null,
    })
  }

  // Empresa recém-cadastrada: busca os dados da Receita uma vez (só preenche o vazio).
  const autoLooked = useRef(false)
  useEffect(() => {
    if (loading || autoLooked.current || type !== 'PJ' || mode !== 'interno') return
    if (digits(initial.cnpj).length !== 14 || initial.dataFundacao || initial.cep) return
    const t = setTimeout(() => { autoLooked.current = true; void lookupCnpj('pj', String(initial.cnpj)) }, 0)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, type])

  const save = async () => {
    if (!dirty.length) { setMsg({ ok: true, text: 'Nada para salvar.' }); return }
    if (type === 'PJ' && dirty.includes('socios') && Array.isArray(draft.socios) && draft.socios.length) {
      const t = socioTotal(draft.socios)
      if (Math.abs(t - 100) > 0.01) { setErrors({ socios: `A soma das participações deve ser 100% (está ${t.toLocaleString('pt-BR')}%).` }); setMsg({ ok: false, text: 'Confira os sócios.' }); return }
    }
    setBusy(true); setMsg(null)
    const r = await endpoints.save(Object.fromEntries(dirty.map((k) => [k, draft[k] ?? null])))
    setBusy(false)
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {}); setMsg({ ok: false, text: r.error ?? 'Não foi possível salvar.' })
      const first = Object.keys(r.fieldErrors ?? {})[0]
      if (first) document.getElementById(`cad-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setErrors({})
    await load()
    setMsg({ ok: true, text: 'Dados salvos.' })
    onSaved?.()
  }

  if (loading) return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>
  if (loadError) return <p className="text-sm text-red-600" role="alert">{loadError}</p>

  const layout = type === 'PJ' ? PJ_LAYOUT : PF_LAYOUT
  const label = (k: string) => LABEL_OVERRIDE[type]?.[k] ?? FIELD_BY_KEY[k]?.label ?? k
  const isMissing = (k: string) => highlight && missing.some((m) => m.key === k)

  const control = (k: string) => {
    const kind = FIELD_INPUT[k] ?? 'text'
    const v = draft[k]
    const disabled = lockedSet.has(k)
    const err = errors[k]
    const c = `${cls} ${err ? 'border-red-400' : isMissing(k) ? 'border-amber-400' : ''}`
    const id = `cad-${k}`
    if (disabled && mode === 'cliente') return <input id={id} className={c} disabled value="Já informado" readOnly />
    switch (kind) {
      case 'cpf': return <input id={id} className={c} disabled={disabled} inputMode="numeric" placeholder="000.000.000-00" value={maskCPF(String(v ?? ''))} onChange={(e) => set(k, digits(e.target.value))} />
      case 'cnpj': {
        const which = k === 'cnpj' ? 'pj' : 'emp'
        return (
          <div className="relative">
            <input id={id} className={`${c} pr-9`} disabled={disabled} inputMode="numeric" placeholder="00.000.000/0000-00" value={maskCNPJ(String(v ?? ''))} onChange={(e) => { const d = digits(e.target.value); set(k, d); if (d.length === 14) lookupCnpj(which, d) }} />
            {endpoints.cnpj && <button type="button" onClick={() => lookupCnpj(which, String(v ?? ''))} disabled={digits(v).length !== 14 || looking === k} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:hover:bg-transparent" aria-label="Buscar dados do CNPJ" title="Buscar dados do CNPJ">{looking === k ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} aria-hidden />}</button>}
          </div>
        )
      }
      case 'cep': return (
        <div className="relative">
          <input id={id} className={`${c} pr-9`} disabled={disabled} inputMode="numeric" placeholder="00000-000" value={maskCEP(String(v ?? ''))} onChange={(e) => { const d = digits(e.target.value); set(k, d); if (d.length === 8) lookupCep(k === 'cep' ? 'res' : 'emp', d) }} />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">{looking === k ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} aria-hidden />}</span>
        </div>
      )
      case 'phone': return <input id={id} className={c} disabled={disabled} inputMode="tel" placeholder="(00) 00000-0000" value={maskPhone(String(v ?? ''))} onChange={(e) => set(k, digits(e.target.value))} />
      case 'email': return <input id={id} className={c} disabled={disabled} type="email" inputMode="email" autoComplete="off" placeholder="nome@exemplo.com" value={String(v ?? '')} onChange={(e) => set(k, e.target.value.trim())} />
      case 'date': return <input id={id} className={c} disabled={disabled} type="date" value={String(v ?? '').slice(0, 10)} onChange={(e) => set(k, e.target.value)} />
      case 'money': return <MoneyInput id={id} className={c} disabled={disabled} value={v == null || v === '' ? null : Number(v)} onChange={(n) => set(k, n)} />
      case 'percent': return <div className="relative"><input id={id} className={`${c} pr-8`} disabled={disabled} inputMode="decimal" value={v == null ? '' : String(v).replace('.', ',')} onChange={(e) => set(k, e.target.value.replace(/[^\d,]/g, '').slice(0, 6))} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span></div>
      case 'int': return <input id={id} className={c} disabled={disabled} inputMode="numeric" value={v == null ? '' : String(v)} onChange={(e) => { const d = digits(e.target.value).slice(0, 7); set(k, d === '' ? null : Number(d)) }} />
      case 'months': return <YearsMonths id={id} className={c} disabled={disabled} value={v == null || v === '' ? null : Number(v)} onChange={(n) => set(k, n)} />
      case 'uf': return <select id={id} className={c} disabled={disabled} value={String(v ?? '')} onChange={(e) => set(k, e.target.value)}><option value="">UF</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
      case 'select': return (
        <select id={id} className={c} disabled={disabled} value={String(v ?? '')} onChange={(e) => set(k, e.target.value)}>
          <option value="">Selecione</option>
          {(SELECT_OPTIONS[k] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
      case 'list': return disabled ? <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-500">Já informado</p> : <ListEditor field={k} value={Array.isArray(v) ? (v as Row[]) : []} onChange={(rows) => set(k, rows)} />
      default:
        if (k === 'nomePai') {
          const nd = v === PAI_ND
          return (
            <div className="space-y-1.5">
              <input id={id} className={c} disabled={disabled || nd} value={nd ? '' : String(v ?? '')} placeholder={nd ? 'Não declarado' : undefined} onChange={(e) => set(k, e.target.value)} />
              {!disabled && <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300" checked={nd} onChange={(e) => set(k, e.target.checked ? PAI_ND : '')} />Não declarado</label>}
            </div>
          )
        }
        return <input id={id} className={c} disabled={disabled} value={String(v ?? '')} placeholder={k === 'nacionalidade' ? 'Brasileira' : undefined} onChange={(e) => set(k, e.target.value)} />
    }
  }

  const total = required.size
  const done = total - missing.length
  return (
    <div className="space-y-5" ref={top}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
        <span className="text-gray-700">{missing.length ? <>Ficha completa: <b>{done}</b> de <b>{total}</b> obrigatórios</> : <span className="font-medium text-green-700">Ficha completa para envio aos bancos</span>}</span>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-gray-200"><div className={`h-full ${missing.length ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${total ? Math.round((done / total) * 100) : 100}%` }} /></div>
      </div>

      {layout.filter((s) => !s.show || s.show(draft)).map((s) => {
        const keys = s.keys.filter((k) => visible(k, draft))
        return (
          <section key={s.title}>
            <h3 className="mb-2 text-sm font-semibold text-brand-700">{s.title}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {keys.map((k) => {
                const kind = FIELD_INPUT[k]
                const span = kind === 'list' ? 'sm:col-span-2 lg:col-span-3' : s.wide?.includes(k) ? 'sm:col-span-2' : ''
                return (
                  <div key={k} className={span}>
                    <FieldLabel htmlFor={`cad-${k}`} required={required.has(k)} helpText={k === 'pep' ? 'Quem exerce ou exerceu, nos últimos 5 anos, cargo público relevante (ou é parente próximo de quem exerce).' : undefined}>{label(k)}</FieldLabel>
                    {control(k)}
                    {errors[k] && <p className="mt-0.5 text-xs text-red-600">{errors[k]}</p>}
                    {k === 'socios' && Array.isArray(draft.socios) && draft.socios.length > 0 && !lockedSet.has(k) && <SociosTotal rows={draft.socios as Row[]} />}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-white/95 px-1 py-3 backdrop-blur">
        {msg && <p className={`mr-auto text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        <button type="button" onClick={save} disabled={busy || !dirty.length} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? 'Salvando…' : mode === 'cliente' ? 'Enviar dados' : 'Salvar cadastro'}
        </button>
      </div>
    </div>
  )
}

export function YearsMonths({ id, className, value, onChange, disabled }: { id: string; className: string; value: number | null; onChange: (n: number | null) => void; disabled?: boolean }) {
  const y = value == null ? '' : String(Math.floor(value / 12))
  const m = value == null ? '' : String(value % 12)
  const upd = (ny: string, nm: string) => { if (ny === '' && nm === '') { onChange(null); return } onChange(Math.min(99, Number(ny || 0)) * 12 + Math.min(11, Number(nm || 0))) }
  return (
    <div className="flex gap-2">
      <div className="relative flex-1"><input id={id} className={`${className} pr-12`} disabled={disabled} inputMode="numeric" value={y} onChange={(e) => upd(e.target.value.replace(/\D/g, '').slice(0, 2), m)} aria-label="Anos" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">anos</span></div>
      <div className="relative flex-1"><input className={`${className} pr-14`} disabled={disabled} inputMode="numeric" value={m} onChange={(e) => upd(y, e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="Meses" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">meses</span></div>
    </div>
  )
}

function SociosTotal({ rows }: { rows: Row[] }) {
  const t = socioTotal(rows)
  const ok = Math.abs(t - 100) <= 0.01
  return <p className={`mt-1 text-xs font-medium ${ok ? 'text-green-700' : 'text-amber-700'}`}>Total das participações: {t.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%{ok ? '' : ' (deve somar 100%)'}</p>
}

const EMPTY_ROW: Record<string, Row> = { socios: { assina: 'NAO', avalista: 'NAO' } }

export function ListEditor({ field, value, onChange }: { field: string; value: Row[]; onChange: (rows: Row[]) => void }) {
  const shape = LIST_SHAPE[field] ?? [{ key: 'descricao', label: 'Descrição' }]
  const rows = value
  const upd = (i: number, k: string, v: unknown) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  const add = () => onChange([...rows, { ...(EMPTY_ROW[field] ?? {}) }])
  const del = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const ctl = (i: number, r: Row, col: (typeof shape)[number]) => {
    const v = r[col.key]
    const aria = `${col.label} ${i + 1}`
    switch (col.kind) {
      case 'doc': { const d = digits(v); return <input className={cls} inputMode="numeric" aria-label={aria} placeholder={col.label} value={d.length > 11 ? maskCNPJ(d) : maskCPF(d)} onChange={(e) => upd(i, col.key, digits(e.target.value).slice(0, 14))} /> }
      case 'phone': return <input className={cls} inputMode="tel" aria-label={aria} placeholder={col.label} value={maskPhone(String(v ?? ''))} onChange={(e) => upd(i, col.key, digits(e.target.value))} />
      case 'money': return <MoneyInput className={cls} aria-label={aria} value={v == null || v === '' ? null : Number(v)} onChange={(n) => upd(i, col.key, n)} />
      case 'percent': return <div className="relative"><input className={`${cls} pr-8`} inputMode="decimal" aria-label={aria} placeholder={col.label} value={v == null ? '' : String(v).replace('.', ',')} onChange={(e) => upd(i, col.key, e.target.value.replace(/[^\d,]/g, '').slice(0, 6))} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span></div>
      case 'date': return <input className={cls} type="date" aria-label={aria} value={String(v ?? '').slice(0, 10)} onChange={(e) => upd(i, col.key, e.target.value)} />
      case 'email': return <input className={cls} type="email" aria-label={aria} placeholder={col.label} value={String(v ?? '')} onChange={(e) => upd(i, col.key, e.target.value.trim())} />
      case 'yesno': return <label className="flex h-full items-center gap-2 py-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={v === 'SIM'} onChange={(e) => upd(i, col.key, e.target.checked ? 'SIM' : 'NAO')} />{col.label}</label>
      case 'select': return <select className={cls} aria-label={aria} value={String(v ?? '')} onChange={(e) => upd(i, col.key, e.target.value)}><option value="">{col.label}</option>{col.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      default: return <input className={cls} aria-label={aria} placeholder={col.label} value={String(v ?? '')} onChange={(e) => upd(i, col.key, e.target.value)} />
    }
  }
  const singular: Record<string, string> = { socios: 'sócio', referencias: 'referência', outrasRendas: 'renda', patrimonio: 'bem', referenciasBancarias: 'referência bancária', referenciasComerciais: 'referência comercial' }
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {shape.map((col) => (
              <div key={col.key} className={col.wide ? 'sm:col-span-2' : ''}>
                {col.kind !== 'yesno' && <span className="mb-0.5 block text-[11px] text-gray-500">{col.label}</span>}
                {ctl(i, r, col)}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end"><button type="button" onClick={() => del(i)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"><Trash2 size={13} />Remover</button></div>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"><Plus size={14} />Adicionar {singular[field] ?? 'item'}</button>
    </div>
  )
}

// ── Conexões ─────────────────────────────────────────────────────────────────

async function getJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { credentials: 'include', ...init })
    const json = await res.json().catch(() => null)
    return { ok: res.ok && json?.success !== false, json }
  } catch { return { ok: false, json: null } }
}

/** Painel da loja: ficha do proponente. CPF/CNPJ/e-mail gravados: só o MASTER troca. */
export function internalEndpoints(proponentId: string, role: string | null | undefined): CadastroEndpoints {
  const base = `/api/financing/proponents/${proponentId}/fields`
  return {
    load: async () => {
      const r = await getJson(`${base}?all=1`)
      if (!r.ok) return { ok: false, error: r.json?.error ?? 'Não foi possível carregar.' }
      const values = (r.json?.data?.values ?? {}) as Values
      const locked = role === 'MASTER' ? [] : ['cpf', 'cnpj', 'email'].filter((k) => isFilled(k, values[k]))
      return { ok: true, personType: r.json?.data?.personType === 'PJ' ? 'PJ' : 'PF', values, locked }
    },
    save: async (fields) => {
      const r = await getJson(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })
      return r.ok ? { ok: true } : { ok: false, error: r.json?.error ?? 'Não foi possível salvar.', fieldErrors: r.json?.fieldErrors }
    },
    cep: async (cep) => { const r = await getJson(`/api/address/lookup-by-cep?cep=${cep}`); return r.json && (r.json.logradouro || r.json.cidade) ? r.json : null },
    cnpj: async (cnpj) => { const r = await getJson(`/api/companies/lookup?cnpj=${cnpj}`); return r.json?.found ? r.json : null },
  }
}

/** Link seguro do cliente: só completa o que está vazio. */
export function portalEndpoints(token: string): CadastroEndpoints {
  const base = `/api/site/fi-portal/${encodeURIComponent(token)}/dados`
  return {
    load: async () => {
      const r = await getJson(base, { cache: 'no-store' })
      if (!r.ok) return { ok: false, error: r.json?.error ?? 'Não foi possível carregar.' }
      return { ok: true, personType: r.json?.data?.personType === 'PJ' ? 'PJ' : 'PF', values: r.json?.data?.values ?? {}, locked: r.json?.data?.filled ?? [] }
    },
    save: async (fields) => {
      const r = await getJson(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })
      return r.ok ? { ok: true } : { ok: false, error: r.json?.error ?? 'Não foi possível salvar.', fieldErrors: r.json?.fieldErrors }
    },
    cep: async (cep) => { const r = await getJson(`${base}?cep=${cep}`); return r.ok ? r.json?.data ?? null : null },
    cnpj: async (cnpj) => { const r = await getJson(`${base}?cnpj=${cnpj}`); return r.ok ? r.json?.data ?? null : null },
  }
}
