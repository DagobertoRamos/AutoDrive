// =============================================================================
// POST /api/master/communication/email/templates/[id]/preview
// Body: { vars: Record<string,string> }
// Retorna: { subject, html, text } — HTML envolvido no layout AutoDrive.
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireMaster } from '@/lib/master-guards'
import { renderEmailTemplate, wrapWithLayout } from '@/lib/email-renderer'

const bodySchema = z.object({
  vars: z.record(z.string(), z.string()).optional().default({}),
})

export async function POST(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { error } = await requireMaster()
  if (error) return error

  const raw = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' },
      { status: 400 },
    )
  }

  const tpl = await prisma.emailTemplate.findUnique({ where: { id: params.id } })
  if (!tpl) return NextResponse.json({ success: false, error: 'Template não encontrado.' }, { status: 404 })

  const rendered = renderEmailTemplate(
    { subject: tpl.subject, bodyHtml: tpl.bodyHtml, bodyText: tpl.bodyText, variables: tpl.variables },
    parsed.data.vars,
  )

  const fullHtml = wrapWithLayout(rendered.bodyHtml, { previewText: rendered.subject })

  return NextResponse.json({
    success: true,
    data:    {
      subject:  rendered.subject,
      html:     fullHtml,
      bodyHtml: rendered.bodyHtml,
      text:     rendered.bodyText,
    },
  })
}
