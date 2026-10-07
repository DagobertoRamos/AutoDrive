// =============================================================================
// Exclusão definitiva de usuário (Painel MASTER).
// As referências são lidas do próprio banco (pg_constraint), então o purge
// acompanha o schema sem lista manual:
// Se o usuário tem histórico na loja (auditoria, negociações, avaliações…),
// ele é ARQUIVADO: nada perde o autor. Sem histórico, apaga de vez:
//   • FK opcional  → SET NULL; FK obrigatória → apagado junto (recursivo).
// Tudo numa transação: falhou um passo, nada é apagado.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

type Tx = Prisma.TransactionClient

interface FkRef { table: string; column: string; refColumn: string; notNull: boolean }
export interface PurgeStep { table: string; action: 'delete' | 'unlink' | 'keep'; count: number }

const MAX_DEPTH = 6
const q = (id: string) => `"${id.replace(/"/g, '""')}"`

async function refsTo(tx: Tx, table: string, cache: Map<string, FkRef[]>): Promise<FkRef[]> {
  const hit = cache.get(table)
  if (hit) return hit
  const rows = await tx.$queryRawUnsafe<{ tbl: string; col: string; refcol: string; nn: boolean }[]>(
    `select c.conrelid::regclass::text as tbl, a.attname::text as col, ra.attname::text as refcol, a.attnotnull as nn
       from pg_constraint c
       join pg_attribute a  on a.attrelid  = c.conrelid  and a.attnum  = c.conkey[1]
       join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
      where c.contype = 'f' and array_length(c.conkey, 1) = 1
        and c.confrelid = $1::regclass`,
    table,
  )
  const refs = rows.map((r) => ({ table: r.tbl.replace(/^"|"$/g, ''), column: r.col, refColumn: r.refcol, notNull: r.nn }))
  cache.set(table, refs)
  return refs
}

/**
 * Percorre o que depende das linhas `table WHERE where`. Em modo `apply`
 * desvincula/apaga; senão só conta (prévia). Ordem: filhos antes do pai.
 */
async function walk(
  tx: Tx, table: string, where: string, params: unknown[], apply: boolean,
  steps: Map<string, PurgeStep>, cache: Map<string, FkRef[]>, depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH) throw new Error(`Cadeia de dependências profunda demais em ${table}.`)
  const refs = await refsTo(tx, table, cache)
  // Auto-referência obrigatória (ex.: resposta presa a um comentário): os
  // descendentes entram no mesmo conjunto, senão o DELETE do pai falha.
  for (const self of refs.filter((r) => r.table === table && r.notNull)) {
    where = `${q(self.refColumn)} in (with recursive t as (select ${q(self.refColumn)} as k from ${q(table)} where ${where} union select c.${q(self.refColumn)} from ${q(table)} c join t on c.${q(self.column)} = t.k) select k from t)`
  }
  for (const ref of refs) {
    const sub = `${q(ref.column)} in (select ${q(ref.refColumn)} from ${q(table)} where ${where})`
    if (!ref.notNull) {
      const key = `${ref.table}.${ref.column}`
      const n = apply
        ? await tx.$executeRawUnsafe(`update ${q(ref.table)} set ${q(ref.column)} = null where ${sub}`, ...params)
        : Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from ${q(ref.table)} where ${sub}`, ...params))[0]?.n ?? 0)
      if (n) steps.set(key, { table: ref.table, action: 'unlink', count: (steps.get(key)?.count ?? 0) + n })
    } else if (ref.table === table) {
      // Auto-referência obrigatória: já incluída no conjunto acima.
      continue
    } else {
      await walk(tx, ref.table, sub, params, apply, steps, cache, depth + 1)
    }
  }
  const n = apply
    ? await tx.$executeRawUnsafe(`delete from ${q(table)} where ${where}`, ...params)
    : Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from ${q(table)} where ${where}`, ...params))[0]?.n ?? 0)
  if (n) steps.set(table, { table, action: 'delete', count: (steps.get(table)?.count ?? 0) + n })
}

// Dados só do acesso da pessoa (sem valor histórico): apagados na exclusão.
// Todo o resto (auditoria, negociações, avaliações, comissões…) é histórico
// da loja e precisa continuar no nome dela.
const PERSONAL_TABLES = new Set([
  'notifications', 'notification_deliveries', 'notification_preferences', 'mobile_devices',
  'password_resets', 'api_tokens', 'user_modules',
])

