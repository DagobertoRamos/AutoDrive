'use client'
// Guarda a campanha de entrada do visitante (atribuição do lead). Sem dados pessoais.
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { rememberCampaign } from './lead-utils'

export function SiteCampaignMemory() {
  const pathname = usePathname()
  useEffect(() => { rememberCampaign() }, [pathname])
  return null
}
