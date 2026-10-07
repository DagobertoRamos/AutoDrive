import { redirect } from 'next/navigation'

// Mantido para links antigos: as fichas aprovadas ficam no filtro da lista de Fichas.
export default function AprovadasPage() {
  redirect('/financiamento/fichas?etapa=aprovadas')
}
