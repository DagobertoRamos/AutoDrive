import { notFound, redirect } from 'next/navigation'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { isModuleDeniedForUser, isModuleEnabled } from '@/lib/tenant-modules'
import { PendencyGeneralSettings } from '@/components/pendencies/PendencyGeneralSettings'

export const dynamic = 'force-dynamic'

export default async function PendencyGeneralSettingsPage() {
  const session = await getServerAuthSession()
  if (!session?.user) redirect('/login')

  if (!canAccessModule(session.user.role, 'pendencies.settings')) {
    notFound()
  }

  if (session.user.role !== 'MASTER' && session.user.tenantId) {
    const enabled = await isModuleEnabled(session.user.tenantId, 'pendencies.settings')
    if (!enabled) notFound()
  }

  if (session.user.id) {
    const denied = await isModuleDeniedForUser(session.user.id, 'pendencies.settings')
    if (denied) notFound()
  }

  return <PendencyGeneralSettings />
}
