'use client'
import { useParams } from 'next/navigation'
import FichaView from '@/components/fi/FichaView'

export default function FichaDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  if (!id) return null
  return <FichaView id={id} />
}
