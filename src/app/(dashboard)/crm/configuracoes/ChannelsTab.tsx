'use client'

// =============================================================================
// Central de Configurações do CRM — Canais de captação. Cada canal (Facebook,
// Instagram, TikTok, Google Ads, portais...) ganha uma URL de entrada própria;
// o lead que chega por ela cai no CRM com a origem, o funil, o tipo e a
// temperatura do canal. Registro dos recebimentos e botão de teste.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Copy, Plus, RefreshCw, Save, Send, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCrmSettings } from '@/hooks/useCrmSettings'
import type { ChannelCatalogItem, ChannelGroup, LeadChannel } from '@/lib/crm/channels-core'
import { Card, checkCls, inputCls } from './ListsTabs'

interface LogEntry { at: string; channelId: string; ok: boolean; outcome: string; message: string; leadId?: string; leadNumber?: number | null; name?: string; test?: boolean }
interface Data { channels: LeadChannel[]; log: LogEntry[]; catalog: ChannelCatalogItem[]; groups: Record<ChannelGroup, string>; baseUrl: string }
interface PipelineOpt { id: string; name: string; virtual: boolean; active: boolean }
type Draft = Partial<LeadChannel> & { type: string; name: string }

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500) }} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
      {ok ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}{ok ? 'Copiado' : 'Copiar'}
    </button>
  )
}

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function ChannelsTab({ canManage }: { canManage: boolean }) {
  const { settings } = useCrmSettings()
  const [data, setData] = useState<Data | null>(null)
  const [items, setItems] = useState<Draft[]>([])
  const [pipelines, setPipelines] = useState<PipelineOpt[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [picker, setPicker] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)

  const fetchChannels = () => fetch('/api/crm/channels', { credentials: 'include' }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => null) }))
  const apply = useCallback(({ ok, j }: { ok: boolean; j: { data?: Data; error?: string } | null }) => {
    if (!ok || !j?.data) { setError(j?.error ?? 'Não foi possível carregar os canais.'); return }
    setData(j.data)
    setLoadedAt(Date.now())
    setItems(j.data.channels)
    setDirty(false)
  }, [])
  const load = useCallback(async () => apply(await fetchChannels()), [apply])

  useEffect(() => {
    fetchChannels().then(apply).catch(() => setError('Não foi possível carregar os canais.'))
    fetch('/api/crm/pipelines', { credentials: 'include' }).then((r) => r.json()).then((j) => setPipelines(Array.isArray(j?.data) ? j.data : [])).catch(() => {})
  }, [apply])

  const catalog = useMemo(() => new Map((data?.catalog ?? []).map((c) => [c.type, c])), [data])
  const stats = useMemo(() => {
    const m = new Map<string, { total: number; last: LogEntry | null; errors: number }>()
    const since = loadedAt - 7 * 86_400_000
    for (const e of data?.log ?? []) {
      const s = m.get(e.channelId) ?? { total: 0, last: null, errors: 0 }
      if (!s.last) s.last = e
      if (new Date(e.at).getTime() >= since) { if (e.ok) s.total++; else s.errors++ }
      m.set(e.channelId, s)
    }
    return m
  }, [data, loadedAt])

  const update = (idx: number, patch: Partial<Draft>) => { setItems((l) => l.map((c, i) => (i === idx ? { ...c, ...patch } : c))); setDirty(true); setMsg(null) }
  const add = (item: ChannelCatalogItem) => {
    const same = items.filter((c) => c.type === item.type).length
    setItems((l) => [...l, { type: item.type, name: same ? `${item.label} ${same + 1}` : item.label, active: true, sourceCode: item.sourceCode, secret: '', pipelineId: null, leadType: null, temperature: null }])
    setDirty(true); setPicker(false); setOpen(`new-${items.length}`)
  }
  const remove = (idx: number) => {
    const c = items[idx]
    if (c.id && !confirm(`Remover o canal "${c.name}"? A URL de entrada dele para de funcionar na hora.`)) return
    setItems((l) => l.filter((_, i) => i !== idx)); setDirty(true)
  }

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/crm/channels', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ channels: items }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao salvar.' }); return }
      await load(); setMsg({ ok: true, text: 'Salvo. Copie a URL de entrada de cada canal.' })
    } catch { setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setSaving(false) }
  }

  const test = async (c: Draft) => {
    if (!c.id) return
    setTesting(c.id); setMsg(null)
    try {
      const r = await fetch(`/api/crm/channels/${c.id}/test`, { method: 'POST', credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? { ok: true, text: `Lead de teste #${j.leadNumber ?? '?'} criado pelo canal "${c.name}". Confira no CRM e descarte depois.` } : { ok: false, text: j?.error ?? 'O teste falhou.' })
      await load()
    } finally { setTesting(null) }
  }

  if (error) return <Card title="Canais de captação" hint=""><p className="text-sm text-red-600">{error}</p></Card>
  if (!data) return <Card title="Canais de captação" hint=""><p className="text-sm text-gray-500">Carregando…</p></Card>

  const realPipelines = pipelines.filter((p) => !p.virtual && p.active)
  const groups = Object.entries(data.groups) as [ChannelGroup, string][]

  return (
    <div className="space-y-4">
      <Card title="Canais de captação" hint="Conecte Facebook, Instagram, TikTok, Google Ads, portais de veículos e outras ferramentas. Cada canal tem uma URL de entrada própria: todo lead enviado para ela cai aqui no CRM, com a origem, o funil e a distribuição configurados.">
        {items.length === 0 && <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">Nenhum canal ainda. Clique em <b>Adicionar canal</b> e escolha de onde vêm os seus leads.</p>}

        <ul className="space-y-3">
          {items.map((c, idx) => {
            const cat = catalog.get(c.type)
            const key = c.id ?? `new-${idx}`
            const expanded = open === key
            const url = c.key ? `${data.baseUrl}${c.key}` : null
            const st = c.id ? stats.get(c.id) : undefined
            return (
              <li key={key} className="rounded-xl border border-gray-200">
                <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cat?.color ?? '#94a3b8' }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {cat?.label ?? c.type}
                      {!c.id && <span className="ml-2 text-amber-700">· salve para gerar a URL</span>}
                      {st?.last && <> · último: {fmt(st.last.at)} {st.last.ok ? '✓' : '⚠'}</>}
                      {st && <> · 7 dias: {st.total} recebido(s){st.errors ? `, ${st.errors} recusado(s)` : ''}</>}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-700">
                    <input type="checkbox" className={checkCls} disabled={!canManage} checked={c.active !== false} onChange={(e) => update(idx, { active: e.target.checked })} />Ativo
                  </label>
                  {c.id && canManage && (
                    <button type="button" onClick={() => void test(c)} disabled={testing === c.id || dirty} title={dirty ? 'Salve antes de testar' : 'Cria um lead de teste pelo canal'} className="btn-secondary text-xs">
                      {testing === c.id ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}Enviar lead de teste
                    </button>
                  )}
                  <button type="button" onClick={() => setOpen(expanded ? null : key)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                    Configurar <ChevronDown size={14} className={cn('transition', expanded && 'rotate-180')} />
                  </button>
                  {canManage && <button type="button" onClick={() => remove(idx)} className="text-gray-400 hover:text-red-600" aria-label={`Remover ${c.name}`}><Trash2 size={15} /></button>}
                </div>

                {expanded && (
                  <div className="space-y-4 border-t border-gray-100 px-3 py-3">
                    <div>
                      <p className="mb-1 text-xs font-semibold text-gray-700">URL de entrada</p>
                      {url ? (
                        <div className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 break-all rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-800">{url}</code>
                          <CopyBtn value={url} />
                        </div>
                      ) : <p className="text-xs text-amber-700">Clique em Salvar para gerar a URL deste canal.</p>}
                      <p className="mt-1 text-[11px] text-gray-500">Trate a URL como senha: quem tem, consegue criar leads. Se vazar, remova o canal e crie outro.</p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-xs font-medium text-gray-700">Nome do canal
                        <input className={cn(inputCls, 'mt-1')} disabled={!canManage} value={c.name} maxLength={80} onChange={(e) => update(idx, { name: e.target.value })} />
                      </label>
                      <label className="text-xs font-medium text-gray-700">{cat?.secretLabel ?? 'Chave secreta (opcional)'}
                        <input className={cn(inputCls, 'mt-1')} disabled={!canManage} value={c.secret ?? ''} maxLength={200} placeholder={cat?.secretLabel ? 'Cole a mesma chave configurada na plataforma' : 'Se preenchida, o lead precisa enviar esta chave'} onChange={(e) => update(idx, { secret: e.target.value })} />
                      </label>
                      <label className="text-xs font-medium text-gray-700">Origem no CRM
                        <select className={cn(inputCls, 'mt-1')} disabled={!canManage} value={c.sourceCode ?? cat?.sourceCode ?? ''} onChange={(e) => update(idx, { sourceCode: e.target.value })}>
                          {settings.sources.filter((s) => s.active || s.code === c.sourceCode).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-gray-700">Funil de destino
                        <select className={cn(inputCls, 'mt-1')} disabled={!canManage} value={c.pipelineId ?? ''} onChange={(e) => update(idx, { pipelineId: e.target.value || null })}>
                          <option value="">Funil padrão</option>
                          {realPipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-gray-700">Tipo de lead
                        <select className={cn(inputCls, 'mt-1')} disabled={!canManage} value={c.leadType ?? ''} onChange={(e) => update(idx, { leadType: e.target.value || null })}>
                          <option value="">Não definir</option>
                          {settings.leadTypes.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-gray-700">Temperatura inicial
                        <select className={cn(inputCls, 'mt-1')} disabled={!canManage} value={c.temperature ?? ''} onChange={(e) => update(idx, { temperature: e.target.value || null })}>
                          <option value="">Não definir</option>
                          {settings.temperatures.filter((t) => t.active).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </label>
                    </div>
                    <p className="text-[11px] text-gray-500">Quem recebe o lead segue a <b>Distribuição</b> do CRM; sem ninguém configurado, os gestores são avisados. O mesmo cliente com lead aberto não duplica: vira um novo contato no lead existente.</p>

                    {cat && (
                      <div className="rounded-lg bg-brand-50/50 px-3 py-2.5 text-xs text-gray-700">
                        <p className="mb-1 font-semibold text-gray-900">Como ligar o {cat.label}</p>
                        <p className="mb-2">{cat.how}</p>
                        <ol className="list-decimal space-y-1 pl-4">{cat.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {canManage && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setPicker(true)} className="btn-secondary text-sm"><Plus size={15} />Adicionar canal</button>
            <div className="flex items-center gap-3">
              {msg && <span className={cn('text-sm', msg.ok ? 'text-green-600' : 'text-red-600')}>{msg.text}</span>}
              <button onClick={save} disabled={saving || !dirty} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        )}
      </Card>

      {picker && (
        <Card title="Escolha o canal" hint="De onde vêm os leads? Você pode ter mais de um canal do mesmo tipo (ex.: um por formulário ou por campanha).">
          <button type="button" onClick={() => setPicker(false)} className="float-right -mt-12 text-gray-400 hover:text-gray-700" aria-label="Fechar"><X size={16} /></button>
          <div className="space-y-4">
            {groups.map(([g, label]) => (
              <div key={g}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.catalog.filter((c) => c.group === g).map((c) => (
                    <button key={c.type} type="button" onClick={() => add(c)} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-brand-400 hover:bg-brand-50/40">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="font-medium text-gray-900">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Registro de recebimentos" hint="Os últimos leads que chegaram pelos canais (e os recusados, com o motivo).">
        {data.log.length === 0 ? <p className="text-sm text-gray-500">Nada recebido ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-400"><th className="py-1 pr-3">Quando</th><th className="py-1 pr-3">Canal</th><th className="py-1 pr-3">Resultado</th><th className="py-1 pr-3">Lead</th></tr></thead>
              <tbody>
                {data.log.map((e, i) => {
                  const ch = data.channels.find((c) => c.id === e.channelId)
                  return (
                    <tr key={`${e.at}-${i}`} className="border-t border-gray-100">
                      <td className="py-1.5 pr-3 text-gray-600">{fmt(e.at)}</td>
                      <td className="py-1.5 pr-3 text-gray-800">{ch?.name ?? 'Canal removido'}</td>
                      <td className={cn('py-1.5 pr-3', e.ok ? 'text-green-700' : 'text-red-700')}>{e.message}{e.test ? ' (teste)' : ''}</td>
                      <td className="py-1.5 pr-3">{e.leadId ? <Link href={`/crm/leads/${e.leadId}`} className="text-brand-700 hover:underline">#{e.leadNumber ?? '—'} {e.name}</Link> : <span className="text-gray-500">{e.name ?? '—'}</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
