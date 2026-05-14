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
      <div>
        <h1 className="text-xl font-bold text-gray-900">Importação de Planilhas</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Sincronize dados do Google Sheets com o sistema AutoDrive.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-12 shadow-card text-center">
        <FileSpreadsheet size={48} className="text-brand-300" strokeWidth={1} />
        <h2 className="mt-4 text-base font-semibold text-gray-800">
          Gerencie suas integrações em Configurações
        </h2>
        <p className="mt-2 text-sm text-gray-500 max-w-sm">
          O gerenciamento de planilhas, abas e mapeamento de colunas está centralizado
          na seção de Configurações → Google Sheets.
        </p>
        <Link
          href="/configuracoes/sheets"
          className="btn-primary mt-6"
        >
          <Settings size={14} />
          Ir para Configurações de Planilhas
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Funcionalidades disponíveis em Configurações → Sheets</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          {[
            'Adicionar e configurar planilhas do Google Sheets',
            'Cadastrar abas com tipos de dados específicos',
            'Mapear colunas da planilha para campos do sistema',
            'Disparar sincronizações manuais por aba',
            'Monitorar status e histórico de importações',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
