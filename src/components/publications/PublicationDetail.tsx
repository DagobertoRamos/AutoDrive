'use client'
/* eslint-disable @next/next/no-img-element -- fotos do estoque */

// Detalhe de uma publicação: situação no canal, o que foi enviado, ajuste
// específico do canal (com histórico), ações e diagnóstico técnico.
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Download, ExternalLink, Loader2, Pause, Play, RefreshCw, Save, Trash2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ago, ChannelMark, Drawer, ErrorNote, inputCls, money, StatusPill, STATUS_TONE, when } from './ui'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Detail {
  publication: any; vehicle: any; channel: any; preview: any; events: any[]; jobs: any[]
  can: { prepare: boolean; approve: boolean; publish: boolean; connections: boolean }
}

export function PublicationDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [edit, setEdit] = useState<{ title: string; description: string; price: string } | null>(null)
  const [manualUrl, setManualUrl] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    try { const j = await api<{ data: Detail }>(`/api/publications/${id}`); setD(j.data) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }, [id])
  useEffect(() => { const t = setTimeout(() => { setD(null); setEdit(null); setMsg(null); void load() }, 0); return () => clearTimeout(t) }, [load])

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!id) return
    if (action === 'RETIRAR' && !confirm('Retirar este anúncio do canal? A retirada é confirmada no próprio canal.')) return
    setBusy(action); setMsg(null)
    try {
      const j = await api<{ results: Array<{ ok: boolean; message: string }> }>('/api/publications/actions', { method: 'POST', json: { ids: [id], action, ...extra } })
      const r = j.results[0]; setMsg({ ok: r.ok, text: r.message })
      await load(); onChanged?.()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const saveOverrides = async () => {
    if (!id || !edit) return
    setBusy('save'); setMsg(null)
    try {
      const j = await api<{ updates: number }>(`/api/publications/${id}`, { method: 'PATCH', json: { title: edit.title, description: edit.description, price: edit.price ? Number(edit.price) : undefined } })
      setMsg({ ok: true, text: j.updates ? 'Salvo. Atualização enviada ao canal.' : 'Salvo.' }); setEdit(null); await load(); onChanged?.()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const p = d?.publication
  const caps = d?.channel?.capabilities ?? {}
  const live = p && ['PUBLICADO', 'EM_ANALISE', 'ATUALIZACAO_PENDENTE'].includes(p.status)
  return (
    <Drawer open={!!id} onClose={onClose} wide title={d?.vehicle?.title ?? 'Publicação'} subtitle={d ? `${d.channel?.name ?? p?.channel} · ${p?.connection?.label ?? ''}${p?.campaignKey && d.channel?.campaigns ? ` · campanha ${p.campaignKey}` : ''}` : undefined}>
      {!d ? <div className="flex items-center gap-2 py-10 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" />Carregando…</div> : (
        <div className="space-y-5">
          <section className="flex flex-wrap items-center gap-2">
            <ChannelMark channel={p.channel} />
            <StatusPill tone={STATUS_TONE[p.status] ?? 'neutral'} label={p.statusLabel} />
            {p.archiveReason && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Arquivado · {p.archiveReason === 'VENDIDO' ? 'Vendido' : 'Retirado'}</span>}
            {p.manual && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">Manual</span>}
            <span className="text-xs text-gray-500">Conferido {ago(p.lastVerifiedAt)}</span>
            {p.remoteUrl && <a href={p.remoteUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">Abrir anúncio <ExternalLink size={12} /></a>}
          </section>

          {p.scheduledAt && p.status === 'AGENDADO' && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">Agendado para {when(p.scheduledAt)}.</p>}
          {p.manualAction && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><p className="flex items-center gap-1 font-semibold"><AlertTriangle size={13} />Ação manual</p><p className="mt-0.5">{p.manualAction}</p></div>}
          {p.lastError && p.status !== 'PUBLICADO' && <ErrorNote message={p.lastError} hint={p.lastErrorHint} />}
          {msg && <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{msg.text}</p>}

          {d.can.publish && (
            <section className="flex flex-wrap gap-2">
              {p.status === 'AGENDADO' && <button onClick={() => act('CANCELAR_AGENDAMENTO')} disabled={!!busy} className="btn-secondary px-3 py-1.5 text-xs"><XCircle size={14} />Cancelar agendamento</button>}
              {live && caps.pause === 'SIM' && <button onClick={() => act('PAUSAR')} disabled={!!busy} className="btn-secondary px-3 py-1.5 text-xs"><Pause size={14} />Pausar</button>}
              {(p.status === 'PAUSADO' || (p.desiredState !== 'PUBLICADO' && !p.archivedAt)) && <button onClick={() => act('RETOMAR')} disabled={!!busy} className="btn-secondary px-3 py-1.5 text-xs"><Play size={14} />Reativar</button>}
              {p.remoteId && caps.get === 'SIM' && <button onClick={() => act('VERIFICAR')} disabled={!!busy} className="btn-secondary px-3 py-1.5 text-xs"><RefreshCw size={14} className={cn(busy === 'VERIFICAR' && 'animate-spin')} />Conferir no canal</button>}
              {live && caps.update === 'SIM' && <button onClick={() => act('SINCRONIZAR')} disabled={!!busy} className="btn-secondary px-3 py-1.5 text-xs"><RefreshCw size={14} />Sincronizar</button>}
              {p.desiredState !== 'REMOVIDO' && p.status !== 'REMOVIDO' && <button onClick={() => act('RETIRAR')} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"><Trash2 size={14} />Retirar</button>}
            </section>
          )}

          {p.manual && d.can.publish && (
            <section className="space-y-2 rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-800">Publicação manual</p>
              <p className="text-xs text-gray-500">Baixe fotos e texto, publique na plataforma e cole o link para acompanhar.</p>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/publications/${p.id}/export`} className="btn-secondary px-3 py-1.5 text-xs"><Download size={14} />Baixar fotos e texto</a>
                <input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://… link do post" className={cn(inputCls, 'min-w-0 flex-1 py-1.5 text-xs')} aria-label="Link do post publicado" />
                <button onClick={() => act('MANUAL_PUBLICADO', { url: manualUrl })} disabled={!!busy || !manualUrl} className="btn-primary px-3 py-1.5 text-xs"><CheckCircle2 size={14} />Publiquei</button>
                {p.status === 'PUBLICADO' && <button onClick={() => act('MANUAL_REMOVIDO')} disabled={!!busy} className="btn-secondary px-3 py-1.5 text-xs">Removi</button>}
              </div>
            </section>
          )}

          {d.preview && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">O que vai ao canal</h3>
                {d.can.prepare && !edit && <button onClick={() => setEdit({ title: p.overrides?.title ?? d.preview.title, description: p.overrides?.description ?? d.preview.description, price: String(p.overrides?.price ?? d.preview.price ?? '') })} className="text-xs font-medium text-brand-700 hover:underline">Ajustar para este canal</button>}
              </div>
              {edit ? (
                <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                  <label className="block text-xs text-gray-600">Título<input className={inputCls} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
                  <label className="block text-xs text-gray-600">Descrição<textarea rows={6} className={inputCls} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
                  <label className="block text-xs text-gray-600">Preço neste canal (vazio = preço do estoque)<input inputMode="numeric" className={inputCls} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value.replace(/[^\d.]/g, '') })} /></label>
                  <div className="flex justify-end gap-2"><button onClick={() => setEdit(null)} className="btn-secondary px-3 py-1.5 text-xs">Cancelar</button><button onClick={saveOverrides} disabled={busy === 'save'} className="btn-primary px-3 py-1.5 text-xs">{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar</button></div>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="font-semibold text-gray-900">{d.preview.title}</p>
                  <p className="text-sm text-gray-700">{d.preview.oldPrice != null && <s className="mr-1 text-gray-400">{money(d.preview.oldPrice)}</s>}<b>{money(d.preview.price)}</b></p>
                  <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line text-xs text-gray-600">{d.preview.description}</p>
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                    {d.preview.photos.map((u: string, i: number) => <div key={u} className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100"><img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />{i === 0 && <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">capa</span>}</div>)}
                  </div>
                  {d.preview.issues?.length > 0 && <ul className="mt-2 space-y-1">{d.preview.issues.map((i: any, k: number) => <li key={k} className={cn('text-[11px]', i.severity === 'error' ? 'text-red-700' : 'text-amber-700')}>• {i.message} <span className="text-gray-500">{i.hint}</span></li>)}</ul>}
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Histórico</h3>
            <ol className="space-y-2 border-l border-gray-200 pl-3">
              {d.events.map((e: any) => (
                <li key={e.id} className="text-xs">
                  <p className="text-gray-800">{e.message}</p>
                  <p className="text-[11px] text-gray-400">{when(e.createdAt)} · {e.actorName ?? 'Sistema'}</p>
                </li>
              ))}
              {!d.events.length && <li className="text-xs text-gray-400">Sem eventos.</li>}
            </ol>
          </section>

          <details className="group rounded-xl border border-gray-200">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-xl">Diagnóstico técnico <ChevronDown size={15} className="transition-transform group-open:rotate-180" /></summary>
            <div className="space-y-3 border-t border-gray-100 px-3 py-3 text-[11px] text-gray-600">
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                <dt className="text-gray-400">Referência</dt><dd className="font-mono">{p.externalRef}</dd>
                <dt className="text-gray-400">ID no canal</dt><dd className="font-mono">{p.remoteId ?? '—'}</dd>
                <dt className="text-gray-400">Situação no canal</dt><dd>{p.remoteStatus ?? '—'} (confirmado: {p.confirmedState ?? '—'})</dd>
                <dt className="text-gray-400">Intenção</dt><dd>{p.desiredState} · geração {p.generation}</dd>
                <dt className="text-gray-400">Token pendente</dt><dd className="font-mono">{p.pendingToken ?? '—'}</dd>
                <dt className="text-gray-400">Conteúdo enviado</dt><dd className="font-mono">{p.sentRevisionHash ?? '—'}</dd>
                <dt className="text-gray-400">Ambiente</dt><dd>{p.connection?.environment ?? '—'}</dd>
              </dl>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-gray-400"><tr><th className="py-1 pr-2 font-medium">Tarefa</th><th className="pr-2 font-medium">Situação</th><th className="pr-2 font-medium">Tentativas</th><th className="pr-2 font-medium">Quando</th><th className="font-medium">Erro</th></tr></thead>
                  <tbody>{d.jobs.map((j: any) => <tr key={j.id} className="border-t border-gray-100 align-top"><td className="py-1 pr-2">{j.op}{j.outcomeUnknown ? ' (reconsulta)' : ''}</td><td className="pr-2">{j.status}</td><td className="pr-2">{j.attempts}/{j.maxAttempts}</td><td className="pr-2 whitespace-nowrap">{when(j.finishedAt ?? j.runAt)}</td><td className="max-w-[16rem] break-words">{j.lastErrorKind ? `${j.lastErrorKind}: ` : ''}{j.lastError ?? ''}</td></tr>)}</tbody>
                </table>
              </div>
              {p.remoteData && <pre className="max-h-40 overflow-auto rounded bg-gray-50 p-2">{JSON.stringify(p.remoteData, null, 2)}</pre>}
            </div>
          </details>
        </div>
      )}
    </Drawer>
  )
}
