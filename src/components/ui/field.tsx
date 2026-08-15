'use client'

// =============================================================================
// Componentes base de campo — identificação semântica de OBRIGATORIEDADE.
//
// Padrão único do AutoDrive (usar em qualquer formulário):
//
//   Quilometragem *
//   Obrigatório
//
// com o "*" e a palavra "Obrigatório" no token semântico de erro do design
// system (`text-error` = #DC2626 no tailwind.config.ts) — nunca em vermelho
// hardcoded e nunca repetindo este JSX em cada tela.
// =============================================================================

import type { ReactNode } from 'react'

export function RequiredMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`text-error font-semibold ${className}`}>*</span>
  )
}

/** Etiqueta "Obrigatório" — sempre acompanha o `*`. */
export function RequiredTag({ className = '' }: { className?: string }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide text-error ${className}`}>
      Obrigatório
    </span>
  )
}

interface FieldLabelProps {
  children:  ReactNode
  /** Marca o campo como obrigatório: "*" + etiqueta "Obrigatório". */
  required?: boolean
  htmlFor?:  string
  /** Texto auxiliar exibido abaixo do rótulo (ex.: "Mínimo de 1 foto."). */
  hint?:     ReactNode
  className?: string
}

/**
 * Rótulo padrão. `required` é a ÚNICA forma de marcar obrigatoriedade —
 * a UI nunca deduz isso do nome do campo.
 */
export function FieldLabel({ children, required, htmlFor, hint, className = '' }: FieldLabelProps) {
  return (
    <span className={`flex flex-col gap-0.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-gray-600 flex items-center gap-1">
        {children}
        {required && <RequiredMark />}
      </label>
      {required && <RequiredTag />}
      {hint && <span className="text-[10px] text-gray-500">{hint}</span>}
    </span>
  )
}

/** Mensagem de erro do campo — ligar via aria-describedby. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  if (!children) return null
  return (
    <span id={id} role="alert" className="text-[11px] font-medium text-error">
      {children}
    </span>
  )
}

/** Classe de borda/anel de erro do design system (para inputs e selects). */
export const FIELD_ERROR_CLASS = 'border-error focus:border-error focus:ring-error'
