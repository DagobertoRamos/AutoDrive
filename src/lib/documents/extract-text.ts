// =============================================================================
// documents/extract-text.ts — pipeline robusto de extração de texto (AutoDrive)
//
// Núcleo reutilizável da leitura de documentos. NUNCA lança para o chamador:
// sempre devolve um resultado classificado com status + mensagem clara em pt-BR.
// Trata os casos: PDF com texto, PDF escaneado/imagem (requires_ocr), PDF
// protegido, PDF corrompido, arquivo grande demais, tipo não suportado, texto.
//
// PDF: 3 estratégias em ordem de robustez (pdfjs-dist legacy → pdf-parse v2 →
// pdf-parse v1). Ambos os pacotes estão em `serverExternalPackages` (next.config)
// e são `import()/require()`'d em runtime. SEM dados sensíveis em log — só nome
// do erro, contagem de chars/páginas e status.
// =============================================================================

export type ExtractionStatus =
  | 'text_extracted'
  | 'requires_ocr'
  | 'protected'
  | 'corrupted'
  | 'unsupported'
  | 'too_large'

export interface ExtractTextResult {
  status:   ExtractionStatus
  /** true quando há texto utilizável (status === 'text_extracted'). */
  ok:       boolean
  text:     string
  /** Mensagem clara para o usuário/UI. */
  message:  string
  chars:    number
  pages:    number | null
  mimeType: string
  fileName?: string
}

export const DEFAULT_MAX_BYTES = Number(process.env.DOC_EXTRACT_MAX_BYTES ?? 15 * 1024 * 1024) // 15 MB
const MIN_MEANINGFUL_CHARS = 20 // abaixo disso, tratamos como "sem texto pesquisável"

const PDF = 'application/pdf'
const TEXT_MIMES = new Set(['text/plain', 'text/csv', 'application/json', 'text/markdown'])
const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

const MESSAGES: Record<ExtractionStatus, string> = {
  text_extracted: 'Documento lido com sucesso.',
  requires_ocr:   'Documento recebido, mas não possui texto pesquisável — precisa de OCR/leitura por IA.',
  protected:      'Documento protegido por senha ou ilegível.',
  corrupted:      'Arquivo inválido ou corrompido.',
  unsupported:    'Tipo de arquivo não suportado para leitura de texto.',
  too_large:      'Arquivo excede o limite permitido.',
}

function meaningfulLength(text: string): number {
  return text.replace(/\s+/g, '').length
}

/** Classifica um erro do pdfjs/pdf-parse em protegido / corrompido / null. */
function classifyPdfError(err: unknown): 'protected' | 'corrupted' | null {
  const name = (err as { name?: string })?.name ?? ''
  const msg = ((err as Error)?.message ?? String(err ?? '')).toLowerCase()
  if (name === 'PasswordException' || msg.includes('password') || msg.includes('encrypted')) return 'protected'
  if (name === 'InvalidPDFException' || msg.includes('invalid pdf') || msg.includes('structure') || msg.includes('xref') || msg.includes('startxref') || msg.includes('corrupt')) return 'corrupted'
  return null
}

interface PdfRead { text: string; pages: number | null; classify: 'protected' | 'corrupted' | null }

