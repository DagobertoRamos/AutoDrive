'use client'
/* eslint-disable @next/next/no-img-element -- fotos/logos da loja vêm de URLs arbitrárias */

// Foto do veículo com fallback para o "Em breve" (porta do VehicleImage).
import { useEffect, useRef, useState } from 'react'

export const EM_BREVE_IMG = '/site/em-breve.svg'

export function SiteVehicleImage({ src, alt, loading = 'lazy' }: { src: string | null; alt: string; loading?: 'eager' | 'lazy' }) {
  const [failed, setFailed] = useState<string | null>(null)
  const img = useRef<HTMLImageElement>(null)
  const real = src || EM_BREVE_IMG
  useEffect(() => {
    // A imagem pode falhar antes do listener existir durante a hidratação.
    const f = requestAnimationFrame(() => { if (img.current?.complete && img.current.naturalWidth === 0) setFailed(real) })
    return () => cancelAnimationFrame(f)
  }, [real])
  return (
    <img ref={img} src={failed === real ? EM_BREVE_IMG : real} alt={alt} loading={loading} onError={() => setFailed(real)} />
  )
}
