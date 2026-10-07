'use client'

// Depois da aprovação: formalização → contrato/assinatura → gravame → pagamento
// do banco. Mostra só a situação de cada etapa; as mudanças ficam no painel
// lateral e oferecem apenas os próximos passos válidos (o servidor confere).

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { ProposalView } from '@/lib/finance/fi/read-model'
import { HelpHint } from '@/components/ui/help-hint'
import { FieldLabel } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { Alert, api, brlOrDash, btnPrimary, btnSecondary, dateBR, Drawer, inputClass, StatusBadge } from './ui'

const NEXT: Record<'formalization' | 'lien' | 'funding', Record<string, { to: string; label: string }[]>> = {
  formalization: {
    NAO_INICIADA: [{ to: 'EM_ANDAMENTO', label: 'Iniciar formalização' }, { to: 'AGUARDANDO_DOCUMENTOS', label: 'Aguardando documentos' }, { to: 'AGUARDANDO_ASSINATURA', label: 'Contrato pronto — aguardando assinatura' }],
    EM_ANDAMENTO: [{ to: 'AGUARDANDO_DOCUMENTOS', label: 'Aguardando documentos' }, { to: 'AGUARDANDO_ASSINATURA', label: 'Aguardando assinatura' }, { to: 'ASSINADA', label: 'Contrato assinado' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }],
    AGUARDANDO_DOCUMENTOS: [{ to: 'EM_ANDAMENTO', label: 'Documentos recebidos' }, { to: 'AGUARDANDO_ASSINATURA', label: 'Aguardando assinatura' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }],
    AGUARDANDO_ASSINATURA: [{ to: 'ASSINADA', label: 'Contrato assinado' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }, { to: 'EM_ANDAMENTO', label: 'Voltar para em andamento' }],
    ASSINADA: [{ to: 'CONCLUIDA', label: 'Concluir formalização' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }],
    CONCLUIDA: [{ to: 'COM_PENDENCIA', label: 'Registrar pendência' }],
    COM_PENDENCIA: [{ to: 'EM_ANDAMENTO', label: 'Pendência resolvida' }, { to: 'AGUARDANDO_ASSINATURA', label: 'Aguardando assinatura' }, { to: 'ASSINADA', label: 'Contrato assinado' }],
  },
  lien: {
    NAO_INICIADO: [{ to: 'SOLICITADO', label: 'Gravame solicitado' }, { to: 'REGISTRADO', label: 'Gravame registrado' }],
    SOLICITADO: [{ to: 'REGISTRADO', label: 'Gravame registrado' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }],
    COM_PENDENCIA: [{ to: 'SOLICITADO', label: 'Solicitar de novo' }, { to: 'REGISTRADO', label: 'Gravame registrado' }],
    REGISTRADO: [{ to: 'BAIXADO', label: 'Gravame baixado' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }],
    BAIXADO: [],
  },
  funding: {
    NAO_ESPERADO: [{ to: 'AGUARDANDO', label: 'Aguardando pagamento' }],
    AGUARDANDO: [{ to: 'ENVIADO_PAGAMENTO', label: 'Banco enviou para pagamento' }, { to: 'PAGO', label: 'Banco pagou' }, { to: 'PAGO_PARCIAL', label: 'Banco pagou parte' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }, { to: 'BLOQUEADO', label: 'Pagamento bloqueado' }],
    ENVIADO_PAGAMENTO: [{ to: 'PAGO', label: 'Banco pagou' }, { to: 'PAGO_PARCIAL', label: 'Banco pagou parte' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }, { to: 'BLOQUEADO', label: 'Pagamento bloqueado' }],
    COM_PENDENCIA: [{ to: 'AGUARDANDO', label: 'Pendência resolvida' }, { to: 'ENVIADO_PAGAMENTO', label: 'Banco enviou para pagamento' }, { to: 'PAGO', label: 'Banco pagou' }],
    BLOQUEADO: [{ to: 'AGUARDANDO', label: 'Desbloqueado' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }],
    PAGO_PARCIAL: [{ to: 'PAGO', label: 'Banco pagou o restante' }, { to: 'COM_PENDENCIA', label: 'Registrar pendência' }],
    PAGO: [],
  },
}

const TITLES = { formalization: 'Formalização', lien: 'Gravame', funding: 'Pagamento do banco' } as const
const HINT = { formalization: 'FORMALIZACAO', lien: 'GRAVAME', funding: 'PAGAMENTO_BANCO' } as const

