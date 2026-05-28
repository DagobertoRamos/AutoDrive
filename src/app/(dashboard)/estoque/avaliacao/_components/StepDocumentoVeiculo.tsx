'use client'

// =============================================================================
// StepDocumentoVeiculo — Upload do CRLV (PDF preferido) com extração automática
// de campos do veículo. Componente é montado ANTES dos demais inputs da etapa
// "Veículo": o resto do formulário só libera depois do upload OU da escolha
// explícita "Não tenho documento" (que prossegue para consulta por placa).
// =============================================================================

import { useRef, useState } from 'react'
import {
  Upload, FileCheck, XCircle,
  Loader2, Eye, Trash2, RefreshCw, FileText,
} from 'lucide-react'
import type { ExtractedVehicle, ExtractionConfidence } from '@/lib/crlv/parser'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type ExtractionSource = 'pdf-text' | 'ocr' | 'manual'

export interface StepDocumentoVeiculoProps {
  evaluationId?: string | null
  onExtracted:   (data: ExtractedVehicle, source: ExtractionSource, confidence: ExtractionConfidence) => void
  onSkip:        (reason: string) => void
  hasUploaded:   boolean
  hasSkipped:    boolean
}

// ── Estado interno do upload ──────────────────────────────────────────────────

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'reading' }
  | { kind: 'success';  file: File; confidence: ExtractionConfidence; message: string }
  | { kind: 'partial';  file: File; confidence: ExtractionConfidence; missing: string[]; message: string }
  | { kind: 'failure';  message: string; file?: File }

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'
const MAX_BYTES = 8 * 1024 * 1024

