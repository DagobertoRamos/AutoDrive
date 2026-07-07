'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, User, Clock, ShieldAlert, ArrowRight, Volume2 } from 'lucide-react'
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
}

interface CurrentData {
  queue: { id: string; date: string; status: string; unitId: string } | null
  entries: Entry[]
  vendedorDaVez: { sellerId: string; sellerName: string; position: number } | null
  me: Entry | null
  arrivalsPending: number
  queueOpen?: boolean
}

export default function StorePanelPage() {
  const [data, setData] = useState<CurrentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(0)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [flashActive, setFlashActive] = useState(false)
  // Volume do alarme na TV (multiplicador). Padrão alto (4x) porque a TV da loja
  // costuma ficar com volume baixo. Ajustável na tela e lembrado por terminal.
  const [vol, setVol] = useState(4)

  const prevVendedorId = useRef<string | null>(null)
  const prevCalledSellerId = useRef<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Carrega o volume salvo neste terminal (se houver).
  useEffect(() => {
    try { const s = localStorage.getItem('sq_panel_vol'); if (s) setVol(Math.max(1, Math.min(8, Number(s) || 4))) } catch { /* ignore */ }
  }, [])

  // Aplica e persiste o volume mestre sempre que mudar.
  useEffect(() => {
    setAlertVolume(vol)
    try { localStorage.setItem('sq_panel_vol', String(vol)) } catch { /* ignore */ }
  }, [vol])

  // Ajusta o volume e toca uma prévia (se o áudio já estiver liberado).
  const changeVol = (delta: number) => {
    setVol((v) => {
      const nv = Math.max(1, Math.min(8, v + delta))
      setAlertVolume(nv)
      if (audioUnlocked) playSound('soft')
      return nv
    })
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/current', { credentials: 'include' })
      if (res.ok) {
        const j = await res.json()
        const currentData = j?.data as CurrentData
        setData(currentData)

        // Detecção de nova chamada
        const calledSeller = currentData?.entries?.find((e) => e.operationalState === 'CHAMADO')
        if (calledSeller) {
          if (calledSeller.sellerId !== prevCalledSellerId.current) {
            // Nova chamada de vendedor!
            prevCalledSellerId.current = calledSeller.sellerId
            playSound('chime')
            setFlashActive(true)
            setTimeout(() => setFlashActive(false), 5000)
          }
        } else {
          prevCalledSellerId.current = null
        }

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
    } catch { /* noop */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const poll = setInterval(load, 2500)
    return () => clearInterval(poll)
  }, [load])

  const handleUnlockAudio = () => {
    unlockAudio()
    setAudioUnlocked(true)
    playSound('soft')
  }

  // Separar vendedores nas sub-filas operacionais
  const entries = data?.entries ?? []
  const waiting = entries.filter((e) => (e.status === 'WAITING' || e.status === 'NEXT') && !e.blocked)
  const called = entries.filter((e) => e.operationalState === 'CHAMADO')
  const attending = entries.filter((e) => e.operationalState === 'ATENDENDO' || e.operationalState === 'EM_INFORMACAO_RAPIDA' || e.operationalState === 'ATENDENDO_SEM_INICIAR' || e.operationalState === 'AGUARDANDO_FINALIZACAO')
  const paused = entries.filter((e) => e.operationalState === 'PAUSADO' || e.operationalState === 'NAO_RESPONDEU' || e.operationalState === 'BLOQUEADO' || e.operationalState === 'FORA_DA_LOJA')

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

        <div className="flex items-center gap-4">
          {/* Controle de volume do alarme (TV baixa → aumentar aqui). */}
          <div className="flex items-center gap-1.5 rounded-xl bg-gray-800/60 border border-gray-700 px-2 py-1.5">
            <button onClick={() => changeVol(-1)} disabled={vol <= 1} className="h-6 w-6 rounded-md bg-gray-700 text-white text-base font-bold leading-none hover:bg-gray-600 disabled:opacity-40" aria-label="Diminuir volume">−</button>
            <span className="flex items-center gap-1 text-xs font-bold text-gray-200 tabular-nums w-[54px] justify-center"><Volume2 size={14} /> {vol}x</span>
            <button onClick={() => changeVol(1)} disabled={vol >= 8} className="h-6 w-6 rounded-md bg-gray-700 text-white text-base font-bold leading-none hover:bg-gray-600 disabled:opacity-40" aria-label="Aumentar volume">+</button>
          </div>
          {!audioUnlocked ? (
            <button
              onClick={handleUnlockAudio}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black animate-pulse hover:bg-amber-400"
            >
              <Volume2 size={16} />
              HABILITAR ÁUDIO DO PAINEL
            </button>
          ) : (
            <span className="text-xs font-bold text-green-500 flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-ping" />
              ÁUDIO ATIVO
            </span>
          )}
          <span className="text-sm font-semibold tabular-nums text-gray-400">
            {new Date(now).toLocaleTimeString()}
          </span>
        </div>
      </header>

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
                    <div key={c.id} className="rounded-3xl border-2 border-amber-500 bg-amber-950/20 p-6 flex flex-col justify-between shadow-lg shadow-amber-500/5 animate-pulse">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black uppercase">
                            TOCANDO
                          </span>
                          <span className="text-xs font-bold text-amber-500 tabular-nums">
                            {timeLabel(c.joinedAt)}
                          </span>
                        </div>
                        <h4 className="text-3xl font-black mt-3 text-white truncate">
                          {c.sellerName}
                        </h4>
                      </div>
                      <div className="mt-6 text-sm text-gray-400 font-medium">
                        Responda no celular/computador
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
