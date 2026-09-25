// =============================================================================
// tenant-lifecycle/purge.ts — apaga TODOS os dados de uma loja (tenant).
//
// Genérico de propósito: são ~130 tabelas com "tenantId" e dezenas de tabelas
// filhas sem ele (itens, anexos em Bytes, históricos). Listar tudo à mão
// quebraria a cada model novo. Então a exclusão é guiada pelo catálogo do
// Postgres:
//
//   1. Alvos iniciais: a linha em "tenants" + toda linha com "tenantId" = loja.
//   2. Fecho transitivo pelas FKs: linha que referencia uma linha-alvo por FK
//      obrigatória (ou ON DELETE CASCADE) também vira alvo; por FK opcional, a
//      referência é apenas anulada (ex.: MASTER que editou algo da loja).
//      Linhas de OUTRA loja nunca viram alvo — se alguma bloquear, a exclusão
//      aborta inteira e o erro aparece para o MASTER.
//   3. Os ids-alvo ficam em tabelas temporárias; depois DELETE em ondas (com
//      SAVEPOINT) até esvaziar, respeitando a ordem que as FKs exigirem.
//
// Tudo numa transação só: ou apaga tudo, ou nada. `dryRun` faz o mesmo
// trabalho e desfaz no final — serve para medir e para validar antes do prazo.
// =============================================================================

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type Tx = Prisma.TransactionClient

interface FkEdge {
  child: string
  parent: string
  childCols: string[]
  parentCols: string[]
  nullable: boolean
  onDelete: string // a=no action, r=restrict, c=cascade, n=set null, d=set default
}

export interface PurgeResult {
  ok: boolean
  dryRun: boolean
  tenantId: string
  deleted: Record<string, number>
  nullified: Record<string, number>
  totalRows: number
  error?: string
}

