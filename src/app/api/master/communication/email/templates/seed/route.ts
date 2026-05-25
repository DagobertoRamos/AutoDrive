// =============================================================================
// POST /api/master/communication/email/templates/seed
// Cria os templates padrão (idempotente — pula os que já existem por chave única).
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { DEFAULT_EMAIL_TEMPLATES } from '@/lib/email-defaults'

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    let created = 0
    let skipped = 0

    for (const t of DEFAULT_EMAIL_TEMPLATES) {
      const existing = await prisma.emailTemplate.findFirst({
        where: { tenantId: null, purpose: t.purpose, key: t.key },
        select: { id: true },
      }).catch(() => null)
      if (existing) { skipped++; continue }

      await prisma.emailTemplate.create({
        data: {
          tenantId:    null,
          purpose:     t.purpose,
          key:         t.key,
          name:        t.name,
          description: t.description,
          subject:     t.subject,
          bodyHtml:    t.bodyHtml,
          bodyText:    t.bodyText,
          variables:   t.variables,
          active:      true,
        },
      })
      created++
    }

    await logMasterAction(session, 'SEED_EMAIL_TEMPLATES', 'EmailTemplate', null, {
      afterData: { created, skipped }, req,
    })

    return NextResponse.json({ success: true, created, skipped })
  } catch (err) {
    return handlePrismaError(err)
  }
}
