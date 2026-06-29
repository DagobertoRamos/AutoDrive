// Consolidado: "Atendimentos" agora é uma aba dentro de Relatórios da Fila.
import { redirect } from 'next/navigation'

export default function AtendimentosRedirect() {
  redirect('/vendedor-da-vez/relatorios')
}
