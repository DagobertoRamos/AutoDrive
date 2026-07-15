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
import { extractNativePdfData, parseCrlvText, validatePlate, validateChassis, validateRenavam } from '@/lib/crlv/parser'

// Next.js: rotas com upload devem usar runtime Node (necessário p/ fs)
export const runtime = 'nodejs'

// Next 15+/16: `params` virou Promise. Precisa de await — caso contrário
// `params.id` é undefined síncrono e o create do Prisma estoura
// `PrismaClientValidationError` → mensagem genérica "Dados inválidos".
export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const params = await Promise.resolve(ctxArg.params)
  const evaluationId = params?.id
  if (!evaluationId) {
    return NextResponse.json({ error: 'ID de avaliação ausente na URL.' }, { status: 400 })
  }

  try {
    const ctx = await loadEvaluationContext(evaluationId)
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

    const mime = file.type || 'application/octet-stream'
    const size = file.size
    const v    = validateUpload(mime, size)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())

    const section    = String(formData.get('section')   ?? '').trim() || null
    const rawCategory = String(formData.get('category')  ?? '').trim()
    // A category final é decidida abaixo (precisa da extensão do arquivo salvo).
    const itemId     = String(formData.get('itemId')    ?? '').trim() || null
    const serviceId  = String(formData.get('serviceId') ?? '').trim() || null

    // Se for CRLV E a avaliação já tem placa/chassi/renavam preenchidos:
    // extrai os identificadores do PDF novo e exige que pelo menos UM bata
    // com o veículo cadastrado. Impede que o usuário troque o CRLV de uma
    // avaliação por um documento de OUTRO veículo (por engano ou proposital).
    // Se a avaliação está "em branco" (nenhum identificador), aceita — é o
    // primeiro CRLV e ele vai popular os campos.
    const hasVehicleId = Boolean(ctx.plate || ctx.chassi || ctx.renavam)
    if (rawCategory === 'CRLV' && hasVehicleId && mime === 'application/pdf') {
      try {
        const { text } = await extractNativePdfData(bytes)
        const parsed = text ? parseCrlvText(text) : {}
        const docPlate   = parsed.plate   ? String(parsed.plate).toUpperCase().replace(/[^A-Z0-9]/g, '') : null
        const docChassi  = parsed.chassis ? String(parsed.chassis).toUpperCase().replace(/[^A-Z0-9]/g, '') : null
        const docRenavam = parsed.renavam ? String(parsed.renavam).replace(/[^\d]/g, '') : null
        const evalPlate   = ctx.plate   ? ctx.plate.toUpperCase().replace(/[^A-Z0-9]/g, '') : null
        const evalChassi  = ctx.chassi  ? ctx.chassi.toUpperCase().replace(/[^A-Z0-9]/g, '') : null
        const evalRenavam = ctx.renavam ? ctx.renavam.replace(/[^\d]/g, '') : null

        const plateOk   = Boolean(docPlate && evalPlate && validatePlate(docPlate) && docPlate === evalPlate)
        const chassiOk  = Boolean(docChassi && evalChassi && validateChassis(docChassi) && docChassi === evalChassi)
        const renavamOk = Boolean(docRenavam && evalRenavam && validateRenavam(docRenavam) && docRenavam === evalRenavam)

        // Rejeita apenas quando o CRLV trouxe ALGUM identificador válido E
        // NENHUM bateu com os da avaliação. Se o PDF veio ilegível (sem
        // identificadores), não bloqueia — o operador continua responsável
        // por conferir; o alerta seria falso-positivo constante.
        const docHasAnyId = Boolean(docPlate || docChassi || docRenavam)
        if (docHasAnyId && !plateOk && !chassiOk && !renavamOk) {
          return NextResponse.json({
            error: 'Este CRLV é de um veículo diferente. Placa/chassi/renavam do documento não batem com os dados da avaliação.',
            code: 'CRLV_VEHICLE_MISMATCH',
            evaluation: { plate: ctx.plate, chassi: ctx.chassi, renavam: ctx.renavam },
            document:   { plate: docPlate, chassi: docChassi, renavam: docRenavam },
          }, { status: 422 })
        }
      } catch {
        // Se a extração falhar (PDF corrompido, timeout), permite o upload —
        // o operador confere manualmente. Não bloquear por falha de infra.
      }
    }

    const saved    = await saveAttachment(evaluationId, file.name, mime, bytes)
    const category = rawCategory || (saved.fileType === 'pdf' ? 'OUTRO' : 'FOTO')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const att = await (prisma as any).evaluationAttachment.create({
      data: {
        tenantId:       ctx.tenantId ?? '',
        evaluationId,
        itemId,
        serviceId,
        section,
        category,
        fileName:       saved.fileName,
        fileType:       saved.fileType,
        mimeType:       saved.mimeType,
        fileSize:       saved.fileSize,
        storageKey:     saved.storageKey,
        publicUrl:      saved.publicUrl,
        uploadedById:   session.user.id,
        uploadedByName: session.user.name ?? null,
      },
    })

    // Action específica pra documentos oficiais — facilita filtro em audit logs.
    const action = category === 'CRLV'           ? 'DOCUMENT_CRLV_UPLOADED'
                 : category === 'LAUDO_CAUTELAR' ? 'DOCUMENT_CAUTELAR_UPLOADED'
                 : category === 'ATPV_E'         ? 'DOCUMENT_ATPV_E_UPLOADED'
                 : category === 'DUT_CRV'        ? 'DOCUMENT_DUT_CRV_UPLOADED'
                 : 'ADD_ATTACHMENT'

    await recordHistory({
      tenantId:     ctx.tenantId ?? '',
      evaluationId,
      itemId:       itemId ?? undefined,
      serviceId:    serviceId ?? undefined,
      userId:       session.user.id,
      userName:     session.user.name,
      userRole:     session.user.role,
      action,
      newValue:     { fileName: saved.fileName, category, section, attachmentId: att.id },
    })

    // AuditLog adicional pra documentos rastreáveis em consulta global
    if (category === 'CRLV' || category === 'LAUDO_CAUTELAR' || category === 'ATPV_E' || category === 'DUT_CRV') {
      await prisma.auditLog.create({
        data: {
          userId:    session.user.id,
          tenantId:  ctx.tenantId ?? null,
          action,
          entity:    'EvaluationAttachment',
          entityId:  att.id,
          userName:  session.user.name ?? null,
          userRole:  session.user.role,
          status:    'SUCCESS',
          afterData: {
            evaluationId, category, fileName: saved.fileName,
            mimeType: saved.mimeType, fileSize: saved.fileSize,
          } as never,
        },
      }).catch(() => {})
    }

    return NextResponse.json({ data: att }, { status: 201 })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[attachments POST] falha:', err instanceof Error ? err.message : err)
    }
    return handlePrismaError(err)
  }
}
