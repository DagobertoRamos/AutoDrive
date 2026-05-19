// =============================================================================
// POST /api/evaluations/[id]/attachments
//
// Upload multipart de arquivo (imagem ou PDF) para a avaliação.
// Form fields aceitos:
//   file       (File)            — obrigatório
//   section    (string)          — opcional (INTERIOR | DOCUMENTOS | ...)
//   category   (string)          — opcional (CRLV | LAUDO_CAUTELAR | FOTO | ...)
//   itemId     (string)          — opcional (vincula ao item)
//   serviceId  (string)          — opcional (vincula ao serviço)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canUploadAttachment }  from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'
import { saveAttachment, validateUpload } from '@/lib/evaluation/storage'

// Next.js: rotas com upload devem usar runtime Node (necessário p/ fs)
export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canUploadAttachment(user, ctx))
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const formData = await req.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json({ error: 'Corpo inválido (multipart/form-data esperado).' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Campo "file" é obrigatório.' }, { status: 400 })

    const mime = file.type
    const size = file.size
    const v    = validateUpload(mime, size)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const saved = await saveAttachment(params.id, file.name, mime, bytes)

    const section   = String(formData.get('section')   ?? '') || null
    const category  = String(formData.get('category')  ?? '') || (saved.fileType === 'pdf' ? 'OUTRO' : 'FOTO')
    const itemId    = String(formData.get('itemId')    ?? '') || null
    const serviceId = String(formData.get('serviceId') ?? '') || null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const att = await (prisma as any).evaluationAttachment.create({
      data: {
        tenantId:     ctx.tenantId ?? '',
        evaluationId: params.id,
        itemId,
        serviceId,
        section,
        category,
        fileName:     saved.fileName,
        fileType:     saved.fileType,
        mimeType:     saved.mimeType,
        fileSize:     saved.fileSize,
        storageKey:   saved.storageKey,
        publicUrl:    saved.publicUrl,
        uploadedById:   session.user.id,
        uploadedByName: session.user.name ?? null,
      },
    })

    await recordHistory({
      tenantId:     ctx.tenantId ?? '',
      evaluationId: params.id,
      itemId:       itemId ?? undefined,
      serviceId:    serviceId ?? undefined,
      userId:       session.user.id,
      userName:     session.user.name,
      userRole:     session.user.role,
      action:       'ADD_ATTACHMENT',
      newValue:     { fileName: saved.fileName, category, section },
    })

    return NextResponse.json({ data: att }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
