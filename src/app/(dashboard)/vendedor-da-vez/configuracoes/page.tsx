'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Configurações — regras da unidade.
// Presença (geofence/QR/dispositivo), timeout de aceite, regras de recorrente.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Settings, Save, MapPin, Bell, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SOUND_OPTIONS, playSound, unlockAudio } from '@/lib/seller-queue/alert-client'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const METHODS = [['GPS', 'GPS / geofence'], ['QR_CODE', 'QR Code'], ['DEVICE_CHECK', 'Dispositivo']] as const

interface Cfg {
  active: boolean; presenceMethods: string[]; geofenceLat: number | null; geofenceLng: number | null; geofenceRadiusM: number;
  qrSecret: string | null; acceptTimeoutSeconds: number; requireRevalidationOnAccept: boolean;
  recurringCustomerRule: string; requestByNameRequiresApproval: boolean;
  alertSound: boolean; alertSoundType: string; alertBrowserPush: boolean; alertWhatsapp: boolean; alertWhatsappManagers: boolean; alertRepeatSeconds: number; allowChooseSeller: boolean
}
const DEFAULTS: Cfg = { active: false, presenceMethods: ['GPS'], geofenceLat: null, geofenceLng: null, geofenceRadiusM: 150, qrSecret: '', acceptTimeoutSeconds: 60, requireRevalidationOnAccept: true, recurringCustomerRule: 'RESPONSIBLE', requestByNameRequiresApproval: true, alertSound: true, alertSoundType: 'siren', alertBrowserPush: true, alertWhatsapp: true, alertWhatsappManagers: true, alertRepeatSeconds: 10, allowChooseSeller: true }

export default function ConfiguracoesFilaPage() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const toggleMethod = (m: string) => setCfg((c) => ({ ...c, presenceMethods: c.presenceMethods.includes(m) ? c.presenceMethods.filter((x) => x !== m) : [...c.presenceMethods, m] }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seller-queue/config', { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { const j = await res.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null); const j = await res.json(); if (j?.data) setCfg({ ...DEFAULTS, ...j.data, qrSecret: j.data.qrSecret ?? '' })
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((p) => setCfg((c) => ({ ...c, geofenceLat: p.coords.latitude, geofenceLng: p.coords.longitude })))
  }

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const body = { ...cfg, qrSecret: cfg.qrSecret || null }
      const res = await fetch('/api/seller-queue/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      setMsg(res.ok ? 'Configurações salvas.' : (j?.error ?? 'Erro ao salvar.')); setTimeout(() => setMsg(null), 3000)
    } catch { setMsg('Erro de rede.') } finally { setSaving(false) }
  }

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Settings size={20} className="text-brand-600" />Configurações da Fila</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800"><input type="checkbox" checked={cfg.active} onChange={(e) => set('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Validação de presença ativa nesta unidade</label>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-700">Métodos de presença aceitos</label>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(([v, l]) => <button key={v} type="button" onClick={() => toggleMethod(v)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium', cfg.presenceMethods.includes(v) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-300 bg-white text-gray-500')}>{l}</button>)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Latitude</label><input className={inputCls} value={cfg.geofenceLat ?? ''} onChange={(e) => set('geofenceLat', e.target.value ? Number(e.target.value) : null)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Longitude</label><input className={inputCls} value={cfg.geofenceLng ?? ''} onChange={(e) => set('geofenceLng', e.target.value ? Number(e.target.value) : null)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Raio (m)</label><input type="number" className={inputCls} value={cfg.geofenceRadiusM} onChange={(e) => set('geofenceRadiusM', Number(e.target.value) || 150)} /></div>
        </div>
        <button onClick={useMyLocation} className="btn-secondary text-xs"><MapPin size={13} />Usar minha localização atual</button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Segredo do QR (token)</label><input className={inputCls} value={cfg.qrSecret ?? ''} onChange={(e) => set('qrSecret', e.target.value)} placeholder="token fixo do QR da loja" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Tempo de aceite (segundos)</label><input type="number" min={10} max={600} className={inputCls} value={cfg.acceptTimeoutSeconds} onChange={(e) => set('acceptTimeoutSeconds', Number(e.target.value) || 60)} /></div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.requireRevalidationOnAccept} onChange={(e) => set('requireRevalidationOnAccept', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Revalidar presença no aceite</label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Cliente recorrente</label><select className={inputCls} value={cfg.recurringCustomerRule} onChange={(e) => set('recurringCustomerRule', e.target.value)}><option value="RESPONSIBLE">Chama o responsável</option><option value="QUEUE">Sempre o vendedor da vez</option></select></div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.requestByNameRequiresApproval} onChange={(e) => set('requestByNameRequiresApproval', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Pedido por nome exige aprovação</label>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Bell size={16} className="text-brand-600" />Avisos & Alertas do vendedor da vez</h2>
        <p className="-mt-2 text-xs text-gray-500">Como o vendedor é alertado quando vira o "vendedor da vez". O aviso na central (balão) é sempre enviado.</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.alertSound} onChange={(e) => set('alertSound', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Som em loop no app do vendedor</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.alertBrowserPush} onChange={(e) => set('alertBrowserPush', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Notificação do navegador (aba minimizada)</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.alertWhatsapp} onChange={(e) => set('alertWhatsapp', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />WhatsApp para o vendedor da vez</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.alertWhatsappManagers} onChange={(e) => set('alertWhatsappManagers', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />WhatsApp à gestão (timeout / sem vendedor)</label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Modelo do som</label>
            <div className="flex gap-2">
              <select className={inputCls} value={cfg.alertSoundType} onChange={(e) => set('alertSoundType', e.target.value)}>
                {SOUND_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button type="button" onClick={() => { unlockAudio(); playSound(cfg.alertSoundType) }} className="btn-secondary shrink-0 text-xs" title="Ouvir"><Volume2 size={14} />Tocar</button>
            </div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Repetir o som a cada (segundos)</label><input type="number" min={5} max={120} className={inputCls} value={cfg.alertRepeatSeconds} onChange={(e) => set('alertRepeatSeconds', Number(e.target.value) || 10)} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={cfg.allowChooseSeller} onChange={(e) => set('allowChooseSeller', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Gestão pode escolher o vendedor (auto-organização)</label>
        <p className="-mt-1 text-[11px] text-gray-400">O WhatsApp usa o provedor já configurado da loja; sem provedor ativo, o envio é ignorado silenciosamente.</p>
      </div>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className={cn('text-sm', /salvas/.test(msg) ? 'text-green-600' : 'text-red-600')}>{msg}</span>}
        <button onClick={save} disabled={saving || loading} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar configurações'}</button>
      </div>
    </div>
  )
}
