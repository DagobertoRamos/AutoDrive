import type { CapacitorConfig } from '@capacitor/cli'

// =============================================================================
// Capacitor — Android MVP do AutoDrive.
// O AutoDrive usa Next.js/API/NextAuth/Prisma, então o app NÃO é export estático:
// ele abre a URL HTTPS do AutoDrive (homologação/produção) como wrapper nativo.
// server.url vem de CAP_SERVER_URL (sem segredo); placeholder seguro se ausente.
// cleartext=false → apenas HTTPS. Ver mobile/capacitor.config.example.json.
// =============================================================================

const config: CapacitorConfig = {
  appId: 'br.com.autodrive.app',
  appName: 'AutoDrive',
  webDir: 'public',
  server: {
    url: process.env.CAP_SERVER_URL || 'https://homologacao.autodrive.example/',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
