'use client'
// Fecha os <details class="filter-dropdown"> do estoque: clique fora, Esc,
// escolha de opção (link), troca de rota e abertura de outro dropdown.
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const SELECTOR = 'details.filter-dropdown'

function closeAll(except?: Element | null) {
  document.querySelectorAll<HTMLDetailsElement>(`${SELECTOR}[open]`).forEach((d) => { if (d !== except) d.open = false })
}

export function SiteDropdownAutoClose() {
  const pathname = usePathname()
  const search = useSearchParams()

  useEffect(() => { closeAll() }, [pathname, search])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      const owner = target?.closest(SELECTOR) ?? null
      closeAll(owner)
      if (owner && target?.closest('a')) (owner as HTMLDetailsElement).open = false
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll() }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey) }
  }, [])

  return null
}