/** Domínio dos e-mails de usuários arquivados (libera o e-mail original). */
export const ARCHIVED_EMAIL_DOMAIN = '@removido.invalid'

export interface PurgeResult { mode: 'delete' | 'archive'; steps: PurgeStep[] }

/**
 * Prévia (apply=false) ou exclusão (apply=true).
 * • Sem histórico → apaga o usuário de vez (como antes).
 * • Com histórico → ARQUIVA: o cadastro fica (nome preservado em logs,
 *   negociações, avaliações…), mas perde o acesso — senha inutilizada,
 *   e-mail/CPF/telefone liberados, status INATIVO, vendedor/gerente inativos.
 *   Só os dados pessoais de acesso (notificações, dispositivos…) são apagados.
 */
export async function purgeUser(tx: Tx, userId: string, apply: boolean): Promise<PurgeResult> {
  const steps = new Map<string, PurgeStep>()
  await walk(tx, 'users', `"id" = $1`, [userId], false, steps, new Map(), 0)
  const all = [...steps.values()]
  const history = all.filter((s) => s.table !== 'users' && !PERSONAL_TABLES.has(s.table))

  if (history.length === 0) {
    if (apply) {
      steps.clear()
      await walk(tx, 'users', `"id" = $1`, [userId], true, steps, new Map(), 0)
    }
    return { mode: 'delete', steps: sortSteps([...steps.values()]) }
  }

  // Arquivar: apaga só os dados pessoais de acesso e mantém o resto ligado ao nome.
  const personal = new Map<string, PurgeStep>()
  const cache = new Map<string, FkRef[]>()
  for (const ref of (await refsTo(tx, 'users', cache)).filter((r) => PERSONAL_TABLES.has(r.table))) {
    await walk(tx, ref.table, `${q(ref.column)} = $1`, [userId], apply, personal, cache, 1)
  }
  if (apply) {
    const hash = await bcrypt.hash(randomBytes(32).toString('hex'), 10)
    await tx.$executeRawUnsafe(
      `update "users" set "email" = $2, "cpf" = null, "phone" = null, "image" = null,
              "passwordHash" = $3, "status" = 'INATIVO', "mustChangePassword" = false, "updatedAt" = now()
        where "id" = $1`,
      userId, `excluido.${userId}${ARCHIVED_EMAIL_DOMAIN}`, hash,
    )
    await tx.$executeRawUnsafe(`update "sellers" set "active" = false where "userId" = $1`, userId)
    await tx.$executeRawUnsafe(`update "managers" set "active" = false where "userId" = $1`, userId)
  }
  const kept = history.map((s) => ({ ...s, action: 'keep' as const }))
  return { mode: 'archive', steps: sortSteps([...personal.values(), ...kept]) }
}

function sortSteps(list: PurgeStep[]): PurgeStep[] {
  return list.sort((a, b) => (a.action === b.action ? b.count - a.count : a.action === 'delete' ? -1 : 1))
}

// Nomes amigáveis para a prévia (tabela sem nome aqui aparece como está).
export const PURGE_TABLE_LABELS: Record<string, string> = {
  users: 'Usuário', sellers: 'Cadastro de vendedor', managers: 'Cadastro de gerente',
  notifications: 'Notificações', notification_deliveries: 'Entregas de notificação',
  notification_preferences: 'Preferências de notificação', mobile_devices: 'Dispositivos do app',
  password_resets: 'Pedidos de troca de senha', api_tokens: 'Tokens de API', user_modules: 'Módulos liberados',
  pendencies: 'Pendências', pendency_comments: 'Comentários em pendências', pendency_events: 'Eventos de pendência',
  pendency_status_history: 'Histórico de pendências', ranking_scores: 'Pontuações de ranking',
  commission_extracts: 'Extratos de comissão', commission_adjustments: 'Ajustes de comissão',
  commission_rules: 'Regras de comissão', deals: 'Negociações', goals: 'Metas', audit_logs: 'Registros de auditoria',
  vehicle_evaluations: 'Avaliações', message_returns: 'Retornos de mensagens', tenant_partners: 'Sócios de loja',
  system_settings: 'Configurações alteradas por ele', import_jobs: 'Importações',
}
