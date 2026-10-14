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
import { readFromDrive }        from '@/lib/storage/drive'

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
    // Lê os bytes como base64 via SQL: o adapter Neon (usado em produção) não
    // consegue devolver colunas Bytes pelo findUnique ("JS functions cannot be
    // represented as a serde_json::Value") — a rota falhava e a foto aparecia
    // quebrada. Mesmo contorno de src/lib/site/assets.ts.
    // Metadados primeiro (sem os bytes): só lê o conteúdo depois da permissão.
    const meta = await prisma.evaluationFile.findUnique({ where: { id: fileId }, select: { evaluationId: true, fileName: true, mimeType: true, driveFileId: true } })
    if (!meta) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
    const file = meta

    const ctx = await loadEvaluationContext(file.evaluationId)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canViewEvaluation(user, ctx)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    let bytes: Buffer
    if (file.driveFileId) {
      bytes = await readFromDrive(file.driveFileId)
    } else {
      const rows = await prisma.$queryRaw<Array<{ b64: string | null }>>`
        SELECT encode(data, 'base64') AS b64 FROM evaluation_files WHERE id = ${fileId} LIMIT 1`
      if (!rows[0]?.b64) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
      bytes = Buffer.from(rows[0].b64, 'base64')
    }
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type':        file.mimeType || 'application/octet-stream',
        'Content-Length':      String(bytes.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
        // Conteúdo por sessão: cache só no browser do usuário (o arquivo nunca muda).
        'Cache-Control':       'private, max-age=604800, immutable',
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
