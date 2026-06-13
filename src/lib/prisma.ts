// =============================================================================
// Prisma Client singleton — AutoDrive
//
// Em produção/desenvolvimento usamos o **Neon serverless adapter** sobre
// WebSocket. Vantagens:
//   • Conexão TCP-virtual mantida viva ⇒ cold-start do endpoint Neon não
//     derruba mais o primeiro request (problema clássico do free tier).
//   • Compatível com edge runtime caso a gente migre.
//   • Funciona com pgbouncer (a DATABASE_URL aponta pro host -pooler).
//
// Fallback: se o adapter falhar em carregar (ex.: ws ausente), cai pro driver
// nativo do Prisma com a mesma DATABASE_URL.
//
// 'query' fica desligado do log pra não poluir o dev-overlay. Use
// DEBUG=prisma:query no terminal pra inspecionar queries.
// =============================================================================

import { PrismaClient } from '@prisma/client'
import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? ''
  // Tentamos configurar o adapter Neon. Falhas (env vazio, inicialização do
  // adapter etc.) caem pro driver nativo.
  try {
    if (!url) throw new Error('DATABASE_URL ausente')
    neonConfig.webSocketConstructor = ws

    // @prisma/adapter-neon 7.x: PrismaNeon recebe PoolConfig direto e
    // gerencia o pool internamente. PrismaClient aceita o adapter como factory.
    const adapter = new PrismaNeon({ connectionString: url })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new PrismaClient({
      adapter: adapter as any,
      log: [
        { level: 'error', emit: 'stdout' },
        { level: 'warn',  emit: 'stdout' },
      ],
    } as any)
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[prisma] Neon adapter indisponível, usando driver nativo:', (e as Error).message)
    }
    return new PrismaClient({
      log: [
        { level: 'error', emit: 'stdout' },
        { level: 'warn',  emit: 'stdout' },
      ],
    })
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
