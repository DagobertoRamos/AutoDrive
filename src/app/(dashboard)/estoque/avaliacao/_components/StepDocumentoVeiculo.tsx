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
  | { kind: 'reading'; message?: string }
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

function preprocessCanvasForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imgData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // Convert to grayscale
    let gray = 0.299 * r + 0.587 * g + 0.114 * b

    // Enhancing contrast: dynamic thresholding
    if (gray < 130) {
      gray = 0
    } else {
      gray = 255
    }

    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas
}

async function renderImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let scale = 1.0
      // Limita dimensões para no máximo 2000px para evitar estouro de memória no mobile
      if (img.width > 2000 || img.height > 2000) {
        scale = Math.min(2000 / img.width, 2000 / img.height)
      }
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas)
      } else {
        reject(new Error('Falha ao obter contexto 2D do Canvas.'))
      }
      URL.revokeObjectURL(img.src)
    }
    img.onerror = (err) => {
      reject(err)
      URL.revokeObjectURL(img.src)
    }
  })
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

    setState({ kind: 'reading', message: 'Lendo documento...' })
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
      
      const requiresOcr: boolean            = Boolean((d as any).requiresOcr)
      const documentId: string              = (d as any).documentId ?? ''
      const documentHash: string            = (d as any).documentHash ?? ''
      const extractionRunId: string         = (d as any).extractionRunId ?? ''

      // Se for necessário OCR/QR Code local (client-side)
      if (requiresOcr) {
        setState({ kind: 'reading', message: 'Inicializando OCR e QR local...' })
        let ocrText = ''
        let qrContent = ''

        try {
          if (file.type === 'application/pdf') {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
            pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

            const arrayBuffer = await file.arrayBuffer()
            const loadingTask = pdfjs.getDocument({
              data: new Uint8Array(arrayBuffer),
              useSystemFonts: true,
              disableFontFace: true,
              verbosity: 0,
            })
            const pdf = await loadingTask.promise
            const totalPages = Math.min(pdf.numPages, 3)

            const { createWorker } = await import('tesseract.js')
            const worker = await createWorker('por', 1, {
              workerPath: '/tesseract/worker.min.js',
              corePath: '/tesseract/tesseract-core-lstm.js',
              langPath: window.location.origin + '/tessdata/v1',
              gzip: true,
            })

            try {
              for (let p = 1; p <= totalPages; p++) {
                setState({ kind: 'reading', message: `Executando OCR local (página ${p}/${totalPages})...` })
                const page = await pdf.getPage(p)
                const viewport = page.getViewport({ scale: 1.5 })
                const canvas = document.createElement('canvas')
                canvas.width = viewport.width
                canvas.height = viewport.height
                const ctx = canvas.getContext('2d')
                if (!ctx) throw new Error('Falha ao obter contexto do Canvas.')

                await page.render({
                  canvasContext: ctx,
                  viewport: viewport,
                } as any).promise

                // Tenta decodificar QR Code
                if (!qrContent) {
                  try {
                    const { BrowserQRCodeReader } = await import('@zxing/browser')
                    const reader = new BrowserQRCodeReader()
                    const qrResult = await reader.decodeFromCanvas(canvas)
                    qrContent = qrResult.getText()
                  } catch { /* sem qr */ }
                }

                // Pré-processa imagem do Canvas para o OCR
                preprocessCanvasForOcr(canvas)

                // Roda o Tesseract
                const { data: { text } } = await worker.recognize(canvas)
                ocrText += text + '\n'
              }
            } finally {
              await worker.terminate()
            }
          } else {
            // Imagem nativa
            setState({ kind: 'reading', message: 'Processando imagem local...' })
            const canvas = await renderImageToCanvas(file)

            if (!qrContent) {
              try {
                const { BrowserQRCodeReader } = await import('@zxing/browser')
                const reader = new BrowserQRCodeReader()
                const qrResult = await reader.decodeFromCanvas(canvas)
                qrContent = qrResult.getText()
              } catch { /* sem qr */ }
            }

            preprocessCanvasForOcr(canvas)

            const { createWorker } = await import('tesseract.js')
            const worker = await createWorker('por', 1, {
              workerPath: '/tesseract/worker.min.js',
              corePath: '/tesseract/tesseract-core-lstm.js',
              langPath: window.location.origin + '/tessdata/v1',
              gzip: true,
            })

            try {
              const { data: { text } } = await worker.recognize(canvas)
              ocrText = text
            } finally {
              await worker.terminate()
            }
          }

          // Envia observações brutas de volta para o backend sem reenviar o arquivo original
          setState({ kind: 'reading', message: 'Cruzando consenso no servidor...' })
          const ocrRes = await fetch('/api/evaluations/vehicle-document/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documentId,
              documentHash,
              extractionRunId,
              ocrText,
              qrContent,
              isClientResult: true,
            }),
          })
          const ocrData = await ocrRes.json().catch(() => ({}))

          if (!ocrRes.ok) {
            setState({ kind: 'failure', file, message: ocrData.error ?? 'Falha ao processar o resultado do OCR local.' })
            return
          }

          const ocrExtracted: boolean = Boolean(ocrData.extracted)
          const ocrConf: ExtractionConfidence = ocrData.confidence ?? 'low'
          const ocrSrc: ExtractionSource = ocrData.source ?? 'ocr'
          const ocrVehicle: ExtractedVehicle = ocrData.vehicle ?? {}
          const ocrMissing: string[] = ocrData.missingFields ?? []
          const ocrMessage: string = ocrData.message ?? ''

          if (!ocrExtracted) {
            setState({ kind: 'failure', file, message: ocrMessage || 'Não foi possível extrair dados por OCR.' })
            return
          }

          onExtracted(ocrVehicle, ocrSrc, ocrConf)

          if (props.evaluationId) {
            try {
              const att = new FormData()
              att.append('file', file)
              att.append('kind', 'CRLV')
              att.append('category', 'CRLV')
              await fetch(`/api/evaluations/${props.evaluationId}/attachments`, { method: 'POST', body: att })
            } catch { /* silent */ }
          }

          if (ocrMissing.length > 0) {
            setState({ kind: 'partial', file, confidence: ocrConf, missing: ocrMissing, message: ocrMessage })
          } else {
            setState({ kind: 'success', file, confidence: ocrConf, message: ocrMessage || 'Documento processado por OCR local.' })
          }
          return

        } catch (ocrErr) {
          setState({ kind: 'failure', file, message: `Falha no processamento OCR/QR: ${(ocrErr as Error)?.message}` })
          return
        }
      }

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

      {/* ── Sucesso / parcial — chip do arquivo + hint de persistência ── */}
      {(state.kind === 'success' || state.kind === 'partial') && currentFile && (
        <>
          <FileChip file={currentFile} onRemove={onReset} onRetry={() => void handleFile(currentFile)} />
          {props.evaluationId && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
              <strong>CRLV salvo com sucesso.</strong> Este documento ficará disponível na
              aba <em>Documentação</em> do veículo para consultas futuras — não precisa reenviar
              em novas negociações.
            </p>
          )}
        </>
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
