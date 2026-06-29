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

  // O `next build` rodava o type-check embutido ("Running TypeScript ...") DEPOIS
  // do webpack já ter ocupado a RAM do container Hobby da Vercel → a checagem
  // entrava em thrashing e TRAVAVA até o timeout de 45 min (deploy 5de01a7).
  // A validação de tipos é feita SEPARADAMENTE (`tsc --noEmit`) em toda etapa do
  // protocolo (README_ROBOTS) e no CI local — então pular a checagem redundante
  // do build não perde segurança de tipos e alivia o pico de RAM/tempo do build.
  typescript: { ignoreBuildErrors: true },
  // Lint também não roda no build (já rodamos `eslint .` separadamente).
  eslint: { ignoreDuringBuilds: true },

  experimental: {
    webpackMemoryOptimizations: true,
    // DESLIGADO de propósito: o build worker do Next roda um 2º processo pesado
    // em paralelo; somado ao processo principal estoura a RAM do container da
    // Vercel (SIGKILL/OOM). Com 1 processo único (cap de heap no script build)
    // o pico de RAM total cai e o build cabe no container. Ver LOG 0103.
    webpackBuildWorker: false,
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
  webpack: (config, { isServer, dev }) => {
    // No build de produção, limita o paralelismo do webpack: processa menos
    // módulos ao mesmo tempo → reduz o PICO de RAM e evita o OOM (SIGKILL) no
    // container Hobby da Vercel. Não afeta o dev (HMR). Reduzido p/ 1 quando o
    // app cresceu e o pico voltou a estourar o container (deploy 238fc7f OOM).
    if (!dev) config.parallelism = 1

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