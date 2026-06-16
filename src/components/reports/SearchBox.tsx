'use client'

// =============================================================================
// SearchBox — busca textual com debounce. Dispara onChange ~350ms após parar
// de digitar. Usado nas telas/relatórios do Financeiro.
// =============================================================================

import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'

export default function SearchBox({
  value, onChange, placeholder = 'Buscar...', className = '',
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  const [local, setLocal] = useState(value)

  // Mantém o estado local em sincronia quando o valor externo é limpo de fora.
  useEffect(() => { setLocal(value) }, [value])

  // Debounce: propaga apenas após pausa na digitação. (onChange é um setter
  // estável de useState nos callers, então é seguro nas dependências.)
  useEffect(() => {
    if (local === value) return
    const t = setTimeout(() => onChange(local), 350)
    return () => clearTimeout(t)
  }, [local, value, onChange])

  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-7 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {local && (
        <button onClick={() => setLocal('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" aria-label="Limpar busca">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
