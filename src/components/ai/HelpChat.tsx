'use client'

// =============================================================================
// HelpChat — assistente de ajuda (IA controlada) do AutoDrive.
// Consome /api/ai/help-chat. A IA só orienta sobre o uso do sistema; não executa
// ações nem inventa. Se não houver provedor real configurado, usa MockAI (aviso).
// =============================================================================

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Msg { role: 'user' | 'assistant'; content: string }
const SUGGESTIONS = [
  'Como faço uma avaliação de veículo?',
  'Como cadastro uma venda?',
  'Por que meu PDF não foi lido?',
  'Como funciona o módulo F&I?',
]

export default function HelpChat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mockNote, setMockNote] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || loading) return
    const history = messages.slice(-8)
    setMessages((m) => [...m, { role: 'user', content: message }])
    setInput(''); setLoading(true)
    try {
      const res = await fetch('/api/ai/help-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ message, history }) })
      const json = await res.json()
      const answer = json?.answer ?? json?.error ?? 'Não consegui responder agora.'
      setMessages((m) => [...m, { role: 'assistant', content: answer }])
      setMockNote(json?.mock ? `Respostas simuladas (${json?.provider ?? 'MockAI'}) — configure um provedor de IA no painel Master para respostas reais.` : null)
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Erro de rede ao falar com o assistente. Tente novamente.' }])
    } finally { setLoading(false) }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Bot size={17} /></div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Assistente AutoDrive</p>
          <p className="text-[11px] text-gray-400">Tira dúvidas de uso do sistema — não executa ações.</p>
        </div>
      </div>

      <div className="max-h-80 min-h-[140px] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-gray-500">Como posso ajudar você no AutoDrive?</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-brand-50 hover:text-brand-700">{s}</button>
              ))}
            </div>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Bot size={13} /></div>}
            <div className={cn('max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm', m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800')}>{m.content}</div>
            {m.role === 'user' && <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600"><User size={13} /></div>}
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={15} className="animate-spin" />Pensando...</div>}
        <div ref={endRef} />
      </div>

      {mockNote && <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-700">{mockNote}</div>}

      <div className="flex items-center gap-2 border-t border-gray-100 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder="Pergunte algo sobre o sistema..."
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()} className="btn-primary text-sm disabled:opacity-50"><Send size={15} />Enviar</button>
      </div>
    </div>
  )
}
