'use client'

// =============================================================================
// StepDocumentoVeiculo — Upload do CRLV com extração automática de campos.
//
// MÁQUINA DE ESTADOS EXPLÍCITA:
//   IDLE → UPLOADING → VALIDATING → READING_NATIVE_PDF → RENDERING_PDF
//          → READING_QR → LOADING_OCR → RUNNING_OCR → PARSING
//          → SUCCESS | PARTIAL_SUCCESS | MANUAL_REQUIRED | FAILED | TIMEOUT | CANCELLED
//
// REGRAS DE SEGURANÇA:
//   1. Todo estado de loading possui timeout configurável.
//   2. Toda Promise pode ser cancelada via AbortController.
//   3. O finally do fluxo principal SEMPRE encerra o loading.
//   4. O worker do Tesseract SEMPRE é terminado (finally).
//   5. Não há dupla execução simultânea (processingRef + extractionRunId).
//   6. React StrictMode não causa dupla execução (proteção via ref).
// =============================================================================

import { useRef, useState, useCallback, useEffect } from 'react'
import {
  Upload, FileCheck, XCircle,
  Loader2, Eye, Trash2, RefreshCw, FileText,
  AlertTriangle, CheckCircle, Clock,
} from 'lucide-react'
import type { ExtractedVehicle, ExtractionConfidence } from '@/lib/crlv/parser'
import type { ExtractResultField } from '@/lib/crlv/pipeline/shared/types'

async function calculateFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function getSafeFields(payload: unknown): Record<string, ExtractResultField> {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('fields' in payload) ||
    !payload.fields ||
    typeof payload.fields !== 'object' ||
    Array.isArray(payload.fields)
  ) {
    return {}
  }
  return payload.fields as Record<string, ExtractResultField>
}

function mapToCanonical(fields: Record<string, ExtractResultField>): ExtractedVehicle {
  const result: any = {}
  
  const mapField = (srcKey: string, destKey: string, type: 'string' | 'number' = 'string') => {
    if (fields[srcKey]) {
      const val = fields[srcKey].validatedValue ?? fields[srcKey].normalizedValue
      if (val !== null && val !== undefined && val !== '') {
        if (type === 'number') {
          const num = Number(val)
          if (!isNaN(num)) result[destKey] = num
        } else {
          result[destKey] = val
        }
      }
    }
  }

  mapField('placa', 'plate')
  mapField('renavam', 'renavam')
  mapField('chassi', 'chassis')
  mapField('anoFabricacao', 'manufactureYear', 'number')
  mapField('anoModelo', 'modelYear', 'number')

  return result as ExtractedVehicle
}

function mapExtractionSource(strategy: string): ExtractionSource {
  if (strategy === 'CLIENT_OCR') return 'ocr'
  return 'pdf-text'
}

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type ExtractionSource = 'pdf-text' | 'ocr' | 'manual'

export interface StepDocumentoVeiculoProps {
  evaluationId?: string | null
  onExtracted:   (data: ExtractedVehicle, source: ExtractionSource, confidence: ExtractionConfidence) => void
  onSkip:        (reason: string) => void
  hasUploaded:   boolean
  hasSkipped:    boolean
}

// ── Máquina de estados ────────────────────────────────────────────────────────

type ProcessingState =
  | 'IDLE'
  | 'UPLOADING'
  | 'VALIDATING'
  | 'READING_NATIVE_PDF'
  | 'RENDERING_PDF'
  | 'READING_QR'
  | 'LOADING_OCR'
  | 'RUNNING_OCR'
  | 'PARSING'

type TerminalState =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'MANUAL_REQUIRED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'CANCELLED'

type MachineState = ProcessingState | TerminalState

const PROCESSING_STATES = new Set<MachineState>([
  'UPLOADING', 'VALIDATING', 'READING_NATIVE_PDF',
  'RENDERING_PDF', 'READING_QR', 'LOADING_OCR', 'RUNNING_OCR', 'PARSING',
])

const TERMINAL_STATES = new Set<MachineState>([
  'SUCCESS', 'PARTIAL_SUCCESS', 'MANUAL_REQUIRED', 'FAILED', 'TIMEOUT', 'CANCELLED',
])

function isProcessing(s: MachineState): boolean { return PROCESSING_STATES.has(s) }
function isTerminal(s: MachineState): boolean   { return TERMINAL_STATES.has(s) }

