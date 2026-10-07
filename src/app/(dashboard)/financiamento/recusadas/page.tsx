import { redirect } from 'next/navigation'

// Mantido para links antigos: as fichas recusadas ficam no filtro da lista de Fichas.
export default function RecusadasPage() {
  redirect('/financiamento/fichas?status=RECUSADA')
}
