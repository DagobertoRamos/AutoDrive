'use client'

// =============================================================================
// Modais das ações de uma operação. Cada um faz UMA coisa, com poucos campos.
// O botão fica travado durante o envio (e o backend é idempotente).
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { Copy, MessageCircle, Upload } from 'lucide-react'
import { FieldLabel } from '@/components/ui/field'
import { STAGE_DONE_LABEL, nextStage, type TransferStage } from '@/lib/automotive/transfer-core'
import { btn, ErrorLine, input, Modal, postJson, Hint } from './ui'

export type OpAction =
  | { kind: 'renave.entry'; opId?: string; vehicleId?: string }
  | { kind: 'renave.exit'; opId: string }
  | { kind: 'renave.cancel'; opId: string; sale: boolean }
  | { kind: 'fiscal.issue'; opId: string; direction: 'IN' | 'OUT' }
  | { kind: 'fiscal.emit'; opId: string; onUseXml?: () => void }
  | { kind: 'transfer.advance'; opId: string; current: string; inspectionRequired: boolean }
  | { kind: 'transfer.instructions'; opId: string }
  | { kind: 'financing.lien'; opId: string }

const today = () => new Date().toISOString().slice(0, 10)

interface FiscalPreview {
  mode: 'API' | 'MANUAL'; providerName: string; missing: string[]; rulesConfirmed: boolean; reductionExpired: boolean
  summary: { nature: string; type: 'IN' | 'OUT'; cfop: string; ncm: string; amount: number; counterpart: { name: string; doc: string }; icms: { mode: 'CST'; value: number } | { mode: 'CSOSN' } }
}