async function readPdf(buffer: Buffer): Promise<PdfRead> {
  let pages: number | null = null
  let classify: 'protected' | 'corrupted' | null = null

  // ── Estratégia 1: pdfjs-dist (legacy) — mais robusta, dá nº de páginas ──────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true, verbosity: 0, isEvalSupported: false })
    const doc = await task.promise
    pages = doc.numPages ?? null
    const pieces: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      pieces.push((content.items as { str?: string }[]).map((it) => (typeof it.str === 'string' ? it.str : '')).join(' '))
    }
    try { await doc.destroy?.() } catch { /* silent */ }
    const text = pieces.join('\n').trim()
    if (meaningfulLength(text) >= MIN_MEANINGFUL_CHARS) return { text, pages, classify: null }
    // parseou mas (quase) sem texto → provável escaneado
  } catch (e) {
    classify = classifyPdfError(e)
    console.warn('[extract-text] pdfjs falhou:', (e as Error)?.name || (e as Error)?.message)
    if (classify === 'protected') return { text: '', pages, classify }
  }

  // ── Estratégia 2: pdf-parse v2 ──────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const mod: any = require('pdf-parse')
    const PDFParse = mod?.PDFParse ?? mod?.default?.PDFParse
    if (PDFParse) {
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      const result = await parser.getText()
      const text = String(result?.text ?? '').trim()
      if (typeof result?.total === 'number') pages = pages ?? result.total
      try { await parser.destroy?.() } catch { /* silent */ }
      if (meaningfulLength(text) >= MIN_MEANINGFUL_CHARS) return { text, pages, classify: null }
    }
  } catch (e) {
    classify = classify ?? classifyPdfError(e)
    console.warn('[extract-text] pdf-parse v2 falhou:', (e as Error)?.name || (e as Error)?.message)
  }

  // ── Estratégia 3: pdf-parse v1 (default callable) ───────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const mod: any = require('pdf-parse')
    const fn = typeof mod === 'function' ? mod : typeof mod?.default === 'function' ? mod.default : null
    if (fn) {
      const result = await fn(buffer)
      const text = String(result?.text ?? '').trim()
      if (typeof result?.numpages === 'number') pages = pages ?? result.numpages
      if (meaningfulLength(text) >= MIN_MEANINGFUL_CHARS) return { text, pages, classify: null }
    }
  } catch (e) {
    classify = classify ?? classifyPdfError(e)
    console.warn('[extract-text] pdf-parse v1 falhou:', (e as Error)?.name || (e as Error)?.message)
  }

  return { text: '', pages, classify }
}

function result(status: ExtractionStatus, partial: Partial<ExtractTextResult> = {}): ExtractTextResult {
  const text = partial.text ?? ''
  return {
    status,
    ok: status === 'text_extracted',
    text,
    message: partial.message ?? MESSAGES[status],
    chars: meaningfulLength(text),
    pages: partial.pages ?? null,
    mimeType: partial.mimeType ?? '',
    fileName: partial.fileName,
  }
}

/**
 * Extrai texto de um documento de forma controlada. Nunca lança.
 */
export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
  opts: { fileName?: string; maxBytes?: number } = {},
): Promise<ExtractTextResult> {
  const mime = (mimeType || '').toLowerCase().split(';')[0].trim()
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const base = { mimeType: mime, fileName: opts.fileName }

  if (!buffer || buffer.byteLength === 0) return result('corrupted', { ...base, message: 'Arquivo vazio.' })
  if (buffer.byteLength > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024))
    return result('too_large', { ...base, message: `Arquivo excede o limite permitido (${mb} MB).` })
  }

  // ── Texto puro ──────────────────────────────────────────────────────────────
  if (TEXT_MIMES.has(mime)) {
    const text = buffer.toString('utf8').trim()
    return meaningfulLength(text) >= 1
      ? result('text_extracted', { ...base, text })
      : result('requires_ocr', { ...base, message: 'Arquivo de texto vazio.' })
  }

  // ── Imagem → precisa de OCR / leitura por IA multimodal ─────────────────────
  if (IMAGE_MIMES.has(mime)) {
    return result('requires_ocr', { ...base, message: 'Imagem recebida — precisa de OCR/leitura por IA para extrair texto.' })
  }

  // ── PDF ─────────────────────────────────────────────────────────────────────
  if (mime === PDF) {
    const { text, pages, classify } = await readPdf(buffer)
    if (meaningfulLength(text) >= MIN_MEANINGFUL_CHARS) return result('text_extracted', { ...base, text, pages })
    if (classify === 'protected') return result('protected', { ...base, pages })
    if (classify === 'corrupted') return result('corrupted', { ...base, pages })
    if (pages && pages > 0) return result('requires_ocr', { ...base, pages }) // parseou, mas sem texto → escaneado
    return result('corrupted', { ...base, pages })
  }

  // DOCX e outros formatos ainda não suportados nesta etapa.
  return result('unsupported', base)
}
