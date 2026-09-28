'use client'

// =============================================================================
// Nova publicação › Conteúdo: escreve a descrição (IA ou modelo pronto, em 3
// estilos) e as condições comerciais com os dados do sistema. Condições vazias
// são preenchidas sozinhas com o padrão da loja; se a loja ainda não
// configurou, aparece o quadro rápido (com sugestão) para confirmar.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Save, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, inputCls } from '@/components/publications/ui'
import { DESC_STYLES, DESC_STYLE_LABEL, type DescStyle, type StoreTerms } from '@/lib/publications/social/text-core'

export function TextAssist({ vehicleId, conditionsEmpty, onDescription, onConditions }: { vehicleId: string; conditionsEmpty: boolean; onDescription: (t: string) => void; onConditions: (t: string) => void }) {
  const [style, setStyle] = useState<DescStyle>('EMOCIONAL')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [setup, setSetup] = useState<StoreTerms | null>(null)
  const auto = useRef(false)

  const conditions = async (terms?: StoreTerms, silent = false) => {
    const j = await api('/api/publications/social/text', { method: 'POST', json: { vehicleId, kind: 'CONDICOES', ...(terms ? { terms } : {}) } })
    if (!terms && !j.configured) { setSetup(j.terms); if (!silent) setNote({ ok: false, text: 'A loja ainda não configurou as condições. Confira a sugestão abaixo.' }); return }
    if (j.text) { onConditions(j.text); setNote({ ok: true, text: silent ? 'Condições comerciais preenchidas com o padrão da loja.' : 'Condições comerciais preenchidas.' }) }
  }

  // Condições vazias: preenche sozinho ao abrir.
  useEffect(() => {
    if (auto.current || !conditionsEmpty) return
    auto.current = true
    void conditions(undefined, true).catch(() => undefined)
  }, [conditionsEmpty]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (kind: 'IA' | 'MODELO' | 'CONDICOES') => {
    setBusy(kind); setNote(null)
    try {
      if (kind === 'CONDICOES') await conditions()
      else {
        const j = await api('/api/publications/social/text', { method: 'POST', json: { vehicleId, kind: 'DESCRICAO', style, useAi: kind === 'IA' } })
        onDescription(j.text)
        setNote({ ok: true, text: j.ai ? `Descrição escrita pela IA (${j.source}) só com os dados do sistema. Revise antes de publicar.` : kind === 'IA' ? 'Nenhuma IA configurada: usei o modelo pronto com os dados do sistema.' : 'Descrição montada com o modelo pronto.' })
      }
    } catch (e) { setNote({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const fill = async (save: boolean) => {
    if (!setup) return
    setBusy(save ? 'SALVAR' : 'PREENCHER'); setNote(null)
    try {
      if (save) await api('/api/publications/settings', { method: 'PUT', json: { terms: setup } })
      await conditions(setup)
      if (save) { setSetup(null); setNote({ ok: true, text: 'Salvo como padrão da loja: os próximos anúncios já saem com essas condições.' }) }
    } catch (e) { setNote({ ok: false, text: `${(e as Error).message}${save ? ' (salvar o padrão é permissão de gestor; o texto foi preenchido só neste anúncio)' : ''}` }); if (save) await conditions(setup).catch(() => undefined) } finally { setBusy(null) }
  }
  const setT = (x: Partial<StoreTerms>) => setSetup((s) => (s ? { ...s, ...x } : s))

  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-semibold text-gray-800"><Sparkles size={13} className="text-brand-700" />Escrever para mim</span>
        <select aria-label="Estilo da descrição" className={cn(inputCls, 'w-auto py-1 text-xs')} value={style} onChange={(e) => setStyle(e.target.value as DescStyle)}>
          {DESC_STYLES.map((s) => <option key={s} value={s}>{DESC_STYLE_LABEL[s]}</option>)}
        </select>
        <button type="button" onClick={() => run('IA')} disabled={!!busy} className="btn-primary px-2.5 py-1 text-xs">{busy === 'IA' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}Descrição com IA</button>
        <button type="button" onClick={() => run('MODELO')} disabled={!!busy} className="btn-secondary px-2.5 py-1 text-xs">{busy === 'MODELO' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}Modelo pronto</button>
        <button type="button" onClick={() => run('CONDICOES')} disabled={!!busy} className="btn-secondary px-2.5 py-1 text-xs">{busy === 'CONDICOES' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}Condições da loja</button>
      </div>
      <p className="text-[11px] text-gray-500">Usa só o que está no sistema: ficha, opcionais, origem, laudo cautelar e as condições configuradas pela loja. Nada é inventado.</p>

      {setup && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-white p-3">
          <p className="text-xs font-semibold text-gray-800">Condições comerciais da loja</p>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {([['cash', 'À vista'], ['acceptsTrade', 'Aceita veículo na troca'], ['consortium', 'Consórcio'], ['transferIncluded', 'Transferência inclusa'], ['ipvaPaid', 'IPVA pago']] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={setup[k]} onChange={(e) => setT({ [k]: e.target.checked })} />{l}</label>
            ))}
            <label className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={setup.financing} onChange={(e) => setT({ financing: e.target.checked })} />Financiamento em até
              <input type="number" min={2} max={120} className={cn(inputCls, 'w-16 py-0.5 text-xs')} value={setup.financingMax ?? ''} onChange={(e) => setT({ financingMax: e.target.value ? Number(e.target.value) : null })} />x</label>
            <label className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={setup.cards} onChange={(e) => setT({ cards: e.target.checked })} />Cartão em até
              <input type="number" min={2} max={36} className={cn(inputCls, 'w-16 py-0.5 text-xs')} value={setup.cardsMax ?? ''} onChange={(e) => setT({ cardsMax: e.target.value ? Number(e.target.value) : null })} />x</label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fill(true)} disabled={!!busy} className="btn-primary px-2.5 py-1 text-xs">{busy === 'SALVAR' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Salvar como padrão da loja e preencher</button>
            <button type="button" onClick={() => fill(false)} disabled={!!busy} className="btn-secondary px-2.5 py-1 text-xs">{busy === 'PREENCHER' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}Só preencher este anúncio</button>
          </div>
        </div>
      )}
      {note && <p role="status" className={cn('text-xs', note.ok ? 'text-green-700' : 'text-amber-700')}>{note.text}</p>}
    </div>
  )
}
