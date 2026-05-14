'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function PendenciasPage() {
  const { data: session } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!session) return
    const role = session.user?.role
    if (role === 'VENDEDOR') {
      router.replace('/pendencias/vendedor')
    } else {
      router.replace('/pendencias/gerencia')
    }
  }, [session, router])

  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  )
}
