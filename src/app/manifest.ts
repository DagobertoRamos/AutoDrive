// =============================================================================
// PWA manifest do AutoDrive (Next.js App Router — app/manifest.ts).
// Ícones PNG locais em /icons/icon-{192,512}.png (gerados do favicon da marca).
// Cor de tema alinhada ao fundo branco do ícone.
// =============================================================================

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AutoDrive',
    short_name: 'AutoDrive',
    description: 'AutoDrive SaaS automotivo',
    start_url: '/inicio',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: '#16A34A',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
