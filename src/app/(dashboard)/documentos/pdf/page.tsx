'use client'

// =============================================================================
// Leitura de PDF — AutoDrive
// Upload e extração de dados de contratos em formato PDF
// =============================================================================

import { useState, useRef } from 'react'
import { FileText, Upload, X, CheckCircle2, AlertCircle, Loader2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ParseResult {
  contractNumber: string | null
  customerName:   string | null
  plate:          string | null
  vehicle:        string | null
  value:          number | null
  date:           string | null
  rawText:        string
  confidence:     number
}

export default function PdfPage() {
  const [file, setFile]           = useState<File | null>(null)
  const [parsing, setParsing]     = useState(false)
  const [result, setResult]       = useState<ParseResult | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') {
      setError('Apenas arquivos PDF são aceitos.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('O arquivo deve ter no máximo 10 MB.')
      return
    }
    setFile(f)
    setResult(null)
    setError(null)
    setSaved(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) {
      const event = { target: { files: e.dataTransfer.files } } as unknown as React.ChangeEvent<HTMLInputElement>
      handleFileChange(event)
    }
  }

  const handleParse = async () => {
    if (!file) return
    setParsing(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/documents/pdf-parse', {
        method: 'POST', credentials: 'include', body: fd,
      })
      const data = await res.json()
      if (data.success) {
        setResult(data.data)
      } else {
        setError(data.error ?? 'Erro ao processar o PDF.')
      }
    } catch {
      setError('Erro de conexão ao enviar o arquivo.')
    } finally {
      setParsing(false)
    }
  }

  const handleSave = async () => {
    if (!result) return
    setSaving(true)
    try {
      const res  = await fetch('/api/documents/contracts', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
      const data = await res.json()
      if (data.success) setSaved(true)
      else setError(data.error ?? 'Erro ao salvar.')
    } catch {
      setError('Erro de conexão.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setFile(null); setResult(null); setError(null); setSaved(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Leitura de Contrato PDF</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Faça upload de um contrato em PDF para extração automática dos dados.
        </p>
      </div>

      {/* ── Upload area ──────────────────────────────────────────────────── */}
      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 py-16 transition-colors hover:border-brand-400 hover:bg-brand-50"
        >
          <Upload size={36} className="text-gray-300" strokeWidth={1.5} />
          <p className="mt-3 text-base font-medium text-gray-600">Arraste o PDF aqui ou clique para selecionar</p>
          <p className="mt-1 text-xs text-gray-400">PDF • Máximo 10 MB</p>
          <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <FileText size={20} className="shrink-0 text-brand-700" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-brand-800">{file.name}</p>
            <p className="text-xs text-brand-600">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          <button onClick={reset} className="shrink-0 rounded p-1 hover:bg-brand-100">
            <X size={14} className="text-brand-600" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {file && !result && (
        <div className="flex justify-end">
          <button onClick={handleParse} disabled={parsing} className="btn-primary">
            {parsing
              ? <><Loader2 size={14} className="animate-spin" />Processando...</>
              : <><FileText size={14} />Extrair dados do PDF</>}
          </button>
        </div>
      )}

      {/* ── Result ────────────────────────────────────────────────────────── */}
      {result && (
        <div className="card animate-fade-in">
          <div className="section-header">
            <CheckCircle2 size={15} className="text-green-600" />
            <h2 className="text-sm font-semibold text-gray-800">Dados extraídos</h2>
            <span className={cn(
              'ml-auto rounded-full px-2 py-0.5 text-xs font-medium',
              result.confidence >= 80 ? 'bg-green-100 text-green-700' : result.confidence >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700',
            )}>
              Confiança: {result.confidence}%
            </span>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Nº do Contrato',    value: result.contractNumber },
                { label: 'Nome do Cliente',   value: result.customerName },
                { label: 'Placa',             value: result.plate },
                { label: 'Veículo',           value: result.vehicle },
                { label: 'Valor',             value: result.value != null ? result.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null },
                { label: 'Data do contrato',  value: result.date },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs font-medium text-gray-500">{label}</p>
                  <p className={cn('mt-0.5 text-sm', value ? 'font-medium text-gray-800' : 'text-gray-300 italic')}>
                    {value ?? 'Não identificado'}
                  </p>
                </div>
              ))}
            </div>

            {result.rawText && (
              <details className="rounded-lg border border-gray-200">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50">
                  Texto bruto extraído
                </summary>
                <pre className="max-h-48 overflow-auto p-3 text-xs text-gray-600 whitespace-pre-wrap">
                  {result.rawText}
                </pre>
              </details>
            )}

            {saved ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                <CheckCircle2 size={14} />
                Contrato salvo com sucesso na base de dados.
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <button onClick={reset} className="btn-secondary text-sm">Novo upload</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                  {saving ? <><Loader2 size={13} className="animate-spin" />Salvando...</> : 'Salvar contrato'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
