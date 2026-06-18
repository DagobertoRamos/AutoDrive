// =============================================================================
// next.config.js — Configuração principal do Next.js
//
// IMPORTANTE: este arquivo precisa existir na raiz com esse nome exato.
// O Next NÃO lê next.config2.js nem next.config.js.ts.bak.
//
// serverExternalPackages: mantém pacotes pesados fora do bundle do webpack —
// são require()'d em runtime no Node. Sem isso, pdf-parse + pdfjs-dist
// quebram (workers, polyfills DOM) na rota
// /api/evaluations/vehicle-document/extract.
// (Antes ficava em experimental.serverComponentsExternalPackages; promovido
//  pra opção estável no Next 15.)
// =============================================================================

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Reduz uso de memória no build de produção.
  productionBrowserSourceMaps: false,

  experimental: {
    webpackMemoryOptimizations: true,
    webpackBuildWorker: true,
    serverSourceMaps: false,
    preloadEntriesOnStart: false,
  },

  // Esconde o botão flutuante "N" do Next no canto inferior esquerdo durante o dev.
  devIndicators: false,

  // Origens extras permitidas no dev server (HMR / static via IP externo)
  allowedDevOrigins: ['54.232.189.113'],

  serverExternalPackages: [
    'pdf-parse',
    'pdfjs-dist',
    'canvas',
    // Neon serverless adapter + ws (transporte WebSocket).
    // Sem isso, o webpack do Next bundla `ws` e quebra o require opcional
    // do `bufferutil`/`utf-8-validate` → erro "bufferUtil.mask is not a function".
    '@neondatabase/serverless',
    '@prisma/adapter-neon',
    'ws',
  ],

  // Webpack: fallback de módulos Node em código client + alias para canvas
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
      }
    }

    // pdfjs-dist tenta carregar `canvas` em runtime — alias pra vazio em ambos
    // os bundles (client e server).
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    }

    return config
  },
}

module.exports = nextConfig