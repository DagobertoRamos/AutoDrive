'use client'
import { useParams } from 'next/navigation'
import FichaDetail from '@/components/financing/FichaDetail'

export default function FichaDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  if (!id) return null
  return <FichaDetail id={id} />
}