function fmtSize(bytes: number): string {
  if (bytes < 1024)            return `${bytes} B`
  if (bytes < 1024 * 1024)     return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function confidenceLabel(c: ExtractionConfidence): string {
  if (c === 'high')   return 'alta'
  if (c === 'medium') return 'média'
  return 'baixa'
}

export function StepDocumentoVeiculo(props: StepDocumentoVeiculoProps) {
  const { onExtracted, onSkip, hasUploaded, hasSkipped } = props

  const [state,        setState]        = useState<UploadState>({ kind: 'idle' })
  const [dragging,     setDragging]     = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      setState({ kind: 'failure', message: 'Arquivo maior que 8MB. Reduza ou envie outro.' })
      return
    }
    // Validação adicional: apenas PDF/imagem de documento (CRLV/ATPV-e)
    const acceptedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!acceptedTypes.includes(file.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
      setState({ kind: 'failure', message: 'Apenas CRLV / CRLV-e / ATPV-e em PDF ou imagem são aceitos.' })
      return
    }
    setState({ kind: 'uploading' })
    const form = new FormData()
    form.append('file', file)
    if (props.evaluationId) form.append('evaluationId', props.evaluationId)

    setState({ kind: 'reading' })
    try {
      const r = await fetch('/api/evaluations/vehicle-document/extract', {
        method: 'POST',
        body:   form,
      })
      const d = await r.json().catch(() => ({} as { message?: string }))

      if (!r.ok) {
        setState({ kind: 'failure', file, message: (d as { error?: string })?.error ?? 'Falha ao processar o documento.' })
        return
      }

      const extracted: boolean              = Boolean((d as { extracted?: boolean }).extracted)
      const conf: ExtractionConfidence      = ((d as { confidence?: ExtractionConfidence }).confidence ?? 'low')
      const src: ExtractionSource           = ((d as { source?: ExtractionSource }).source ?? 'pdf-text')
      const vehicle: ExtractedVehicle       = (d as { vehicle?: ExtractedVehicle }).vehicle ?? {}
      const missing: string[]               = ((d as { missingFields?: string[] }).missingFields ?? [])
      const message: string                 = (d as { message?: string }).message ?? ''

      if (!extracted) {
        setState({ kind: 'failure', file, message: message || 'Não foi possível extrair dados deste arquivo.' })
        return
      }

      // Propaga para o wizard
      onExtracted(vehicle, src, conf)

      // Anexa também como CRLV oficial se houver evaluationId — assim o
      // documento já fica salvo na aba Documentos com kind=CRLV.
      if (props.evaluationId) {
        try {
          const att = new FormData()
          att.append('file', file)
          att.append('kind', 'CRLV')
          att.append('category', 'CRLV')
          await fetch(`/api/evaluations/${props.evaluationId}/attachments`, { method: 'POST', body: att })
        } catch { /* silent — o extract já capturou os dados, anexo é bônus */ }
      }

      if (missing.length > 0) {
        setState({ kind: 'partial', file, confidence: conf, missing, message })
      } else {
        setState({ kind: 'success', file, confidence: conf, message: message || 'Documento lido com sucesso.' })
      }
    } catch (err) {
      setState({ kind: 'failure', file, message: (err as Error)?.message ?? 'Erro de conexão ao enviar arquivo.' })
    }
  }

  function onPickClick() {
    inputRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) void handleFile(f)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void handleFile(f)
  }

  function onReset() {
    setState({ kind: 'idle' })
  }

  const isBusy = state.kind === 'uploading' || state.kind === 'reading'
  // Mantém a referência ao onSkip — usado pelo botão "Preencher manualmente"
  // dentro do estado de falha (não é mais um botão público no idle).
  void onSkip

  // Decide o que mostrar — modo silencioso por padrão. Sucesso e leitura
  // parcial são tratados sem banner (o operador vê os campos preenchidos
  // automaticamente abaixo). Apenas mostramos feedback em erro real.
  const hasFile =
    state.kind === 'success' ||
    state.kind === 'partial' ||
    state.kind === 'failure'
  const currentFile =
    state.kind === 'success' ? state.file :
    state.kind === 'partial' ? state.file :
    state.kind === 'failure' ? (state.file ?? null) :
    null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <FileText className="h-5 w-5 text-brand-600 mt-0.5" />
        <div>
          <h3 className="font-semibold text-gray-800">CRLV do veículo</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Envie o <strong>CRLV / CRLV-e / ATPV-e</strong> em PDF ou imagem. Aceitamos apenas documentos oficiais do veículo (PDF, JPG, PNG, WEBP — máx 8MB).
          </p>
        </div>
      </div>

      {/* ── Estado idle ── */}
      {state.kind === 'idle' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={onPickClick}
          className={[
            'cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
            dragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-gray-50/40 hover:border-brand-400 hover:bg-brand-50/30',
          ].join(' ')}
        >
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100">
            <Upload className="h-6 w-6 text-brand-700" />
          </div>
          <p className="text-sm font-semibold text-gray-800">Clique ou arraste o arquivo aqui</p>
          <p className="text-[11px] text-gray-500 mt-1">PDF · JPG · PNG · WEBP · máx 8MB</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={onFileSelected}
          />
        </div>
      )}

      {/* ── Estado loading (mínimo) ── */}
      {isBusy && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-3 text-sm text-brand-800">
          <Loader2 className="h-4 w-4 animate-spin" />
          {state.kind === 'uploading' ? 'Enviando arquivo...' : 'Lendo documento...'}
        </div>
      )}

      {/* ── Sucesso / parcial — silencioso, só mostra o chip do arquivo ── */}
      {(state.kind === 'success' || state.kind === 'partial') && currentFile && (
        <FileChip file={currentFile} onRemove={onReset} onRetry={() => void handleFile(currentFile)} />
      )}

      {/* ── Falha real (token inválido, arquivo corrompido, etc.) — preserva ── */}
      {state.kind === 'failure' && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">Não foi possível ler o documento</p>
              <p className="text-xs text-red-700 mt-0.5">{state.message}</p>
              <button
                type="button"
                onClick={() => state.file ? void handleFile(state.file) : onPickClick()}
                className="mt-2 inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
              >
                <RefreshCw className="h-3 w-3" /> Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Referências mantidas pra não quebrar a interface tipada
          (props recebidos mas usados de forma transparente) */}
      <input type="hidden" data-uploaded={String(hasUploaded || hasFile)} data-skipped={String(hasSkipped)} />
    </div>
  )
}

// Notas pra leitor futuro: o componente NUNCA exibe "Leitura parcial",
// "Dados extraídos", "confiança" etc — esse feedback foi removido a pedido
// do operador. Se a leitura é parcial, o usuário simplesmente vê os campos
// que conseguimos preencher e completa o resto manualmente.
// O botão "Não tenho documento agora" também foi removido — o operador pode
// prosseguir sem upload digitando a placa diretamente abaixo.
void confidenceLabel

// ── Sub-componente: chip do arquivo com ações ────────────────────────────────

function FileChip({ file, onRemove, onRetry }: { file: File; onRemove: () => void; onRetry: () => void }) {
  // Visualizar = abre o blob em nova aba. Funciona enquanto o objeto não é
  // garbage-collected — para PDFs locais isso é suficiente até o salvamento.
  const onView = () => {
    try {
      const url = URL.createObjectURL(file)
      window.open(url, '_blank', 'noopener,noreferrer')
      // Não revogamos imediatamente: o popup acabou de pedir o URL.
    } catch { /* silent */ }
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs">
      <FileCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
      <span className="flex-1 min-w-0 truncate font-medium text-gray-700">{file.name}</span>
      <span className="text-[10px] text-gray-400">{fmtSize(file.size)}</span>
      <button type="button" onClick={onView} title="Visualizar" className="text-gray-500 hover:text-brand-700">
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onRetry} title="Ler novamente" className="text-gray-500 hover:text-brand-700">
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onRemove} title="Remover" className="text-gray-500 hover:text-red-600">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
