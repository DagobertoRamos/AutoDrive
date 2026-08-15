// =============================================================================
// GET /api/evaluations/files/[fileId]
//
// Serve o conteúdo de um anexo guardado no banco (backend de storage "db",
// usado quando o filesystem é somente leitura — caso da hospedagem serverless).
//
// Diferente de public/uploads, aqui o arquivo é PROTEGIDO: exige sessão válida
// e a mesma permissão de leitura da avaliação a que ele pertence.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canViewEvaluation }    from '@/lib/evaluation/permissions'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { fileId: string } | Promise<{ fileId: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const params = await Promise.resolve(ctxArg.params)
  const fileId = params?.fileId
  if (!fileId) return NextResponse.json({ error: 'Arquivo não informado.' }, { status: 400 })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file: any = await (prisma as any).evaluationFile.findUnique({
      where:  { id: fileId },
      select: { id: true, evaluationId: true, fileName: true, mimeType: true, data: true },
    })
    if (!file) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })

    const ctx = await loadEvaluationContext(file.evaluationId)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canViewEvaluation(user, ctx)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const bytes: Buffer = Buffer.from(file.data)
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type':        file.mimeType || 'application/octet-stream',
        'Content-Length':      String(bytes.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
        // Conteúdo por sessão: cache só no browser do usuário.
        'Cache-Control':       'private, max-age=3600',
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
