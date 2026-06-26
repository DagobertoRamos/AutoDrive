'use client'

// =============================================================================
// Comercial › Fila › Ativar Alertas — guia o vendedor a liberar, no aparelho,
// tudo que o alerta de "vendedor da vez" precisa para tocar mesmo bloqueado/em
// 2º plano (Fase 4). Mostra o status de cada item e leva direto à configuração
// certa em qualquer fabricante (Samsung, Xiaomi, Motorola, etc.).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { BellRing, BatteryCharging, Maximize, CheckCircle2, AlertTriangle, ChevronRight, Smartphone, Loader2 } from 'lucide-react'
import {
  isNativeAndroid, getAlertStatus, type AlertStatus,
  openNotificationSettings, openBatterySettings, openFullScreenSettings, openAppDetailsSettings,
} from '@/lib/mobile/push-bridge'

// Dicas específicas por fabricante (o caminho exato muda de marca para marca).
function oemTip(manufacturer: string): string | null {
  const m = (manufacturer || '').toLowerCase()
  if (m.includes('samsung')) return 'Samsung: em "Bateria" escolha "Sem restrições" e desligue "Colocar app em suspensão". Em "Cuidados com o dispositivo" remova o AutoDrive dos apps em suspensão.'
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco')) return 'Xiaomi/Redmi: ative "Início automático" (Autostart) e em "Economia de bateria" escolha "Sem restrições" para o AutoDrive.'
  if (m.includes('motorola')) return 'Motorola: em "Bateria" escolha "Sem restrições" e desative a otimização de bateria para o AutoDrive.'
  if (m.includes('oppo') || m.includes('realme') || m.includes('oneplus')) return 'Oppo/Realme/OnePlus: ative "Início automático" e permita execução em 2º plano para o AutoDrive.'
  if (m.includes('huawei')) return 'Huawei: em "Iniciar app" escolha "Gerenciar manualmente" e ative iniciar automaticamente e executar em 2º plano.'
  if (m.includes('vivo')) return 'Vivo: ative "Início automático em alta prioridade" e permita consumo de bateria em 2º plano.'
  return null
}

interface ItemProps {
  ok: boolean
  icon: React.ReactNode
  title: string
  desc: string
  cta: string
  onClick: () => void
}
function Item({ ok, icon, title, desc, cta, onClick }: ItemProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
        {ok ? <CheckCircle2 size={20} /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {ok && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">Ativado</span>}
        </div>
        <p className="mt-0.5 text-sm text-gray-500">{desc}</p>
        {!ok && (
          <button onClick={onClick} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">
            {cta} <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function AtivarAlertas() {
  const [status, setStatus] = useState<AlertStatus | null>(null)
  const [native, setNative] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const isNative = isNativeAndroid()
    setNative(isNative)
    if (isNative) setStatus(await getAlertStatus())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    // Reconfere ao voltar das configurações do sistema.
    const onVis = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [refresh])

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
  }

  // PWA/PC: nada a configurar nativamente.
  if (!native) {
    return (
      <div className="mx-auto max-w-md p-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <Smartphone className="mx-auto mb-3 text-brand-600" size={32} />
          <h1 className="text-lg font-bold text-gray-900">Ativar alertas no celular</h1>
          <p className="mt-2 text-sm text-gray-500">Esta tela serve para o <strong>aplicativo Android</strong> do AutoDrive. Abra-a pelo app instalado no seu celular para liberar os alertas de chamada.</p>
        </div>
      </div>
    )
  }

  const allOk = status ? status.notifications && status.batteryUnrestricted && status.fullScreen : false
  const tip = status ? oemTip(status.manufacturer) : null

  return (
    <div className="mx-auto max-w-md space-y-3 p-4">
      <div className="mb-1">
        <h1 className="text-xl font-bold text-gray-900">Ativar alertas de chamada</h1>
        <p className="mt-1 text-sm text-gray-500">Para você tocar e receber a chamada do "vendedor da vez" mesmo com o celular bloqueado, libere os 3 itens abaixo.</p>
      </div>

      {allOk && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <CheckCircle2 size={18} /> Tudo certo! Seu aparelho está pronto para receber as chamadas.
        </div>
      )}

      <Item
        ok={!!status?.notifications}
        icon={<BellRing size={20} />}
        title="Notificações"
        desc="Permite mostrar o aviso de chamada com Aceitar e Recusar."
        cta="Permitir notificações"
        onClick={() => void openNotificationSettings()}
      />
      <Item
        ok={!!status?.batteryUnrestricted}
        icon={<BatteryCharging size={20} />}
        title="Bateria sem restrição"
        desc="Impede o celular de adormecer o app e bloquear a chamada na bateria."
        cta="Liberar bateria"
        onClick={() => void openBatterySettings()}
      />
      <Item
        ok={!!status?.fullScreen}
        icon={<Maximize size={20} />}
        title="Notificação em tela cheia"
        desc="Faz a chamada abrir por cima da tela bloqueada (Android 14+)."
        cta="Permitir tela cheia"
        onClick={() => void openFullScreenSettings()}
      />

      {tip && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{tip}</span>
        </div>
      )}

      <button
        onClick={() => void openAppDetailsSettings()}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
      >
        Abrir todas as configurações do app
      </button>

      <button
        onClick={() => void refresh()}
        className="w-full rounded-lg px-4 py-2 text-sm font-medium text-brand-600 hover:underline"
      >
        Já configurei — verificar de novo
      </button>
    </div>
  )
}
