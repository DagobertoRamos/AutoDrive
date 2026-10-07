// =============================================================================
// Trava de dados de identidade: CPF, CNPJ e e-mail só o MASTER altera.
// Os demais podem PREENCHER quando o campo está vazio, mas não trocar um valor
// já gravado. Comparação normalizada (só dígitos; e-mail sem caixa/espaços),
// então reenviar o mesmo valor com outra máscara não conta como alteração.
// =============================================================================

export const IDENTITY_FIELDS = ['cpf', 'cnpj', 'email'] as const
export type IdentityField = (typeof IDENTITY_FIELDS)[number]

export const IDENTITY_LOCK_MESSAGE = 'Só o MASTER pode alterar CPF, CNPJ e e-mail já cadastrados.'

const norm = (field: string, v: unknown): string => {
  if (v == null) return ''
  const s = String(v).trim()
  return /email/i.test(field) ? s.toLowerCase() : s.replace(/\D/g, '')
}

/**
 * Erro se um não-MASTER tentar trocar um CPF/CNPJ/e-mail já preenchido.
 * `fields` mapeia o nome no corpo da requisição → nome no registro (padrão: igual).
 */
export function identityLockError(
  role: string | null | undefined,
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
  fields: Record<string, string> = { cpf: 'cpf', cnpj: 'cnpj', email: 'email' },
): string | null {
  if (role === 'MASTER' || !current || !incoming) return null
  for (const [inKey, curKey] of Object.entries(fields)) {
    if (!(inKey in incoming) || incoming[inKey] === undefined) continue
    const before = norm(curKey, current[curKey])
    if (!before) continue // vazio: pode preencher
    if (norm(curKey, incoming[inKey]) !== before) return IDENTITY_LOCK_MESSAGE
  }
  return null
}

/** Para as telas: campo travado para este usuário (já preenchido e não é MASTER)? */
export const identityLocked = (role: string | null | undefined, currentValue: unknown) =>
  role !== 'MASTER' && currentValue != null && String(currentValue).trim() !== ''
