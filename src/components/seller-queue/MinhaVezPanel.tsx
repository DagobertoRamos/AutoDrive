'use client'

// =============================================================================
// Painel "Minha Vez" — bloco do vendedor dentro da Visão Geral da fila.
// Entrar/sair/pausar/voltar; quando chamado, aceitar/recusar; finalizar com
// cadastro do cliente + resultado. Faz polling de /current. Extraído da antiga
// página "Minha Fila" (agora consolidada na Visão Geral).
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { LogOut, Pause, Play, Check, X, CheckCircle2, Hand, Clock, QrCode, DoorOpen, Bell, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QrScanner } from '@/components/seller-queue/QrScanner'
import AlertSetupBanner from '@/components/seller-queue/AlertSetupBanner'
import ClienteNaLojaPanel from '@/components/seller-queue/ClienteNaLojaPanel'
import CustomerLookup, { type CustomerMatch } from '@/components/seller-queue/CustomerLookup'
import { queueStatusLabel } from '@/lib/seller-queue/labels'
import { unlockAudio, ensureNotifyPermission, stopCriticalAlert } from '@/lib/seller-queue/alert-client'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base md:text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const TYPES = [['SALE', 'Venda'], ['EXCHANGE', 'Troca'], ['PURCHASE', 'Compra'], ['CONSIGNMENT', 'Consignação'], ['FINANCING', 'Financiamento'], ['AFTER_SALES', 'Pós-venda'], ['OTHER', 'Outro']] as const
const RESULTS = [['CONVERTED_TO_NEGOTIATION', 'Virou negociação'], ['SCHEDULED_RETURN', 'Retorno agendado'], ['NO_INTEREST', 'Sem interesse'], ['LOST', 'Perdido'], ['DUPLICATED', 'Duplicado'], ['FORWARDED_TO_RESPONSIBLE', 'Encaminhado'], ['INVALID_ATTENDANCE', 'Inválido']] as const

interface Me { status: string; position: number }
interface MyAtt { id: string; status: string; acceptDeadline: string | null; arrival: { customerName: string | null; customerPhone: string | null; customerEmail: string | null; recurring: boolean } | null; visitType?: string | null; startedAt?: string | null }
interface Block { type: 'COOLDOWN' | 'DAILY_BLOCK'; endsAt: string }
interface Current { me: Me | null; myAttendance: MyAtt | null; vendedorDaVez: { sellerName: string } | null; myBlock?: Block | null; myPosVenda?: { status: string } | null; closeReasons?: string[]; autoRemovedNotice?: string | null; queueOpen?: boolean; canCheckIn?: boolean; onVacation?: boolean; permissions?: { callCurrentSeller?: boolean }; activeAttentionTest?: { id: string; sentAt: string } | null }

function getPosition(): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
    // maximumAge: reaproveita uma posição recente (≤60s) → aceite instantâneo no
    // 2º toque/atendimento. timeout menor p/ não travar o botão por muito tempo.
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve({}), { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 },
    )
  })
}

const statusLabel = (s: string) => queueStatusLabel(s)

