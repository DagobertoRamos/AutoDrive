'use client'

// =============================================================================
// Documentos > Termos — gerador de documentos (modelos → preencher → PDF).
// =============================================================================

import { FileText } from 'lucide-react'
import DocumentGeneratorPanel from '@/components/documents/DocumentGeneratorPanel'

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><FileText size={20} className="text-brand-600" />Termos</h1>
        <p className="mt-0.5 text-sm text-gray-500">Termos de garantia, entrega e vistoria.</p>
      </div>
      <DocumentGeneratorPanel category="termo" />
    </div>
  )
}
