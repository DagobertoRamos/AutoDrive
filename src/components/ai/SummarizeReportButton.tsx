'use client'

// =============================================================================
// SummarizeReportButton — botão reutilizável "Resumir com IA" para relatórios.
// Envia { title, data } (os dados já exibidos na tela) p/ /api/ai/reports/
// summarize e mostra o resumo. A IA só resume; não inventa nem decide.
// =============================================================================

import { useState } from 'react'
import { Sparkles, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SummarizeReportButton({ title, data, className }: { title: string; data: unknown; className?: string }) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [mock, setMock] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true); setError(null); setSummary(''); setOpen(true)
    try {
      const res = await fetch('/api/ai/reports/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ title, data }) })
      const json = await res.json()
      if (!json.success && !json.summary) { setError(json?.error ?? 'Não foi possível resumir.'); return }
      setSummary(json.summary ?? ''); setMock(!!json.mock)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={run} disabled={loading} className={cn('btn-secondary text-xs disabled:opacity-50', className)} title="Resumir este relatório com IA">
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}Resumir com IA
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><Sparkles size={16} className="text-brand-600" />Resumo: {title}</h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-gray-400"><Loader2 size={16} className="animate-spin" />Gerando resumo...</div>
            ) : error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-sm text-gray-700">{summary}</p>
                {mock && <p className="mt-3 rounded bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">Resumo simulado (MockAI) — configure um provedor de IA no painel Master para resumo real.</p>}
                <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400">Resumo gerado por IA com base nos dados exibidos. Confira antes de decidir.</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