export function PostApproval({ view, canFormalize, onChanged }: { view: ProposalView; canFormalize: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState<null | 'formalization' | 'lien' | 'funding'>(null)
  const pa = view.postApproval
  const steps = [
    { kind: 'formalization' as const, meta: pa.formalization.meta, extra: pa.contractNumber ? `Contrato ${pa.contractNumber}` : null },
    { kind: 'lien' as const, meta: pa.lien.meta, extra: pa.lien.registeredAt ? `Registrado em ${dateBR(pa.lien.registeredAt)}` : null },
    { kind: 'funding' as const, meta: pa.funding.meta, extra: pa.funding.paidAt ? `${brlOrDash(pa.funding.amount)} em ${dateBR(pa.funding.paidAt)}` : pa.funding.waitingDays != null ? `Aguardando há ${pa.funding.waitingDays} dia${pa.funding.waitingDays === 1 ? '' : 's'}` : null },
  ]
  return (
    <>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.kind} className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 px-3 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs text-gray-500">{i + 1}. {TITLES[s.kind]}<HelpHint term={HINT[s.kind]} size={11} /></p>
              <div className="mt-1"><StatusBadge meta={s.meta} size="md" /></div>
              {s.extra && <p className="mt-1 text-xs text-gray-500">{s.extra}</p>}
            </div>
            {canFormalize && NEXT[s.kind][(s.kind === 'formalization' ? pa.formalization.status : s.kind === 'lien' ? pa.lien.status : pa.funding.status)]?.length > 0 && (
              <button className="shrink-0 text-xs font-medium text-brand-700 hover:underline" onClick={() => setOpen(s.kind)}>Atualizar</button>
            )}
          </li>
        ))}
      </ol>
      {open && <StepDrawer view={view} kind={open} onClose={() => setOpen(null)} onDone={onChanged} />}
    </>
  )
}

function StepDrawer({ view, kind, onClose, onDone }: { view: ProposalView; kind: 'formalization' | 'lien' | 'funding'; onClose: () => void; onDone: () => void }) {
  const current = kind === 'formalization' ? view.postApproval.formalization.status : kind === 'lien' ? view.postApproval.lien.status : view.postApproval.funding.status
  const options = NEXT[kind][current] ?? []
  const [to, setTo] = useState(options[0]?.to ?? '')
  const [contractNumber, setContractNumber] = useState(view.postApproval.contractNumber ?? '')
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState<number | null>(view.postApproval.approvedValue)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const paid = kind === 'funding' && (to === 'PAGO' || to === 'PAGO_PARCIAL')

  const save = async () => {
    setBusy(true); setError(null)
    const r = await api(`/api/financing/proposals/${view.id}/post-approval`, { method: 'POST', body: { kind, to, contractNumber: contractNumber || null, date: date || null, amount: paid ? amount : null, note: note || null } })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone(); onClose()
  }

  return (
    <Drawer title={TITLES[kind]} onClose={onClose} footer={<><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} onClick={save} disabled={busy || !to}><ArrowRight size={15} />{busy ? 'Salvando…' : 'Confirmar'}</button></>}>
      <div className="space-y-4">
        <div className="space-y-2" role="radiogroup" aria-label="Próximo passo">
          {options.map((o) => (
            <label key={o.to} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${to === o.to ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}>
              <input type="radio" name="step" checked={to === o.to} onChange={() => setTo(o.to)} />{o.label}
            </label>
          ))}
        </div>
        {kind === 'formalization' && <div><FieldLabel>Número do contrato</FieldLabel><input className={inputClass} value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} /></div>}
        {(to === 'ASSINADA' || to === 'REGISTRADO' || paid || to === 'AGUARDANDO' || to === 'ENVIADO_PAGAMENTO') && (
          <div><FieldLabel>{paid ? 'Data do pagamento' : to === 'AGUARDANDO' ? 'Previsão de pagamento' : 'Data'}</FieldLabel><input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        )}
        {paid && <div><FieldLabel required>Valor pago pelo banco</FieldLabel><MoneyInput className={inputClass} value={amount} onChange={setAmount} /></div>}
        {paid && !view.deal && <Alert tone="warning">Vincule a ficha a uma negociação: o recebimento entra no financeiro pela negociação.</Alert>}
        <div><FieldLabel>Observação</FieldLabel><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Drawer>
  )
}
