// =============================================================================
// API: /api/documents/pdf-parse — AutoDrive
// Upload e extração de dados de PDF de contrato
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'documents.pdf')) {
      return NextResponse.json({ success: false, error: 'Sem permissão para leitura de PDF' }, { status: 403 })
    }

    const formData = await req.formData()
    const file     = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ success: false, error: 'Nenhum arquivo enviado.' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ success: false, error: 'Apenas arquivos PDF são aceitos.' }, { status: 400 })
    }

    // TODO: implementar extração real com pdf-parse ou pdfjs-dist
    // const buffer    = await file.arrayBuffer()
    // const pdfData   = await pdfParse(Buffer.from(buffer))
    // const extracted = extractContractFields(pdfData.text)

    // Simulação de resposta
    const result = {
      contractNumber: null as string | null,
      customerName:   null as string | null,
      plate:          null as string | null,
      vehicle:        null as string | null,
      value:          null as number | null,
      date:           null as string | null,
      rawText:        `[Arquivo: ${file.name}] — Extração real não implementada. Instale pdf-parse e implemente o parser.`,
      confidence:     0,
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('[POST /api/documents/pdf-parse]', err)
    return NextResponse.json({ success: false, error: 'Erro ao processar o PDF.' }, { status: 500 })
  }
}
