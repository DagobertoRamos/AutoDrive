// Carrega o documento e confere o acesso ao registro dono (regras em attachment-access.ts).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, type SessionUser } from '@/lib/auth-guards'
import { checkDocumentAccess, type DocAccessLevel } from '@/lib/documents/attachment-access'
import { isDocEntityType } from '@/lib/documents/attachment-types'

const notFound = () => NextResponse.json({ success: false, error: 'Documento não encontrado.' }, { status: 404 })

export async function loadDocument(id: string, level: DocAccessLevel) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() } as const
  const doc = await prisma.documentAttachment.findUnique({ where: { id } })
  if (!doc || !isDocEntityType(doc.entityType)) return { error: notFound() } as const
  const acc = await checkDocumentAccess(user, doc.entityType, doc.entityId, level)
  if (!acc.ok) return { error: acc.error.status === 404 ? notFound() : acc.error } as const
  if (user.role !== 'MASTER' && doc.tenantId && doc.tenantId !== user.tenantId) return { error: notFound() } as const
  return { user: user as SessionUser, doc } as const
}
