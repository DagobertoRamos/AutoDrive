'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Volume2, Bell, ShieldAlert, RefreshCw, Play, CheckCircle2, History, User } from 'lucide-react'
import { SOUND_OPTIONS, playSound, unlockAudio } from '@/lib/seller-queue/alert-client'
import { cn } from '@/lib/utils'

interface CallableSeller {
  sellerId: string
  name: string
  queueStatus: string | null
  inQueue: boolean
}

interface AttentionEvent {
  id: string
  createdAt: string
  type: string
  sellerId: string | null
  sellerName: string | null
  actorId: string | null
  actorName: string | null
  reason: string | null
}

function parseEventStatus(reason: string | null) {
  if (!reason) return { status: 'UNKNOWN', text: 'Sem informações', color: 'bg-gray-100 text-gray-700 border-gray-200' }
  if (reason.includes('respondido')) {
    const match = reason.match(/tempo de resposta:\s*(\d+s)/i)
    const time = match ? match[1] : ''
    return { status: 'RESPONDED', text: `Respondido em ${time || 'alguns segundos'} ✓`, color: 'bg-green-100 text-green-800 border-green-200' }
  }
  if (reason.includes('enviado')) {
    return { status: 'SENT', text: 'Pendente (aguardando vendedor)', color: 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse' }
  }
  return { status: 'OTHER', text: reason, color: 'bg-gray-100 text-gray-700 border-gray-200' }
}

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER']

export default function QueueTestsPage() {
  const { data: session } = useSession()
  const user = session?.user as { id?: string; role?: string } | undefined
  const isManager = !!user?.role && MANAGE_ROLES.includes(user.role)

  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [sellers, setSellers] = useState<CallableSeller[]>([])
  const [selectedSeller, setSelectedSeller] = useState('')
  const [history, setHistory] = useState<AttentionEvent[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const flash = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3600)
  }

  const handleUnlockAudio = () => {
    unlockAudio()
    setAudioUnlocked(true)
    playSound('soft')
  }

  const loadSellers = useCallback(async () => {
    if (!isManager) return
    try {
      const res = await fetch('/api/seller-queue/callable', { credentials: 'include' })
      if (res.ok) {
        const j = await res.json()
        setSellers(j?.data ?? [])
      }
    } catch { /* noop */ }
  }, [isManager])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/seller-queue/test-attention', { credentials: 'include' })
      if (res.ok) {
        const j = await res.json()
        setHistory(j?.data ?? [])
      }
    } catch { /* noop */ } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    loadSellers()
    loadHistory()
  }, [loadSellers, loadHistory])

  const triggerTest = async () => {
    if (!selectedSeller) {
      flash('Selecione um vendedor.', false)
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/seller-queue/test-attention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sellerId: selectedSeller })
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        if (j?.warning) {
          // Enviou, mas o alvo não tem aparelho registrado → não vai chegar push.
          flash(j.warning, false)
        } else {
          const d = j?.devices
          const detail = d ? ` (Android ${d.android} · iPhone/PWA ${d.webpush + d.ios})` : ''
          flash(`Teste de atenção enviado!${detail} ⚠️`, true)
        }
        loadHistory()
      } else {
        flash(j?.error ?? 'Falha ao enviar teste de atenção.', false)
      }
    } catch {
      flash('Erro de rede.', false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      {/* Toast Alert */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-xl animate-bounce",
          toast.ok ? "bg-green-600" : "bg-red-600"
        )}>
          {toast.ok ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Volume2 size={24} className="text-brand-600 animate-pulse" />
            Painel de Diagnóstico e Testes
          </h1>
          <p className="text-xs text-gray-500">
            Valide o áudio, som de chamadas, sirenes e testes de atenção operacional dos vendedores.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Teste de Áudio Local */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Bell size={18} className="text-brand-600" />
            Teste de Áudio Local
          </h2>
          <p className="text-xs text-gray-500">
            Clique no botão abaixo para destravar o contexto de áudio do navegador e testar os toques.
          </p>

          {!audioUnlocked ? (
            <button
              onClick={handleUnlockAudio}
              className="btn-primary w-full justify-center py-3 text-sm font-bold animate-pulse"
            >
              <Volume2 size={16} />
              Destravar Áudio do Navegador
            </button>
          ) : (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs font-semibold text-green-700 text-center">
              ✓ Áudio destravado com sucesso!
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2">
            {SOUND_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  if (!audioUnlocked) handleUnlockAudio()
                  playSound(s.value)
                }}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
              >
                <span>{s.label}</span>
                <Play size={12} className="text-brand-600" />
              </button>
            ))}
          </div>
        </div>

        {/* Disparo de Teste de Atenção (Gestor) */}
        {isManager && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert size={18} className="text-amber-500" />
              Enviar Teste de Atenção
            </h2>
            <p className="text-xs text-gray-500">
              Dispare uma notificação persistente na tela de um vendedor específico para testar o tempo de reação.
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Vendedor</label>
                <select
                  value={selectedSeller}
                  onChange={(e) => setSelectedSeller(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">— selecione o vendedor —</option>
                  {sellers.map((s) => (
                    <option key={s.sellerId} value={s.sellerId}>
                      {s.name} {s.queueStatus ? `(${s.queueStatus})` : '(fora da fila)'}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={triggerTest}
                disabled={busy}
                className="btn-primary w-full justify-center py-3 text-sm font-bold bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
              >
                <ShieldAlert size={16} />
                Disparar Alerta na Tela do Vendedor
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Histórico de Testes Recentes */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 bg-gray-50">
          <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <History size={16} className="text-brand-600" />
            Histórico Recente de Alertas e Respostas
          </p>
          <button
            onClick={loadHistory}
            disabled={loadingHistory}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <RefreshCw size={14} className={cn(loadingHistory && "animate-spin")} />
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {history.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Nenhum alerta de atenção enviado recentemente.
            </div>
          ) : (
            history.map((h) => {
              const statusInfo = parseEventStatus(h.reason)
              return (
                <div key={h.id} className="grid gap-2 px-4 py-3 md:grid-cols-[10rem_1.5fr_1fr] md:items-center text-xs">
                  <div className="text-gray-400 tabular-nums">
                    {new Date(h.createdAt).toLocaleString()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                      <User size={12} className="text-gray-400" />
                      {h.sellerName ?? 'Vendedor desconhecido'}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Enviado por: {h.actorName ?? 'Gestão'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('px-2.5 py-1 rounded-full border text-[10px] font-bold shadow-sm', statusInfo.color)}>
                      {statusInfo.text}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
