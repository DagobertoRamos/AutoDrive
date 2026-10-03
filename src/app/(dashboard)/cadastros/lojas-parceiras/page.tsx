// Lojas parceiras foram unificadas em Fornecedores (tipo Veículos).
import { redirect } from 'next/navigation'

export default function LojasParceirasRedirect() {
  redirect('/cadastros/fornecedores?tipo=VEICULOS')
}
