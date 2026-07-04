'use client'

// =============================================================================
// AlertSetup — guia o usuário a liberar, no aparelho, tudo que o alerta de
// "vendedor da vez" precisa para tocar mesmo bloqueado/em 2º plano. Mostra o
// status de cada item e leva direto à configuração certa em qualquer fabricante.
// Usado na página "Ativar Alertas" e embutido em Configurações.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { BellRing, BatteryCharging, Maximize, CheckCircle2, AlertTriangle, ChevronRight, Smartphone, Loader2, Share, PlusSquare } from 'lucide-react'
import {
  isNativeAndroid, getAlertStatus, type AlertStatus,
  openNotificationSettings, openBatterySettings, openFullScreenSettings, openAppDetailsSettings,
} from '@/lib/mobile/push-bridge'
import { webPushSupported, isIOS, isStandalonePWA, notificationPermission, enableWebPush } from '@/lib/mobile/web-push-client'

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

export default function AlertSetup({ scope = 'queue' }: { scope?: 'queue' | 'general' }) {
  const [status, setStatus] = useState<AlertStatus | null>(null)
  const [native, setNative] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const testarAlerta = async () => {
    setTesting(true); setTestMsg(null)
    try {
      const r = await fetch('/api/mobile/push-test', { credentials: 'include' })
      const j = await r.json()
      const total = (j?.devicesNativos ?? 0) + (j?.webPushInscricoes ?? 0)
      if (j?.enviados > 0) setTestMsg('✅ Alerta enviado! Em alguns segundos deve aparecer a notificação.')
      else if (total === 0) setTestMsg('⚠️ Este aparelho ainda não está inscrito. Toque em "Ativar notificações" primeiro.')
      else setTestMsg(
        isNativeAndroid()
          ? '⚠️ Não foi possível enviar (a inscrição pode ter expirado). Feche o app completamente e abra de novo para renovar a inscrição.'
          : '⚠️ Não foi possível enviar (a inscrição pode ter expirado). Toque em "Ativar notificações" de novo.',
      )
    } catch {
      setTestMsg('⚠️ Erro de rede ao testar.')
    } finally { setTesting(false) }
  }

  const refresh = useCallback(async () => {
    const isNative = isNativeAndroid()
    setNative(isNative)
    if (isNative) setStatus(await getAlertStatus())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    const onVis = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [refresh])

  if (loading) {
    return <div className="flex min-h-[20vh] items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
  }

  if (!native) {
    return <WebPushSetup scope={scope} testarAlerta={testarAlerta} testing={testing} testMsg={testMsg} />
  }

  const allOk = status ? status.notifications && status.batteryUnrestricted && status.fullScreen : false
  const tip = status ? oemTip(status.manufacturer) : null

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        {scope === 'general'
          ? 'Para receber avisos importantes mesmo com o celular bloqueado, libere os itens abaixo.'
          : 'Para você tocar e receber a chamada do "vendedor da vez" mesmo com o celular bloqueado, libere os 3 itens abaixo.'}
      </p>

      {allOk && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <CheckCircle2 size={18} /> Tudo certo! Seu aparelho está pronto para receber as chamadas.
        </div>
      )}

      <Item ok={!!status?.notifications} icon={<BellRing size={20} />} title="Notificações" desc={scope === 'general' ? 'Permite mostrar avisos importantes do AutoDrive.' : 'Permite mostrar o aviso de chamada com Aceitar e Recusar.'} cta="Permitir notificações" onClick={() => void openNotificationSettings()} />
      <Item ok={!!status?.batteryUnrestricted} icon={<BatteryCharging size={20} />} title="Bateria sem restrição" desc="Impede o celular de adormecer o app e bloquear a chamada na bateria." cta="Liberar bateria" onClick={() => void openBatterySettings()} />
      <Item ok={!!status?.fullScreen} icon={<Maximize size={20} />} title="Notificação em tela cheia" desc="Faz a chamada abrir por cima da tela bloqueada (Android 14+)." cta="Permitir tela cheia" onClick={() => void openFullScreenSettings()} />

      {tip && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{tip}</span>
        </div>
      )}

      <button onClick={() => void testarAlerta()} disabled={testing} className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
        {testing ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
        Enviar alerta de teste para este celular
      </button>
      {testMsg && <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">{testMsg}</div>}

      <button onClick={() => void openAppDetailsSettings()} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
        Abrir todas as configurações do app
      </button>
      <button onClick={() => void refresh()} className="w-full rounded-lg px-4 py-2 text-sm font-medium text-brand-600 hover:underline">
        Já configurei — verificar de novo
      </button>
    </div>
  )
}

