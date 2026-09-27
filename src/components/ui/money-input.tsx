'use client'

// =============================================================================
// Campo de valor em reais — padrão único do sistema: "R$ 49.900,00".
// Digitação da direita para a esquerda (centavos), como caixa eletrônico:
// não há como gravar "49.900" como 49,9. O estado é sempre um número em reais.
//   <MoneyInput value={price} onChange={setPrice} />
// Para estado em texto (formulários antigos), use `moneyToText` / `textToMoney`.
// =============================================================================

import { maskBRL, numberToBRLMask, parseBRL } from '@/lib/masks'

interface Props {
  value: number | null | undefined
  onChange: (value: number | null) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  autoFocus?: boolean
  'aria-label'?: string
}

export function MoneyInput({ value, onChange, className, placeholder = '0,00', disabled, ...rest }: Props) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        placeholder={placeholder}
        className={`${className ?? ''} !pl-9 tabular-nums`}
        value={value == null ? '' : numberToBRLMask(value)}
        onChange={(e) => onChange(parseBRL(maskBRL(e.target.value)))}
      />
    </div>
  )
}

/** Número em reais → texto canônico para estado string ("49900.5"). */
export const moneyToText = (n: number | null) => (n == null ? '' : String(n))

/** Texto canônico (ou legado "49.900,00") → número em reais. */
export function textToMoney(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = v.trim().replace(/^R\$\s*/i, '')
  // Formato pt-BR com vírgula decimal ("49.900,00").
  if (s.includes(',')) { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
