'use client'

// =============================================================================
// NotesPanel — anotações internas da negociação.
//
// MVP: armazena anotações no campo `notes` do Deal (append-only com prefixo de
// categoria + data + autor). Quando houver tabela `DealNote` dedicada, migrar.
//
// Cada anotação é categorizada para facilitar filtro: ATENDIMENTO, FINANCEIRO,
// DOCUMENTACAO, APROVACAO, ENTREGA, POS_VENDA, OUTRO.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Pin, Loader2, Send } from 'lucide-react'
import type { Attachment } from './AttachmentUploader'

const CATEGORIES: Array<{ value: string; label: string; color: string }> = [
  { value: 'ATENDIMENTO',  label: 'Atendimento',   color: 'bg-blue-100 text-blue-800' },
  { value: 'FINANCEIRO',   label: 'Financeiro',    color: 'bg-emerald-100 text-emerald-800' },
  { value: 'DOCUMENTACAO', label: 'Documentação',  color: 'bg-violet-100 text-violet-800' },
  { value: 'APROVACAO',    label: 'Aprovação',     color: 'bg-amber-100 text-amber-800' },
  { value: 'ENTREGA',      label: 'Entrega',       color: 'bg-cyan-100 text-cyan-800' },
  { value: 'POS_VENDA',    label: 'Pós-venda',     color: 'bg-fuchsia-100 text-fuchsia-800' },
  { value: 'OUTRO',        label: 'Outro',         color: 'bg-gray-100 text-gray-700' },
]

interface DealNote {
  id:        string
  category:  string
  text:      string
  author:    string
  createdAt: string
  pinned?:   boolean
}

interface Props {
  dealId:      string
  attachments: Attachment[]
  onReload:    () => void
  onToast:     (msg: string, ok?: boolean) => void
}

export default function NotesPanel({ dealId, onToast }: Props) {
  const [notes, setNotes]      = useState<DealNote[]>([])
  const [loading, setLoading]  = useState(true)
  const [text, setText]        = useState('')
  const [category, setCat]     = useState('ATENDIMENTO')
  const [saving, setSaving]    = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/negotiations/${dealId}/notes`)
      if (!r.ok) throw new Error()
      const d = await r.json()
      setNotes(Array.isArray(d?.data) ? d.data : [])
    } catch {
      // Endpoint ainda não existe — degrada silenciosamente
      setNotes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [dealId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const r = await fetch(`/api/negotiations/${dealId}/notes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ category, text: text.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? 'Falha ao salvar anotação.')
      setText('')
      onToast('Anotação adicionada.', true)
      load()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Erro', false)
    } finally {
      setSaving(false)
    }
  }

  const grouped = useMemo(() => {
    const sorted = [...notes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return sorted
  }, [notes])

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
          <MessageSquare size={15} className="text-brand-600" />
          <h3 className="font-semibold text-gray-800">Nova anotação</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCat(c.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === c.value ? c.color : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <textarea
            className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Escreva uma anotação interna (visível apenas para a equipe)..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={saving || !text.trim()}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Adicionar anotação
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-brand-600" />
            <h3 className="font-semibold text-gray-800">Histórico de anotações</h3>
          </div>
          <span className="text-xs text-gray-500">{notes.length}</span>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : grouped.length === 0 ? (
            <p className="py-8 text-center text-sm italic text-gray-400">
              Nenhuma anotação ainda. Use o campo acima para adicionar.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {grouped.map((n) => {
                const cat = CATEGORIES.find((c) => c.value === n.category) ?? CATEGORIES[CATEGORIES.length - 1]
                return (
                  <li key={n.id} className="py-3">
                    <div className="mb-1 flex items-center gap-2">
                      {n.pinned && <Pin size={12} className="text-amber-600" />}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cat.color}`}>
                        {cat.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {n.author} · {new Date(n.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <p className="whitespace-pre-line text-sm text-gray-700">{n.text}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
