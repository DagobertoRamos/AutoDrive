'use client'

// =============================================================================
// AttachmentUploader — botão inline pra anexar comprovante a uma linha do
// resumo financeiro (pagamento, débito, quitação, troco) ou avulso (NFe, etc).
//
// Mostra:
//   - botão "Anexar" se nada anexado ainda
//   - chip clicável (download/preview) + botão excluir se já tem anexo
//
// Multi-anexo: o backend aceita N anexos por linha — exibimos todos.
// =============================================================================

import { useState } from 'react'
import { Paperclip, Trash2, Loader2, FileText, Image as ImageIcon, X } from 'lucide-react'

export interface Attachment {
  id:         string
  category:   string
  fileName:   string
  fileType:   string
  mimeType:   string
  publicUrl:  string | null
  notes:      string | null
  paymentId:  string | null
  debtId:     string | null
  vehicleId:  string | null
  changeId:   string | null
  uploadedByName: string | null
  uploadedAt: string
}

interface Props {
  dealId:      string
  category:    string                          // DealAttachmentCategory
  attachments: Attachment[]                    // anexos JÁ FILTRADOS dessa linha
  linkKey?:    'paymentId' | 'debtId' | 'vehicleId' | 'changeId'
  linkValue?:  string
  compact?:    boolean                          // versão menor pra linha
  canDelete?:  boolean
  onChange:    () => void                       // recarrega lista no parent
  onToast?:    (msg: string, ok?: boolean) => void
}

const ACCEPT = 'image/*,application/pdf,text/xml,application/xml'

export default function AttachmentUploader({
  dealId, category, attachments, linkKey, linkValue, compact, canDelete = true, onChange, onToast,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleUpload(file: File) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('category', category)
      if (linkKey && linkValue) fd.append(linkKey, linkValue)
      const res = await fetch(`/api/negotiations/${dealId}/attachments`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Falha no upload')
      onToast?.('Anexo enviado', true)
      onChange()
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro no upload', false)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este anexo?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/attachments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Falha ao remover')
      }
      onToast?.('Anexo removido', true)
      onChange()
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao remover', false)
    } finally {
      setDeletingId(null)
    }
  }

  const sizeBtn = compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
  const sizeIcon = compact ? 11 : 12

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {attachments.map((a) => {
        const isImage = a.fileType === 'image'
        return (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] text-green-800"
            title={a.fileName}
          >
            {isImage ? <ImageIcon size={sizeIcon} /> : <FileText size={sizeIcon} />}
            {a.publicUrl ? (
              <a href={a.publicUrl} target="_blank" rel="noopener noreferrer" className="max-w-[160px] truncate hover:underline">
                {a.fileName}
              </a>
            ) : (
              <span className="max-w-[160px] truncate">{a.fileName}</span>
            )}
            {canDelete && (
              <button
                onClick={() => handleDelete(a.id)}
                disabled={deletingId === a.id}
                className="rounded-full p-0.5 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
                title="Remover"
              >
                {deletingId === a.id ? <Loader2 size={sizeIcon} className="animate-spin" /> : <X size={sizeIcon} />}
              </button>
            )}
          </span>
        )
      })}

      <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white font-medium text-gray-700 hover:bg-gray-50 ${sizeBtn} ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
        {uploading ? <Loader2 size={sizeIcon} className="animate-spin" /> : <Paperclip size={sizeIcon} />}
        {attachments.length > 0 ? 'Anexar outro' : 'Anexar'}
        <input
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.currentTarget.value = '' // permite re-anexar mesmo arquivo
            if (f) handleUpload(f)
          }}
        />
      </label>
    </div>
  )
}
