import { redirect } from 'next/navigation'

// Mantido para links antigos: contratos agora ficam em F&I › Formalização.
export default function ContratosPage() {
  redirect('/financiamento/formalizacao')
}
