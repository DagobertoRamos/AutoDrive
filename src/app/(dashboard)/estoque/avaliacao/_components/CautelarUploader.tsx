'use client'

// =============================================================================
// CautelarUploader — Upload e gerenciamento de anexos cautelares (LAUDO_CAUTELAR).
// Usa POST /api/evaluations/[id]/attachments (multipart) e DELETE para excluir.
//
// LIMITAÇÃO: o backend já tem storage real (lib/evaluation/storage). Cada arquivo
// é enviado individualmente (uma chamada por arquivo). Para batches grandes a UI
// mostra progresso simples; uploads paralelos estão limitados a 3.
// =============================================================================

import { useRef, useState } from 'react'
import {
  Upload, FileText, Image as ImageIcon, Trash2, ExternalLink, Download, Loader2,
  ShieldCheck, X,
} from 'lucide-react'

export interface AttachmentLite {
  id:           string
  fileName:     string
  fileType?:    string | null
  mimeType?:    string | null
  fileSize?:    number | null
  publicUrl?:   string | null
  category?:    string | null
  uploadedByName?: string | null
  createdAt?:   string | null
}

interface CautelarUploaderProps {
  evaluationId:  string
  existingFiles: AttachmentLite[]
  onChange?:     () => void
  readOnly?:     boolean
}

function formatSize(bytes?: number | null): string {
  if (!Number.isFinite(Number(bytes))) return '—'
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
function formatDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function isImage(mime?: string | null, type?: string | null): boolean {
  if (mime?.startsWith('image/')) return true
  if (type === 'image' || type === 'jpg' || type === 'jpeg' || type === 'png' || type === 'webp') return true
  return false
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'

export function CautelarUploader({
  evaluationId, existingFiles, onChange, readOnly,
}: CautelarUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [err,       setErr]       = useState('')

  async function uploadOne(file: File): Promise<void> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('section',  'DOCUMENTOS')
    fd.append('category', 'LAUDO_CAUTELAR')
    const r = await fetch(`/api/evaluations/${evaluationId}/attachments`, { method: 'POST', body: fd })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      throw new Error(d?.error ?? `Falha ao enviar ${file.name}`)
    }
  }

  async function handleFiles(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return
    const files = Array.from(filesList)
    setUploading(true)
    setProgress({ done: 0, total: files.length })
    setErr('')
    try {
      // Pool simples (3 paralelos)
      const queue = [...files]
      let done = 0
      async function worker() {
        while (queue.length > 0) {
          const f = queue.shift()
          if (!f) break
          try { await uploadOne(f) } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro de upload'
            setErr(msg)
          }
          done += 1
          setProgress({ done, total: files.length })
        }
      }
      await Promise.all([worker(), worker(), worker()])
      onChange?.()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(attachmentId: string) {
    if (readOnly) return
    if (!confirm('Excluir este anexo? Esta ação não pode ser desfeita.')) return
    try {
      const r = await fetch(`/api/evaluations/${evaluationId}/attachments/${attachmentId}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErr(d?.error ?? 'Falha ao excluir anexo.')
        return
      }
      onChange?.()
    } catch {
      setErr('Erro de conexão ao excluir.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-brand-600" />
        <h4 className="text-sm font-semibold text-gray-800">Laudo Cautelar — Arquivos</h4>
      </header>

      {!readOnly && (
        <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/30 p-4 text-center">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading
              ? `Enviando ${progress.done}/${progress.total}...`
              : 'Adicionar arquivos (PDF, JPG, PNG, WebP)'}
          </button>
          <p className="mt-2 text-[11px] text-gray-500">Múltiplos arquivos. Tamanho máximo definido pelo servidor.</p>
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <X className="h-3 w-3 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {existingFiles.length === 0 ? (
        <p className="text-xs text-gray-500 italic">Nenhum arquivo cautelar enviado ainda.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {existingFiles.map((f) => (
            <li key={f.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                {isImage(f.mimeType, f.fileType)
                  ? <ImageIcon className="h-5 w-5 text-gray-500" />
                  : <FileText className="h-5 w-5 text-gray-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate" title={f.fileName}>{f.fileName}</p>
                <p className="text-[11px] text-gray-500">
                  {formatSize(f.fileSize)}
                  {f.createdAt && <> · {formatDate(f.createdAt)}</>}
                  {f.uploadedByName && <> · {f.uploadedByName}</>}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  {f.publicUrl && (
                    <>
                      <a
                        href={f.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
                      >
                        <ExternalLink className="h-3 w-3" /> Visualizar
                      </a>
                      <a
                        href={f.publicUrl}
                        download={f.fileName}
                        className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
                      >
                        <Download className="h-3 w-3" /> Baixar
                      </a>
                    </>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleDelete(f.id)}
                      className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" /> Excluir
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
