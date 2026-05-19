// =============================================================================
// /negociacoes/[id]/editar
//
// Esta rota agora delega ao MESMO wizard de /negociacoes/nova, em modo edit.
// O wizard reusa todas as etapas, validações, máscaras, regras e UI.
// Implementado como redirect server-side para preservar a URL amigável /editar
// e ainda assim reutilizar 100% o componente da Nova Negociação.
// =============================================================================

import { redirect } from 'next/navigation'

export default function EditarNegociacaoRedirect({
  params,
}: {
  params: { id: string }
}) {
  redirect(`/negociacoes/nova?dealId=${encodeURIComponent(params.id)}`)
}
