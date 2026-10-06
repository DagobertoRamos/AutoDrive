// Relatórios financeiros seguem o acesso do Centro Financeiro.
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-guards'
import { hasFinanceAccess } from '@/lib/finance/access'

export default async function FinanceReportsLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!(await hasFinanceAccess(user))) notFound()
  return <>{children}</>
}