function maskPhoneBR(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 3) return `(${d.slice(0, 2)})${d.slice(2)}`
  if (d.length <= 7) return `(${d.slice(0, 2)})${d.slice(2, 3)}.${d.slice(3)}`
  return `(${d.slice(0, 2)})${d.slice(2, 3)}.${d.slice(3, 7)}-${d.slice(7, 11)}`
}
const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
function capName(s: string): string {
  return s.toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => (i > 0 && SMALL_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

function blockText(b: Block, nowMs: number): string {
  if (b.type === 'DAILY_BLOCK') return 'Bloqueado por reincidência até o fim do dia. Procure a gerência para liberar.'
  const mins = Math.max(0, Math.ceil((new Date(b.endsAt).getTime() - nowMs) / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  const dur = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`
  return `Você perdeu a vez vezes demais e está fora da fila. Volta liberada em ~${dur}.`
}

export default function MinhaVezPanel() {
  const [data, setData] = useState<Current | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const [finForm, setFinForm] = useState({ type: 'SALE', result: 'CONVERTED_TO_NEGOTIATION', motivo: '', notes: '', customerName: '', customerPhone: '', customerEmail: '' })
  // Cliente/lead reaproveitado da busca (anti-duplicação). Limpa ao digitar manual.
  const [pickedCustomerId, setPickedCustomerId] = useState<string | null>(null)
  const [pickedLeadId, setPickedLeadId] = useState<string | null>(null)
  const pickMatch = (m: CustomerMatch) => {
    setFinForm((f) => ({ ...f, customerName: m.name ?? f.customerName, customerPhone: m.phone ?? f.customerPhone, customerEmail: m.email ?? f.customerEmail }))
    setPickedCustomerId(m.customerId); setPickedLeadId(m.leadId)
  }
  const [now, setNow] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/current', { credentials: 'include' })
      if (res.ok) setData((await res.json())?.data ?? null)
    } catch { /* noop */ }
  }, [])
  // Polling mais rápido (2s) para o "Aceitar/Recusar" aparecer logo após ser
  // chamado (antes era 5s → parecia travado no celular).
  useEffect(() => { load(); const i = setInterval(load, 2000); return () => clearInterval(i) }, [load])
  useEffect(() => { setNow(Date.now()); timer.current = setInterval(() => setNow(Date.now()), 1000); return () => { if (timer.current) clearInterval(timer.current) } }, [])

  useEffect(() => {
    const onGesture = () => unlockAudio()
    window.addEventListener('pointerdown', onGesture, { once: true })
    return () => window.removeEventListener('pointerdown', onGesture)
  }, [])

  // Alerta sonoro / vibratório de teste de atenção
  const { criticalAlert } = require('@/lib/seller-queue/alert-client')
  useEffect(() => {
    if (data?.activeAttentionTest) {
      criticalAlert({ title: 'Teste de atenção! ⚠️', body: 'Confirme que está ativo para responder à gerência.' })
    }
  }, [data?.activeAttentionTest?.id])

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
  const [customerOpen, setCustomerOpen] = useState(false)
  const [calling, setCalling] = useState(false)
  // Chamar o vendedor da vez (1 toque). Trava anti-duplicidade: o botão fica
  // travado enquanto chama (front) e o backend devolve "alreadyInProgress" se já
  // há chamada tocando ou dentro do cooldown de 10s.
  const callDaVez = async () => {
    if (calling) return
    if (!data?.permissions?.callCurrentSeller) { flash('Sem permissão para chamar o vendedor da vez.', false); return }
    setCalling(true)
    try {
      const res = await fetch('/api/seller-queue/quick-call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) flash(j?.error ?? 'Falha ao chamar.', false)
      else if (j?.data?.alreadyInProgress) flash(j?.data?.sellerName ? `Chamada já em andamento — ${j.data.sellerName} foi chamado.` : (j?.data?.cooldownSeconds ? `Aguarde ${j.data.cooldownSeconds}s para chamar de novo.` : 'Chamada já em andamento — aguarde.'), false)
      else if (j?.data?.call?.ok) flash('Vendedor da vez chamado! 🔔', true)
      else flash(j?.data?.call?.reason ?? 'Nenhum vendedor disponível na fila.', false)
      await load()
    } catch { flash('Erro de rede.', false) } finally { setCalling(false) }
  }
  const checkIn = async () => { unlockAudio(); void ensureNotifyPermission(); const pos = await getPosition(); await post('check-in', pos, 'Você entrou na fila!') }
  const checkInQr = async (token: string) => { unlockAudio(); void ensureNotifyPermission(); setScanOpen(false); await post('check-in', { qrToken: token }, 'Você entrou na fila!') }
  const resume = async () => { const pos = await getPosition(); await post('resume', pos, 'De volta à fila!') }
  const me = data?.me
  const att = data?.myAttendance
  const secsLeft = att?.acceptDeadline ? Math.max(0, Math.floor((new Date(att.acceptDeadline).getTime() - now) / 1000)) : null

  const pedirVoltar = async () => { await post('pos-vendas/request-return', undefined, 'Retorno solicitado — aguarde a autorização do gestor.') }
  // Trava IMEDIATA (busy) antes do GPS → o botão desabilita no 1º toque e mostra
  // "Iniciando…"; evita o duplo-toque no celular (antes o GPS rodava sem travar).
  const accept = async () => { if (!att || busy) return; setBusy(true); stopCriticalAlert(); const pos = await getPosition(); await post(`attendances/${att.id}/accept`, pos, 'Atendimento iniciado!') }
  const reject = async () => { if (!att || busy) return; stopCriticalAlert(); const reason = prompt('Motivo da recusa:'); if (!reason) return; await post(`attendances/${att.id}/reject`, { reason }, 'Recusado.') }
  const finish = async () => {
    if (!att) return
    const name = capName(finForm.customerName.trim())
    const isInfoRapida = att.visitType === 'INFORMACAO_RAPIDA'

    if (!isInfoRapida) {
      if (!name) { flash('Informe o nome do cliente.', false); return }
      if (finForm.customerPhone.replace(/\D/g, '').length < 10) { flash('Informe um telefone válido.', false); return }
      if (!isEmail(finForm.customerEmail)) { flash('Informe um e-mail válido.', false); return }
    } else {
      if (name || finForm.customerPhone.replace(/\D/g, '').length > 0 || finForm.customerEmail.trim()) {
        if (!name) { flash('Informe o nome do cliente.', false); return }
        if (finForm.customerPhone.replace(/\D/g, '').length < 10) { flash('Informe um telefone válido.', false); return }
        if (finForm.customerEmail.trim() && !isEmail(finForm.customerEmail)) { flash('Informe um e-mail válido.', false); return }
      }
    }

    if (!finForm.notes.trim()) { flash('As observações são obrigatórias.', false); return }
    const notesWithMotivo = (finForm.motivo ? `Motivo: ${finForm.motivo}. ` : '') + finForm.notes.trim()
    const payload: Record<string, unknown> = {
      type: finForm.type,
      result: finForm.result,
      notes: notesWithMotivo,
      customerName: name || undefined,
      customerPhone: finForm.customerPhone || undefined,
      customerEmail: finForm.customerEmail.trim() || undefined,
      customerId: pickedCustomerId || undefined,
      leadId: pickedLeadId || undefined
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/seller-queue/attendances/${att.id}/finish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flash(j?.error ?? 'Não foi possível finalizar.', false); return }
      flash('Atendimento finalizado!', true)
      setFinishOpen(false); await load()
      // Virou negociação → abre a negociação criada para o vendedor completar.
      if (j?.data?.dealId) window.location.assign(`/negociacoes/${j.data.dealId}`)
    } catch { flash('Erro de rede.', false) } finally { setBusy(false) }
  }

  // O bloco de status só aparece para quem pode entrar na fila (ou já está nela).
  const showStatusCard = !!me || data?.canCheckIn !== false

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-hidden">
      <style>{`
        @keyframes mv-rise { from { opacity:0; transform: translateY(12px) } to { opacity:1; transform:none } }
        @keyframes mv-shine { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes mv-float { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-4px) } }
        .mv-card { animation: mv-rise .5s cubic-bezier(.2,.7,.3,1) both }
        .mv-card::after { content:''; position:absolute; inset:0; background-image:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.5) 50%,transparent 65%); background-size:200% 100%; animation: mv-shine 3s linear infinite; pointer-events:none }
        .mv-float { animation: mv-float 2.6s ease-in-out infinite }
      `}</style>
      {toast && <div className={cn('break-words rounded-lg px-4 py-2 text-sm', toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{toast.msg}</div>}

      <AlertSetupBanner />

      {/* Modo férias ativo */}
      {data?.onVacation && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">🏖️ Você está em <strong>modo férias</strong> — fora da fila e sem ser chamado. Desative em Configurações para voltar.</div>
      )}

      {/* Aviso: removido automaticamente por pausa/ausência prolongada */}
      {data?.autoRemovedNotice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">⏱️ {data.autoRemovedNotice}</div>
      )}
      {data?.queueOpen === false && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">🔒 A fila está fechada agora (fora do horário de funcionamento).</div>
      )}

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
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button onClick={accept} disabled={busy} className="btn-primary flex-1 justify-center py-3 text-base">{busy ? <><Clock size={18} className="animate-spin" />Iniciando…</> : <><Check size={18} />Aceitar</>}</button>
            <button onClick={reject} disabled={busy} className="btn-secondary justify-center py-3"><X size={18} />Recusar</button>
          </div>
        </div>
      )}

      {/* Em atendimento — finalizar */}
      {att?.status === 'IN_ATTENDANCE' && (
        <div className="rounded-2xl border-2 border-green-400 bg-green-50 p-5 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-green-700">Em atendimento</p>
          <p className="mt-1 text-gray-700">{att.arrival?.customerName ?? 'Cliente'}{att.arrival?.customerPhone ? ` · ${att.arrival.customerPhone}` : ''}</p>
          <button onClick={() => { setFinForm((f) => ({ ...f, motivo: '', notes: '', customerName: att?.arrival?.customerName ?? '', customerPhone: att?.arrival?.customerPhone ?? '', customerEmail: att?.arrival?.customerEmail ?? '' })); setFinishOpen(true) }} disabled={busy} className="btn-primary mt-4 w-full justify-center py-3 text-base"><CheckCircle2 size={18} />Cadastrar cliente e finalizar</button>
        </div>
      )}

      {/* Ações rápidas — cards animados: Entrar · Chamar da vez · Atender · QR */}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1 — Entrar na fila / seu status */}
        {showStatusCard && (
          <div className="mv-card relative min-w-0 overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4 shadow-card" style={{ animationDelay: '0ms' }}>
            <DoorOpen size={22} className="mv-float text-brand-600" />
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-500">Sua vez</p>
            {!me || me.status === 'LEFT' ? (
              <>
                <p className="text-lg font-bold leading-tight text-gray-900">Fora da fila</p>
                <button onClick={checkIn} disabled={busy} className="relative z-10 mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"><Hand size={15} />Entrar na fila</button>
                <p className="mt-1.5 text-center text-[10px] text-gray-400">Presença validada (GPS/QR)</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold leading-tight text-gray-900">{me.position > 0 ? `${me.position}º` : statusLabel(me.status)}</p>
                <p className="text-xs text-gray-400">{statusLabel(me.status)}</p>
                <div className="relative z-10 mt-2 grid gap-1.5 min-[380px]:grid-cols-2">
                  {me.status === 'PAUSED' ? (
                    <button onClick={resume} disabled={busy} className="flex-1 rounded-lg bg-brand-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"><Play size={13} className="mr-1 inline" />Voltar</button>
                  ) : ['WAITING', 'NEXT'].includes(me.status) ? (
                    <button onClick={() => post('pause', {}, 'Pausado.')} disabled={busy} className="flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"><Pause size={13} className="mr-1 inline" />Pausar</button>
                  ) : null}
                  <button onClick={() => post('check-out', {}, 'Você saiu da fila.')} disabled={busy} className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"><LogOut size={13} className="mr-1 inline" />Sair</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Card 2 — Chamar vendedor da vez (1 toque, com trava anti-duplicidade) */}
        {data?.permissions?.callCurrentSeller && <button onClick={callDaVez} disabled={calling} className="mv-card group relative min-w-0 overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60" style={{ animationDelay: '60ms' }}>
          <Crown size={22} className="mv-float text-amber-500" />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Vendedor da vez</p>
          <p className="truncate text-lg font-bold leading-tight text-gray-900" title={data?.vendedorDaVez?.sellerName}>{data?.vendedorDaVez?.sellerName ?? '— ninguém'}</p>
          <span className="relative z-10 mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm"><Hand size={13} />{calling ? 'Chamando…' : 'Chamar da vez'}</span>
        </button>}

        {/* Card 3 — Ler QR da loja */}
        {showStatusCard && (
          <button onClick={() => setScanOpen(true)} disabled={busy} className="mv-card group relative min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60" style={{ animationDelay: '90ms' }}>
            <QrCode size={22} className="mv-float text-gray-700" />
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">QR da loja</p>
            <p className="text-lg font-bold leading-tight text-gray-900">Entrar com QR</p>
            <p className="relative z-10 mt-1 text-xs font-medium text-gray-500">Escanear código →</p>
          </button>
        )}

        {/* Card 4 — Atender cliente (chamar responsável / registrar chegada) */}
        <button onClick={() => setCustomerOpen(true)} className="mv-card group relative min-w-0 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lg" style={{ animationDelay: '180ms' }}>
          <Bell size={22} className="mv-float text-blue-500" />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-blue-600">Atender cliente</p>
          <p className="text-lg font-bold leading-tight text-gray-900">Registrar / chamar</p>
          <p className="relative z-10 mt-1 text-xs font-medium text-blue-600">Cadastrar cliente · chamar responsável →</p>
        </button>
      </div>

      {scanOpen && <QrScanner onResult={checkInQr} onClose={() => setScanOpen(false)} />}

      {/* Popup — atender cliente (registrar chegada / chamar responsável / pós-vendas / agendamento) */}
      {customerOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3" onClick={() => setCustomerOpen(false)}>
          <div className="mx-auto my-4 w-full max-w-[min(28rem,calc(100vw-1.5rem))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-bold text-white drop-shadow">Atender cliente</h3>
              <button onClick={() => setCustomerOpen(false)} className="rounded-lg bg-white/90 p-1.5 text-gray-600 shadow hover:bg-white"><X size={18} /></button>
            </div>
            <ClienteNaLojaPanel />
          </div>
        </div>
      )}

      {finishOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setFinishOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-[min(28rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold text-gray-900">Cadastrar cliente e finalizar</h2>
            <p className="mb-3 text-xs text-gray-500">Registre os dados do cliente e o resultado. Gera um lead de atendimento no seu nome.</p>
            <div className="space-y-3">
              <div className="relative"><label className="mb-1 block text-xs font-medium text-gray-700">Nome do cliente *</label><input className={inputCls} value={finForm.customerName} onChange={(e) => { setFinForm((f) => ({ ...f, customerName: e.target.value })); setPickedCustomerId(null); setPickedLeadId(null) }} onBlur={() => setFinForm((f) => ({ ...f, customerName: capName(f.customerName) }))} placeholder="Ex.: Dagoberto Ramos de Francisco" /><CustomerLookup query={finForm.customerName} onPick={pickMatch} /></div>
              <div className="relative"><label className="mb-1 block text-xs font-medium text-gray-700">Telefone *</label><input type="tel" inputMode="numeric" className={inputCls} value={finForm.customerPhone} onChange={(e) => { setFinForm((f) => ({ ...f, customerPhone: maskPhoneBR(e.target.value) })); setPickedCustomerId(null); setPickedLeadId(null) }} placeholder="(11)9.9999-9999" /><CustomerLookup query={finForm.customerPhone} onPick={pickMatch} /></div>
              <div className="relative"><label className="mb-1 block text-xs font-medium text-gray-700">E-mail *</label><input type="email" className={inputCls} value={finForm.customerEmail} onChange={(e) => { setFinForm((f) => ({ ...f, customerEmail: e.target.value })); setPickedCustomerId(null); setPickedLeadId(null) }} placeholder="cliente@email.com" /><CustomerLookup query={finForm.customerEmail} onPick={pickMatch} /></div>
              {pickedCustomerId && <p className="-mt-1 text-[11px] font-medium text-green-600">✓ Cliente existente selecionado — não vai duplicar.</p>}
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Tipo</label><select className={inputCls} value={finForm.type} onChange={(e) => setFinForm((f) => ({ ...f, type: e.target.value }))}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Resultado</label><select className={inputCls} value={finForm.result} onChange={(e) => setFinForm((f) => ({ ...f, result: e.target.value }))}>{RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              {(data?.closeReasons?.length ?? 0) > 0 && (
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Motivo</label><select className={inputCls} value={finForm.motivo} onChange={(e) => setFinForm((f) => ({ ...f, motivo: e.target.value }))}><option value="">— selecione —</option>{data!.closeReasons!.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
              )}
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Observações *</label><textarea rows={2} className={inputCls} value={finForm.notes} onChange={(e) => setFinForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Obrigatório — resumo do atendimento" /></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[auto_auto] sm:justify-end"><button onClick={() => setFinishOpen(false)} className="btn-secondary justify-center text-sm">Cancelar</button><button onClick={finish} disabled={busy} className="btn-primary justify-center text-sm"><CheckCircle2 size={15} />Finalizar</button></div>
          </div>
        </div>
      )}

      {/* Modal de Teste de Atenção Operacional */}
      {data?.activeAttentionTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-red-500 bg-white p-6 text-center shadow-2xl">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 animate-bounce">
              <Bell size={24} />
            </span>
            <h2 className="mt-4 text-xl font-bold text-gray-900">Teste de Atenção! ⚠️</h2>
            <p className="mt-2 text-sm text-gray-500">
              A gerência solicitou uma validação de sua atenção operacional. Responda imediatamente.
            </p>
            <p className="mt-4 text-2xl font-black tabular-nums text-red-600">
              {Math.max(1, Math.round((now - new Date(data.activeAttentionTest.sentAt).getTime()) / 1000))}s
            </p>
            <button
              onClick={async () => {
                const durationSeconds = Math.max(1, Math.round((Date.now() - new Date(data.activeAttentionTest!.sentAt).getTime()) / 1000))
                setBusy(true)
                try {
                  const res = await fetch('/api/seller-queue/test-attention', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      action: 'respond',
                      notificationId: data.activeAttentionTest!.id,
                      durationSeconds
                    })
                  })
                  if (res.ok) {
                    flash(`Teste respondido com sucesso em ${durationSeconds} segundos!`, true)
                    stopCriticalAlert()
                  } else {
                    flash('Erro ao responder teste de atenção.', false)
                  }
                  await load()
                } catch {
                  flash('Erro de rede ao responder.', false)
                } finally {
                  setBusy(false)
                }
              }}
              disabled={busy}
              className="mt-6 w-full rounded-xl bg-red-600 py-3 text-base font-bold text-white shadow-lg transition hover:bg-red-700 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              ESTOU ATIVO / RESPONDER
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
