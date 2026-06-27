'use client'

// =============================================================================
// QueueSelfCard — card compacto de AUTOATENDIMENTO da fila, para o vendedor
// entrar/sair/pausar/voltar e ver a própria situação (posição, "Em atendimento",
// "Sua vez!") em QUALQUER tela do menu Fila de Atendimento. Some para quem não é
// vendedor (gerente/admin). Atualiza sozinho a cada 6s.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { LogOut, Pause, Play, Hand, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Me { status: string; position: number }
interface Current { me: Me | null; myAttendance: { id: string; status: string } | null; canCheckIn?: boolean }

function getPosition(): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve({}), { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}
function statusLabel(s: string): string {
  return ({ WAITING: 'Aguardando', NEXT: 'Próximo', CALLED: 'Sua vez!', ACCEPTED: 'Aceito', IN_ATTENDANCE: 'Em atendimento', PAUSED: 'Pausado' } as Record<string, string>)[s] ?? s
}

export default function QueueSelfCard() {
  const [data, setData] = useState<Current | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/current', { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { setHidden(true); return }
      setData((await res.json())?.data ?? null)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(); const i = setInterval(load, 6000); return () => clearInterval(i) }, [load])

  const post = async (path: string, body?: unknown) => {
    setBusy(true)
    try {
      await fetch(`/api/seller-queue/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: body ? JSON.stringify(body) : undefined })
      await load()
    } catch { /* noop */ } finally { setBusy(false) }
  }
  const checkIn = async () => { const pos = await getPosition(); await post('check-in', pos) }
  const resume = async () => { const pos = await getPosition(); await post('resume', pos) }

  if (loading || hidden) return null
  const me = data?.me
  const att = data?.myAttendance
  if (!me && !data?.canCheckIn) return null // não é vendedor → nada a mostrar

  const inAttendance = !!att && ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'].includes(att.status)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {!me ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Você não está na fila</p>
            <p className="text-xs text-gray-500">Entre para receber clientes.</p>
          </div>
          <button onClick={() => void checkIn()} disabled={busy} className="btn-primary shrink-0">{busy ? <Loader2 size={15} className="animate-spin" /> : <Hand size={15} />}Entrar na fila</button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              {inAttendance || me.position <= 0 ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Situação</p>
                  <p className="text-xl font-bold text-gray-900">{statusLabel(me.status)}</p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Sua posição na fila</p>
                  <p className="text-2xl font-bold tabular-nums text-gray-900">{me.position}º</p>
                </>
              )}
            </div>
            <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', me.status === 'PAUSED' ? 'bg-amber-100 text-amber-700' : me.status === 'IN_ATTENDANCE' ? 'bg-green-100 text-green-700' : me.status === 'CALLED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>{statusLabel(me.status)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {inAttendance && (
              <Link href="/vendedor-da-vez/minha-fila" className="btn-primary flex-1 justify-center"><CheckCircle2 size={15} />Ir para o atendimento</Link>
            )}
            {me.status === 'PAUSED' ? (
              <button onClick={() => void resume()} disabled={busy} className="btn-primary flex-1 justify-center"><Play size={15} />Voltar à fila</button>
            ) : ['WAITING', 'NEXT'].includes(me.status) ? (
              <button onClick={() => void post('pause', {})} disabled={busy} className="btn-secondary flex-1 justify-center"><Pause size={15} />Pausar</button>
            ) : null}
            {!inAttendance && (
              <button onClick={() => void post('check-out', {})} disabled={busy} className="btn-secondary justify-center text-red-600"><LogOut size={15} />Sair</button>
            )}
            <Link href="/vendedor-da-vez/minha-fila" className="btn-secondary justify-center">Minha Fila<ChevronRight size={15} /></Link>
          </div>
        </>
      )}
    </div>
  )
}
