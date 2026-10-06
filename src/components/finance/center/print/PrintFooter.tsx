'use client'

// =============================================================================
// Rodapé das impressões do financeiro: "<tipo> · gerado em dd/mm/aaaa hh:mm
// (America/Sao_Paulo)" repetido em TODAS as páginas (position: fixed na
// impressão). O Chrome não suporta caixas de margem do @page nem counter(page)
// em elemento fixo, então não há número de página.
//
// PrintFrame: envolve o conteúdo numa tabela só na impressão, com um <tfoot>
// vazio que se repete em cada página e reserva o espaço do rodapé fixo (sem
// ele, o rodapé cobriria as últimas linhas da página). Na tela é um bloco comum.
// =============================================================================

import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Altura reservada para o rodapé em cada página. */
export const PRINT_FOOTER_SPACE = '8mm'

export function spNowLabel(d = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

/** CSS comum da impressão do financeiro (A4, margens pequenas, rodapé fixo, moldura). */
export const FIN_PRINT_CSS = `
.fin-print-frame, .fin-print-frame > tbody, .fin-print-frame > tbody > tr, .fin-print-frame > tbody > tr > td { display: block; width: 100%; }
.fin-print-frame > tfoot { display: none; }
@media print {
  @page { size: A4; margin: 10mm 10mm 8mm; }
  html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .fin-print-footer { display: flex !important; position: fixed !important; left: 0; right: 0; bottom: 0; }
  .fin-print-frame { display: table; width: 100%; border-collapse: collapse; }
  .fin-print-frame > tbody { display: table-row-group; }
  .fin-print-frame > tbody > tr { display: table-row; }
  .fin-print-frame > tbody > tr > td { display: table-cell; padding: 0; }
  .fin-print-frame > tfoot { display: table-footer-group; }
}
`

export default function PrintFooter({ label }: { label: string }) {
  const [now, setNow] = useState(() => spNowLabel())
  useEffect(() => {
    const upd = () => setNow(spNowLabel())
    window.addEventListener('beforeprint', upd)
    return () => window.removeEventListener('beforeprint', upd)
  }, [])
  return (
    <>
      <style>{FIN_PRINT_CSS}</style>
      <div className="fin-print-footer hidden items-center gap-3 border-t border-gray-300 bg-white pt-1 text-[8px] leading-none text-gray-500">
        <span className="truncate" suppressHydrationWarning>{label} · gerado em {now} (America/Sao_Paulo)</span>
      </div>
    </>
  )
}

/** Moldura de impressão: reserva o espaço do rodapé fixo em cada página. */
export function PrintFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <table className="fin-print-frame">
      <tfoot aria-hidden="true"><tr><td><div style={{ height: PRINT_FOOTER_SPACE }} /></td></tr></tfoot>
      <tbody><tr><td className={cn(className)}>{children}</td></tr></tbody>
    </table>
  )
}
