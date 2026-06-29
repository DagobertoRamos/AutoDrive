// Consolidado: "Minha Fila" agora faz parte da Visão Geral da Fila de Atendimento.
import { redirect } from 'next/navigation'

export default function MinhaFilaRedirect() {
  redirect('/vendedor-da-vez')
}