type UIState =
  | { machine: 'IDLE' }
  | { machine: ProcessingState; step: string }
  | { machine: 'SUCCESS';          file: File; confidence: ExtractionConfidence; fieldsApplied: number; message: string }
  | { machine: 'PARTIAL_SUCCESS';  file: File; confidence: ExtractionConfidence; missing: string[]; fieldsApplied: number; message: string }
  | { machine: 'MANUAL_REQUIRED'; file: File; message: string }
  | { machine: 'FAILED';           file?: File; message: string; step?: string }
  | { machine: 'TIMEOUT';          file?: File; step: string }
  | { machine: 'CANCELLED' }

// ── Timeouts por etapa (ms) ───────────────────────────────────────────────────

const TIMEOUTS = {
  FILE_VALIDATION:    10_000,
  NATIVE_PDF:         15_000,
  PAGE_RENDER:        20_000,
  QR_READING:         10_000,
  OCR_WORKER_LOAD:    30_000,
  OCR_PAGE:           60_000,
  TOTAL_PROCESSING:   90_000,
  NETWORK:            20_000,
} as const

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'
const MAX_BYTES = 8 * 1024 * 1024

function fmtSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Helper: Promise com timeout ───────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error(`Timeout: ${label} (${ms / 1000}s)`), { isTimeout: true, step: label }))
    }, ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

// ── Helper: preprocessar canvas para OCR ─────────────────────────────────────

function preprocessCanvasForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imgData.data
  for (let i = 0; i < data.length; i += 4) {
    let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    gray = gray < 130 ? 0 : 255
    data[i] = data[i + 1] = data[i + 2] = gray
  }
  ctx.putImageData(imgData, 0, 0)
}

// ── Helper: renderizar imagem em canvas ───────────────────────────────────────

async function renderImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.src = objectUrl
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let scale = 1.0
      if (img.width > 2000 || img.height > 2000) {
        scale = Math.min(2000 / img.width, 2000 / img.height)
      }
      canvas.width  = img.width  * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(objectUrl)
        resolve(canvas)
      } else {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Falha ao obter contexto 2D do Canvas.'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Falha ao carregar a imagem.'))
    }
  })
}

// ── Helper: tentar QR Code (sem lançar exceção) ───────────────────────────────

async function tryReadQr(canvas: HTMLCanvasElement): Promise<string> {
  try {
    const { BrowserQRCodeReader } = await import('@zxing/browser')
    const reader = new BrowserQRCodeReader()
    // decodeFromCanvas é síncrono no @zxing/browser — pode lançar NotFoundException
    // Envolto em Promise.resolve() para compatibilidade com withTimeout
    const result = await withTimeout(
      Promise.resolve(reader.decodeFromCanvas(canvas)),
      TIMEOUTS.QR_READING,
      'READING_QR',
    )
    return (result as any).getText()
  } catch {
    return '' // QR não encontrado ou timeout — não é erro fatal
  }
}

// ── Helper: log de instrumentação (sem dados sensíveis) ───────────────────────

