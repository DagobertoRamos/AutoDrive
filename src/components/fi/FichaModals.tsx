'use client'

// Ações da ficha em modais curtos. Cada envio leva uma chave de idempotência
// gerada ao abrir o modal: duplo clique / reenvio da mesma tela não duplica.

import { useMemo, useState } from 'react'
import { Copy, MessageCircle, Plus, Send } from 'lucide-react'
import type { ProposalView } from '@/lib/finance/fi/read-model'
import { FieldLabel } from '@/components/ui/field'
import { HelpHint } from '@/components/ui/help-hint'
import { MoneyInput } from '@/components/ui/money-input'
import { Alert, api, brlOrDash, btnDanger, btnPrimary, btnSecondary, inputClass, Modal, newIdempotencyKey, StatusBadge } from './ui'
import { FieldsForm } from './FieldsForm'
import { PersonPicker } from './NewProposalModal'

type View = ProposalView
const TERMS = [12, 18, 24, 36, 48, 60, 72]

// ── Enviar aos bancos ─────────────────────────────────────────────────────────
export function SendModal({ view, onClose, onDone }: { view: View; onClose: () => void; onDone: () => void }) {
  const sentBanks = new Set(view.banks.filter((b) => b.current.active && !['RECUSADA', 'FALHA_ENVIO', 'CANCELADA', 'EXPIRADA', 'SUBSTITUIDA'].includes(b.current.status)).map((b) => b.bankId))
  const available = view.connections.filter((c) => !sentBanks.has(c.bankId))
  const [selected, setSelected] = useState<string[]>([])
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState(newIdempotencyKey)

  const missing = useMemo(() => {
    const byBank = view.missing.byBank.filter((b) => selected.includes(b.bankId))
    const all = new Map<string, { key: string; label: string; group: string }>()
    for (const f of view.missing.common) all.set(f.key, f)
    for (const b of byBank) for (const f of b.fields) all.set(f.key, f)
    return { fields: [...all.values()], byBank }
  }, [selected, view.missing])

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const send = async () => {
    if (!selected.length) { setError('Escolha pelo menos um banco.'); return }
    if (!consent) { setError('Confirme a autorização do cliente.'); return }
    setBusy(true); setError(null)
    const r = await api(`/api/financing/proposals/${view.id}/send`, { method: 'POST', body: { bankIds: selected, idempotencyKey: key, consent, revision: view.revision } })
    setBusy(false)
    if (!r.ok) { setError(r.error); if (r.json?.code === 'REVISAO') onDone(); return }
    setKey(newIdempotencyKey())
    onDone(); onClose()
  }

  return (
    <Modal title="Enviar aos bancos" onClose={onClose} wide footer={<><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} onClick={send} disabled={busy || missing.fields.length > 0 || !selected.length}><Send size={15} />{busy ? 'Enviando…' : 'Enviar proposta'}</button></>}>
      <div className="space-y-4">
        {available.length === 0 ? <p className="text-sm text-gray-600">Todos os bancos ativos já receberam esta ficha. Para mudar as condições, use “Ajustar proposta”.</p> : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {available.map((c) => (
              <li key={c.bankId}>
                <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={selected.includes(c.bankId)} onChange={() => toggle(c.bankId)} /><span className="font-medium text-gray-900">{c.bankName}</span></span>
                  <span className="flex items-center gap-1"><StatusBadge meta={{ label: c.label, tone: c.tone === 'success' ? 'success' : c.tone === 'danger' ? 'danger' : c.tone === 'warning' ? 'warning' : 'neutral' }} />{c.state === 'NAO_INTEGRADO' && <HelpHint term="BANCO_NAO_INTEGRADO" size={12} />}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {missing.fields.length > 0 && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            {missing.byBank.filter((b) => b.fields.length || view.missing.common.length).map((b) => <p key={b.bankId} className="text-sm font-medium text-amber-900">{b.message}</p>)}
            {selected.length === 0 && <p className="text-sm font-medium text-amber-900">Complete a ficha para enviar.</p>}
            <FieldsForm proponentId={view.customer.proponentId} fields={missing.fields} onSaved={onDone} submitLabel="Salvar e continuar" />
          </div>
        )}
        <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={consent} onChange={(e) => setConsent(e.target.checked)} />O cliente autorizou o envio dos dados aos bancos escolhidos para análise de crédito.</label>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Registrar a resposta do banco ─────────────────────────────────────────────
const RESP_OPTIONS = [
  { value: 'EM_ANALISE', label: 'Em análise' }, { value: 'PENDENTE', label: 'Pediu documentos / informações' },
  { value: 'PRE_APROVADA', label: 'Pré-aprovada' }, { value: 'APROVADA', label: 'Aprovada' },
  { value: 'RECUSADA', label: 'Recusada' }, { value: 'EXPIRADA', label: 'Expirada' }, { value: 'CANCELADA', label: 'Cancelada' },
]

export function RespondModal({ view, attemptId, onClose, onDone, canSeeReturn }: { view: View; attemptId: string; onClose: () => void; onDone: () => void; canSeeReturn: boolean }) {
  const bank = view.banks.find((b) => b.current.id === attemptId)
  const [status, setStatus] = useState('APROVADA')
  const [f, setF] = useState<{ approvedAmount: number | null; downPayment: number | null; installments: number; installmentValue: number | null; rateMonthly: string; cetMonthly: string; cetYearly: string; tacValue: number | null; totalAmount: number | null; expiresAt: string; reason: string; externalId: string; docs: string; returnPercent: string }>({
    approvedAmount: view.terms.amount, downPayment: view.terms.downPayment, installments: view.terms.installments ?? 48, installmentValue: null,
    rateMonthly: '', cetMonthly: '', cetYearly: '', tacValue: null, totalAmount: null, expiresAt: '', reason: '', externalId: '', docs: '', returnPercent: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const withOffer = ['APROVADA', 'PRE_APROVADA', 'PENDENTE'].includes(status)
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

  const save = async () => {
    if (status === 'APROVADA' && !f.installmentValue) { setError('Informe o valor da parcela aprovada.'); return }
    if (status === 'PENDENTE' && !f.docs.trim()) { setError('Informe o que o banco pediu.'); return }
    setBusy(true); setError(null)
    const body = {
      action: 'RESPOSTA', status, reason: f.reason.trim() || null, externalId: f.externalId.trim() || null,
      offer: withOffer ? { approvedAmount: f.approvedAmount, downPayment: f.downPayment, installments: f.installments, installmentValue: f.installmentValue, rateMonthly: num(f.rateMonthly), cetMonthly: num(f.cetMonthly), cetYearly: num(f.cetYearly), tacValue: f.tacValue, totalAmount: f.totalAmount, expiresAt: f.expiresAt || null } : null,
      pendingItems: status === 'PENDENTE' ? f.docs.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 15).map((label) => ({ key: label.toUpperCase().replace(/\W+/g, '_').slice(0, 60), label, kind: 'DOCUMENTO' })) : undefined,
      ...(canSeeReturn && f.returnPercent.trim() ? { returnPercent: num(f.returnPercent) } : {}),
    }
    const r = await api(`/api/financing/submissions/${attemptId}`, { method: 'POST', body })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone(); onClose()
  }

  return (
    <Modal title={`Resposta do ${bank?.bankName ?? 'banco'}`} onClose={onClose} wide footer={<><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Registrar resposta'}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><FieldLabel required>O que o banco respondeu?</FieldLabel>
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>{RESP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </div>
        {withOffer && <>
          <div><FieldLabel helpTerm="VALOR_FINANCIADO">Valor aprovado</FieldLabel><MoneyInput className={inputClass} value={f.approvedAmount} onChange={(v) => setF({ ...f, approvedAmount: v })} /></div>
          <div><FieldLabel>Entrada</FieldLabel><MoneyInput className={inputClass} value={f.downPayment} onChange={(v) => setF({ ...f, downPayment: v })} /></div>
          <div><FieldLabel required={status === 'APROVADA'}>Parcelas</FieldLabel><select className={inputClass} value={f.installments} onChange={(e) => setF({ ...f, installments: Number(e.target.value) })}>{TERMS.map((t) => <option key={t} value={t}>{t}x</option>)}</select></div>
          <div><FieldLabel required={status === 'APROVADA'}>Valor da parcela</FieldLabel><MoneyInput className={inputClass} value={f.installmentValue} onChange={(v) => setF({ ...f, installmentValue: v })} /></div>
          <div><FieldLabel>Taxa ao mês (%)</FieldLabel><input className={inputClass} inputMode="decimal" value={f.rateMonthly} onChange={(e) => setF({ ...f, rateMonthly: e.target.value })} /></div>
          <div><FieldLabel helpTerm="CET">CET ao mês (%)</FieldLabel><input className={inputClass} inputMode="decimal" value={f.cetMonthly} onChange={(e) => setF({ ...f, cetMonthly: e.target.value })} /></div>
          <div><FieldLabel helpTerm="CET">CET ao ano (%)</FieldLabel><input className={inputClass} inputMode="decimal" value={f.cetYearly} onChange={(e) => setF({ ...f, cetYearly: e.target.value })} /></div>
          <div><FieldLabel helpTerm="TAC">TAC</FieldLabel><MoneyInput className={inputClass} value={f.tacValue} onChange={(v) => setF({ ...f, tacValue: v })} /></div>
          <div><FieldLabel>Total a pagar</FieldLabel><MoneyInput className={inputClass} value={f.totalAmount} onChange={(v) => setF({ ...f, totalAmount: v })} /></div>
          <div><FieldLabel>Aprovação válida até</FieldLabel><input type="date" className={inputClass} value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></div>
          {canSeeReturn && <div><FieldLabel helpTerm="RETORNO_PREVISTO">Retorno (%)</FieldLabel><input className={inputClass} inputMode="decimal" value={f.returnPercent} onChange={(e) => setF({ ...f, returnPercent: e.target.value })} /></div>}
        </>}
        {status === 'PENDENTE' && <div className="sm:col-span-2"><FieldLabel required>Documentos pedidos</FieldLabel><input className={inputClass} placeholder="Ex.: CNH, comprovante de renda" value={f.docs} onChange={(e) => setF({ ...f, docs: e.target.value })} /></div>}
        {(status === 'RECUSADA' || status === 'CANCELADA') && <div className="sm:col-span-2"><FieldLabel>Motivo informado</FieldLabel><input className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>}
        <div className="sm:col-span-2"><FieldLabel>Número da proposta no banco</FieldLabel><input className={inputClass} value={f.externalId} onChange={(e) => setF({ ...f, externalId: e.target.value })} /></div>
        {error && <p className="text-sm text-red-600 sm:col-span-2" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Ajustar proposta (nova versão) ────────────────────────────────────────────
export function AdjustModal({ view, onClose, onDone }: { view: View; onClose: () => void; onDone: () => void }) {
  const [vehicleValue, setVehicleValue] = useState<number | null>(view.terms.vehicleValue)
  const [downPayment, setDownPayment] = useState<number | null>(view.terms.downPayment)
  const [installments, setInstallments] = useState<number>(view.terms.installments ?? 48)
  const [co, setCo] = useState<{ id: string; nomeCompleto: string; cpf: string | null } | null>(view.coBuyer ? { id: view.coBuyer.id, nomeCompleto: view.coBuyer.name, cpf: null } : null)
  const banksAvailable = view.banks.map((b) => ({ id: b.bankId, name: b.bankName }))
  const [bankIds, setBankIds] = useState<string[]>(banksAvailable.map((b) => b.id))
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [key] = useState(newIdempotencyKey)
  const financed = vehicleValue != null ? Math.max(0, vehicleValue - (downPayment ?? 0)) : null

  const save = async () => {
    if (!vehicleValue) { setError('Informe o valor do veículo.'); return }
    if (!bankIds.length) { setError('Escolha pelo menos um banco.'); return }
    if (!consent) { setError('Confirme a autorização do cliente.'); return }
    setBusy(true); setError(null)
    const r = await api(`/api/financing/proposals/${view.id}/adjust`, { method: 'POST', body: { idempotencyKey: key, bankIds, vehicleValue, downPayment: downPayment ?? 0, installments, coProponentId: co?.id ?? null, consent, revision: view.revision } })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone(); onClose()
  }

  return (
    <Modal title="Ajustar proposta" onClose={onClose} wide footer={<><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} onClick={save} disabled={busy}>{busy ? 'Enviando…' : 'Enviar nova versão'}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><FieldLabel required>Valor do veículo</FieldLabel><MoneyInput className={inputClass} value={vehicleValue} onChange={setVehicleValue} /></div>
        <div><FieldLabel>Entrada</FieldLabel><MoneyInput className={inputClass} value={downPayment} onChange={setDownPayment} /></div>
        <div><FieldLabel required>Parcelas</FieldLabel><select className={inputClass} value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>{TERMS.map((t) => <option key={t} value={t}>{t}x</option>)}</select></div>
        <div><FieldLabel helpTerm="VALOR_FINANCIADO">Valor financiado</FieldLabel><p className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm font-semibold">{brlOrDash(financed)}</p></div>
        <div className="sm:col-span-2"><FieldLabel helpTerm="CO_COMPRADOR">Co-comprador</FieldLabel><PersonPicker value={co} onChange={setCo} exclude={view.customer.proponentId} label="Buscar co-comprador" /></div>
        <div className="sm:col-span-2"><FieldLabel required>Bancos</FieldLabel>
          <div className="flex flex-wrap gap-2">{banksAvailable.map((b) => (
            <label key={b.id} className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={bankIds.includes(b.id)} onChange={() => setBankIds((s) => s.includes(b.id) ? s.filter((x) => x !== b.id) : [...s, b.id])} />{b.name}</label>
          ))}</div>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700 sm:col-span-2"><input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={consent} onChange={(e) => setConsent(e.target.checked)} />O cliente autorizou o envio dos dados aos bancos escolhidos para análise de crédito.</label>
        {error && <p className="text-sm text-red-600 sm:col-span-2" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Solicitar ao cliente (link seguro) ────────────────────────────────────────
export function PortalModal({ view, onClose, onDone }: { view: View; onClose: () => void; onDone: () => void }) {
  const pending = view.documents.filter((d) => d.status === 'PENDENTE' || d.status === 'REPROVADO')
  const [newDoc, setNewDoc] = useState('')
  const [link, setLink] = useState<{ url: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null)

  const addDoc = async () => {
    if (newDoc.trim().length < 2) return
    const r = await api(`/api/financing/proposals/${view.id}/documents`, { method: 'POST', body: { type: newDoc.trim(), required: true } })
    if (!r.ok) { setInfo({ tone: 'danger', text: r.error ?? 'Erro.' }); return }
    setNewDoc(''); onDone()
  }
  const generate = async (channel: 'COPIAR' | 'WHATSAPP') => {
    setBusy(true); setInfo(null)
    const r = await api<{ url: string; message: string; sent: { ok: boolean; error?: string } | null }>(`/api/financing/proposals/${view.id}/portal-link`, { method: 'POST', body: { channel } })
    setBusy(false)
    if (!r.ok || !r.data) { setInfo({ tone: 'danger', text: r.error ?? 'Erro.' }); return }
    setLink({ url: r.data.url, message: r.data.message })
    if (channel === 'WHATSAPP') setInfo(r.data.sent?.ok ? { tone: 'success', text: 'Enviado pelo WhatsApp da loja.' } : { tone: 'danger', text: r.data.sent?.error ?? 'Não enviado.' })
    else { await navigator.clipboard?.writeText(r.data.message).catch(() => {}); setInfo({ tone: 'success', text: 'Mensagem com o link copiada.' }) }
    onDone()
  }
  const phone = (view.customer.phone ?? '').replace(/\D/g, '')

  return (
    <Modal title="Solicitar ao cliente" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-900">{pending.length ? 'Documentos que o cliente vai enviar' : 'Nenhum documento pendente.'}</p>
          {pending.length > 0 && <ul className="mb-2 space-y-1 text-sm text-gray-700">{pending.map((d) => <li key={d.id}>• {d.type}{d.bankName ? <span className="text-gray-500"> — pedido do {d.bankName}</span> : null}</li>)}</ul>}
          <div className="flex gap-2"><input className={inputClass} placeholder="Pedir outro documento (ex.: comprovante de residência)" value={newDoc} onChange={(e) => setNewDoc(e.target.value)} /><button className={btnSecondary} onClick={addDoc} aria-label="Adicionar documento"><Plus size={15} /></button></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={busy} onClick={() => generate('WHATSAPP')}><MessageCircle size={15} />Enviar pelo WhatsApp da loja</button>
          <button className={btnSecondary} disabled={busy} onClick={() => generate('COPIAR')}><Copy size={15} />Copiar link</button>
        </div>
        {info && <Alert tone={info.tone}>{info.text}</Alert>}
        {link && (
          <div className="space-y-2">
            <p className="break-all rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{link.url}</p>
            {phone.length >= 10 && <a className="text-sm font-medium text-brand-700 hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}?text=${encodeURIComponent(link.message)}`}>Abrir no meu WhatsApp</a>}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Cancelar ficha ────────────────────────────────────────────────────────────
export function CancelModal({ view, onClose, onDone }: { view: View; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (reason.trim().length < 3) { setError('Informe o motivo.'); return }
    setBusy(true); setError(null)
    const r = await api(`/api/financing/proposals/${view.id}/cancel`, { method: 'POST', body: { reason } })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone(); onClose()
  }
  return (
    <Modal title="Cancelar ficha" onClose={onClose} footer={<><button className={btnSecondary} onClick={onClose}>Voltar</button><button className={btnDanger} onClick={save} disabled={busy}>{busy ? 'Cancelando…' : 'Cancelar ficha'}</button></>}>
      <FieldLabel required>Motivo</FieldLabel>
      <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    </Modal>
  )
}
