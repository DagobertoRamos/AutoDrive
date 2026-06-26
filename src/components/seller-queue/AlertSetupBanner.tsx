'use client'

// =============================================================================
// AlertSetupBanner — aviso proativo que aparece na Minha Fila (só no app Android
// nativo) quando algum ajuste de alerta do aparelho ainda não está liberado.
// Leva o vendedor à tela "Ativar Alertas" (Fase 4). Some quando está tudo ok.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellRing, ChevronRight } from 'lucide-react'
import { isNativeAndroid, getAlertStatus } from '@/lib/mobile/push-bridge'

export default function AlertSetupBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let active = true
    const check = async () => {
      if (!isNativeAndroid()) return
      const s = await getAlertStatus()
      if (!active) return
      setShow(!!s && !(s.notifications && s.batteryUnrestricted && s.fullScreen))
    }
    void check()
    const onVis = () => { if (!document.hidden) void check() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { active = false; document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [])

  if (!show) return null

  return (
    <Link
      href="/vendedor-da-vez/ativar-alertas"
      className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 hover:bg-amber-100"
    >
      <BellRing size={20} className="shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Ative os alertas do seu celular</p>
        <p className="text-xs text-amber-700">Para não perder nenhuma chamada com a tela bloqueada. Toque para configurar.</p>
      </div>
      <ChevronRight size={18} className="shrink-0" />
    </Link>
  )
}
