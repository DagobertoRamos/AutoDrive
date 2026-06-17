// =============================================================================
// API: /api/documents/pdf-parse — AutoDrive
// Upload e EXTRAÇÃO REAL de texto de PDF de contrato (pipeline robusto).
// Usa o serviço unificado src/lib/documents/extract-text.ts: trata PDF com
// texto, escaneado (requires_ocr), protegido, corrompido e grande demais,
// sempre com mensagem clara — nunca "quebra" sem explicação.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { extractDocumentText } from '@/lib/documents/extract-text'
import { parseContractText } from '@/services/contract-pdf-parser.service'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'documents.pdf')) {
      return NextResponse.json({ success: false, error: 'Sem permissão para leitura de PDF' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ success: false, error: 'Nenhum arquivo enviado.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const extraction = await extractDocumentText(buffer, file.type || 'application/pdf', { fileName: file.name, maxBytes: MAX_BYTES })

    // Casos sem texto utilizável → mensagem clara (sem quebrar o fluxo).
    if (extraction.status !== 'text_extracted') {
      return NextResponse.json({ success: false, error: extraction.message, status: extraction.status }, { status: 200 })
    }

    // Texto extraído → tenta interpretar campos do contrato (best-effort).
    const parsed = parseContractText(extraction.text)
    const v = parsed.vehicles[0]
    const veiculo = v ? [v.marca, v.modelo, v.anoMod ?? v.anoFab].filter(Boolean).join(' ') || null : null

    // Confiança simples: proporção de campos-chave reconhecidos.
    const fields = [parsed.contractCode, parsed.buyer?.name ?? parsed.seller?.name, v?.placa, veiculo, parsed.totalValue, parsed.contractDate]
    const found = fields.filter((x) => x !== null && x !== undefined && x !== '').length
    const confidence = Math.round((found / fields.length) * 100)

    return NextResponse.json({
      success: true,
      status: extraction.status,
      message: extraction.message,
      data: {
        contractNumber: parsed.contractCode,
        customerName:   parsed.buyer?.name ?? parsed.seller?.name ?? null,
        plate:          v?.placa ?? null,
        vehicle:        veiculo,
        value:          parsed.totalValue,
        date:           parsed.contractDate,
        rawText:        extraction.text,
        confidence,
      },
    })
  } catch (err) {
    // Log sem dados sensíveis (só o nome/mensagem do erro).
    console.error('[POST /api/documents/pdf-parse]', (err as Error)?.name || (err as Error)?.message)
    return NextResponse.json({ success: false, error: 'Erro ao processar o PDF.' }, { status: 500 })
  }
}
