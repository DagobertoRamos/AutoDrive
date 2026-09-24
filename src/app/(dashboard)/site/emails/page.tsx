'use client'

// =============================================================================
// Painel do Site — E-mails de aviso de lead (porta de Configurações → E-mails
// do dagobertoeasycar): quem recebe o aviso de novo lead, confirmação ao
// cliente, e-mail de teste e histórico dos últimos envios.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Mail, Save, Send, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EMAIL_RE, MAX_RECIPIENTS } from '@/lib/site/lead-email-core'

interface Settings { enabled: boolean; recipients: string[]; notifyCustomer: boolean }
interface LogEntry { at: string; kind: 'INTERNO' | 'CLIENTE' | 'TESTE'; to: string; subject: string; status: 'ENVIADO' | 'FALHOU' | 'DESLIGADO'; error?: string }
interface Data { settings: Settings; server: 'LOJA' | 'PLATAFORMA' | null; log: LogEntry[]; canManage: boolean; userEmail: string }

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50'
const KIND = { INTERNO: 'Aviso à equipe', CLIENTE: 'Confirmação ao cliente', TESTE: 'Teste' }

export default function SiteEmailsPage() {
  const [d, setD] = useState<Data | null>(null)
  const [s, setS] = useState<Settings | null>(null)
  const [text, setText] = useState('')
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = useCallback((j: { data?: Data } | null) => {
    if (!j?.data) return
    setD(j.data); setS(j.data.settings); setText(j.data.settings.recipients.join('\n'))
    setTestTo((t) => t || j.data!.settings.recipients[0] || j.data!.userEmail)
  }, [])
  const fetchData = () => fetch('/api/site-admin/emails', { credentials: 'include' }).then((r) => r.json()).catch(() => null)
  const load = useCallback(async () => apply(await fetchData()), [apply])
  useEffect(() => {
    let alive = true
    void fetchData().then((j) => { if (alive) apply(j) })
    return () => { alive = false }
  }, [apply])

  if (!d || !s) return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
  const dis = !d.canManage
  const typed = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)
  const invalid = typed.filter((x) => !EMAIL_RE.test(x))
  const tooMany = typed.length > MAX_RECIPIENTS

  const save = async () => {
    setBusy('save'); setMsg(null)
    try {
      const r = await fetch('/api/site-admin/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ emails: { ...s, recipients: typed } }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao salvar.' }); return }
      await load(); setMsg({ ok: true, text: 'E-mails salvos.' })
    } finally { setBusy(null) }
  }
  const test = async () => {
    setBusy('test'); setMsg(null)
    try {
      const r = await fetch('/api/site-admin/emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ to: testTo }) })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? { ok: true, text: `Teste enviado para ${testTo}. Confira a caixa de entrada (e o spam).` } : { ok: false, text: j?.error ?? 'Falha no envio.' })
      await load()
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Mail size={20} className="text-brand-600" />E-mails de aviso</h1>
        <p className="text-sm text-gray-500">A cada lead do site, a equipe recebe um e-mail com os dados e os botões “Abrir no CRM” e “Chamar no WhatsApp”. O lead chega no CRM de qualquer jeito.</p>
      </div>

      {d.server
        ? <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800"><CheckCircle2 size={14} />Servidor de e-mail disponível ({d.server === 'LOJA' ? 'da loja' : 'da plataforma'}).</p>
        : <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={14} />Não há servidor de e-mail configurado. Peça ao administrador da plataforma para configurar em Comunicação; até lá, os avisos ficam só no CRM e no sininho.</p>}

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <input type="checkbox" disabled={dis} checked={s.enabled} onChange={(e) => { setS({ ...s, enabled: e.target.checked }); setMsg(null) }} className="rounded border-gray-300 text-brand-600" />Enviar e-mail a cada novo lead do site
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Quem recebe (até {MAX_RECIPIENTS}, um por linha)</span>
          <textarea disabled={dis} rows={3} className={cn(input, (invalid.length > 0 || tooMany) && 'border-red-300')} value={text} placeholder={'vendas@minhaloja.com.br\ngerente@minhaloja.com.br'} onChange={(e) => { setText(e.target.value); setMsg(null) }} />
          {invalid.length > 0 && <span className="mt-1 block text-[11px] text-red-600">Inválido: {invalid.join(', ')} (não será salvo).</span>}
          {tooMany && <span className="mt-1 block text-[11px] text-red-600">Só os {MAX_RECIPIENTS} primeiros serão salvos.</span>}
          {s.enabled && typed.length === 0 && <span className="mt-1 block text-[11px] text-amber-700">Informe ao menos um e-mail para receber os avisos.</span>}
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" disabled={dis} checked={s.notifyCustomer} onChange={(e) => { setS({ ...s, notifyCustomer: e.target.checked }); setMsg(null) }} className="mt-0.5 rounded border-gray-300 text-brand-600" />
          <span>Confirmar ao cliente por e-mail<span className="block text-xs text-gray-500">Quando ele informar e-mail: “Recebemos sua solicitação”, com o protocolo e o botão do WhatsApp.</span></span>
        </label>
        {d.canManage && <div className="flex justify-end"><button onClick={() => void save()} disabled={!!busy} className="btn-primary text-sm">{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar</button></div>}
      </section>

      {d.canManage && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Enviar um teste</h2>
          <div className="flex flex-wrap gap-2">
            <input className={cn(input, 'max-w-sm flex-1')} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="seu@email.com" />
            <button onClick={() => void test()} disabled={!!busy || !EMAIL_RE.test(testTo)} className="btn-secondary text-sm">{busy === 'test' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Enviar teste</button>
          </div>
        </section>
      )}
      {msg && <p className={cn('text-sm', msg.ok ? 'text-green-700' : 'text-red-600')}>{msg.text}</p>}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Últimos envios</h2>
        {d.log.length === 0 ? <p className="text-xs text-gray-400">Nenhum e-mail enviado ainda.</p> : (
          <ul className="divide-y divide-gray-100">
            {d.log.map((l, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 py-2 text-xs">
                {l.status === 'ENVIADO' ? <CheckCircle2 size={14} className="mt-0.5 text-green-600" /> : <XCircle size={14} className="mt-0.5 text-red-500" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-gray-800">{l.subject}</p>
                  <p className="text-gray-500">{KIND[l.kind]} · {l.to} · {new Date(l.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  {l.error && <p className="text-red-600">{l.error}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
