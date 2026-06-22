// =============================================================================
// PWA manifest do AutoDrive (Next.js App Router — app/manifest.ts).
// Ícone local em /icons/autodrive-icon.svg (sem asset externo). Cores alinhadas
// à marca (verde #16A34A) e ao layout claro atual.
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
        src: '/icons/autodrive-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/autodrive-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
