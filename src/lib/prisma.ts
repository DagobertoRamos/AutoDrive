// =============================================================================
// Prisma Client singleton — AutoDrive
// Evita múltiplas instâncias durante hot-reload em desenvolvimento.
//
// IMPORTANTE: 'query' foi removido intencionalmente do log em desenvolvimento.
// Usar log: ['query'] direciona saídas para process.stdout, que o Next.js
// captura no dev-overlay e pode exibir na UI durante impressão.
// Use `DEBUG=prisma:query` no terminal se precisar inspecionar queries.
// =============================================================================

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { level: 'error', emit: 'stdout' },
      { level: 'warn',  emit: 'stdout' },
    ],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
