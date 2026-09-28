'use client'

// =============================================================================
// Calendário › Programação automática: grade semanal (dias × horário ×
// formato) para Instagram/Facebook. O sistema escolhe os carros do estoque em
// rodízio (quem está há mais tempo sem aparecer primeiro) e agenda com arte,
// legenda e música. Mantém sempre as próximas 48 h preenchidas.
// =============================================================================

import { useEffect, useState } from 'react'
import { CalendarClock, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, inputCls } from '@/components/publications/ui'
import { ART_TEMPLATES, FORMAT_INFO, SOCIAL_FORMATS, TEMPLATE_INFO, type SocialFormat } from '@/lib/publications/social/formats'
import { MOOD_LABEL, MUSIC_MOODS } from '@/lib/publications/social/music-core'
import type { AutoProgram, AutoSlot } from '@/lib/publications/social/autoprog-core'

const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function AutoProgramPanel({ onPlanned }: { onPlanned?: () => void }) {
  const [p, setP] = useState<AutoProgram | null>(null)
  const [conns, setConns] = useState<Array<{ id: string; channel: string; label: string; status: string }>>([])
  const [can, setCan] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api('/api/publications/settings').then((j) => setP(j.data.autoProgram)).catch(() => undefined)
    api('/api/publications/connections').then((j) => { setConns(j.data.connections.filter((c: { channel: string }) => c.channel === 'INSTAGRAM' || c.channel === 'META_PAGE')); setCan(!!j.data.can?.connections) }).catch(() => undefined)
  }, [])
  if (!p) return null
  const set = (x: Partial<AutoProgram>) => setP({ ...p, ...x })
  const setSlot = (i: number, x: Partial<AutoSlot>) => set({ slots: p.slots.map((s, k) => (k === i ? { ...s, ...x } : s)) })

  const save = async () => {
    if (p.enabled && !p.connectionIds.length) { setMsg({ ok: false, text: 'Escolha ao menos uma conta do Instagram ou Facebook.' }); return }
    if (p.enabled && !confirm('Ligar a programação automática?\n\nO sistema vai agendar posts sozinho, todos os dias da grade, com carros do estoque em rodízio.')) return
    setBusy(true); setMsg(null)
    try {
      const j = await api('/api/publications/settings', { method: 'PUT', json: { autoProgram: p } })
      setP(j.data.autoProgram)
      setMsg({ ok: true, text: j.program ? `Salvo. ${j.program.message}` : 'Salvo. Programação desligada.' })
      onPlanned?.()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }

  return (
    <details className="group rounded-xl border border-brand-200 bg-white" open={p.enabled || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><CalendarClock size={16} className="text-brand-700" />Programação automática {p.enabled ? <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">ligada</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">desligada</span>}</span>
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
      </summary>
      <fieldset disabled={!can} className="space-y-4 border-t border-gray-100 p-4">
        <p className="text-xs text-gray-600">Monte a grade da semana. Em cada horário o sistema escolhe um carro do estoque (quem está há mais tempo sem aparecer vai primeiro), cria a arte, a legenda e a música e agenda. As próximas 48 h ficam sempre preenchidas; tudo aparece aqui no calendário e pode ser cancelado.</p>

        <label className="flex items-center gap-2 text-sm font-medium text-gray-800"><input type="checkbox" checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Ligar programação automática</label>

        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-700">Contas</p>
          {conns.map((c) => (
            <label key={c.id} className={cn('flex items-center gap-2 text-xs', c.status === 'CONECTADO' ? 'text-gray-700' : 'text-gray-400')}>
              <input type="checkbox" disabled={c.status !== 'CONECTADO'} checked={p.connectionIds.includes(c.id)} onChange={(e) => set({ connectionIds: e.target.checked ? [...p.connectionIds, c.id] : p.connectionIds.filter((x) => x !== c.id) })} />
              {c.channel === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} · {c.label}{c.status !== 'CONECTADO' ? ' (reconectar)' : ''}
            </label>
          ))}
          {!conns.length && <p className="text-xs text-gray-500">Conecte o Instagram ou a Página do Facebook em Canais conectados.</p>}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">Grade da semana</p>
          {p.slots.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2">
              <div className="flex gap-0.5" role="group" aria-label="Dias">
                {DAYS.map((d, k) => (
                  <button key={k} type="button" title={DAY_NAMES[k]} aria-pressed={s.days.includes(k)} onClick={() => setSlot(i, { days: s.days.includes(k) ? s.days.filter((x) => x !== k) : [...s.days, k].sort() })}
                    className={cn('h-7 w-7 rounded-full border text-[11px] font-semibold', s.days.includes(k) ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-500')}>{d}</button>
                ))}
              </div>
              <input type="time" aria-label="Horário" className={cn(inputCls, 'w-28 py-1 text-xs')} value={s.time} onChange={(e) => setSlot(i, { time: e.target.value })} />
              <select aria-label="Formato" className={cn(inputCls, 'w-auto py-1 text-xs')} value={s.format} onChange={(e) => setSlot(i, { format: e.target.value as SocialFormat })}>
                {SOCIAL_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_INFO[f].label}</option>)}
              </select>
              <button type="button" onClick={() => set({ slots: p.slots.filter((_, k) => k !== i) })} aria-label="Remover horário" className="ml-auto rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          ))}
          {p.slots.length < 12 && <button type="button" onClick={() => set({ slots: [...p.slots, { days: [1, 2, 3, 4, 5], time: '18:00', format: 'POST' }] })} className="btn-secondary px-2 py-1 text-xs"><Plus size={13} />Adicionar horário</button>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs text-gray-600">Modelo da arte
            <select className={inputCls} value={p.template} onChange={(e) => set({ template: e.target.value as AutoProgram['template'] })}>{ART_TEMPLATES.map((t) => <option key={t} value={t}>{TEMPLATE_INFO[t].label}</option>)}</select>
          </label>
          <label className="block text-xs text-gray-600">Música dos vídeos
            <select className={inputCls} value={p.music ? p.music.mood ?? 'ANIMADA' : 'NONE'} onChange={(e) => set({ music: e.target.value === 'NONE' ? null : { mode: 'AUTO', mood: e.target.value as (typeof MUSIC_MOODS)[number] } })}>
              <option value="NONE">Sem música</option>
              {MUSIC_MOODS.map((m) => <option key={m} value={m}>Automática — {MOOD_LABEL[m]}</option>)}
            </select>
          </label>
          <label className="block text-xs text-gray-600">Repetir o mesmo carro após (dias)
            <input type="number" min={0} max={60} className={inputCls} value={p.minDaysBetween} onChange={(e) => set({ minDaysBetween: Number(e.target.value) || 0 })} />
          </label>
          <label className="flex items-center gap-2 pt-5 text-xs text-gray-600"><input type="checkbox" checked={p.promoFirst} onChange={(e) => set({ promoFirst: e.target.checked })} />Carros em promoção primeiro</label>
        </div>

        <div className="flex items-center gap-2">
          {can ? <button type="button" onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{busy && <Loader2 size={13} className="animate-spin" />}Salvar programação</button> : <p className="text-xs text-gray-500">Somente gestores alteram a programação.</p>}
          {msg && <p role="status" className={cn('text-xs', msg.ok ? 'text-green-700' : 'text-red-700')}>{msg.text}</p>}
        </div>
      </fieldset>
    </details>
  )
}