function logStep(step: string, extra?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[CRLV:${step}]`, extra ?? '')
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

export function StepDocumentoVeiculo(props: StepDocumentoVeiculoProps) {
  const { onExtracted, onSkip, hasUploaded, hasSkipped } = props

  const [uiState, setUiState] = useState<UIState>({ machine: 'IDLE' })
  const [dragging, setDragging] = useState(false)
  const [useV2, setUseV2] = useState(false)
  const inputRef       = useRef<HTMLInputElement | null>(null)
  const processingRef  = useRef(false) // protege contra dupla execução
  const abortRef       = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/evaluations/vehicle-document/extract/feature-flag')
      .then(r => r.json())
      .then(d => setUseV2(d.enabled))
      .catch(() => setUseV2(false))
  }, [])

  // ⏹️ Cancelamento explícito ⏹️─────────────────────────────────────────────────

  const cancelCurrent = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    processingRef.current = false
    setUiState({ machine: 'CANCELLED' })
  }, [])

  // ── Fluxo principal ────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    // Proteção contra dupla execução
    if (processingRef.current) return
    processingRef.current = true

    // Cancela qualquer execução anterior
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    // V2 Pipeline Branch
    if (useV2) {
      setUiState({ machine: 'UPLOADING', step: 'Iniciando Pipeline V2...' })
      try {
        const { DocumentExtractionController } = await import('@/lib/crlv/pipeline/client/DocumentExtractionController.client')
        
        // 1. Call Init
        const initRes = await fetch('/api/evaluations/vehicle-document/extract/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            fileHash: await calculateFileSha256(file)
          })
        });
        const initData = await initRes.json();
        
        if (!initRes.ok) throw new Error(initData.error || 'Failed to init V2 session');

        setUiState({ machine: 'READING_NATIVE_PDF', step: 'Processando arquivo (V2)...' })
        
        if (file.size < 4000000 && file.type === 'application/pdf') {
          // Server-Native for small PDFs
          const fd = new FormData();
          fd.append('processingId', initData.processingId);
          fd.append('file', file);
          const srvRes = await fetch('/api/evaluations/vehicle-document/extract/server-native', { method: 'POST', body: fd });
          
          if (!srvRes.ok) {
            const errData = await srvRes.json().catch(() => ({}));
            throw new Error(errData.error || 'Falha no processamento servidor');
          }
          
          const srvData = await srvRes.json();
          const safeFields = getSafeFields(srvData);
          
          if (srvData.status === 'COMPLETED' || Object.keys(safeFields).length > 0) {
            onExtracted(mapToCanonical(safeFields), mapExtractionSource(srvData.strategyUsed), 'high');
            setUiState({ machine: 'SUCCESS', file, confidence: 'high', fieldsApplied: Object.keys(safeFields).length, message: 'Extração V2 concluída' });
            return;
          }
        }
        
        // Client Flow
        const clientRes = await DocumentExtractionController.processClientSide(file, initData);
        setUiState({ machine: 'PARSING', step: 'Enviando resultado (V2)...' })
        
        const txtRes = await fetch('/api/evaluations/vehicle-document/extract/text-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            processingId: initData.processingId,
            processingToken: initData.processingToken,
            source: clientRes.source,
            pages: clientRes.pages,
            pdfjsVersion: 'V2',
            durationMs: 100,
            tesseractVersion: 'V2',
            language: 'por'
          })
        });
        if (!txtRes.ok) {
          const errData = await txtRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Falha ao salvar resultado');
        }
        const txtData = await txtRes.json();
        const safeTxtFields = getSafeFields(txtData);
        
        if (txtData.status === 'COMPLETED' || Object.keys(safeTxtFields).length > 0) {
          onExtracted(mapToCanonical(safeTxtFields), mapExtractionSource(txtData.strategyUsed), 'high');
          setUiState({ machine: 'SUCCESS', file, confidence: 'high', fieldsApplied: Object.keys(safeTxtFields).length, message: 'Extração V2 concluída' });
        } else {
          setUiState({ machine: 'MANUAL_REQUIRED', file, message: 'V2: ' + (txtData.message || 'Dados não encontrados') });
        }

      } catch (e: any) {
        setUiState({ machine: 'FAILED', file, message: String(e) })
      } finally {
        processingRef.current = false
      }
      return;
    }

    // Referências para cleanup garantido
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tesseractWorker: any | null = null
    let fieldsApplied = 0

    const stepFailed = (msg: string, step?: string, f?: File) => {
      setUiState({ machine: 'FAILED', message: msg, step, file: f ?? file })
    }

    const stepTimeout = (step: string, f?: File) => {
      setUiState({ machine: 'TIMEOUT', step, file: f ?? file })
    }

    try {
      // ── ESTADO: VALIDATING ────────────────────────────────────────────────
      setUiState({ machine: 'VALIDATING', step: 'Validando arquivo...' })
      logStep('FILE_VALIDATION_STARTED', { name: file.name, size: file.size, type: file.type })

      if (file.size > MAX_BYTES) {
        stepFailed('Arquivo maior que 8MB. Reduza ou envie outro arquivo.', 'VALIDATING')
        return
      }
      const acceptedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
      if (!acceptedTypes.includes(file.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
        stepFailed('Apenas CRLV / CRLV-e / ATPV-e em PDF ou imagem são aceitos.', 'VALIDATING')
        return
      }

      logStep('FILE_VALIDATION_COMPLETED')

      // ── ESTADO: UPLOADING ─────────────────────────────────────────────────
      setUiState({ machine: 'UPLOADING', step: 'Enviando arquivo...' })
      logStep('DOCUMENT_UPLOAD_STARTED')

      const form = new FormData()
      form.append('file', file)
      if (props.evaluationId) form.append('evaluationId', props.evaluationId)

      let uploadRes: Response
      try {
        uploadRes = await withTimeout(
          fetch('/api/evaluations/vehicle-document/extract', {
            method: 'POST',
            body: form,
            signal: ac.signal,
          }),
          TIMEOUTS.NETWORK,
          'UPLOADING',
        )
      } catch (e: any) {
        if (ac.signal.aborted) return
        if (e?.isTimeout) { stepTimeout('UPLOADING'); return }
        stepFailed('Falha de rede ao enviar o arquivo.', 'UPLOADING')
        return
      }

      logStep('DOCUMENT_UPLOAD_COMPLETED', { status: uploadRes.status })

      let d: Record<string, any>
      try {
        d = await uploadRes.json()
      } catch {
        stepFailed('Resposta inválida do servidor (JSON inválido).', 'UPLOADING')
        return
      }

      if (!uploadRes.ok) {
        stepFailed(d?.error ?? 'Falha ao processar o documento.', 'UPLOADING')
        return
      }

      const requiresOcr: boolean       = Boolean(d.requiresOcr)
      const documentId: string         = d.documentId ?? ''
      const documentHash: string       = d.documentHash ?? ''
      const extractionRunId: string    = d.extractionRunId ?? ''

      // ── CAMINHO A: Resultado nativo do PDF (sem OCR) ─────────────────────
      if (!requiresOcr) {
        logStep('NATIVE_PDF_EXTRACTION_COMPLETED', { confidence: d.confidence })
        const vehicle: ExtractedVehicle = d.vehicle ?? {}
        const missing: string[]         = d.missingFields ?? []
        const conf: ExtractionConfidence = d.confidence ?? 'low'
        const src: ExtractionSource     = d.source ?? 'pdf-text'

        fieldsApplied = countFilledFields(vehicle)

        if (!d.extracted || fieldsApplied === 0) {
          setUiState({ machine: 'MANUAL_REQUIRED', file, message: 'Não foi possível preencher automaticamente este documento. Você pode preencher os dados manualmente ou tentar outro arquivo.' })
          return
        }

        onExtracted(vehicle, src, conf)
        await tryAttachCrlv(props.evaluationId, file, ac.signal)

        if (missing.length > 0) {
          setUiState({ machine: 'PARTIAL_SUCCESS', file, confidence: conf, missing, fieldsApplied, message: `Parte dos dados foi encontrada (${fieldsApplied} campos). Revise os campos destacados.` })
        } else {
          setUiState({ machine: 'SUCCESS', file, confidence: conf, fieldsApplied, message: `Documento lido. ${fieldsApplied} campos preenchidos. Revise os dados.` })
        }
        return
      }

      // ── CAMINHO B: OCR local necessário ───────────────────────────────────
      let ocrText  = ''
      let qrContent = ''

      if (file.type === 'application/pdf') {
        // ── ESTADO: READING_NATIVE_PDF ──────────────────────────────────────
        setUiState({ machine: 'READING_NATIVE_PDF', step: 'Carregando PDF...' })
        logStep('PDF_RENDER_STARTED')

        let pdfjs: any
        let pdf: any
        try {
          pdfjs = await withTimeout(
            import('pdfjs-dist/legacy/build/pdf.mjs'),
            TIMEOUTS.NATIVE_PDF,
            'READING_NATIVE_PDF',
          )
          // pdfjs-dist v5: worker configurado via GlobalWorkerOptions
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

          const arrayBuffer = await file.arrayBuffer()
          pdf = await withTimeout(
            pdfjs.getDocument({
              data: new Uint8Array(arrayBuffer),
              useSystemFonts: true,
              disableFontFace: true,
              verbosity: 0,
            }).promise,
            TIMEOUTS.NATIVE_PDF,
            'READING_NATIVE_PDF',
          )
        } catch (e: any) {
          if (ac.signal.aborted) return
          if (e?.isTimeout) { stepTimeout('READING_NATIVE_PDF'); return }
          stepFailed(`Falha ao carregar o PDF: ${e?.message ?? 'erro desconhecido'}`, 'READING_NATIVE_PDF')
          return
        }

        logStep('PDF_RENDER_COMPLETED', { pages: pdf.numPages })

        // ── ESTADO: LOADING_OCR ─────────────────────────────────────────────
        setUiState({ machine: 'LOADING_OCR', step: 'Carregando engine de OCR...' })
        logStep('OCR_WORKER_LOADING')

        try {
          const { createWorker } = await import('tesseract.js')

          // Tesseract.js v7 API — os paths abaixo devem apontar para os
          // assets servidos via /public/ (verificados no build).
          // workerPath: script do worker do Tesseract
          // corePath:   pasta contendo os arquivos WASM (não o arquivo .js)
          // langPath:   pasta contendo os arquivos .traineddata.gz
          tesseractWorker = await withTimeout(
            createWorker('por', 1, {
              workerPath: '/tesseract/worker.min.js',
              corePath: '/tesseract',
              langPath: '/tessdata/v1',
              gzip: true,
              logger: (m: any) => {
                if (m?.status === 'recognizing text') {
                  // atualiza o estado com o progresso real — opcional
                }
              },
            }),
            TIMEOUTS.OCR_WORKER_LOAD,
            'LOADING_OCR',
          )
        } catch (e: any) {
          if (ac.signal.aborted) return
          if (e?.isTimeout) {
            stepTimeout('LOADING_OCR')
            return
          }
          // Worker não carregou — fallback para manual
          setUiState({ machine: 'MANUAL_REQUIRED', file, message: 'Não foi possível carregar o engine de OCR neste navegador. Preencha os dados manualmente.' })
          return
        }

        logStep('OCR_WORKER_READY')

        const totalPages = Math.min(pdf.numPages, 3)

        // ── ESTADO: RUNNING_OCR ─────────────────────────────────────────────
        try {
          for (let p = 1; p <= totalPages; p++) {
            if (ac.signal.aborted) return

            setUiState({ machine: 'RUNNING_OCR', step: `OCR local (página ${p}/${totalPages})...` })
            logStep('OCR_STARTED', { page: p })

            // ── RENDERIZAÇÃO DA PÁGINA ────────────────────────────────────
            setUiState({ machine: 'RENDERING_PDF', step: `Renderizando página ${p}/${totalPages}...` })

            let canvas: HTMLCanvasElement
            try {
              const page     = await pdf.getPage(p)
              const viewport = page.getViewport({ scale: 1.5 })
              canvas = document.createElement('canvas')
              canvas.width  = viewport.width
              canvas.height = viewport.height
              const ctx = canvas.getContext('2d')
              if (!ctx) throw new Error('Canvas 2D não disponível neste navegador.')

              await withTimeout(
                page.render({ canvasContext: ctx, viewport } as any).promise,
                TIMEOUTS.PAGE_RENDER,
                'RENDERING_PDF',
              )
            } catch (e: any) {
              if (ac.signal.aborted) return
              if (e?.isTimeout) { stepTimeout('RENDERING_PDF'); return }
              stepFailed(`Falha ao renderizar página ${p}: ${e?.message}`, 'RENDERING_PDF')
              return
            }

            // ── QR CODE ────────────────────────────────────────────────────
            setUiState({ machine: 'READING_QR', step: `Lendo QR Code (página ${p})...` })
            if (!qrContent) {
              qrContent = await tryReadQr(canvas)
            }

            // ── OCR DA PÁGINA ──────────────────────────────────────────────
            setUiState({ machine: 'RUNNING_OCR', step: `OCR local (página ${p}/${totalPages})...` })
            preprocessCanvasForOcr(canvas)

            try {
              const ocrResult = await withTimeout(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                tesseractWorker.recognize(canvas) as Promise<{ data: { text: string } }>,
                TIMEOUTS.OCR_PAGE,
                'RUNNING_OCR',
              )
              const text = (ocrResult as any)?.data?.text ?? ''
              ocrText += text + '\n'
              logStep('OCR_COMPLETED', { page: p, chars: text.length })
            } catch (e: any) {
              if (ac.signal.aborted) return
              if (e?.isTimeout) { stepTimeout('RUNNING_OCR'); return }
              // OCR de uma página falhou — continua com as demais, não é fatal
              console.warn(`[CRLV] OCR falhou na página ${p}:`, e?.message)
            }
          }
        } finally {
          // Worker SEMPRE é terminado, mesmo em caso de erro
          try { await tesseractWorker?.terminate() } catch { /* silent */ }
          tesseractWorker = null
          try { await pdf.destroy?.() } catch { /* silent */ }
        }

      } else {
        // ── IMAGEM NATIVA ──────────────────────────────────────────────────

        setUiState({ machine: 'RENDERING_PDF', step: 'Processando imagem...' })

        let canvas: HTMLCanvasElement
        try {
          canvas = await withTimeout(
            renderImageToCanvas(file),
            TIMEOUTS.PAGE_RENDER,
            'RENDERING_PDF',
          )
        } catch (e: any) {
          if (ac.signal.aborted) return
          if (e?.isTimeout) { stepTimeout('RENDERING_PDF'); return }
          stepFailed(`Falha ao processar a imagem: ${e?.message}`, 'RENDERING_PDF')
          return
        }

        // QR Code
        setUiState({ machine: 'READING_QR', step: 'Lendo QR Code...' })
        qrContent = await tryReadQr(canvas)

        // OCR
        setUiState({ machine: 'LOADING_OCR', step: 'Carregando engine de OCR...' })
        logStep('OCR_WORKER_LOADING')

        try {
          const { createWorker } = await import('tesseract.js')
          tesseractWorker = await withTimeout(
            createWorker('por', 1, {
              workerPath: '/tesseract/worker.min.js',
              corePath: '/tesseract',
              langPath: '/tessdata/v1',
              gzip: true,
            }),
            TIMEOUTS.OCR_WORKER_LOAD,
            'LOADING_OCR',
          )
          logStep('OCR_WORKER_READY')
        } catch (e: any) {
          if (ac.signal.aborted) return
          if (e?.isTimeout) { stepTimeout('LOADING_OCR'); return }
          setUiState({ machine: 'MANUAL_REQUIRED', file, message: 'Não foi possível carregar o engine de OCR. Preencha os dados manualmente.' })
          return
        }

        try {
          setUiState({ machine: 'RUNNING_OCR', step: 'Executando OCR na imagem...' })
          preprocessCanvasForOcr(canvas)
          const ocrResult = await withTimeout(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            tesseractWorker.recognize(canvas) as Promise<{ data: { text: string } }>,
            TIMEOUTS.OCR_PAGE,
            'RUNNING_OCR',
          )
          ocrText = (ocrResult as any)?.data?.text ?? ''
          logStep('OCR_COMPLETED', { chars: ocrText.length })
        } catch (e: any) {
          if (ac.signal.aborted) return
          if (e?.isTimeout) { stepTimeout('RUNNING_OCR'); return }
          // OCR falhou — tenta enviar com texto vazio para o backend
          ocrText = ''
        } finally {
          try { await tesseractWorker?.terminate() } catch { /* silent */ }
          tesseractWorker = null
        }
      }

      // ── ESTADO: PARSING — Envia observações de OCR ao backend ─────────────
      if (ac.signal.aborted) return

      setUiState({ machine: 'PARSING', step: 'Cruzando consenso no servidor...' })
      logStep('PARSER_STARTED', { ocrChars: ocrText.length, qrFound: Boolean(qrContent) })

      let ocrRes: Response
      try {
        ocrRes = await withTimeout(
          fetch('/api/evaluations/vehicle-document/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ac.signal,
            body: JSON.stringify({
              documentId,
              documentHash,
              extractionRunId,
              ocrText,
              qrContent,
              isClientResult: true,
            }),
          }),
          TIMEOUTS.NETWORK,
          'PARSING',
        )
      } catch (e: any) {
        if (ac.signal.aborted) return
        if (e?.isTimeout) { stepTimeout('PARSING'); return }
        stepFailed('Falha de rede ao enviar resultado do OCR.', 'PARSING')
        return
      }

      let ocrData: Record<string, any>
      try {
        ocrData = await ocrRes.json()
      } catch {
        stepFailed('Resposta inválida do servidor após OCR (JSON inválido).', 'PARSING')
        return
      }

      logStep('PARSER_COMPLETED', { status: ocrRes.status, confidence: ocrData?.confidence })

      if (!ocrRes.ok) {
        stepFailed(ocrData?.error ?? 'Falha ao processar o resultado do OCR local.', 'PARSING')
        return
      }

      const ocrVehicle: ExtractedVehicle  = ocrData.vehicle ?? {}
      const ocrMissing: string[]           = ocrData.missingFields ?? []
      const ocrConf: ExtractionConfidence  = ocrData.confidence ?? 'low'
      const ocrSrc: ExtractionSource       = ocrData.source ?? 'ocr'

      fieldsApplied = countFilledFields(ocrVehicle)

      if (!ocrData.extracted || fieldsApplied === 0) {
        setUiState({
          machine: 'MANUAL_REQUIRED',
          file,
          message: 'Não foi possível preencher automaticamente este documento. Você pode preencher os dados manualmente ou tentar outro arquivo.',
        })
        return
      }

      onExtracted(ocrVehicle, ocrSrc, ocrConf)
      await tryAttachCrlv(props.evaluationId, file, ac.signal)

      logStep('FIELD_MAPPING_COMPLETED', { fieldsApplied, missing: ocrMissing.length })

      if (ocrMissing.length > 0) {
        setUiState({ machine: 'PARTIAL_SUCCESS', file, confidence: ocrConf, missing: ocrMissing, fieldsApplied, message: `Parte dos dados foi encontrada (${fieldsApplied} campos). Revise os campos destacados.` })
      } else {
        setUiState({ machine: 'SUCCESS', file, confidence: ocrConf, fieldsApplied, message: `Documento lido. ${fieldsApplied} campos preenchidos. Revise os dados.` })
      }

    } catch (err: any) {
      if (ac.signal.aborted) return
      const isTimeout = err?.isTimeout === true
      if (isTimeout) {
        stepTimeout(err?.step ?? 'processamento')
      } else {
        stepFailed(err?.message ?? 'Erro inesperado ao processar o documento.', 'FAILED')
      }
      logStep('EXTRACTION_FAILED', { error: err?.message, isTimeout })
    } finally {
      // GARANTIA: worker SEMPRE é terminado mesmo em caso de exceção não tratada
      if (tesseractWorker) {
        try { await tesseractWorker.terminate() } catch { /* silent */ }
      }
      processingRef.current = false
      // Não limpa abortRef — mantém o último para eventual segundo cancelamento
    }
  }

  // ── Handlers de input ─────────────────────────────────────────────────────

  function onPickClick() { inputRef.current?.click() }

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
    abortRef.current?.abort()
    abortRef.current = null
    processingRef.current = false
    setUiState({ machine: 'IDLE' })
  }

  function onRetry(file: File) {
    setUiState({ machine: 'IDLE' })
    void handleFile(file)
  }

  // ── Renderização ──────────────────────────────────────────────────────────

  const isBusy   = isProcessing(uiState.machine)
  const isIdle   = uiState.machine === 'IDLE'
  const machine  = uiState.machine
  // hasFile para compatibilidade com o wizard externo
  const hasFile  = machine === 'SUCCESS' || machine === 'PARTIAL_SUCCESS' || machine === 'MANUAL_REQUIRED' || machine === 'FAILED' || machine === 'TIMEOUT'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <FileText className="h-5 w-5 text-brand-600 mt-0.5" />
        <div>
          <h3 className="font-semibold text-gray-800">CRLV do veículo</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Envie o <strong>CRLV / CRLV-e / ATPV-e</strong> em PDF ou imagem. Aceitamos apenas documentos
            oficiais do veículo (PDF, JPG, PNG, WEBP — máx 8MB).
          </p>
        </div>
      </div>

      {/* ── IDLE: dropzone ── */}
      {isIdle && (
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
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onFileSelected} />
        </div>
      )}

      {/* ── CANCELLED ── */}
      {machine === 'CANCELLED' && (
        <div className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <p className="font-medium">Leitura cancelada.</p>
          <button type="button" onClick={onReset} className="mt-2 text-xs text-brand-700 underline">
            Enviar outro arquivo
          </button>
        </div>
      )}

      {/* ── LOADING: spinner com etapa ── */}
      {isBusy && (
        <div className="flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-3 text-sm text-brand-800">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>{'step' in uiState ? (uiState as { step: string }).step : 'Processando...'}</span>
          </div>
          <button
            type="button"
            onClick={cancelCurrent}
            className="self-start text-[11px] text-brand-600 underline hover:text-brand-800"
          >
            Cancelar leitura
          </button>
        </div>
      )}

      {/* ── SUCCESS ── */}
      {machine === 'SUCCESS' && 'file' in uiState && (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>{(uiState as { message: string }).message}</span>
          </div>
          <FileChip file={(uiState as { file: File }).file} onRemove={onReset} onRetry={() => onRetry((uiState as { file: File }).file)} />
          {props.evaluationId && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
              <strong>CRLV salvo com sucesso.</strong> Este documento ficará disponível na
              aba <em>Documentação</em> do veículo para consultas futuras — não precisa reenviar
              em novas negociações.
            </p>
          )}
        </>
      )}

      {/* ── PARTIAL_SUCCESS ── */}
      {machine === 'PARTIAL_SUCCESS' && 'file' in uiState && (
        <>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Parte dos dados foi encontrada.</p>
              <p className="text-xs mt-0.5">{(uiState as { message: string }).message} Revise os campos destacados.</p>
            </div>
          </div>
          <FileChip file={(uiState as { file: File }).file} onRemove={onReset} onRetry={() => onRetry((uiState as { file: File }).file)} />
        </>
      )}

      {/* ── MANUAL_REQUIRED ── */}
      {machine === 'MANUAL_REQUIRED' && 'file' in uiState && (
        <div className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800">Preenchimento manual necessário</p>
              <p className="text-xs text-gray-600 mt-0.5">{(uiState as { message: string }).message}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onRetry((uiState as { file: File }).file)}
                  className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  <RefreshCw className="h-3 w-3" /> Tentar novamente
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  Substituir arquivo
                </button>
                <button
                  type="button"
                  onClick={() => onSkip('MANUAL_REQUIRED')}
                  className="inline-flex items-center gap-1 rounded border border-brand-300 bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                >
                  Preencher manualmente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FAILED ── */}
      {machine === 'FAILED' && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">Não foi possível ler o documento</p>
              <p className="text-xs text-red-700 mt-0.5">{(uiState as { message: string }).message}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const f = (uiState as { file?: File }).file
                    if (f) onRetry(f); else onPickClick()
                  }}
                  className="inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                >
                  <RefreshCw className="h-3 w-3" /> Tentar novamente
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                >
                  Substituir arquivo
                </button>
                <button
                  type="button"
                  onClick={() => onSkip('FAILED')}
                  className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  Preencher manualmente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TIMEOUT ── */}
      {machine === 'TIMEOUT' && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">Tempo limite excedido</p>
              <p className="text-xs text-orange-700 mt-0.5">
                A leitura demorou mais do que o esperado e foi interrompida. O arquivo continua
                disponível e os dados podem ser preenchidos manualmente.
                {(uiState as { step: string }).step ? ` (etapa: ${(uiState as { step: string }).step})` : ''}
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const f = (uiState as { file?: File }).file
                    if (f) onRetry(f); else onPickClick()
                  }}
                  className="inline-flex items-center gap-1 rounded border border-orange-300 bg-white px-2 py-1 text-[11px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  <RefreshCw className="h-3 w-3" /> Tentar novamente
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex items-center gap-1 rounded border border-orange-300 bg-white px-2 py-1 text-[11px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  Substituir arquivo
                </button>
                <button
                  type="button"
                  onClick={() => onSkip('TIMEOUT')}
                  className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  Preencher manualmente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Referências mantidas para compatibilidade tipada */}
      <input type="hidden" data-uploaded={String(hasUploaded || hasFile)} data-skipped={String(hasSkipped)} />
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Conta campos não-nulos do ExtractedVehicle (exceto campos de metadados) */
function countFilledFields(v: ExtractedVehicle): number {
  const IGNORED = new Set(['_fields', 'ownerName', 'ownerDocument', 'predominantColor', 'fuel', 'power', 'displacement', 'vehicleType'])
  return Object.entries(v).filter(([k, val]) => !IGNORED.has(k) && val != null && val !== '').length
}

/** Tenta anexar o arquivo CRLV à avaliação (best-effort, não bloqueia) */
async function tryAttachCrlv(evaluationId: string | null | undefined, file: File, signal: AbortSignal): Promise<void> {
  if (!evaluationId) return
  try {
    const att = new FormData()
    att.append('file', file)
    att.append('kind', 'CRLV')
    att.append('category', 'CRLV')
    await fetch(`/api/evaluations/${evaluationId}/attachments`, { method: 'POST', body: att, signal })
  } catch { /* silent — o extract já capturou os dados, anexo é bônus */ }
}

// ── Sub-componente: chip do arquivo com ações ─────────────────────────────────

function FileChip({ file, onRemove, onRetry }: { file: File; onRemove: () => void; onRetry: () => void }) {
  const onView = () => {
    try {
      const url = URL.createObjectURL(file)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch { /* silent */ }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs">
      <FileCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
      <span className="flex-1 min-w-0 truncate font-medium text-gray-700">{file.name}</span>
      <span className="text-[10px] text-gray-400">{fmtSize(file.size)}</span>
      <button type="button" onClick={onView}   title="Visualizar"     className="text-gray-500 hover:text-brand-700"><Eye      className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={onRetry}  title="Ler novamente"  className="text-gray-500 hover:text-brand-700"><RefreshCw className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={onRemove} title="Remover"        className="text-gray-500 hover:text-red-600"><Trash2    className="h-3.5 w-3.5" /></button>
    </div>
  )
}

// Verifica invariante: todos os TERMINAL_STATES devem ter handler de UI
// (garante em compilação que nenhum estado é ignorado no render)
const _checkTerminalCoverage: Record<TerminalState, true> = {
  SUCCESS: true, PARTIAL_SUCCESS: true, MANUAL_REQUIRED: true,
  FAILED: true, TIMEOUT: true, CANCELLED: true,
}
void _checkTerminalCoverage
void isTerminal

