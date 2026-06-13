// =============================================================================
// /negociacoes/[id]/editar
//
// Esta rota agora delega ao MESMO wizard de /negociacoes/nova, em modo edit.
// O wizard reusa todas as etapas, validações, máscaras, regras e UI.
// Implementado como redirect server-side para preservar a URL amigável /editar
// e ainda assim reutilizar 100% o componente da Nova Negociação.
//
// Next 15+/16: `params` virou Promise. Precisa await antes de acessar id —
// sem isso, a URL final vira `?dealId=undefined` e o GET retorna 404.
// =============================================================================

import { redirect } from 'next/navigation'

export default async function EditarNegociacaoRedirect({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const { id } = await Promise.resolve(params)
  redirect(`/negociacoes/nova?dealId=${encodeURIComponent(id)}`)
}
