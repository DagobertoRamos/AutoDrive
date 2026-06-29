// Consolidado: "Cliente na Loja" agora faz parte da Visão Geral da Fila.
import { redirect } from 'next/navigation'

export default function ClienteNaLojaRedirect() {
  redirect('/vendedor-da-vez')
}