class DryRunRollback extends Error {
  constructor(public result: PurgeResult) { super('dry-run') }
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`
const cols = (list: string[], alias?: string) => list.map((c) => (alias ? `${alias}.${q(c)}` : q(c))).join(', ')
const row = (list: string[], alias?: string) => (list.length === 1 ? cols(list, alias) : `(${cols(list, alias)})`)

async function loadCatalog(tx: Tx) {
  const tenantTables = (await tx.$queryRawUnsafe<{ t: string }[]>(
    `SELECT table_name AS t FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'tenantId'
      ORDER BY table_name`,
  )).map((r) => r.t)

  const pkRows = await tx.$queryRawUnsafe<{ t: string; cols: string[] }[]>(
    `SELECT cl.relname AS t, array_agg(a.attname ORDER BY k.ord) AS cols
       FROM pg_index i
       JOIN pg_class cl ON cl.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      WHERE i.indisprimary AND n.nspname = current_schema()
      GROUP BY cl.relname`,
  )
  const pk = new Map(pkRows.map((r) => [r.t, r.cols]))

  const edges = await tx.$queryRawUnsafe<FkEdge[]>(
    `SELECT cl.relname AS child, p.relname AS parent,
            array_agg(ca.attname ORDER BY k.ord) AS "childCols",
            array_agg(pa.attname ORDER BY k.ord) AS "parentCols",
            bool_and(NOT ca.attnotnull) AS nullable,
            c.confdeltype::text AS "onDelete"
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_class p ON p.oid = c.confrelid
       CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(ck, pk, ord)
       JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = k.ck
       JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = k.pk
      WHERE c.contype = 'f' AND n.nspname = current_schema()
      GROUP BY c.oid, cl.relname, p.relname, c.confdeltype
      ORDER BY cl.relname, c.oid`,
  )
  return { tenantTables: new Set(tenantTables), pk, edges }
}

/** Aresta que obriga a apagar a filha (e não só anular a referência). */
const isDeleteEdge = (e: FkEdge) => e.onDelete === 'c' || ((e.onDelete === 'a' || e.onDelete === 'r') && !e.nullable)
/** Aresta em que basta anular a coluna da filha. */
const isNullifyEdge = (e: FkEdge) => (e.onDelete === 'a' || e.onDelete === 'r') && e.nullable

type TableSink = (table: string, rows: Record<string, unknown>[]) => Promise<void>

async function runPurge(tx: Tx, tenantId: string, dryRun: boolean, sink?: TableSink): Promise<PurgeResult> {
  const { tenantTables, pk, edges } = await loadCatalog(tx)
  const TENANTS = 'tenants'

  // ── 1. Tabelas-alvo (fecho estático pelo grafo de FKs) ─────────────────────
  const targets = new Set<string>([TENANTS, ...tenantTables])
  let grew = true
  while (grew) {
    grew = false
    for (const e of edges) {
      if (targets.has(e.parent) && !targets.has(e.child) && isDeleteEdge(e)) { targets.add(e.child); grew = true }
    }
  }
  for (const t of targets) if (!pk.get(t)?.length) throw new Error(`Tabela sem chave primária: ${t}`)

  const tmp = new Map<string, string>()
  let i = 0
  for (const t of targets) {
    const name = `_purge_${i++}`
    tmp.set(t, name)
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE ${q(name)} ON COMMIT DROP AS SELECT ${cols(pk.get(t)!)} FROM ${q(t)} WITH NO DATA`)
  }

  // Filtro de escopo: numa tabela com tenantId, só entram linhas da loja ou sem loja.
  const scope = (t: string, alias: string) => (tenantTables.has(t) ? ` AND (${alias}."tenantId" IS NULL OR ${alias}."tenantId" = $1)` : '')
  const notYet = (t: string, alias: string) =>
    `NOT EXISTS (SELECT 1 FROM ${q(tmp.get(t)!)} x WHERE ${pk.get(t)!.map((c) => `x.${q(c)} = ${alias}.${q(c)}`).join(' AND ')})`
  const inTargets = (t: string, alias: string) =>
    `EXISTS (SELECT 1 FROM ${q(tmp.get(t)!)} x WHERE ${pk.get(t)!.map((c) => `x.${q(c)} = ${alias}.${q(c)}`).join(' AND ')})`

  // ── 2. Sementes ────────────────────────────────────────────────────────────
  await tx.$executeRawUnsafe(`INSERT INTO ${q(tmp.get(TENANTS)!)} SELECT ${cols(pk.get(TENANTS)!)} FROM ${q(TENANTS)} WHERE "id" = $1`, tenantId)
  for (const t of tenantTables) {
    await tx.$executeRawUnsafe(`INSERT INTO ${q(tmp.get(t)!)} SELECT ${cols(pk.get(t)!)} FROM ${q(t)} WHERE "tenantId" = $1`, tenantId)
  }

  // ── 3. Ponto fixo: filhas obrigatórias das linhas-alvo também são alvo ────
  const deleteEdges = edges.filter((e) => targets.has(e.parent) && targets.has(e.child) && isDeleteEdge(e))
  for (let round = 0; round < 50; round++) {
    let added = 0
    for (const e of deleteEdges) {
      const sql = `INSERT INTO ${q(tmp.get(e.child)!)}
         SELECT ${cols(pk.get(e.child)!, 'c')} FROM ${q(e.child)} c
          WHERE ${row(e.childCols, 'c')} IN (SELECT ${cols(e.parentCols, 'p')} FROM ${q(e.parent)} p WHERE ${inTargets(e.parent, 'p')})
            AND ${notYet(e.child, 'c')}${scope(e.child, 'c')}`
      added += sql.includes('$1') ? await tx.$executeRawUnsafe(sql, tenantId) : await tx.$executeRawUnsafe(sql)
    }
    if (!added) break
    if (round === 49) throw new Error('Grafo de dependências não convergiu.')
  }

  // ── Backup: entrega as linhas-alvo de cada tabela e desfaz tudo ──────────
  if (sink) {
    for (const t of targets) {
      const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT c.* FROM ${q(t)} c WHERE ${inTargets(t, 'c')}`)
      if (rows.length) await sink(t, rows)
    }
  }

  // Contagem pelo conjunto-alvo (e não pelo retorno do DELETE, que varia
  // conforme o CASCADE do banco apaga filhas antes da vez delas).
  const deleted: Record<string, number> = {}
  for (const t of targets) {
    const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${q(tmp.get(t)!)}`)
    if (Number(n)) deleted[t] = Number(n)
  }
  const totalRows = Object.values(deleted).reduce((a, b) => a + b, 0)
  if (sink) throw new DryRunRollback({ ok: true, dryRun: true, tenantId, deleted, nullified: {}, totalRows })

  // ── 4. Anula referências opcionais de linhas que ficam ────────────────────
  const nullified: Record<string, number> = {}
  for (const e of edges) {
    if (!targets.has(e.parent) || !isNullifyEdge(e)) continue
    const keep = targets.has(e.child) ? ` AND ${notYet(e.child, 'c')}` : ''
    const n = await tx.$executeRawUnsafe(
      `UPDATE ${q(e.child)} c SET ${e.childCols.map((col) => `${q(col)} = NULL`).join(', ')}
        WHERE ${row(e.childCols, 'c')} IN (SELECT ${cols(e.parentCols, 'p')} FROM ${q(e.parent)} p WHERE ${inTargets(e.parent, 'p')})${keep}`,
    )
    if (n) nullified[`${e.child}.${e.childCols.join('+')}`] = (nullified[`${e.child}.${e.childCols.join('+')}`] ?? 0) + n
  }

  // ── 5. DELETE em ondas (a ordem certa aparece sozinha) ────────────────────
  let pending = [...targets]
  let lastError = ''
  for (let wave = 0; pending.length && wave < targets.size + 5; wave++) {
    const next: string[] = []
    for (const t of pending) {
      await tx.$executeRawUnsafe('SAVEPOINT purge_sp')
      try {
        await tx.$executeRawUnsafe(`DELETE FROM ${q(t)} c WHERE ${inTargets(t, 'c')}`)
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT purge_sp')
      } catch (err) {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT purge_sp')
        lastError = `${t}: ${err instanceof Error ? err.message.split('\n').slice(-3).join(' ') : String(err)}`
        next.push(t)
      }
    }
    if (next.length === pending.length) break // nenhuma tabela andou nesta onda
    pending = next
  }
  if (pending.length) throw new Error(`Exclusão bloqueada por dados que não são da loja. Último erro — ${lastError}`)

  const result: PurgeResult = { ok: true, dryRun, tenantId, deleted, nullified, totalRows }
  if (dryRun) throw new DryRunRollback(result)
  return result
}

/**
 * Apaga (ou simula, com dryRun) todos os dados da loja. Com `sink`, entrega
 * cada tabela para backup e NUNCA apaga (vira simulação). Nunca lança: devolve
 * `ok: false` + `error` se algo impedir — e aí nada foi apagado.
 */
export async function purgeTenantData(
  tenantId: string,
  opts: { dryRun?: boolean; sink?: TableSink; timeoutMs?: number } = {},
): Promise<PurgeResult> {
  const dryRun = opts.dryRun ?? false
  try {
    return await prisma.$transaction((tx) => runPurge(tx, tenantId, dryRun || !!opts.sink, opts.sink), { timeout: opts.timeoutMs ?? 280_000, maxWait: 20_000 })
  } catch (err) {
    if (err instanceof DryRunRollback) return err.result
    return {
      ok: false, dryRun, tenantId, deleted: {}, nullified: {}, totalRows: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
