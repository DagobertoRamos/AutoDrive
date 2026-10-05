'use client'

// Foto do veículo no painel: link quebrado/expirado (ex.: BNDV apagou a foto)
// ou arte "em breve" vira a imagem padrão "Aguardando fotos".
import { useEffect, useRef, useState } from 'react'
import Image, { type ImageProps } from 'next/image'
import { VEHICLE_NO_PHOTO_IMG, isPlaceholderPhoto } from '@/lib/vehicle-placeholder'

type Props = Omit<ImageProps, 'src' | 'onError'> & { src: string | null | undefined; onBroken?: (src: string) => void }

export function VehiclePhotoImg({ src, alt, onBroken, ...rest }: Props) {
  const [failed, setFailed] = useState<string | null>(null)
  const ref = useRef<HTMLImageElement>(null)
  const real = src && !isPlaceholderPhoto(src) ? src : null
  const fail = (u: string) => { setFailed(u); onBroken?.(u) }

  useEffect(() => {
    if (!real) return
    // A imagem pode falhar antes do listener existir durante a hidratação.
    const f = requestAnimationFrame(() => { if (ref.current?.complete && ref.current.naturalWidth === 0) fail(real) })
    return () => cancelAnimationFrame(f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real])

  const ok = real && failed !== real
  return (
    <Image
      ref={ref}
      {...rest}
      src={ok ? real : VEHICLE_NO_PHOTO_IMG}
      alt={ok ? alt : 'Aguardando fotos'}
      unoptimized
      onError={() => { if (real) fail(real) }}
    />
  )
}
