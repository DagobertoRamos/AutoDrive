'use client'

// =============================================================================
// Nova publicação › Conteúdo: escreve a descrição (IA ou modelo pronto, em 3
// estilos) e as condições comerciais com os dados do sistema.
// =============================================================================

import { useState } from 'react'
import { FileText, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, inputCls } from '@/components/publications/ui'
import { DESC_STYLES, DESC_STYLE_LABEL, type DescStyle } from '@/lib/publications/social/text-core'

export function TextAssist({ vehicleId, onDescription, onConditions }: { vehicleId: string; onDescription: (t: string) => void; onConditions: (t: string) => void }) {
  const [style, setStyle] = useState<DescStyle>('COMPLETO')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (kind: 'IA' | 'MODELO' | 'CONDICOES') => {
    setBusy(kind); setNote(null)
    try {
      if (kind === 'CONDICOES') {
        const j = await api('/api/publications/social/text', { method: 'POST', json: { vehicleId, kind: 'CONDICOES' } })
        if (j.empty) setNote({ ok: false, text: 'A loja ainda não configurou as condições padrão (Canais conectados › Contatos e regras da loja).' })
        else { onConditions(j.text); setNote({ ok: true, text: 'Condições preenchidas com a configuração da loja e a ficha do carro.' }) }
      } else {
        const j = await api('/api/publications/social/text', { method: 'POST', json: { vehicleId, kind: 'DESCRICAO', style, useAi: kind === 'IA' } })
        onDescription(j.text)
        setNote({ ok: true, text: j.ai ? `Descrição escrita pela IA (${j.source}) só com os dados do sistema. Revise antes de publicar.` : kind === 'IA' ? 'Nenhuma IA configurada: usei o modelo pronto com os dados do sistema.' : 'Descrição montada com o modelo pronto.' })
      }
    } catch (e) { setNote({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

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
      {note && <p role="status" className={cn('text-xs', note.ok ? 'text-green-700' : 'text-amber-700')}>{note.text}</p>}
    </div>
  )
}
