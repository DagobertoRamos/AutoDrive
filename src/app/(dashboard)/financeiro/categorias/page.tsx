// Rota antiga: o cadastro de categorias virou o Plano de contas.
import { redirect } from 'next/navigation'

export default function FinanceCategoriesPage() {
  redirect('/financeiro/plano-de-contas')
}