function WebPushSetup({ scope, testarAlerta, testing, testMsg }: { scope: 'queue' | 'general'; testarAlerta: () => Promise<void>; testing: boolean; testMsg: string | null }) {
  const [perm, setPerm] = useState<string>('default')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [env, setEnv] = useState<{ supported: boolean; ios: boolean; standalone: boolean }>({ supported: false, ios: false, standalone: false })

  useEffect(() => {
    const st = isStandalonePWA()
    setEnv({ supported: webPushSupported(), ios: isIOS(), standalone: st })
    setPerm(notificationPermission())
    if (st && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void enableWebPush().then((r) => { if (r.ok) setMsg('✅ Notificações ativas neste aparelho.'); else setMsg('⚠️ ' + (r.reason || 'reative as notificações abaixo.')) })
    }
  }, [])

  const ativar = async () => {
    setBusy(true); setMsg(null)
    const r = await enableWebPush()
    setPerm(notificationPermission())
    setMsg(r.ok ? '✅ Notificações ativadas neste aparelho!' : r.reason === 'denied' ? '⚠️ Permissão negada. Ative em Ajustes do iPhone › Notificações › AutoDrive.' : '⚠️ ' + (r.reason || 'Não foi possível ativar agora. Tente de novo.'))
    setBusy(false)
  }

  const precisaInstalar = env.ios && !env.standalone

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        {scope === 'general'
          ? 'Receba avisos importantes do AutoDrive mesmo com o navegador fechado ou em segundo plano, quando o aparelho permitir.'
          : 'Receba a chamada do "vendedor da vez" mesmo com a tela bloqueada.'}
      </p>

      {!env.supported && !precisaInstalar && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este navegador não suporta notificações. No iPhone, use o Safari e adicione o app à Tela de Início.
        </div>
      )}

      {precisaInstalar ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">📲 Primeiro, instale o app na Tela de Início</p>
          <p className="mt-1">No iPhone, a notificação só funciona com o app adicionado à Tela de Início. Faça uma vez:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Toque no botão <strong>Compartilhar</strong> <Share size={14} className="inline" /> (barra inferior do Safari).</li>
            <li>Escolha <strong>“Adicionar à Tela de Início”</strong> <PlusSquare size={14} className="inline" />.</li>
            <li>Confirme em <strong>Adicionar</strong>.</li>
            <li><strong>Abra o AutoDrive pelo ícone</strong> que apareceu na tela do iPhone e volte aqui.</li>
          </ol>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${perm === 'granted' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
              {perm === 'granted' ? <CheckCircle2 size={20} /> : <BellRing size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900">Notificações {perm === 'granted' && <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">Ativado</span>}</h3>
              <p className="mt-0.5 text-sm text-gray-500">{scope === 'general' ? 'Permite mostrar avisos importantes neste aparelho.' : 'Permite tocar e mostrar a chamada na tela bloqueada.'}</p>
              <button onClick={() => void ativar()} disabled={busy} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} {perm === 'granted' ? 'Reativar notificações' : 'Ativar notificações'}
              </button>
            </div>
          </div>
          {msg && <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">{msg}</div>}

          {perm === 'granted' && (
            <>
              <button onClick={() => void testarAlerta()} disabled={testing} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                {testing ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />} Enviar alerta de teste para este aparelho
              </button>
              {testMsg && <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">{testMsg}</div>}
            </>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <Smartphone size={16} className="mt-0.5 shrink-0" />
        <span>{scope === 'general' ? 'No iPhone, as notificações funcionam quando o AutoDrive está instalado na Tela de Início e a permissão foi concedida.' : 'No iPhone, o alerta toca uma vez com som e aparece na tela bloqueada. O alarme contínuo e a tela de chamada cheia são exclusivos do app Android (limitação da Apple).'}</span>
      </div>
    </div>
  )
}
