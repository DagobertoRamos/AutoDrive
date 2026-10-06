'use client'

// Anexos do lançamento (boleto, NF, comprovante): lista, envio e abertura.
// Consome /api/finance/entries/[id]/attachments.

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { compressImage, uploadErrorMessage } from '@/lib/images/compress-client'
import { DOC_TYPES, DOC_TYPE_LABEL, docTypeLabel, type DocType } from '@/lib/documents/attachment-types'

export interface Attachment { id: string; name: string; docType?: string | null; mimeType: string | null; size: number | null; openUrl: string }

export const ATTACH_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,text/xml,application/xml,.xml'
const MAX = 4 * 1024 * 1024

/** Envia um arquivo (imagem comprimida no aparelho). Retorna erro legível ou null. */
export async function uploadEntryAttachment(entryId: string, file: File, docType?: DocType): Promise<string | null> {
  const f = file.type.startsWith('image/') ? await compressImage(file) : file
  if (f.size > MAX) return 'Arquivo acima de 4 MB.'
  const fd = new FormData()
  fd.append('file', f)
  if (docType) fd.append('docType', docType)
  const r = await fetch(`/api/finance/entries/${entryId}/attachments`, { method: 'POST', body: fd, credentials: 'include' }).catch(() => null)
  if (!r) return 'Erro de rede ao enviar o anexo.'
  return r.ok ? null : uploadErrorMessage(r)
}

const sizeLabel = (n: number | null) => (n == null ? '' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export function AttachmentsPanel({ entryId, canManage }: { entryId: string; canManage: boolean }) {
  const [items, setItems] = useState<Attachment[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [docType, setDocType] = useState<DocType>('NOTA_FISCAL')
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const j = await fetch(`/api/finance/entries/${entryId}/attachments`, { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    setItems(j?.success ? j.data : [])
  }, [entryId])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true); setErr('')
    for (const f of Array.from(files)) {
      const e = await uploadEntryAttachment(entryId, f, docType)
      if (e) { setErr(e); break }
    }
    if (input.current) input.current.value = ''
    setBusy(false)
    await load()
  }

  async function remove(a: Attachment) {
    if (!confirm(`Excluir definitivamente "${a.name}"?`)) return
    const r = await fetch(a.openUrl, { method: 'DELETE', credentials: 'include' })
    if (!r.ok) { setErr('Não foi possível remover.'); return }
    await load()
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Anexos</h3>
        {canManage && (
          <div className="flex items-center gap-1.5">
          <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} aria-label="Tipo do documento" className="rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-600">
            {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-brand-400 hover:text-brand-700">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}Anexar
          </button>
          </div>
        )}
        <input ref={input} type="file" multiple accept={ATTACH_ACCEPT} className="hidden" onChange={(e) => void onFiles(e.target.files)} />
      </div>
      {items == null ? (
        <Loader2 size={16} className="animate-spin text-gray-300" />
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhum anexo.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
              {a.mimeType?.startsWith('image/') ? <ImageIcon size={15} className="shrink-0 text-gray-400" /> : <FileText size={15} className="shrink-0 text-gray-400" />}
              <a href={a.openUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-brand-700 hover:underline">{a.name}</a>
              {a.docType && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{docTypeLabel(a.docType)}</span>}
              <span className="shrink-0 text-[11px] text-gray-400">{sizeLabel(a.size)}</span>
              {canManage && <button type="button" onClick={() => void remove(a)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Excluir anexo definitivamente"><Trash2 size={13} /></button>}
            </li>
          ))}
        </ul>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </section>
  )
}
