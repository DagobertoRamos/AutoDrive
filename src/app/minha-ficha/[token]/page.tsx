'use client'

// =============================================================================
// Portal do cliente (link seguro do F&I) — situação, documentos e contrato.
// Simples e pensado para celular. Sem login: o link é a chave e expira.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Circle, FileText, HelpCircle, Upload } from 'lucide-react'

interface Doc { id: string; type: string; status: string; label: string; canUpload: boolean }
interface View {
  store: string; code: string | null; customerFirstName: string; vehicle: string | null; headline: string; detail: string | null
  step: string; documents: Doc[]; expiresAt: string | null
  offer: null | { bank: string; amount: number | null; downPayment: number | null; installments: number | null; installmentValue: number | null; rateMonthly: number | null; cetMonthly: number | null; cetYearly: number | null; total: number | null }
}

const brl = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)
const STEPS = ['ANALISE', 'APROVADO', 'CONTRATO', 'CONCLUIDO']
const STEP_LABEL: Record<string, string> = { ANALISE: 'Análise', APROVADO: 'Aprovação', CONTRATO: 'Contrato', CONCLUIDO: 'Concluído' }

export default function MinhaFichaPage() {
  const { token } = useParams<{ token: string }>()
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/site/fi-portal/${encodeURIComponent(token)}`, { cache: 'no-store' })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) { setError(json?.error ?? 'Link inválido ou vencido.'); return }
    setView(json.data); setError(null)
  }, [token])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const upload = async (file: File) => {
    if (!target) return
    setUploading(target); setMsg(null)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch(`/api/site/fi-portal/${encodeURIComponent(token)}/documents/${target}`, { method: 'POST', body: fd })
    const json = await res.json().catch(() => null)
    setUploading(null); setTarget(null)
    if (!res.ok || !json?.success) { setMsg(json?.error ?? 'Não foi possível enviar.'); return }
    setMsg('Documento enviado. Obrigado!')
    load()
  }

  if (error) return <Shell><p className="rounded-xl bg-white p-6 text-center text-gray-700 shadow-sm">{error}</p></Shell>
  if (!view) return <Shell><div className="h-40 animate-pulse rounded-xl bg-white" /></Shell>

  // Passos concluídos: análise → aprovação → contrato → concluído.
  const idx = ({ PREPARANDO: -1, DOCUMENTOS: 0, ANALISE: 0, APROVADO: 1, ASSINATURA: 1, CONTRATO_ASSINADO: 2, CONCLUIDO: 3 } as Record<string, number>)[view.step] ?? -1
  return (
    <Shell store={view.store}>
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs text-gray-500">{view.code ? `Ficha ${view.code}` : 'Sua ficha'}{view.vehicle ? ` · ${view.vehicle}` : ''}</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">{view.customerFirstName ? `${view.customerFirstName}, ` : ''}{view.headline.charAt(0).toLowerCase() + view.headline.slice(1)}</h1>
        {view.detail && <p className="mt-1 text-sm text-gray-600">{view.detail}</p>}
        {view.step !== 'ENCERRADO' && (
          <ol className="mt-4 flex items-center gap-2 text-[11px] text-gray-500">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col items-center gap-1">
                {i <= idx ? <CheckCircle2 size={18} className="text-green-600" aria-hidden /> : <Circle size={18} className="text-gray-300" aria-hidden />}
                <span className={i <= idx ? 'font-medium text-gray-800' : ''}>{STEP_LABEL[s]}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {view.documents.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Documentos</h2>
          <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
          <ul className="mt-3 divide-y divide-gray-100">
            {view.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-2"><FileText size={18} className="shrink-0 text-gray-400" aria-hidden /><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{d.type}</p><p className="text-xs text-gray-500">{d.label}</p></div></div>
                {d.canUpload && <button className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={uploading === d.id} onClick={() => { setTarget(d.id); input.current?.click() }}><Upload size={14} />{uploading === d.id ? 'Enviando…' : 'Enviar'}</button>}
              </li>
            ))}
          </ul>
          {msg && <p className="mt-2 text-sm text-gray-700" role="status">{msg}</p>}
        </section>
      )}

      {view.offer && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Condições do financiamento</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Item label="Banco" value={view.offer.bank} />
            <Item label="Valor financiado" value={brl(view.offer.amount)} />
            <Item label="Entrada" value={brl(view.offer.downPayment)} />
            <Item label="Parcelas" value={view.offer.installmentValue ? `${view.offer.installments}x de ${brl(view.offer.installmentValue)}` : '—'} />
            <Item label="Taxa ao mês" value={pct(view.offer.rateMonthly)} />
            <Item label="CET ao mês" value={pct(view.offer.cetMonthly)} help="Custo Efetivo Total do financiamento, incluindo juros e demais encargos informados pelo banco." />
            <Item label="CET ao ano" value={pct(view.offer.cetYearly)} />
            <Item label="Total a pagar" value={brl(view.offer.total)} />
          </dl>
        </section>
      )}

      {view.step === 'PREPARANDO' && <Complement token={token} onDone={load} />}
      <p className="px-2 text-center text-[11px] text-gray-400">Este link é pessoal{view.expiresAt ? ` e vale até ${new Date(view.expiresAt).toLocaleDateString('pt-BR')}` : ''}. Não compartilhe.</p>
    </Shell>
  )
}

function Item({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div><dt className="flex items-center gap-1 text-xs text-gray-500">{label}{help && <span title={help} aria-label={help}><HelpCircle size={12} aria-hidden /></span>}</dt><dd className="font-semibold text-gray-900">{value}</dd></div>
  )
}

function Complement({ token, onDone }: { token: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    const body = Object.fromEntries(new FormData(e.currentTarget).entries())
    const res = await fetch(`/api/site/fi-portal/${encodeURIComponent(token)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok || !json?.success) { setMsg(json?.error ?? 'Não foi possível salvar.'); return }
    setMsg('Dados recebidos. Obrigado!'); onDone()
  }
  const cls = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm'
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Agilize sua análise</h2>
      <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs text-gray-600">Ocupação<select name="occupation" className={cls}><option value="">Selecione</option><option value="CLT">Assalariado (CLT)</option><option value="AUTONOMO">Autônomo</option><option value="EMPRESARIO">Empresário</option><option value="APOSENTADO_PENSIONISTA">Aposentado / pensionista</option></select></label>
        <label className="text-xs text-gray-600">Renda mensal<input name="renda" inputMode="decimal" className={cls} /></label>
        <label className="text-xs text-gray-600">Profissão<input name="profissao" className={cls} /></label>
        <label className="text-xs text-gray-600">CEP<input name="cep" inputMode="numeric" maxLength={9} className={cls} /></label>
        <label className="text-xs text-gray-600">UF<input name="estado" maxLength={2} className={cls} /></label>
        <label className="col-span-2 text-xs text-gray-600">Endereço<input name="logradouro" className={cls} /></label>
        <label className="text-xs text-gray-600">Número<input name="numero" className={cls} /></label>
        <label className="text-xs text-gray-600">Bairro<input name="bairro" className={cls} /></label>
        <label className="col-span-2 text-xs text-gray-600">Cidade<input name="cidade" className={cls} /></label>
        <button className="col-span-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>{busy ? 'Salvando…' : 'Enviar dados'}</button>
        {msg && <p className="col-span-2 text-sm text-gray-700" role="status">{msg}</p>}
      </form>
    </section>
  )
}

function Shell({ children, store }: { children: React.ReactNode; store?: string }) {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        {store && <p className="text-center text-sm font-semibold text-gray-700">{store}</p>}
        {children}
      </div>
    </main>
  )
}
