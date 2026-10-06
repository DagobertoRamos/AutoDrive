// Financeiro › Folha e comissões — exige a liberação 'finance.payroll'
// (o layout do financeiro já exige 'finance').
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-guards'
import { hasFinanceAccess } from '@/lib/finance/access'
import PayrollCenter from '@/components/finance/center/payroll/PayrollCenter'

export default async function PayrollPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!(await hasFinanceAccess(user, 'finance.payroll'))) notFound()
  return <PayrollCenter />
}