export function OperationActionModal({ action, onClose, onDone }: { action: OpAction | null; onClose: () => void; onDone: (message?: string) => void }) {
  const [protocol, setProtocol] = useState('')
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [xml, setXml] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [instr, setInstr] = useState<{ text: string; phone: string | null } | null>(null)
  const [preview, setPreview] = useState<FiscalPreview | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setProtocol(''); setDate(today()); setNotes(''); setReason(''); setXml(null); setFileName(''); setError(null); setInstr(null); setBusy(false)
    setPreview(null)
    if (action?.kind === 'fiscal.emit') {
      postJson<FiscalPreview>(`/api/operations/${action.opId}`, { action: 'fiscal.preview' }).then((r) => { if (r.ok) setPreview(r.data); else setError(r.error) })
    }
    if (action?.kind === 'transfer.instructions') {
      postJson<{ text: string; phone: string | null }>(`/api/operations/${action.opId}`, { action: 'transfer.instructions' }).then((r) => {
        if (r.ok) setInstr(r.data); else setError(r.error)
      })
    }
  }, [action])

  if (!action) return null

  const run = async (url: string, body: unknown, done?: string) => {
    setBusy(true); setError(null)
    const r = await postJson(url, body)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone(done)
  }

  const manual = { protocol, date, notes }
  const cancel = <button className={btn.secondary} onClick={onClose} disabled={busy}>Cancelar</button>

  if (action.kind === 'renave.entry' || action.kind === 'renave.exit') {
    const entry = action.kind === 'renave.entry'
    const url = entry && !action.opId ? `/api/vehicles/${action.vehicleId}/operations` : `/api/operations/${action.opId}`
    return (
      <Modal open title={<span className="inline-flex items-center gap-1.5">{entry ? 'Registrar entrada no RENAVE' : 'Registrar saída no RENAVE'}<Hint term="RENAVE" /></span>} onClose={onClose}
        footer={<>{cancel}<button className={btn.primary} disabled={busy || !protocol.trim()} onClick={() => run(url, { action: entry ? 'renave.entry' : 'renave.exit', manual }, entry ? 'Entrada registrada.' : 'Saída registrada.')}>{busy ? 'Registrando…' : 'Registrar'}</button></>}>
        <div>
          <FieldLabel required helpText="Número do comprovante gerado no portal oficial. Fica guardado na operação.">Protocolo</FieldLabel>
          <input className={input} value={protocol} onChange={(e) => setProtocol(e.target.value)} autoFocus />
        </div>
        <div>
          <FieldLabel>Data</FieldLabel>
          <input type="date" className={input} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <ErrorLine text={error} />
      </Modal>
    )
  }

  if (action.kind === 'renave.cancel') {
    return (
      <Modal open title={action.sale ? 'Cancelar saída no RENAVE' : 'Cancelar entrada no RENAVE'} onClose={onClose}
        footer={<>{cancel}<button className={btn.danger} disabled={busy || reason.trim().length < 5} onClick={() => run(`/api/operations/${action.opId}`, { action: 'renave.cancel', reason, manual }, 'Cancelamento registrado.')}>{busy ? 'Enviando…' : 'Cancelar registro'}</button></>}>
        <div>
          <FieldLabel required>Motivo</FieldLabel>
          <textarea className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Protocolo do cancelamento</FieldLabel>
          <input className={input} value={protocol} onChange={(e) => setProtocol(e.target.value)} />
        </div>
        <ErrorLine text={error} />
      </Modal>
    )
  }

  if (action.kind === 'fiscal.issue') {
    const onFile = async (f: File | null) => {
      setError(null)
      if (!f) return
      if (f.size > 1_000_000) { setError('Arquivo grande demais para um XML de NF-e.'); return }
      setFileName(f.name)
      setXml(await f.text())
    }
    return (
      <Modal open title={<span className="inline-flex items-center gap-1.5">{action.direction === 'OUT' ? 'NF-e de saída' : 'NF-e de entrada'}<Hint term="NFE_XML" /></span>} onClose={onClose}
        footer={<>{cancel}<button className={btn.primary} disabled={busy || !xml} onClick={() => run(`/api/operations/${action.opId}`, { action: 'fiscal.attach', xml }, 'NF-e vinculada.')}>{busy ? 'Conferindo…' : 'Vincular nota'}</button></>}>
        <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 hover:border-brand-400 hover:bg-brand-50/40">
          <Upload className="h-5 w-5 text-gray-400" />
          {fileName || 'Selecionar XML autorizado'}
        </button>
        <ErrorLine text={error} />
      </Modal>
    )
  }

  if (action.kind === 'fiscal.emit') {
    const p = preview
    const blocked = !p || p.missing.length > 0
    const icms = p?.summary.icms
    return (
      <Modal open title={<span className="inline-flex items-center gap-1.5">Emitir NF-e<Hint term="NFE_OPERACAO" /></span>} onClose={onClose}
        footer={<>{action.onUseXml && <button className={btn.link} onClick={() => { onClose(); action.onUseXml?.() }}>Enviar XML</button>}<span className="flex-1" />{cancel}<button className={btn.primary} disabled={busy || blocked} onClick={() => run(`/api/operations/${action.opId}`, { action: 'fiscal.emit' }, 'NF-e enviada ao emissor.')}>{busy ? 'Enviando…' : 'Emitir'}</button></>}>
        {!p && !error && <p className="text-sm text-gray-500">Montando a nota…</p>}
        {p && (
          <>
            <dl className="divide-y divide-gray-100 text-sm">
              <div className="flex justify-between py-1.5"><dt className="text-gray-500">Emissor</dt><dd className="font-medium">{p.providerName}</dd></div>
              <div className="flex justify-between py-1.5"><dt className="text-gray-500">{p.summary.type === 'OUT' ? 'Destinatário' : 'Remetente'}</dt><dd className="text-right font-medium">{p.summary.counterpart.name || '—'}</dd></div>
              <div className="flex justify-between py-1.5"><dt className="text-gray-500">Natureza</dt><dd>{p.summary.nature}</dd></div>
              <div className="flex justify-between py-1.5"><dt className="inline-flex items-center gap-1 text-gray-500">CFOP<Hint term="CFOP" size={11} /></dt><dd>{p.summary.cfop}</dd></div>
              <div className="flex justify-between py-1.5"><dt className="text-gray-500">Valor</dt><dd className="font-semibold">{p.summary.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd></div>
              {icms && icms.mode === 'CST' && icms.value > 0 && <div className="flex justify-between py-1.5"><dt className="inline-flex items-center gap-1 text-gray-500">ICMS<Hint term="REDUCAO_BC" size={11} /></dt><dd>{icms.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd></div>}
            </dl>
            {p.missing.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Falta: {p.missing.join(', ')}.</p>}
            {!p.rulesConfirmed && <p className="text-xs text-amber-700">Regras fiscais ainda não revisadas pelo contador.</p>}
            {p.reductionExpired && <p className="text-xs text-red-700">A redução de ICMS configurada está vencida.</p>}
          </>
        )}
        <ErrorLine text={error} />
      </Modal>
    )
  }

  if (action.kind === 'transfer.advance') {
    const next = nextStage(action.current, { inspectionRequired: action.inspectionRequired }) as TransferStage | null
    return (
      <Modal open title={<span className="inline-flex items-center gap-1.5">Transferência<Hint term="TRANSFERENCIA_STATUS" /></span>} onClose={onClose}
        footer={<>{cancel}<button className={btn.primary} disabled={busy || !next} onClick={() => run(`/api/operations/${action.opId}`, { action: 'transfer.advance', stage: next, manual }, 'Etapa registrada.')}>{busy ? 'Registrando…' : 'Confirmar etapa'}</button></>}>
        <p className="text-sm text-gray-700">Concluir: <strong>{next ? STAGE_DONE_LABEL[next] : '—'}</strong></p>
        <div>
          <FieldLabel>Protocolo</FieldLabel>
          <input className={input} value={protocol} onChange={(e) => setProtocol(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Observação</FieldLabel>
          <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <ErrorLine text={error} />
      </Modal>
    )
  }

  if (action.kind === 'transfer.instructions') {
    const wa = instr?.phone ? `https://wa.me/${instr.phone}?text=${encodeURIComponent(instr.text)}` : null
    return (
      <Modal open title="Instruções ao comprador" onClose={onClose}
        footer={<>
          <button className={btn.secondary} disabled={!instr} onClick={() => { if (instr) { navigator.clipboard?.writeText(instr.text); onDone('Texto copiado.') } }}><Copy className="h-4 w-4" />Copiar</button>
          {wa && <a className={btn.primary} href={wa} target="_blank" rel="noopener noreferrer" onClick={() => onDone()}><MessageCircle className="h-4 w-4" />Abrir WhatsApp</a>}
        </>}>
        {instr ? <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-sans text-sm text-gray-700">{instr.text}</pre> : !error && <p className="text-sm text-gray-500">Carregando…</p>}
        <ErrorLine text={error} />
      </Modal>
    )
  }

  // financing.lien
  return (
    <Modal open title={<span className="inline-flex items-center gap-1.5">Gravame incluído<Hint term="GRAVAME" /></span>} onClose={onClose}
      footer={<>{cancel}<button className={btn.primary} disabled={busy} onClick={() => run(`/api/operations/${action.opId}`, { action: 'financing.lien', protocol }, 'Gravame registrado.')}>{busy ? 'Salvando…' : 'Confirmar'}</button></>}>
      <div>
        <FieldLabel>Protocolo / número do contrato</FieldLabel>
        <input className={input} value={protocol} onChange={(e) => setProtocol(e.target.value)} />
      </div>
      <ErrorLine text={error} />
    </Modal>
  )
}
