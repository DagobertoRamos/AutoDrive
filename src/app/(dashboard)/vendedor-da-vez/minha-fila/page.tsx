'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Minha Fila — tela do vendedor (mobile-first).
// Entrar/sair/pausar/voltar; quando chamado, aceitar/recusar; finalizar com
// resultado. Presença por GPS (best-effort). Faz polling de /current.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { DoorOpen, LogOut, Pause, Play, Check, X, CheckCircle2, RefreshCw, Hand, Clock, QrCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QrScanner } from '@/components/seller-queue/QrScanner'
import { unlockAudio, ensureNotifyPermission, stopCriticalAlert } from '@/lib/seller-queue/alert-client'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const TYPES = [['SALE', 'Venda'], ['EXCHANGE', 'Troca'], ['PURCHASE', 'Compra'], ['CONSIGNMENT', 'Consignação'], ['FINANCING', 'Financiamento'], ['AFTER_SALES', 'Pós-venda'], ['OTHER', 'Outro']] as const
const RESULTS = [['CONVERTED_TO_NEGOTIATION', 'Virou negociação'], ['SCHEDULED_RETURN', 'Retorno agendado'], ['NO_INTEREST', 'Sem interesse'], ['LOST', 'Perdido'], ['DUPLICATED', 'Duplicado'], ['FORWARDED_TO_RESPONSIBLE', 'Encaminhado'], ['INVALID_ATTENDANCE', 'Inválido']] as const

interface Me { status: string; position: number }
interface MyAtt { id: string; status: string; acceptDeadline: string | null; arrival: { customerName: string | null; customerPhone: string | null; recurring: boolean } | null }
interface Alerts { sound: boolean; soundType?: string; browserPush: boolean; repeatSeconds: number }
interface Block { type: 'COOLDOWN' | 'DAILY_BLOCK'; endsAt: string }
interface Current { me: Me | null; myAttendance: MyAtt | null; vendedorDaVez: { sellerName: string } | null; entries: unknown[]; queue: unknown; alerts?: Alerts; myBlock?: Block | null; myPosVenda?: { status: string } | null }

function getPosition(): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve({}), { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}

