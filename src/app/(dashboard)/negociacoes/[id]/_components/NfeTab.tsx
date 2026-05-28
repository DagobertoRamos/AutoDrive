'use client'

// =============================================================================
// NfeTab — Aba "NFe" na detalhe da negociação.
// Upload e listagem de NFe (XML/PDF) anexadas à negociação.
// =============================================================================

import { FileText } from 'lucide-react'
import AttachmentUploader, { type Attachment } from './AttachmentUploader'

interface Props {
  dealId:      string
  attachments: Attachment[]
  onReload:    () => void
  onToast:     (msg: string, ok?: boolean) => void
}

export default function NfeTab({ dealId, attachments, onReload, onToast }: Props) {
  const nfes = attachments.filter((a) => a.category === 'NFE')
  const recibos = attachments.filter((a) => a.category === 'RECIBO')

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-brand-600" />
            <h3 className="font-semibold text-gray-800">Notas Fiscais Eletrônicas</h3>
          </div>
          <span className="text-xs text-gray-500">{nfes.length} arquivo(s)</span>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-gray-500">
            Anexe o XML emitido (chave de acesso preservada) e/ou o PDF da DANFE.
          </p>
          <AttachmentUploader
            dealId={dealId}
            category="NFE"
            attachments={nfes}
            onChange={onReload}
            onToast={onToast}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-brand-600" />
            <h3 className="font-semibold text-gray-800">Recibos</h3>
          </div>
          <span className="text-xs text-gray-500">{recibos.length} arquivo(s)</span>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-gray-500">
            Recibos avulsos da negociação (entrada, sinal, repasse, etc).
          </p>
          <AttachmentUploader
            dealId={dealId}
            category="RECIBO"
            attachments={recibos}
            onChange={onReload}
            onToast={onToast}
          />
        </div>
      </div>
    </div>
  )
}
