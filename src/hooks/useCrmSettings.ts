'use client'

// Listas configuráveis do CRM (temperaturas, tipos, origens, motivos) no cliente.
// Começa com os defaults (tela nunca fica sem rótulo) e troca pelos da loja.

import { useCallback, useEffect, useState } from 'react'
import { defaultCrmSettings, type CrmSettings } from '@/lib/crm/settings-core'

let cache: CrmSettings | null = null

export function useCrmSettings() {
  const [settings, setSettings] = useState<CrmSettings>(() => cache ?? defaultCrmSettings())
  const reload = useCallback(async () => {
    const j = await fetch('/api/crm/settings', { credentials: 'include' }).then((r) => r.json()).catch(() => null)
    if (j?.data) { cache = j.data as CrmSettings; setSettings(cache) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { settings, reload }
}
