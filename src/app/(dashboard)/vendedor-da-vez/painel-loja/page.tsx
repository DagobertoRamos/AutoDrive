'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, User, Clock, ShieldAlert, ArrowRight, Volume2, VolumeX, RefreshCw } from 'lucide-react'
import { playSound, unlockAudio, setAlertVolume } from '@/lib/seller-queue/alert-client'
import { cn } from '@/lib/utils'

interface Entry {
  id: string
  sellerId: string
  sellerName: string
  status: string
  position: number
  joinedAt: string
  blocked: boolean
  attendanceCount: number
  hasDevice?: boolean
  operationalState?: string
  activeAttendanceId?: string | null
  activeAttendanceStatus?: string | null
  activeAttendanceCalledAt?: string | null
  activeAttendanceAcceptDeadline?: string | null
  activeAttendanceActorName?: string | null
}

interface PanelSoundConfig {
  enabled: boolean
  repeatUntilAccepted: boolean
  repeatSeconds: number
  refreshSeconds: number
  volume: number
  soundType: string
  muteOutsideHours: boolean
  wakeLock: boolean
  showHiddenWarning: boolean
}

interface CurrentData {
  queue: { id: string; date: string; status: string; unitId: string } | null
  unitName?: string | null
  entries: Entry[]
  vendedorDaVez: { sellerId: string; sellerName: string; position: number } | null
  me: Entry | null
  arrivalsPending: number
  queueOpen?: boolean
  panelSound?: PanelSoundConfig
}

const DEFAULT_PANEL_SOUND: PanelSoundConfig = {
  enabled: true,
  repeatUntilAccepted: true,
  repeatSeconds: 3,
  refreshSeconds: 3,
  volume: 80,
  soundType: 'siren',
  muteOutsideHours: false,
  wakeLock: true,
  showHiddenWarning: true,
}

