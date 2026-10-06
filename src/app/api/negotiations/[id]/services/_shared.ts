// Serviço da negociação — tipo (linha de serviço) e fornecedor cadastrado.
import { prisma } from '@/lib/prisma'
import { SERVICE_KIND_BY_KEY, guessServiceKind } from '@/lib/finance/result-centers-core'

/** Tipo informado (se válido) ou adivinhado pelo nome. */
export function resolveServiceKind(kind: unknown, name: string | null | undefined, supplier?: string | null): string {
  const k = String(kind ?? '').toUpperCase()
  return SERVICE_KIND_BY_KEY[k] ? k : guessServiceKind(name, supplier)
}

/**
 * Fornecedor do serviço: precisa ser da loja da negociação. Retorna o id e o
 * nome (gravado também no campo texto antigo), `null` para limpar, ou erro.
 */
export async function resolveServiceSupplier(
  supplierId: unknown,
  tenantId: string | null,
): Promise<{ ok: true; supplierId: string | null; name: string | null } | { ok: false; error: string }> {
  if (supplierId == null || supplierId === '') return { ok: true, supplierId: null, name: null }
  if (typeof supplierId !== 'string') return { ok: false, error: 'Fornecedor inválido' }
  const s = await prisma.supplier.findFirst({ where: { id: supplierId, ...(tenantId ? { tenantId } : {}) }, select: { id: true, name: true } })
  if (!s) return { ok: false, error: 'Fornecedor não encontrado' }
  return { ok: true, supplierId: s.id, name: s.name }
}
