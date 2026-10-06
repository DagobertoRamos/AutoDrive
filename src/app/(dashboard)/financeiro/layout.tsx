// Centro Financeiro: área restrita. Sem liberação, nem a página abre
// (o menu já some pelo Sidebar; aqui fecha o acesso pela URL).
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-guards'
import { hasFinanceAccess } from '@/lib/finance/access'

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!(await hasFinanceAccess(user))) notFound()
  return <>{children}</>
}
