import { NextResponse } from 'next/server'
import { canAccessModule } from '@/lib/permissions'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { handlePrismaError } from '@/lib/prisma-errors'
import { getDashboardData } from '@/lib/dashboard/getDashboardData'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'dashboard')) return forbiddenResponse('Sem acesso ao dashboard.')
  { const gate = await assertModuleEnabled(user, 'dashboard'); if (gate) return gate }

  try {
    const data = await getDashboardData(user)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
