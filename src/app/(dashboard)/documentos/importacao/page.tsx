'use client'

// =============================================================================
// Importação de Planilhas — AutoDrive
// Gerenciamento rápido de sincronização Google Sheets
// =============================================================================

import Link from 'next/link'
import { Settings, ArrowRight, FileSpreadsheet } from 'lucide-react'

export default function ImportacaoPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Importação de Planilhas</h1>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-12 shadow-card text-center">
        <FileSpreadsheet size={48} className="text-brand-300" strokeWidth={1} />
        <h2 className="mt-4 text-base font-semibold text-gray-800">
          Planilhas são gerenciadas em Configurações › Google Sheets
        </h2>
        <Link
          href="/configuracoes/sheets"
          className="btn-primary mt-6"
        >
          <Settings size={14} />
          Ir para Configurações de Planilhas
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  )
}
