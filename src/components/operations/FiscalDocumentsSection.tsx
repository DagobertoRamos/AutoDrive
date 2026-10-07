'use client'

// =============================================================================
// Notas fiscais da negociação, vinculadas e conferidas por operação. Vincular
// a nota (XML) acontece na aba Operação, onde fica a próxima ação; aqui é a
// lista, o download do XML e o cancelamento.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { FieldLabel } from '@/components/ui/field'
import { btn, EmptyState, ErrorLine, fmtBRL, fmtDate, Hint, input, Modal, postJson } from './ui'

interface Doc { id: string; operationId: string | null; number: string | null; series: string | null; direction: string; status: string; accessKey: string | null; amount: number | null; authorizedAt: string | null; recipientName?: string | null; issuerName?: string | null }

const STATUS: Record<string, string> = { AUTHORIZED: 'Autorizada', CANCELLED: 'Cancelada', REJECTED: 'Rejeitada', PROCESSING: 'Processando', UNKNOWN: 'Verificando' }

export function FiscalDocumentsSection({ dealId, onGoToOperation }: { dealId: string; onGoToOperation?: () => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [perms, setPerms] = useState<Record<string, boolean>>({})
  const [cancelDoc, setCancelDoc] = useState<Doc | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/negotiations/${dealId}/operations`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.success) { setDocs([]); return }
    setDocs(r.data.fiscalDocs ?? []); setPerms(r.data.permissions ?? {})
  }, [dealId])
  useEffect(() => { load() }, [load])

  if (docs === null) return <div className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white" />
  if (!perms['ops.fiscal.view']) return null

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
        <h3 className="inline-flex items-center gap-1.5 font-semibold text-gray-800">Notas da operação<Hint term="NFE_OPERACAO" /></h3>
        <span className="text-xs text-gray-500">{docs.length}</span>
      </div>
      {docs.length === 0 ? (
        <EmptyState text="Nenhuma nota fiscal vinculada." action={perms['ops.fiscal.issue'] && onGoToOperation ? <button className={btn.secondary} onClick={onGoToOperation}>Vincular nota</button> : undefined} />
      ) : (
        <ul className="divide-y divide-gray-100">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-gray-800">NF-e {d.number ?? '—'}{d.series ? `/${d.series}` : ''} · {d.direction === 'OUT' ? 'saída' : 'entrada'}</p>
                <p className="text-xs text-gray-500">{STATUS[d.status] ?? d.status} · {fmtDate(d.authorizedAt)}{d.amount != null ? ` · ${fmtBRL(d.amount)}` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <a className={btn.link} href={`/api/fiscal-documents/${d.id}?download=xml`}>XML</a>
                {d.status === 'AUTHORIZED' && perms['ops.fiscal.cancel'] && <button className="text-sm font-medium text-red-700 hover:underline" onClick={() => setCancelDoc(d)}>Cancelar</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <FiscalCancelModal doc={cancelDoc} onClose={() => setCancelDoc(null)} onDone={() => { setCancelDoc(null); load() }} />
    </div>
  )
}

export function FiscalCancelModal({ doc, onClose, onDone }: { doc: { id: string; number: string | null } | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [protocol, setProtocol] = useState('')
  const [eventXml, setEventXml] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setReason(''); setProtocol(''); setEventXml(null); setFileName(''); setError(null) }, [doc])
  if (!doc) return null
  const submit = async () => {
    if (reason.trim().length < 15) return setError('Motivo com pelo menos 15 caracteres.')
    if (!eventXml && !protocol.trim()) return setError('Envie o XML do cancelamento ou informe o protocolo.')
    setBusy(true); setError(null)
    const r = await postJson(`/api/fiscal-documents/${doc.id}`, { action: 'cancel', reason, protocol, eventXml })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onDone()
  }
  return (
    <Modal open title={`Cancelar NF-e ${doc.number ?? ''}`} onClose={onClose}
      footer={<><button className={btn.secondary} onClick={onClose} disabled={busy}>Voltar</button><button className={btn.danger} onClick={submit} disabled={busy}>{busy ? 'Enviando…' : 'Cancelar nota'}</button></>}>
      <div><FieldLabel required>Motivo</FieldLabel><textarea className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <input ref={ref} type="file" accept=".xml" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); setEventXml(await f.text()) } }} />
      <button onClick={() => ref.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-600 hover:bg-gray-50">
        <Upload className="h-4 w-4" />{fileName || 'XML do cancelamento'}
      </button>
      <div><FieldLabel>ou protocolo do cancelamento</FieldLabel><input className={input} value={protocol} onChange={(e) => setProtocol(e.target.value)} /></div>
      <ErrorLine text={error} />
    </Modal>
  )
}