export default function StorePanelPage() {
  const [data, setData] = useState<CurrentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(0)
  const [audioUnlocked, setAudioUnlocked] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('sq_panel_audio_unlocked') === '1' } catch { return false }
  })
  const [panelSoundEnabled, setPanelSoundEnabled] = useState(() => {
    try { return typeof window === 'undefined' || localStorage.getItem('sq_panel_sound_enabled') !== '0' } catch { return true }
  })
  const [flashActive, setFlashActive] = useState(false)
  const [isHidden, setIsHidden] = useState(false)
  const [wakeLockActive, setWakeLockActive] = useState(false)

  const prevVendedorId = useRef<string | null>(null)
  const activeSoundTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeSoundCallId = useRef<string | null>(null)
  const isFetchingRef = useRef(false)
  const wakeLockRef = useRef<{ release: () => Promise<void>; released?: boolean } | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const sp = typeof window !== 'undefined' ? window.location.search : ''
      const connector = sp ? (sp.includes('?') ? '&' : '?') : '?'
      const res = await fetch(`/api/seller-queue/panel-summary${sp}${connector}_t=${Date.now()}`, { credentials: 'include' })
      if (res.ok) {
        const j = await res.json()
        const currentData = j?.data as CurrentData
        setData(currentData)

        // Detecção de mudança no vendedor da vez
        if (currentData?.vendedorDaVez) {
          if (currentData.vendedorDaVez.sellerId !== prevVendedorId.current) {
            prevVendedorId.current = currentData.vendedorDaVez.sellerId
            if (prevVendedorId.current) {
              playSound('bell')
            }
          }
        } else {
          prevVendedorId.current = null
        }
      }
    } catch {
      // noop: painel de TV não pode travar por oscilação de rede.
    } finally {
      isFetchingRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const firstLoad = window.setTimeout(() => { void load() }, 0)
    const seconds = Math.min(Math.max(data?.panelSound?.refreshSeconds ?? DEFAULT_PANEL_SOUND.refreshSeconds, 3), 60)
    const poll = setInterval(load, seconds * 1000)
    return () => {
      clearTimeout(firstLoad)
      clearInterval(poll)
    }
  }, [load, data?.panelSound?.refreshSeconds])

  const handleUnlockAudio = () => {
    unlockAudio()
    setAudioUnlocked(true)
    setPanelSoundEnabled(true)
    try {
      localStorage.setItem('sq_panel_audio_unlocked', '1')
      localStorage.setItem('sq_panel_sound_enabled', '1')
    } catch { /* ignore */ }
    playSound(data?.panelSound?.soundType ?? DEFAULT_PANEL_SOUND.soundType)
  }

  const silencePanel = () => {
    setPanelSoundEnabled(false)
    if (activeSoundTimer.current) clearInterval(activeSoundTimer.current)
    activeSoundTimer.current = null
    activeSoundCallId.current = null
    try { localStorage.setItem('sq_panel_sound_enabled', '0') } catch { /* ignore */ }
  }

  // Separar vendedores nas sub-filas operacionais
  const entries = data?.entries ?? []
  const waiting = entries.filter((e) => (e.status === 'WAITING' || e.status === 'NEXT') && !e.blocked)
  const called = entries.filter((e) => e.operationalState === 'CHAMADO')
  const attending = entries.filter((e) => e.operationalState === 'ATENDENDO' || e.operationalState === 'EM_INFORMACAO_RAPIDA' || e.operationalState === 'ATENDENDO_SEM_INICIAR' || e.operationalState === 'AGUARDANDO_FINALIZACAO')
  const panelSound = { ...DEFAULT_PANEL_SOUND, ...(data?.panelSound ?? {}) }
  const activeCall = called[0] ?? null
  const activeCallId = activeCall?.activeAttendanceId ?? activeCall?.id ?? null
  const canPlayPanelSound = panelSound.enabled && panelSound.repeatUntilAccepted && panelSoundEnabled && audioUnlocked && panelSound.volume > 0 && !(panelSound.muteOutsideHours && data?.queueOpen === false)

  useEffect(() => {
    const onVisibility = () => setIsHidden(document.hidden)
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    setAlertVolume(Math.max(0, Math.min(8, (panelSound.volume / 100) * 8)))
  }, [panelSound.volume])

  useEffect(() => {
    const stopLoop = () => {
      if (activeSoundTimer.current) clearInterval(activeSoundTimer.current)
      activeSoundTimer.current = null
      activeSoundCallId.current = null
      setFlashActive(false)
    }

    if (!activeCallId || !canPlayPanelSound) {
      stopLoop()
      return stopLoop
    }

    const repeatMs = Math.min(Math.max(panelSound.repeatSeconds, 1), 30) * 1000
    const playPanelAlert = () => {
      playSound(panelSound.soundType)
      setFlashActive(true)
      window.setTimeout(() => setFlashActive(false), Math.min(900, repeatMs - 100))
    }

    if (activeSoundCallId.current !== activeCallId) {
      stopLoop()
      activeSoundCallId.current = activeCallId
      playPanelAlert()
    }

    if (!activeSoundTimer.current) activeSoundTimer.current = setInterval(playPanelAlert, repeatMs)
    return stopLoop
  }, [activeCallId, canPlayPanelSound, panelSound.repeatSeconds, panelSound.soundType])

  useEffect(() => {
    if (!panelSound.wakeLock) return
    let cancelled = false

    const requestWakeLock = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void>; released?: boolean; addEventListener?: (event: 'release', cb: () => void) => void }> } }
        if (!nav.wakeLock || document.hidden) return
        const lock = await nav.wakeLock.request('screen')
        if (cancelled) { await lock.release(); return }
        wakeLockRef.current = lock
        setWakeLockActive(true)
        lock.addEventListener?.('release', () => setWakeLockActive(false))
      } catch {
        setWakeLockActive(false)
      }
    }

    const onVisible = () => {
      if (!document.hidden && (!wakeLockRef.current || wakeLockRef.current.released)) void requestWakeLock()
    }

    void requestWakeLock()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      const lock = wakeLockRef.current
      wakeLockRef.current = null
      setWakeLockActive(false)
      void lock?.release().catch(() => {})
    }
  }, [panelSound.wakeLock])

  const timeLabel = (joinedStr: string) => {
    try {
      const ms = now - new Date(joinedStr).getTime()
      const mins = Math.max(0, Math.floor(ms / 60000))
      const secs = Math.max(0, Math.floor((ms % 60000) / 1000))
      return `${mins}m ${secs}s`
    } catch {
      return '--'
    }
  }

  const countdownLabel = (deadline?: string | null) => {
    if (!deadline) return 'sem prazo'
    const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000))
    return seconds > 0 ? `${seconds}s para responder` : 'tempo esgotado'
  }

  return (
    <div className={cn(
      "min-h-screen bg-[#090d16] text-white p-6 flex flex-col font-sans transition-colors duration-300",
      flashActive && "bg-brand-950"
    )}>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-600 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-brand-500/30">
            AD
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wider text-gray-100">AUTODRIVE</h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Painel de Atendimento da Loja</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold",
            canPlayPanelSound ? "border-green-800 bg-green-950/50 text-green-300" : "border-gray-700 bg-gray-800/60 text-gray-300"
          )}>
            {canPlayPanelSound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {canPlayPanelSound ? 'Som ativo' : 'Som inativo'}
          </span>
          <span className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800/60 px-3 py-2 text-xs font-bold text-gray-300">
            <RefreshCw size={14} />
            {panelSound.refreshSeconds}s
          </span>
          <span className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800/60 px-3 py-2 text-xs font-bold text-gray-300">
            <Bell size={14} />
            {panelSound.repeatSeconds}s / {panelSound.volume}%
          </span>
          {panelSound.wakeLock && (
            <span className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold",
              wakeLockActive ? "border-blue-800 bg-blue-950/40 text-blue-300" : "border-amber-800 bg-amber-950/30 text-amber-300"
            )}>
              <ShieldAlert size={14} />
              {wakeLockActive ? 'Tela ativa' : 'Wake Lock pendente'}
            </span>
          )}
          {!audioUnlocked || !panelSoundEnabled ? (
            <button
              onClick={handleUnlockAudio}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black animate-pulse hover:bg-amber-400"
            >
              <Volume2 size={16} />
              Ativar som do painel
            </button>
          ) : (
            <>
              <button
                onClick={handleUnlockAudio}
                className="flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2 text-xs font-bold text-gray-100 hover:bg-gray-700"
              >
                <Volume2 size={16} />
                Testar som
              </button>
              <button
                onClick={silencePanel}
                className="flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2 text-xs font-bold text-gray-100 hover:bg-gray-700"
              >
                <VolumeX size={16} />
                Silenciar painel
              </button>
            </>
          )}
          <span className="text-sm font-semibold tabular-nums text-gray-400">
            {new Date(now).toLocaleTimeString()}
          </span>
        </div>
      </header>

      {panelSound.showHiddenWarning && isHidden && (
        <div className="mb-4 rounded-2xl border border-amber-500/60 bg-amber-950/40 px-4 py-3 text-sm font-bold text-amber-200">
          Painel em segundo plano. Mantenha esta aba visível para garantir som e Wake Lock no navegador.
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-12 w-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-grow grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Coluna Principal: Vendedor da Vez + Chamadas Ativas */}
          <div className="xl:col-span-2 space-y-6 flex flex-col">
            {/* Vendedor da Vez */}
            <div className="rounded-3xl border border-gray-800 bg-[#0f1626]/80 p-8 flex flex-col justify-between relative overflow-hidden shadow-2xl shadow-black/40 min-h-[320px]">
              <div className="absolute top-0 right-0 h-40 w-40 bg-brand-500/10 rounded-full blur-3xl" />
              <div>
                <span className="px-3 py-1 rounded-full bg-brand-950 text-brand-400 border border-brand-800 text-xs font-bold tracking-widest uppercase">
                  Vendedor da Vez / Próximo Chamado
                </span>
                <h2 className="text-6xl md:text-8xl font-black mt-6 tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
                  {data?.vendedorDaVez?.sellerName ?? "Fila Vazia"}
                </h2>
              </div>
              <div className="mt-8 flex items-center gap-4">
                {data?.vendedorDaVez ? (
                  <div className="flex items-center gap-2 text-brand-400 font-bold text-sm bg-brand-950/60 border border-brand-900 rounded-xl px-4 py-2">
                    <Clock size={16} />
                    Aguardando chamado
                  </div>
                ) : (
                  <div className="text-amber-500 font-bold text-sm bg-amber-950/40 border border-amber-900 rounded-xl px-4 py-2">
                    Nenhum vendedor em espera geral
                  </div>
                )}
              </div>
            </div>

            {/* Chamadas Ativas (Chamado / Tocando) */}
            <div className="flex-grow flex flex-col">
              <h3 className="text-lg font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Bell size={18} className="text-amber-500 animate-bounce" />
                Chamados Agora
              </h3>
              {called.length === 0 ? (
                <div className="flex-grow rounded-3xl border border-dashed border-gray-800 flex flex-col items-center justify-center py-12 text-center">
                  <span className="h-12 w-12 rounded-full bg-gray-900 flex items-center justify-center text-gray-600 mb-2">
                    <User size={20} />
                  </span>
                  <p className="text-sm font-semibold text-gray-500">Nenhum chamado ativo no momento.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 flex-grow">
                  {called.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        "rounded-3xl border-2 border-amber-500 bg-amber-950/20 p-6 flex flex-col justify-between shadow-lg shadow-amber-500/5",
                        flashActive && "animate-pulse ring-4 ring-amber-400/30"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black uppercase">
                            Chamando vendedor
                          </span>
                          <span className="text-xs font-bold text-amber-500 tabular-nums">
                            {countdownLabel(c.activeAttendanceAcceptDeadline)}
                          </span>
                        </div>
                        <h4 className="text-3xl font-black mt-3 text-white truncate">
                          {c.sellerName}
                        </h4>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-amber-200/80">
                          {c.activeAttendanceActorName ? `Chamado por ${c.activeAttendanceActorName}` : 'Chamado pelo sistema'}
                        </p>
                      </div>
                      <div className="mt-6 grid gap-2 text-sm text-gray-300">
                        <div className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2">
                          <span className="font-medium">Tocando ha</span>
                          <span className="font-bold tabular-nums">{timeLabel(c.activeAttendanceCalledAt ?? c.joinedAt)}</span>
                        </div>
                        <div className="rounded-xl bg-black/20 px-3 py-2 font-semibold text-amber-100">
                          O som para quando o vendedor aceitar, recusar, expirar ou a chamada for escalonada.
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Coluna Lateral: Em atendimento + Ordem da Fila */}
          <div className="space-y-6 flex flex-col justify-between">
            {/* Próximos na Fila */}
            <div className="rounded-3xl border border-gray-800 bg-[#0f1626]/80 p-6 flex flex-col min-h-[300px]">
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ArrowRight size={16} className="text-brand-500" />
                Ordem da Fila ({waiting.length})
              </h3>
              <div className="flex-grow space-y-2 overflow-y-auto max-h-[280px]">
                {waiting.map((w, index) => (
                  <div key={w.id} className="flex items-center justify-between bg-[#121b2d] rounded-xl p-3 border border-gray-800/60">
                    <div className="flex items-center gap-3">
                      <span className="h-6 w-6 rounded-full bg-brand-950 border border-brand-800 flex items-center justify-center text-xs font-bold text-brand-400">
                        {index + 1}
                      </span>
                      <span className="font-bold text-gray-200">{w.sellerName}</span>
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums">{timeLabel(w.joinedAt)}</span>
                  </div>
                ))}
                {waiting.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-8">Nenhum vendedor aguardando na fila.</p>
                )}
              </div>
            </div>

            {/* Atendimentos em Andamento */}
            <div className="flex-grow flex flex-col">
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <User size={16} className="text-blue-500" />
                Atendendo Clientes ({attending.length})
              </h3>
              <div className="flex-grow bg-[#0f1626]/80 rounded-3xl border border-gray-800 p-5 space-y-3 overflow-y-auto max-h-[320px]">
                {attending.map((a) => (
                  <div key={a.id} className="flex items-center justify-between bg-[#121b2d] border border-gray-800/40 rounded-xl p-3.5">
                    <div className="min-w-0">
                      <h4 className="font-black text-gray-100 truncate text-sm">{a.sellerName}</h4>
                      <p className="text-[10px] text-brand-400 font-bold uppercase tracking-wider mt-0.5">
                        {a.operationalState === 'EM_INFORMACAO_RAPIDA' ? 'Informação rápida' : 'Cliente de Porta'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={cn(
                        "text-xs font-semibold tabular-nums",
                        a.operationalState === 'AGUARDANDO_FINALIZACAO' ? "text-pink-500 font-bold" : "text-gray-400"
                      )}>
                        {timeLabel(a.joinedAt)}
                      </span>
                    </div>
                  </div>
                ))}
                {attending.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-12">Nenhum vendedor em atendimento ativo.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
