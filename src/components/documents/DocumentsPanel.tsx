'use client'

// Documentos de um registro (NF, boleto, comprovante, contrato, recibo, outros).
// Cada envio é um documento novo — nada é substituído. Exclusão é definitiva.
// Consome /api/documents/attachments.
//   <DocumentsPanel entityType="DEAL_SERVICE" entityId={id} />           painel completo
//   <DocumentsPanel entityType="DEAL_SERVICE" entityId={id} compact />   selo com contagem (linhas de tabela) que abre o painel

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileCode2, FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload, X } from 'lucide-react'
import { compressImage, uploadErrorMessage } from '@/lib/images/compress-client'
import { DOCS_ACCEPT, DOC_TYPES, DOC_TYPE_LABEL, docTypeLabel, type DocEntityType, type DocType } from '@/lib/documents/attachment-types'

export interface DocumentItemClient {
  id: string
  docType: string
  name: string
  mimeType: string | null
  size: number | null
  createdAt: string
  uploaderName: string | null
  openUrl: string
}

interface Props {
  entityType: DocEntityType
  entityId: string
  /** Selo com contagem que abre o painel (para linhas de tabela/listas). */
  compact?: boolean
  defaultDocType?: DocType
  title?: string
  className?: string
}

const MAX = 4 * 1024 * 1024

const sizeLabel = (n: number | null) => (n == null ? '' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const dateLabel = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function FileIcon({ mime, name }: { mime: string | null; name: string }) {
  if (mime?.startsWith('image/')) return <ImageIcon size={15} className="shrink-0 text-sky-500" />
  if (/xml/i.test(mime ?? '') || /\.xml$/i.test(name)) return <FileCode2 size={15} className="shrink-0 text-emerald-600" />
  return <FileText size={15} className="shrink-0 text-red-500" />
}

/** Envia um documento (imagem comprimida no aparelho). Retorna erro legível ou null. */
export async function uploadDocument(entityType: DocEntityType, entityId: string, file: File, docType: DocType): Promise<string | null> {
  const f = file.type.startsWith('image/') ? await compressImage(file) : file
  if (f.size > MAX) return `${file.name}: arquivo acima de 4 MB.`
  const fd = new FormData()
  fd.append('file', f)
  fd.append('entityType', entityType)
  fd.append('entityId', entityId)
  fd.append('docType', docType)
  const r = await fetch('/api/documents/attachments', { method: 'POST', body: fd, credentials: 'include' }).catch(() => null)
  if (!r) return 'Erro de rede ao enviar o documento.'
  return r.ok ? null : uploadErrorMessage(r)
}

function useDocuments(entityType: DocEntityType, entityId: string) {
  const [items, setItems] = useState<DocumentItemClient[] | null>(null)
  const [canUpload, setCanUpload] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    if (!entityId) { setItems([]); return }
    const qs = new URLSearchParams({ entityType, entityId })
    const r = await fetch(`/api/documents/attachments?${qs}`, { credentials: 'include', cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    if (j?.success) {
      setItems(j.data); setCanUpload(!!j.canUpload); setCanDelete(!!j.canDelete); setLoadError('')
    } else {
      setItems([]); setCanUpload(false); setCanDelete(false); setLoadError(j?.error || '')
    }
  }, [entityType, entityId])

  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])
  return { items, canUpload, canDelete, loadError, load }
}

function PanelBody({ entityType, entityId, defaultDocType = 'NOTA_FISCAL', title = 'Documentos', state }: {
  entityType: DocEntityType; entityId: string; defaultDocType?: DocType; title?: string; state: ReturnType<typeof useDocuments>
}) {
  const { items, canUpload, canDelete, loadError, load } = state
  const [docType, setDocType] = useState<DocType>(defaultDocType)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true); setErr('')
    const errors: string[] = []
    for (const f of Array.from(files)) {
      const e = await uploadDocument(entityType, entityId, f, docType)
      if (e) errors.push(e)
    }
    if (input.current) input.current.value = ''
    setErr(errors.join(' '))
    setBusy(false)
    await load()
  }

  async function remove(a: DocumentItemClient) {
    if (!confirm(`Excluir definitivamente "${a.name}"?`)) return
    setErr('')
    const r = await fetch(`/api/documents/attachments/${a.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => null)
    if (!r?.ok) {
      const j = r ? await r.json().catch(() => null) : null
      setErr(j?.error || 'Não foi possível excluir.')
      return
    }
    await load()
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {title}{items && items.length > 0 ? <span className="ml-1 text-gray-400">({items.length})</span> : null}
        </h3>
        {canUpload && (
          <div className="flex items-center gap-1.5">
            <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} aria-label="Tipo do documento" className="rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-600">
              {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
            </select>
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-60">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}Enviar
            </button>
            <input ref={input} type="file" multiple accept={DOCS_ACCEPT} className="hidden" onChange={(e) => void onFiles(e.target.files)} />
          </div>
        )}
      </div>
      {items == null ? (
        <Loader2 size={16} className="animate-spin text-gray-300" />
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400">{loadError || 'Nenhum documento.'}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
              <FileIcon mime={a.mimeType} name={a.name} />
              <div className="min-w-0 flex-1">
                <a href={a.openUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-brand-700 hover:underline" title={a.name}>{a.name}</a>
                <p className="truncate text-[11px] text-gray-400">
                  {[dateLabel(a.createdAt), a.uploaderName, sizeLabel(a.size)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{docTypeLabel(a.docType)}</span>
              {canDelete && (
                <button type="button" onClick={() => void remove(a)} className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Excluir definitivamente" title="Excluir definitivamente">
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </>
  )
}

function CompactDocuments({ entityType, entityId, defaultDocType, title = 'Documentos', className }: Props) {
  const state = useDocuments(entityType, entityId)
  const [open, setOpen] = useState(false)
  const count = state.items?.length ?? 0

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        title={title}
        aria-label={`${title}${count ? ` (${count})` : ''}`}
        className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${count ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-400 hover:text-gray-600'} ${className ?? ''}`}
      >
        <Paperclip size={11} />{count > 0 && count}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar"><X size={16} /></button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <PanelBody entityType={entityType} entityId={entityId} defaultDocType={defaultDocType} title={title} state={state} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function FullDocuments({ entityType, entityId, defaultDocType, title, className }: Props) {
  const state = useDocuments(entityType, entityId)
  return (
    <section className={className ?? 'rounded-xl border border-gray-200 bg-white p-4'}>
      <PanelBody entityType={entityType} entityId={entityId} defaultDocType={defaultDocType} title={title} state={state} />
    </section>
  )
}

export function DocumentsPanel(props: Props) {
  return props.compact ? <CompactDocuments {...props} /> : <FullDocuments {...props} />
}

/** Selo com contagem para linhas de tabela (atalho de `<DocumentsPanel compact />`). */
export function DocumentsBadge(props: Omit<Props, 'compact'>) {
  return <CompactDocuments {...props} />
}

export default DocumentsPanel
