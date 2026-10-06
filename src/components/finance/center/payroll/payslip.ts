// Recibo / holerite gerencial do colaborador — HTML próprio para impressão
// (abre numa janela nova e chama a impressão do navegador).

import type { PayrollEmployee } from './types'

const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateBR = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '')

export function payslipHtml(emp: PayrollEmployee, month: string, tenant: { name: string; cnpj: string | null }): string {
  const [y, m] = month.split('-')
  const s = emp.summary
  const earnings: { label: string; ref?: string; value: number }[] = []
  for (const e of emp.entries.filter((x) => x.kind !== 'ADIANTAMENTO')) {
    earnings.push({ label: e.description, ref: e.kind === 'BENEFICIO' ? 'Benefício' : 'Salário', value: e.kind === 'SALARIO' ? (e.originalAmount ?? e.amount) : e.amount })
  }
  for (const t of s.commissions.byType) earnings.push({ label: `Comissões — ${t.label}`, ref: `${t.count} lanç.`, value: t.total })

  const discounts: { label: string; ref?: string; value: number }[] = emp.entries
    .filter((e) => e.kind === 'ADIANTAMENTO' && e.status === 'PAGO' && (!e.discountedMonth || e.discountedMonth === month))
    .map((e) => ({ label: e.description, ref: dateBR(e.paidDate ?? e.date), value: e.amount }))

  const totalEarn = earnings.reduce((a, b) => a + b.value, 0)
  const totalDisc = discounts.reduce((a, b) => a + b.value, 0)
  const net = Math.max(0, totalEarn - totalDisc)
  const row = (r: { label: string; ref?: string; value: number }, sign: '' | '-') =>
    `<tr><td>${esc(r.label)}</td><td class="c">${esc(r.ref ?? '')}</td><td class="r">${sign === '-' ? '' : brl(r.value)}</td><td class="r">${sign === '-' ? brl(r.value) : ''}</td></tr>`

  const comDetail = emp.commissions.length
    ? `<h3>Comissões do período</h3><table><thead><tr><th>Descrição</th><th class="c">Tipo</th><th class="c">Situação</th><th class="r">Valor</th></tr></thead><tbody>${
      emp.commissions.map((c) => `<tr><td>${esc(c.description)}</td><td class="c">${esc(c.label)}</td><td class="c">${c.paid ? 'Paga' : 'A pagar'}</td><td class="r">${brl(c.value)}</td></tr>`).join('')
    }</tbody></table>`
    : ''

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${esc(emp.name)} ${m}/${y}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
  h1{font-size:16px;margin:0} h2{font-size:13px;margin:2px 0 0;font-weight:normal;color:#444} h3{font-size:12px;margin:18px 0 6px}
  .head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px;margin-bottom:12px} .grid div span{display:block;color:#666;font-size:10px;text-transform:uppercase}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:5px 6px} th{background:#f2f2f2;font-size:10px;text-transform:uppercase;text-align:left}
  .r{text-align:right;white-space:nowrap} .c{text-align:center} tfoot td{font-weight:bold;background:#fafafa}
  .net{margin-top:10px;display:flex;justify-content:flex-end;font-size:14px;font-weight:bold;gap:16px}
  .sign{margin-top:48px;display:flex;justify-content:space-between;gap:40px} .sign div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center}
  .note{color:#666;font-size:10px;margin-top:14px}
  @media print{body{margin:10mm}}
</style></head><body>
<div class="head"><div><h1>${esc(tenant.name)}</h1>${tenant.cnpj ? `<h2>CNPJ ${esc(tenant.cnpj)}</h2>` : ''}</div>
<div style="text-align:right"><h1>Recibo de pagamento</h1><h2>Competência ${m}/${y}</h2></div></div>
<div class="grid">
  <div><span>Colaborador</span>${esc(emp.name)}</div>
  <div><span>Cargo</span>${esc(emp.cargo ?? '—')}</div>
  <div><span>Unidade</span>${esc(emp.unit ?? '—')}</div>
  ${emp.cpf ? `<div><span>CPF</span>${esc(emp.cpf)}</div>` : ''}
</div>
<table><thead><tr><th>Descrição</th><th class="c">Referência</th><th class="r">Proventos</th><th class="r">Descontos</th></tr></thead>
<tbody>${earnings.map((r) => row(r, '')).join('')}${discounts.map((r) => row(r, '-')).join('')}${!earnings.length && !discounts.length ? '<tr><td colspan="4" class="c">Sem valores no mês.</td></tr>' : ''}</tbody>
<tfoot><tr><td colspan="2">Totais</td><td class="r">${brl(totalEarn)}</td><td class="r">${brl(totalDisc)}</td></tr></tfoot></table>
<div class="net"><span>Líquido</span><span>${brl(net)}</span></div>
${comDetail}
<div class="sign"><div>${esc(tenant.name)}</div><div>${esc(emp.name)}</div></div>
<p class="note">Documento gerencial, sem valor de holerite oficial (folha CLT). Emitido em ${new Date().toLocaleString('pt-BR')}.</p>
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
</body></html>`
}

export function openPayslip(emp: PayrollEmployee, month: string, tenant: { name: string; cnpj: string | null }) {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return false
  w.document.open()
  w.document.write(payslipHtml(emp, month, tenant))
  w.document.close()
  return true
}
