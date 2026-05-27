// =============================================================================
// POST /api/evaluations/vehicle-document/extract
//
// Recebe um CRLV/CRLV-e (PDF preferido; imagem retorna mensagem informando
// que OCR não está habilitado) e devolve os campos extraídos do veículo.
//
// Aceita:
//   - multipart/form-data com campo "file" (e opcionalmente "evaluationId")
//   - application/json { base64, filename, mimeType, evaluationId? }
//
// Não persiste o anexo aqui — quem cuida disso é
// /api/evaluations/[id]/attachments (chamado depois pelo cliente quando o
// rascunho da avaliação já existir).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { requireModule }        from '@/lib/permissions'
import { extractFromCRLV }      from '@/lib/crlv/parser'

export const runtime       = 'nodejs'
export const dynamic       = 'force-dynamic'
export const maxDuration   = 30

const MAX_BYTES = 8 * 1024 * 1024 // 8MB

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'stock.evaluate') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  let buffer:   Buffer | null = null
  let mimeType: string        = ''
  let filename: string        = 'documento'

  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()

  try {
    if (contentType.startsWith('multipart/form-data')) {
      const form = await req.formData()
      const f    = form.get('file')
      if (!(f instanceof File)) {
        return NextResponse.json({ error: 'Arquivo ausente (campo "file" obrigatório).' }, { status: 400 })
      }
      if (f.size > MAX_BYTES) {
        return NextResponse.json({ error: 'Arquivo maior que 8MB.' }, { status: 413 })
      }
      buffer   = Buffer.from(await f.arrayBuffer())
      mimeType = f.type || 'application/octet-stream'
      filename = f.name || filename
    } else {
      const json     = await req.json().catch(() => null) as
        | { base64?: string; filename?: string; mimeType?: string } | null
      if (!json?.base64) {
        return NextResponse.json({ error: 'Corpo inválido — esperado multipart ou { base64, mimeType }.' }, { status: 400 })
      }
      const base64   = json.base64.includes(',') ? json.base64.split(',').pop()! : json.base64
      buffer         = Buffer.from(base64, 'base64')
      if (buffer.byteLength > MAX_BYTES) {
        return NextResponse.json({ error: 'Arquivo maior que 8MB.' }, { status: 413 })
      }
      mimeType = (json.mimeType ?? 'application/pdf').toLowerCase()
      filename = json.filename ?? filename
    }
  } catch (err) {
    return NextResponse.json({ error: 'Falha ao ler o arquivo recebido.', details: (err as Error)?.message }, { status: 400 })
  }

  if (!buffer || buffer.byteLength === 0) {
    return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 })
  }

  const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowed.includes(mimeType)) {
    return NextResponse.json({ error: `Tipo de arquivo não suportado: ${mimeType}` }, { status: 415 })
  }

  try {
    const result = await extractFromCRLV(buffer, mimeType)
    // Em dev: deixamos rawText fluir pro client (debug). Em prod: removemos
    // pra evitar expor PII (proprietário, CPF) no payload de resposta.
    const isDev = process.env.NODE_ENV !== 'production'
    const { rawText, ...rest } = result
    return NextResponse.json({
      ...rest,
      ...(isDev && rawText ? { rawText } : {}),
      filename,
      mimeType,
    })
  } catch (err) {
    return NextResponse.json({
      success:       false,
      extracted:     false,
      confidence:    'low',
      source:        'pdf-text',
      vehicle:       {},
      missingFields: [],
      warnings:      [(err as Error)?.message ?? 'Erro desconhecido'],
      message:       'Erro inesperado ao processar o documento.',
    }, { status: 500 })
  }
}
