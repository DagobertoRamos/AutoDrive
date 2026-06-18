'use client'

// =============================================================================
// Documentos > Analisar com IA. Upload de um documento (PDF/imagem) → a IA
// extrai e resume/identifica. Consome /api/ai/documents/analyze (IA controlada:
// só resume/identifica; não valida juridicamente nem decide). Sem provedor real
// configurado, usa MockAI (com aviso).
// =============================================================================

import { useState, useRef } from 'react'
import { Bot, Upload, X, Loader2, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Analysis { summary: string; documentType: string | null; legible: boolean; needsHumanReview: boolean; note: string | null }

export default function AnalisarDocumentoPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Analysis | null>(null)
  const [meta, setMeta] = useState<{ provider: string; mock: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

  const pick = (f: File | undefined) => {
    if (!f) return
    if (f.size > 8 * 1024 * 1024) { setError('O arquivo deve ter no máximo 8 MB.'); return }
    setFile(f); setResult(null); setError(null); setMeta(null)
  }

  const analyze = async () => {
    if (!file) return
    setLoading(true); setError(null); setResult(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/ai/documents/analyze', { method: 'POST', credentials: 'include', body: fd })
      const json = await res.json()
      if (!json.success) { setError(json?.error ?? 'Não foi possível analisar o documento.'); return }
      setResult(json.data); setMeta({ provider: json.provider, mock: !!json.mock })
    } catch { setError('Erro de conexão ao enviar o arquivo.') } finally { setLoading(false) }
  }

  const reset = () => { setFile(null); setResult(null); setError(null); setMeta(null); if (inputRef.current) inputRef.current.value = '' }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Bot size={20} className="text-brand-600" />Analisar documento com IA</h1>
        <p className="mt-0.5 text-sm text-gray-500">Envie um PDF ou imagem (CRLV, contrato, comprovante, laudo, RG/CNH…). A IA resume e identifica os dados principais.</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
        <span>A IA <strong>auxilia</strong> a leitura — não substitui conferência humana nem validação jurídica/contábil/financeira. Não toma decisões nem aprova nada.</span>
      </div>

      {!file ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]) }}
          onDragOver={(e) => e.preventDefault()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 py-16 transition-colors hover:border-brand-400 hover:bg-brand-50"
        >
          <Upload size={36} className="text-gray-300" strokeWidth={1.5} />
          <p className="mt-3 text-base font-medium text-gray-600">Arraste o documento ou clique para selecionar</p>
          <p className="mt-1 text-xs text-gray-400">PDF, JPG, PNG, WEBP • máx 8 MB</p>
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <Bot size={20} className="shrink-0 text-brand-700" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-brand-800">{file.name}</p><p className="text-xs text-brand-600">{(file.size / 1024).toFixed(1)} KB</p></div>
          <button onClick={reset} className="shrink-0 rounded p-1 hover:bg-brand-100"><X size={14} className="text-brand-600" /></button>
        </div>
      )}

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={14} className="shrink-0" />{error}</div>}

      {file && !result && (
        <div className="flex justify-end">
          <button onClick={analyze} disabled={loading} className="btn-primary">{loading ? <><Loader2 size={14} className="animate-spin" />Analisando...</> : <><Bot size={14} />Analisar com IA</>}</button>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            {result.legible ? <CheckCircle2 size={16} className="text-green-600" /> : <AlertTriangle size={16} className="text-amber-500" />}
            <h2 className="text-sm font-semibold text-gray-800">{result.documentType ? `Documento: ${result.documentType}` : 'Resultado da análise'}</h2>
            {result.needsHumanReview && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Precisa de conferência humana</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{result.summary}</p>
          {result.note && <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">{result.note}</p>}
          {meta?.mock && <p className="mt-2 rounded bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">Análise simulada ({meta.provider}) — configure um provedor de IA no painel Master para análise real.</p>}
          <div className="mt-4 flex justify-end"><button onClick={reset} className="btn-secondary text-sm">Analisar outro</button></div>
        </div>
      )}
    </div>
  )
}
