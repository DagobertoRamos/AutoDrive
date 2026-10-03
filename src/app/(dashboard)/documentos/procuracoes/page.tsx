'use client'

// =============================================================================
// Documentos > Procurações — gerador de documentos (modelos → preencher → PDF).
// =============================================================================

import { FileText } from 'lucide-react'
import DocumentGeneratorPanel from '@/components/documents/DocumentGeneratorPanel'

export default function Page() {
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><FileText size={20} className="text-brand-600" />Procurações</h1>
      <DocumentGeneratorPanel category="procuracao" />
    </div>
  )
}
