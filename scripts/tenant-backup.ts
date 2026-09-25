// =============================================================================
// scripts/tenant-backup.ts — backup COMPLETO de uma loja antes da exclusão
// automática (prazo de guarda de 5 anos). Exporta exatamente as linhas que o
// motor de exclusão apagaria: dados em JSON (1 arquivo por tabela) e arquivos
// guardados no banco (fotos, PDFs, CRLVs, logos...) como arquivos soltos.
//   npx tsx scripts/tenant-backup.ts <tenantId> [pastaDestino]
// Usa o DATABASE_URL do ambiente (produção = Neon). Só LÊ — não altera nada.
// =============================================================================

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { purgeTenantData } from '../src/lib/tenant-lifecycle/purge'

const safe = (s: string) => s.replace(/[^\w.\-]+/g, '_').slice(0, 120)

async function main() {
  const tenantId = process.argv[2]
  if (!tenantId) throw new Error('uso: tenant-backup.ts <tenantId> [pastaDestino]')
  const stamp = new Date().toISOString().slice(0, 10)
  const out = path.resolve(process.argv[3] ?? `backup-loja-${tenantId}-${stamp}`)
  await fs.mkdir(path.join(out, 'dados'), { recursive: true })

  let files = 0
  const r = await purgeTenantData(tenantId, {
    timeoutMs: 15 * 60_000,
    sink: async (table, rows) => {
      const plain = []
      for (const row of rows) {
        const obj: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(row)) {
          if (v instanceof Uint8Array) {
            const dir = path.join(out, 'arquivos', table)
            await fs.mkdir(dir, { recursive: true })
            const name = safe(`${row.id ?? files}_${String(row.fileName ?? row.filename ?? row.originalName ?? k)}`)
            await fs.writeFile(path.join(dir, name), v)
            obj[k] = { arquivo: `arquivos/${table}/${name}`, bytes: v.byteLength }
            files++
          } else {
            obj[k] = typeof v === 'bigint' ? v.toString() : v
          }
        }
        plain.push(obj)
      }
      await fs.writeFile(path.join(out, 'dados', `${table}.json`), JSON.stringify(plain, null, 1))
      console.log(`${table}: ${rows.length}`)
    },
  })
  if (!r.ok) throw new Error(r.error)
  await fs.writeFile(path.join(out, 'resumo.json'), JSON.stringify({ tenantId, geradoEm: new Date().toISOString(), linhasPorTabela: r.deleted, totalLinhas: r.totalRows, arquivos: files }, null, 2))
  console.log(`\nBackup em ${out} — ${r.totalRows} linhas, ${files} arquivos.`)
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
