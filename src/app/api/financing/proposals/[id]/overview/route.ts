// GET /api/financing/proposals/[id]/overview — visão completa da ficha (F&I Core).
import { NextResponse } from 'next/server'
import { fiPermissionsFor } from '@/lib/finance/fi-permissions'
import { buildProposalView } from '@/lib/finance/fi/read-model'
import { fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    const perms = await fiPermissionsFor(auth.tenantId, auth.user.role)
    const data = await buildProposalView(id, perms)
    return NextResponse.json({ success: true, data, permissions: perms })
  } catch (err) { return fiErrorResponse(err) }
}