function blockText(b: Block, nowMs: number): string {
  if (b.type === 'DAILY_BLOCK') return 'Bloqueado por reincidência até o fim do dia. Procure a gerência para liberar.'
  const mins = Math.max(0, Math.ceil((new Date(b.endsAt).getTime() - nowMs) / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  const dur = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`
  return `Você perdeu a vez vezes demais e está fora da fila. Volta liberada em ~${dur}.`
}

export default function MinhaFilaPage() {
  const [data, setData] = useState<Current | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const [finForm, setFinForm] = useState({ type: 'SALE', result: 'CONVERTED_TO_NEGOTIATION', notes: '', customerName: '', customerPhone: '' })
  const [now, setNow] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/current', { credentials: 'include' })
      if (res.status === 403) { const j = await res.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      if (res.status === 400) { const j = await res.json().catch(() => ({})); setDenied(j?.error ?? 'Unidade não definida.'); return }
      setDenied(null); setData((await res.json())?.data ?? null)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i) }, [load])
  useEffect(() => { setNow(Date.now()); timer.current = setInterval(() => setNow(Date.now()), 1000); return () => { if (timer.current) clearInterval(timer.current) } }, [])

  // Destrava o áudio no 1º gesto do usuário na página (política de autoplay).
  useEffect(() => {
    const onGesture = () => unlockAudio()
    window.addEventListener('pointerdown', onGesture, { once: true })
    return () => window.removeEventListener('pointerdown', onGesture)
  }, [])

  // O alerta CRÍTICO (som/balão/vibração) é disparado pelo vigia GLOBAL
  // (QueueAlertWatcher no DashboardShell), que funciona em QUALQUER página/aba.
  // Aqui só paramos o alarme ao aceitar/recusar (ver accept/reject).

  const post = async (path: string, body?: unknown, okMsg?: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/seller-queue/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: body ? JSON.stringify(body) : undefined })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) flash(j?.error ?? 'Não foi possível concluir.', false); else flash(okMsg ?? 'Feito.', true)
      await load(); return res.ok
    } catch { flash('Erro de rede.', false); return false } finally { setBusy(false) }
  }

  const [scanOpen, setScanOpen] = useState(false)
  const checkIn = async () => { unlockAudio(); void ensureNotifyPermission(); const pos = await getPosition(); await post('check-in', pos, 'Você entrou na fila!') }
  const checkInQr = async (token: string) => { unlockAudio(); void ensureNotifyPermission(); setScanOpen(false); await post('check-in', { qrToken: token }, 'Você entrou na fila!') }
  const resume = async () => { const pos = await getPosition(); await post('resume', pos, 'De volta à fila!') }
  const me = data?.me
  const att = data?.myAttendance
  const secsLeft = att?.acceptDeadline ? Math.max(0, Math.floor((new Date(att.acceptDeadline).getTime() - now) / 1000)) : null

  const pedirVoltar = async () => { await post('pos-vendas/request-return', undefined, 'Retorno solicitado — aguarde a autorização do gestor.') }
  const accept = async () => { if (!att) return; stopCriticalAlert(); const pos = await getPosition(); await post(`attendances/${att.id}/accept`, pos, 'Atendimento iniciado!') }
  const reject = async () => { if (!att) return; stopCriticalAlert(); const reason = prompt('Motivo da recusa:'); if (!reason) return; await post(`attendances/${att.id}/reject`, { reason }, 'Recusado.') }
  const finish = async () => { if (!att) return; const ok = await post(`attendances/${att.id}/finish`, finForm, 'Atendimento finalizado!'); if (ok) setFinishOpen(false) }

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><DoorOpen size={20} className="text-brand-600" />Minha Fila</h1>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>
      {toast && <div className={cn('rounded-lg px-4 py-2 text-sm', toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{toast.msg}</div>}

      {/* Pós-vendas — pausado, pede para voltar à fila (autorização do gestor) */}
      {data?.myPosVenda && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-800">🛠️ Você está em pós-vendas (pausado na fila)</p>
          {data.myPosVenda.status === 'RETURN_REQUESTED' ? (
            <p className="mt-1 text-amber-700">Retorno solicitado — aguardando autorização do gestor.</p>
          ) : (
            <>
              <p className="mt-1 text-amber-700">Ao terminar o pós-vendas, peça para voltar à fila (você volta à mesma posição).</p>
              <button onClick={pedirVoltar} disabled={busy} className="mt-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">Pedir para voltar à fila</button>
            </>
          )}
        </div>
      )}

      {/* Bloqueio por reincidência (cooldown/diário) */}
      {data?.myBlock && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <p className="font-semibold text-red-700">🚫 Você está fora da fila</p>
          <p className="mt-0.5 text-red-600">{blockText(data.myBlock, now)}</p>
        </div>
      )}

      {/* Chamado — aceitar/recusar */}
      {att?.status === 'CALLED' && (
        <div className="rounded-2xl border-2 border-brand-400 bg-brand-50 p-5 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Você é o vendedor da vez</p>
          <p className="mt-1 text-gray-700">Cliente presencial aguardando{att.arrival?.customerName ? `: ${att.arrival.customerName}` : ''}.{att.arrival?.recurring ? ' (recorrente)' : ''}</p>
          {secsLeft != null && <p className="mt-2 inline-flex items-center gap-1 text-2xl font-bold tabular-nums text-brand-700"><Clock size={20} />{secsLeft}s</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={accept} disabled={busy} className="btn-primary flex-1 justify-center py-3 text-base"><Check size={18} />Aceitar</button>
            <button onClick={reject} disabled={busy} className="btn-secondary justify-center py-3"><X size={18} />Recusar</button>
          </div>
        </div>
      )}

      {/* Em atendimento — finalizar */}
      {att?.status === 'IN_ATTENDANCE' && (
        <div className="rounded-2xl border-2 border-green-400 bg-green-50 p-5 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-green-700">Em atendimento</p>
          <p className="mt-1 text-gray-700">{att.arrival?.customerName ?? 'Cliente'}{att.arrival?.customerPhone ? ` · ${att.arrival.customerPhone}` : ''}</p>
          <button onClick={() => { setFinForm((f) => ({ ...f, customerName: att?.arrival?.customerName ?? '', customerPhone: att?.arrival?.customerPhone ?? '' })); setFinishOpen(true) }} disabled={busy} className="btn-primary mt-4 w-full justify-center py-3 text-base"><CheckCircle2 size={18} />Finalizar atendimento</button>
        </div>
      )}

      {/* Status na fila */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
        {!me || me.status === 'LEFT' ? (
          <>
            <p className="text-center text-sm text-gray-500">Você não está na fila.</p>
            <button onClick={checkIn} disabled={busy} className="btn-primary mt-3 w-full justify-center py-3 text-base"><Hand size={18} />Entrar na fila</button>
            <button onClick={() => setScanOpen(true)} disabled={busy} className="btn-secondary mt-2 w-full justify-center"><QrCode size={16} />Entrar com QR da loja</button>
            <p className="mt-2 text-center text-[11px] text-gray-400">Sua presença será validada (GPS/QR/dispositivo).</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Sua posição</p>
                <p className="text-3xl font-bold tabular-nums text-gray-900">{me.position}º</p>
              </div>
              <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', me.status === 'PAUSED' ? 'bg-amber-100 text-amber-700' : me.status === 'IN_ATTENDANCE' ? 'bg-green-100 text-green-700' : me.status === 'CALLED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>{me.status}</span>
            </div>
            {data?.vendedorDaVez && <p className="mt-2 text-sm text-gray-500">Vendedor da vez agora: <strong>{data.vendedorDaVez.sellerName}</strong></p>}
            <div className="mt-4 flex gap-2">
              {me.status === 'PAUSED' ? (
                <button onClick={resume} disabled={busy} className="btn-primary flex-1 justify-center"><Play size={15} />Voltar</button>
              ) : ['WAITING', 'NEXT'].includes(me.status) ? (
                <button onClick={() => post('pause', {}, 'Pausado.')} disabled={busy} className="btn-secondary flex-1 justify-center"><Pause size={15} />Pausar</button>
              ) : null}
              <button onClick={() => post('check-out', {}, 'Você saiu da fila.')} disabled={busy} className="btn-secondary justify-center text-red-600"><LogOut size={15} />Sair</button>
            </div>
          </>
        )}
      </div>

      {scanOpen && <QrScanner onResult={checkInQr} onClose={() => setScanOpen(false)} />}

      {finishOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setFinishOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold text-gray-900">Finalizar atendimento</h2>
            <p className="mb-3 text-xs text-gray-500">Cadastre o cliente — gera um lead de atendimento no seu nome.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome do cliente</label><input className={inputCls} value={finForm.customerName} onChange={(e) => setFinForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Nome" /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Telefone</label><input className={inputCls} value={finForm.customerPhone} onChange={(e) => setFinForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="(00) 00000-0000" /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Tipo</label><select className={inputCls} value={finForm.type} onChange={(e) => setFinForm((f) => ({ ...f, type: e.target.value }))}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Resultado</label><select className={inputCls} value={finForm.result} onChange={(e) => setFinForm((f) => ({ ...f, result: e.target.value }))}>{RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><input className={inputCls} value={finForm.notes} onChange={(e) => setFinForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button onClick={() => setFinishOpen(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={finish} disabled={busy} className="btn-primary text-sm"><CheckCircle2 size={15} />Finalizar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
