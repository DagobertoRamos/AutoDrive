// =============================================================================
// Documentos da venda (PURO, testado): HTML pronto para imprimir/PDF (A4).
//   • Contrato particular de compra e venda de veículo (com troca, quadro de
//     débitos e de pagamentos em forma de extrato e as cláusulas legais);
//   • Termo de sinal (arras) e reserva do veículo;
//   • Termo de intermediação (a loja como INTERMEDIADORA entre o proprietário
//     do veículo e o comprador — veículo de parceiro/particular/consignado).
// Base legal citada: Código Civil (arras arts. 417–420; vícios redibitórios
// arts. 441–446; evicção arts. 447–457; corretagem arts. 722–729; tradição
// art. 1.267; resolução art. 475), CDC (garantia legal art. 26, II; reparo
// art. 18, §1º; garantia contratual art. 50; foro art. 101, I), CTB (arts.
// 123, §1º e 134), CPC (art. 784, III) e LGPD (Lei 13.709/2018).
// Campo sem dado no cadastro sai como linha em branco para preencher à mão.
// =============================================================================

import { brl, extenso, type Statement } from './statement-core'

export type DocKind = 'VENDA' | 'SINAL' | 'INTERMEDIACAO'
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  VENDA: 'Contrato de compra e venda',
  SINAL: 'Termo de sinal e reserva',
  INTERMEDIACAO: 'Termo de intermediação',
}

export interface Party {
  tipo: 'PF' | 'PJ'
  nome: string
  documento?: string | null // CPF ou CNPJ (formatado)
  rg?: string | null
  ie?: string | null
  endereco?: string | null
  email?: string | null
  telefone?: string | null
  representante?: { nome: string; cpf?: string | null } | null
}

export interface VehicleData {
  marca?: string | null; modelo?: string | null; versao?: string | null
  anoFab?: number | null; anoModelo?: number | null
  cor?: string | null; combustivel?: string | null; cambio?: string | null
  placa?: string | null; renavam?: string | null; chassi?: string | null; km?: number | null
  valor?: number | null
  /** Financiamento a quitar (troca). */
  quitacao?: { banco?: string | null; valor?: number | null } | null
}

export interface ContractData {
  numero: string
  data: Date
  cidade?: string | null
  uf?: string | null
  logoUrl?: string | null
  loja: Party
  comprador: Party
  /** Dono do veículo quando a loja só intermedeia (parceiro, particular, consignado). */
  proprietario?: Party | null
  vendedorNome?: string | null
  veiculo: VehicleData
  trocas: VehicleData[]
  extrato: Statement
  garantias?: Array<{ nome: string; cobertura?: string | null; anos?: number | null; fornecedor?: string | null }>
  sinal?: { valor: number; data?: Date | null; forma?: string | null } | null
  reservaAte?: Date | null
  entregaPrevista?: Date | null
  /** Remuneração da intermediação (texto, ex.: "8% do valor da venda"). */
  comissao?: string | null
  financiado?: boolean
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const BLANK = '<span class="blank">____________________</span>'
const SHORT = '<span class="blank">__________</span>'
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const f = (v: unknown, blank = BLANK) => (v === null || v === undefined || String(v).trim() === '' ? blank : esc(v))
const dataBR = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : SHORT)
const dataExtenso = (d: Date) => new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
const money = (v: number) => `${brl(v)} (${extenso(v)})`

function qualifica(p: Party, papel: string): string {
  if (p.tipo === 'PJ') {
    return `<p class="party"><b>${papel}:</b> <b>${f(p.nome)}</b>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${f(p.documento)}${p.ie ? (/isent/i.test(p.ie) ? ', isenta de Inscrição Estadual' : `, Inscrição Estadual nº ${esc(p.ie)}`) : ''}, com sede em ${f(p.endereco)}${p.telefone ? `, telefone ${esc(p.telefone)}` : ''}${p.email ? `, e-mail ${esc(p.email)}` : ''}${p.representante?.nome ? `, neste ato representada por ${esc(p.representante.nome)}${p.representante.cpf ? `, CPF nº ${esc(p.representante.cpf)}` : ''}` : ', neste ato representada na forma de seu contrato social'}.</p>`
  }
  return `<p class="party"><b>${papel}:</b> <b>${f(p.nome)}</b>, nacionalidade ${SHORT}, estado civil ${SHORT}, profissão ${SHORT}, portador(a) do RG nº ${f(p.rg, SHORT)} e inscrito(a) no CPF sob o nº ${f(p.documento)}, residente e domiciliado(a) em ${f(p.endereco)}${p.telefone ? `, telefone ${esc(p.telefone)}` : ''}${p.email ? `, e-mail ${esc(p.email)}` : ''}.</p>`
}

function veiculoTabela(v: VehicleData, titulo?: string): string {
  const row = (a: string, b: unknown, c: string, d: unknown) => `<tr><th>${a}</th><td>${f(b, SHORT)}</td><th>${c}</th><td>${f(d, SHORT)}</td></tr>`
  return `${titulo ? `<p class="sub">${esc(titulo)}</p>` : ''}<table class="kv">
${row('Marca', v.marca, 'Modelo', [v.modelo, v.versao].filter(Boolean).join(' ') || null)}
${row('Ano fabricação', v.anoFab, 'Ano modelo', v.anoModelo)}
${row('Cor', v.cor, 'Combustível', v.combustivel)}
${row('Placa', v.placa, 'RENAVAM', v.renavam)}
${row('Chassi', v.chassi, 'Quilometragem', v.km != null ? `${Number(v.km).toLocaleString('pt-BR')} km (aprox.)` : null)}
${v.valor ? `<tr><th>Valor</th><td colspan="3"><b>${money(v.valor)}</b></td></tr>` : ''}
${v.quitacao?.valor ? `<tr><th>Financiamento a quitar</th><td colspan="3">${esc(v.quitacao.banco ?? 'instituição financeira')} — ${brl(v.quitacao.valor)}</td></tr>` : ''}
</table>`
}

function quadroDebitos(e: Statement): string {
  const rows = e.itens.map((l) => {
    const sinal = l.tipo === 'DESCONTO' ? '− ' : ''
    const sit = l.tipo === 'CORTESIA' ? '<span class="tag tag-c">Cortesia — não cobrado</span>' : l.tipo === 'DESCONTO' ? '<span class="tag tag-d">Desconto</span>' : 'Cobrado'
    return `<tr class="${l.tipo === 'CORTESIA' ? 'muted' : ''}"><td>${esc(l.descricao)}</td><td>${sit}</td><td class="r">${sinal}${brl(l.valor)}</td></tr>`
  }).join('\n')
  return `<table class="grid"><thead><tr><th>Descrição</th><th>Situação</th><th class="r">Valor</th></tr></thead><tbody>
${rows}
</tbody><tfoot><tr><td colspan="2"><b>TOTAL DEVIDO PELO COMPRADOR</b></td><td class="r"><b>${brl(e.totalDevido)}</b></td></tr></tfoot></table>
<p class="small">Itens marcados como <b>cortesia</b> são custeados pela loja e não compõem o valor devido. Descontos já estão abatidos do total.</p>`
}

function quadroPagamentos(e: Statement): string {
  const rows = e.pagamentos.map((p) => `<tr><td>${esc(p.forma)}${p.detalhe ? ` — ${esc(p.detalhe)}` : ''}</td><td>${p.data ? dataBR(p.data) : '—'}</td><td>${p.status === 'CONFIRMADO' ? 'Recebido' : 'A receber'}</td><td class="r">${brl(p.valor)}</td></tr>`).join('\n')
  const saldo = e.saldo > 0.009
    ? `<tr><td colspan="3"><b>SALDO A PAGAR PELO COMPRADOR</b></td><td class="r"><b>${brl(e.saldo)}</b></td></tr>`
    : e.saldo < -0.009 ? `<tr><td colspan="3"><b>VALOR A DEVOLVER AO COMPRADOR (troco/crédito)</b></td><td class="r"><b>${brl(-e.saldo)}</b></td></tr>`
    : '<tr><td colspan="3"><b>SALDO</b></td><td class="r"><b>Quitado</b></td></tr>'
  return `<table class="grid"><thead><tr><th>Forma de pagamento</th><th>Data</th><th>Situação</th><th class="r">Valor</th></tr></thead><tbody>
${rows || '<tr><td colspan="4">Nenhum pagamento lançado.</td></tr>'}
</tbody><tfoot><tr><td colspan="3"><b>TOTAL PAGO / A PAGAR CONFORME ACIMA</b></td><td class="r"><b>${brl(e.totalPago)}</b></td></tr>${saldo}</tfoot></table>`
}

function cabecalho(d: ContractData, titulo: string): string {
  const l = d.loja
  return `<header class="hd">
  ${d.logoUrl ? `<img class="logo" src="${esc(d.logoUrl)}" alt="">` : `<div class="logo-txt">${esc(l.nome)}</div>`}
  <div class="hd-info"><b>${esc(l.nome)}</b>${l.documento ? `<br>CNPJ ${esc(l.documento)}` : ''}${l.endereco ? `<br>${esc(l.endereco)}` : ''}${l.telefone || l.email ? `<br>${[l.telefone, l.email].filter(Boolean).map(esc).join(' · ')}` : ''}</div>
</header>
<h1>${esc(titulo)}</h1>
<p class="num">Nº ${esc(d.numero)} · ${dataBR(d.data)}</p>`
}

function assinaturas(partes: Array<{ papel: string; p: Party }>, d: ContractData): string {
  const box = (papel: string, p: Party) => `<div class="sig"><div class="line"></div><b>${esc(p.nome)}</b><br>${papel}${p.documento ? `<br>${p.tipo === 'PJ' ? 'CNPJ' : 'CPF'} ${esc(p.documento)}` : ''}</div>`
  const test = (n: number) => `<div class="sig"><div class="line"></div>Testemunha ${n}<br>Nome: ____________________<br>CPF: ____________________</div>`
  return `<p class="local">${f(d.cidade, SHORT)}${d.uf ? `/${esc(d.uf)}` : ''}, ${dataExtenso(d.data)}.</p>
<div class="sigs">${partes.map((x) => box(x.papel, x.p)).join('')}${test(1)}${test(2)}</div>`
}

const LGPD = (controlador: string) => `<b>Proteção de dados (LGPD).</b> As partes autorizam o tratamento de seus dados pessoais por ${controlador}, nos termos da Lei nº 13.709/2018, exclusivamente para a execução deste instrumento e de obrigações legais e regulatórias (art. 7º, II e V): emissão de documentos, transferência junto ao DETRAN, comunicação de venda, análise de crédito e financiamento, contratação de garantia e seguro, despachante e prestação de contas a órgãos públicos, podendo os dados ser compartilhados apenas com esses terceiros e para essas finalidades. Os dados serão guardados pelo prazo legal. O titular pode, a qualquer tempo, solicitar acesso, correção, informação sobre compartilhamento e demais direitos do art. 18 da LGPD pelos canais da loja.`

function cls(items: string[]): string {
  return `<ol class="cl">${items.map((t) => `<li>${t}</li>`).join('\n')}</ol>`
}

// ── 1. Contrato de compra e venda ───────────────────────────────────────────

export function renderSaleContract(d: ContractData): string {
  const inter = !!d.proprietario
  const vendedor = inter ? d.proprietario! : d.loja
  const vend = inter ? 'VENDEDOR(A)' : 'VENDEDORA'
  const e = d.extrato
  const temTroca = d.trocas.length > 0
  const garantias = d.garantias ?? []
  const clausulas: string[] = [
    `<b>Preço e pagamento.</b> O preço e todos os valores da operação são os do Quadro de Débitos, e a forma de pagamento é a do Quadro de Pagamentos, que integram este contrato. O valor total devido pelo COMPRADOR é de <b>${money(e.totalDevido)}</b>. Pagamentos por transferência, PIX, cartão ou cheque só se consideram realizados após a efetiva compensação/confirmação. ${e.saldo > 0.009 ? `O saldo de ${money(e.saldo)} deverá ser pago nas condições acima, sob pena de aplicação da cláusula de inadimplemento.` : ''}`,
    ...(d.financiado ? [`<b>Financiamento.</b> A parte do preço paga por financiamento depende da aprovação e da liberação do crédito pela instituição financeira, em nome do COMPRADOR, que responde integralmente pelo contrato de financiamento (parcelas, encargos e garantias). O veículo poderá ser gravado com alienação fiduciária em favor da instituição financeira até a quitação.`] : []),
    `<b>Estado do veículo e vistoria.</b> O COMPRADOR declara que, antes da assinatura, <b>examinou, vistoriou e testou o veículo</b>, e que teve <b>plena liberdade para submetê-lo à avaliação mecânica de profissional de sua confiança</b> e para realizar, <b>às suas expensas, laudo de vistoria cautelar</b> e consultas de procedência. Declara ter ciência de que se trata de veículo usado, com quilometragem aproximada e desgaste natural compatíveis com o ano e o uso, e que o recebe no estado em que se encontra, aprovado por ele.`,
    `<b>Garantia legal.</b> ${inter ? 'Responde pelos vícios ocultos do veículo o(a) VENDEDOR(A) proprietário(a), nos termos dos arts. 441 a 446 do Código Civil, sem prejuízo dos direitos assegurados ao COMPRADOR pela lei.' : `A VENDEDORA presta a garantia legal de <b>90 (noventa) dias</b>, contados da entrega, contra vícios ocultos que tornem o veículo impróprio ao uso (art. 26, II e §3º, do Código de Defesa do Consumidor). Constatado o vício, o COMPRADOR deverá comunicá-lo por escrito e apresentar o veículo à VENDEDORA, que terá até 30 (trinta) dias para saná-lo (art. 18, §1º, do CDC), em oficina por ela indicada.`} Não são vícios, e não estão cobertos, o desgaste natural e os itens de manutenção periódica (pneus, freios, embreagem, bateria, amortecedores, buchas, correias, velas, filtros, óleo e fluidos, lâmpadas, palhetas, estofamento, pintura e acabamento), nem danos causados por mau uso, acidente, falta de manutenção, combustível adulterado ou reparo/alteração por terceiros não autorizados.`,
    ...(garantias.length ? [`<b>Garantia contratual.</b> O COMPRADOR adquiriu, de forma complementar à garantia legal (art. 50 do CDC), ${garantias.map((g) => `<b>${esc(g.nome)}</b>${g.cobertura ? ` (${esc(g.cobertura)})` : ''}${g.anos ? `, por ${g.anos} ano(s)` : ''}${g.fornecedor ? `, fornecida por ${esc(g.fornecedor)}` : ''}`).join('; ')}, regida pelo certificado e pelas condições gerais entregues ao COMPRADOR, que declara conhecê-las.`] : []),
    `<b>Entrega e responsabilidade.</b> A propriedade se transfere com a tradição (art. 1.267 do Código Civil), na data e hora da entrega registradas no Termo de Recebimento abaixo${d.entregaPrevista ? `, prevista para ${dataBR(d.entregaPrevista)}` : ''}. A partir da entrega, o COMPRADOR responde civil, criminal e administrativamente pelo veículo, inclusive por infrações de trânsito, pontuação, pedágios, IPVA, licenciamento e seguro relativos a fatos posteriores. ${inter ? 'O(A) VENDEDOR(A)' : 'A VENDEDORA'} responde pelos débitos, multas e encargos cujo fato gerador seja anterior à entrega, salvo os lançados no Quadro de Débitos como de responsabilidade do COMPRADOR.`,
    `<b>Documentação e transferência.</b> O COMPRADOR obriga-se a promover a transferência de propriedade junto ao DETRAN no prazo de <b>30 (trinta) dias</b> (art. 123, §1º, do Código de Trânsito Brasileiro), sob pena de arcar com as penalidades daí decorrentes. ${inter ? 'O(A) VENDEDOR(A)' : 'A VENDEDORA'} fará a comunicação de venda ao órgão de trânsito (art. 134 do CTB). Os custos de documentação/transferência são os indicados no Quadro de Débitos (cobrados ou em cortesia).`,
    `<b>Procedência e evicção.</b> ${inter ? 'O(A) VENDEDOR(A)' : 'A VENDEDORA'} declara ser legítimo(a) proprietário(a) ou possuir poderes para a venda, garante a procedência do veículo e a inexistência de ônus, restrições ou pendências além das informadas neste instrumento, e responde pela evicção (arts. 447 a 457 do Código Civil).`,
    ...(temTroca ? [`<b>Veículo dado na troca.</b> O COMPRADOR entrega o(s) veículo(s) descrito(s) na seção própria como parte do pagamento, pelo valor ali indicado, e declara: (a) ser seu legítimo proprietário; (b) que o veículo está livre de ônus, restrições, adulterações, sinistro de grande monta e débitos, além dos expressamente informados e lançados no Quadro de Débitos (inclusive saldo de financiamento, cuja quitação autoriza); (c) que responde por multas, débitos e encargos com fato gerador anterior à entrega, pelos vícios ocultos (arts. 441 a 446 do CC) e pela evicção (art. 447 do CC). Compromete-se a entregar o documento de transferência (CRV/ATPV-e) devidamente preenchido e assinado. Constatada irregularidade não informada, o COMPRADOR pagará a diferença apurada ou a VENDEDORA poderá recusar o veículo, exigindo o pagamento do valor correspondente em dinheiro.`] : []),
    ...(d.sinal && d.sinal.valor > 0 ? [`<b>Sinal (arras).</b> O valor de ${money(d.sinal.valor)} pago a título de sinal tem natureza de arras confirmatórias e integra o preço (art. 417 do Código Civil). Em caso de desistência imotivada do COMPRADOR, o sinal ficará retido em favor ${inter ? 'do(a) VENDEDOR(A)' : 'da VENDEDORA'}; se a desistência for ${inter ? 'do(a) VENDEDOR(A)' : 'da VENDEDORA'}, este(a) devolverá o sinal mais o equivalente, com correção monetária (art. 418 do CC), podendo a parte prejudicada exigir indenização suplementar se provar maior prejuízo (art. 419 do CC).`] : []),
    `<b>Inadimplemento.</b> A falta de pagamento de qualquer valor nas condições ajustadas, inclusive por cheque devolvido, estorno ou contestação de pagamento, autoriza a parte prejudicada a exigir o cumprimento ou a resolução do contrato com a devolução do veículo, além de perdas e danos (art. 475 do CC), incidindo sobre o valor em atraso correção monetária pelo IPCA, juros de 1% ao mês e multa de 2%.`,
    LGPD(inter ? 'VENDEDOR(A), INTERMEDIADORA e COMPRADOR, cada qual no que lhe couber,' : 'VENDEDORA'),
    `<b>Disposições gerais.</b> Este contrato é celebrado em caráter irrevogável e irretratável, obriga as partes e seus sucessores, e, assinado por duas testemunhas, constitui título executivo extrajudicial (art. 784, III, do Código de Processo Civil). As partes declaram que leram e entenderam todas as cláusulas, que receberam cópia deste instrumento e que o assinam livremente.`,
    `<b>Foro.</b> Fica eleito o foro da comarca de ${f(d.cidade, SHORT)}${d.uf ? `/${esc(d.uf)}` : ''}, ressalvado ao COMPRADOR, quando consumidor, o direito de demandar no foro de seu domicílio (art. 101, I, do CDC).`,
  ]
  const partes = [{ papel: vend, p: vendedor }, ...(inter ? [{ papel: 'INTERMEDIADORA', p: d.loja }] : []), { papel: 'COMPRADOR(A)', p: d.comprador }]
  return wrap(`${cabecalho(d, 'CONTRATO PARTICULAR DE COMPRA E VENDA DE VEÍCULO AUTOMOTOR')}
<section><h2>Partes</h2>
${qualifica(vendedor, vend)}
${inter ? qualifica(d.loja, 'INTERMEDIADORA') : ''}
${qualifica(d.comprador, 'COMPRADOR(A)')}
<p>As partes acima identificadas têm entre si justo e contratado o presente instrumento, que se regerá pelas cláusulas seguintes${inter ? ', atuando a INTERMEDIADORA nos termos do Termo de Intermediação que integra esta venda' : ''}.</p></section>
<section><h2>1. Do objeto — veículo vendido</h2>${veiculoTabela(d.veiculo)}</section>
${temTroca ? `<section><h2>2. Do veículo dado na troca</h2>${d.trocas.map((t, i) => veiculoTabela(t, d.trocas.length > 1 ? `Veículo de troca ${i + 1}` : undefined)).join('')}</section>` : ''}
<section><h2>${temTroca ? '3' : '2'}. Quadro de débitos (composição do valor)</h2>${quadroDebitos(e)}</section>
<section><h2>${temTroca ? '4' : '3'}. Quadro de pagamentos (extrato)</h2>${quadroPagamentos(e)}</section>
<section><h2>${temTroca ? '5' : '4'}. Cláusulas</h2>${cls(clausulas)}</section>
${assinaturas(partes, d)}
<section class="receipt"><h2>Termo de recebimento do veículo</h2>
<p>Declaro que recebi o veículo descrito na cláusula 1, em <b>____/____/________</b>, às <b>____:____</b> h, com <b>__________ km</b>, nas condições vistoriadas e aprovadas, acompanhado de: ( ) chave principal ( ) chave reserva ( ) manual ( ) documento (CRLV) ( ) estepe, macaco e chave de roda.</p>
<div class="sigs"><div class="sig"><div class="line"></div><b>${esc(d.comprador.nome)}</b><br>COMPRADOR(A)</div></div></section>`)
}

// ── 2. Termo de sinal e reserva ─────────────────────────────────────────────

export function renderReservationTerm(d: ContractData): string {
  const inter = !!d.proprietario
  const vendedor = inter ? d.proprietario! : d.loja
  const vend = inter ? 'VENDEDOR(A)' : 'VENDEDORA'
  const sinal = d.sinal?.valor ?? 0
  const e = d.extrato
  const restante = Math.max(0, Math.round((e.totalDevido - sinal) * 100) / 100)
  const clausulas = [
    `<b>Sinal.</b> O COMPRADOR paga neste ato, a título de <b>sinal e princípio de pagamento</b>, o valor de <b>${sinal > 0 ? money(sinal) : `R$ ${SHORT}`}</b>${d.sinal?.forma ? `, por ${esc(d.sinal.forma)}` : ''}${d.sinal?.data ? `, em ${dataBR(d.sinal.data)}` : ''}, que tem natureza de <b>arras confirmatórias</b> e será abatido do preço na conclusão do negócio (art. 417 do Código Civil).`,
    `<b>Preço e saldo.</b> O valor total ajustado para a compra é de <b>${money(e.totalDevido)}</b>, conforme quadro abaixo, restando a pagar <b>${money(restante)}</b>, nas condições do quadro de pagamentos.`,
    `<b>Reserva.</b> ${inter ? 'O(A) VENDEDOR(A), por meio da INTERMEDIADORA, compromete-se' : 'A VENDEDORA compromete-se'} a manter o veículo reservado ao COMPRADOR, sem oferecê-lo ou vendê-lo a terceiros, até <b>${d.reservaAte ? dataBR(d.reservaAte) : `${SHORT}`}</b>, prazo em que o COMPRADOR deverá concluir o pagamento e assinar o contrato de compra e venda.`,
    `<b>Desistência do COMPRADOR.</b> <b>O COMPRADOR declara estar ciente de que, se desistir da compra, deixar de pagar o saldo ou não comparecer para concluir o negócio até o fim do prazo de reserva, perderá o valor pago como sinal</b>, que ficará retido em favor ${inter ? 'do(a) VENDEDOR(A)' : 'da VENDEDORA'} como compensação pela reserva e pela retirada do veículo de venda, nos termos do art. 418 do Código Civil, ficando o veículo liberado para venda.`,
    `<b>Desistência ${inter ? 'do(a) VENDEDOR(A)' : 'da VENDEDORA'}.</b> Se a desistência for ${inter ? 'do(a) VENDEDOR(A)' : 'da VENDEDORA'}, ${inter ? 'este(a)' : 'esta'} devolverá ao COMPRADOR o sinal mais o equivalente, com correção monetária (art. 418 do Código Civil).`,
    `<b>Financiamento.</b> Se parte do preço depender de financiamento e o crédito for recusado pela instituição financeira <b>sem culpa do COMPRADOR</b> (informações verdadeiras e documentação completa entregues no prazo), o sinal será devolvido integralmente em até 10 (dez) dias úteis, desfazendo-se a reserva sem outras penalidades. Informação falsa ou omissão do COMPRADOR equivale à desistência.`,
    `<b>Indenização suplementar.</b> A parte prejudicada poderá pedir indenização suplementar se provar prejuízo maior que o valor do sinal (art. 419 do Código Civil).`,
    `<b>Estado do veículo.</b> O COMPRADOR declara que vistoriou o veículo e que teve liberdade para realizar avaliação mecânica e laudo cautelar, por sua conta, antes da conclusão do negócio. As condições de garantia, entrega, documentação e transferência serão as do contrato de compra e venda.`,
    LGPD(inter ? 'VENDEDOR(A), INTERMEDIADORA e COMPRADOR, cada qual no que lhe couber,' : 'VENDEDORA'),
    `<b>Foro.</b> Fica eleito o foro da comarca de ${f(d.cidade, SHORT)}${d.uf ? `/${esc(d.uf)}` : ''}, ressalvado ao COMPRADOR, quando consumidor, o foro de seu domicílio (art. 101, I, do CDC).`,
  ]
  const partes = [{ papel: vend, p: vendedor }, ...(inter ? [{ papel: 'INTERMEDIADORA', p: d.loja }] : []), { papel: 'COMPRADOR(A)', p: d.comprador }]
  return wrap(`${cabecalho(d, 'TERMO DE SINAL (ARRAS) E RESERVA DE VEÍCULO')}
<section><h2>Partes</h2>${qualifica(vendedor, vend)}${inter ? qualifica(d.loja, 'INTERMEDIADORA') : ''}${qualifica(d.comprador, 'COMPRADOR(A)')}</section>
<section><h2>1. Veículo reservado</h2>${veiculoTabela(d.veiculo)}</section>
${d.trocas.length ? `<section><h2>2. Veículo oferecido na troca</h2>${d.trocas.map((t) => veiculoTabela(t)).join('')}<p class="small">O valor da troca está sujeito à vistoria e às condições do contrato de compra e venda.</p></section>` : ''}
<section><h2>${d.trocas.length ? '3' : '2'}. Quadro de débitos</h2>${quadroDebitos(e)}</section>
<section><h2>${d.trocas.length ? '4' : '3'}. Quadro de pagamentos</h2>${quadroPagamentos(e)}</section>
<section><h2>${d.trocas.length ? '5' : '4'}. Cláusulas</h2>${cls(clausulas)}</section>
<p class="aware"><b>Declaração do COMPRADOR:</b> li este termo e estou ciente de que <b>posso perder o sinal pago em caso de desistência</b>, conforme os arts. 417 a 419 do Código Civil.</p>
${assinaturas(partes, d)}`)
}

// ── 3. Termo de intermediação ───────────────────────────────────────────────

export function renderIntermediationTerm(d: ContractData): string {
  const prop = d.proprietario ?? { tipo: 'PF' as const, nome: '' }
  const e = d.extrato
  const clausulas = [
    `<b>Natureza da intermediação.</b> A INTERMEDIADORA atua exclusivamente na <b>aproximação e intermediação</b> entre o(a) PROPRIETÁRIO(A) e o COMPRADOR, nos termos dos arts. 722 a 729 do Código Civil (corretagem). A INTERMEDIADORA <b>não é proprietária nem vendedora do veículo</b>; a compra e venda é celebrada diretamente entre o(a) PROPRIETÁRIO(A) e o COMPRADOR.`,
    `<b>Preço.</b> O preço total da operação é de <b>${money(e.totalDevido)}</b>, conforme o Quadro de Débitos, pago na forma do Quadro de Pagamentos. Os valores recebidos pela INTERMEDIADORA o são <b>em nome e por conta do(a) PROPRIETÁRIO(A)</b> e serão a ele(a) repassados, deduzida a remuneração da intermediação e eventuais despesas por ele(a) autorizadas, com prestação de contas.`,
    `<b>Remuneração da INTERMEDIADORA.</b> Pela intermediação, a INTERMEDIADORA fará jus a <b>${d.comissao ? esc(d.comissao) : `${SHORT}`}</b>, devida pelo(a) PROPRIETÁRIO(A) com a conclusão do negócio (art. 725 do Código Civil), salvo ajuste diverso por escrito.`,
    `<b>Obrigações do(a) PROPRIETÁRIO(A).</b> Declara ser o legítimo proprietário do veículo, livre de ônus, restrições, adulterações e débitos além dos informados, e responde pela procedência, pelos débitos, multas e encargos com fato gerador anterior à entrega, pelos vícios ocultos (arts. 441 a 446 do CC) e pela evicção (arts. 447 a 457 do CC). Obriga-se a entregar o documento de transferência (CRV/ATPV-e) preenchido e assinado e a fazer a comunicação de venda (art. 134 do CTB).`,
    `<b>Obrigações da INTERMEDIADORA.</b> Executar a intermediação com diligência e prudência, prestando às partes as informações sobre o andamento do negócio, a documentação e os riscos de que tenha conhecimento (art. 723 do CC), conferindo a documentação e as consultas de débitos e restrições disponíveis, e guardando o veículo enquanto estiver sob sua posse. A INTERMEDIADORA não responde pelas obrigações próprias do(a) PROPRIETÁRIO(A) e do COMPRADOR, nem por vícios ocultos não aparentes, salvo culpa própria, sem prejuízo dos direitos assegurados em lei.`,
    `<b>Ciência do COMPRADOR.</b> O COMPRADOR declara que sabe que adquire o veículo do(a) PROPRIETÁRIO(A) por intermédio da INTERMEDIADORA; que <b>vistoriou e testou o veículo</b>, teve <b>plena liberdade para realizar avaliação mecânica</b> com profissional de sua confiança e <b>laudo cautelar por sua conta</b>; e que o recebe no estado em que se encontra, aprovado por ele.`,
    ...(d.sinal && d.sinal.valor > 0 ? [`<b>Sinal.</b> O sinal de ${money(d.sinal.valor)} tem natureza de arras confirmatórias e integra o preço (art. 417 do CC). Havendo desistência imotivada do COMPRADOR, o sinal será perdido em favor do(a) PROPRIETÁRIO(A); se a desistência for do(a) PROPRIETÁRIO(A), este(a) devolverá o sinal mais o equivalente (art. 418 do CC). A remuneração da INTERMEDIADORA também será devida se o negócio não se concretizar por arrependimento das partes (art. 725 do CC).`] : []),
    `<b>Transferência.</b> A transferência será feita diretamente do(a) PROPRIETÁRIO(A) para o COMPRADOR, que deverá promovê-la no DETRAN em até 30 (trinta) dias (art. 123, §1º, do CTB). A partir da entrega, o COMPRADOR responde pelo veículo e por infrações e encargos posteriores.`,
    LGPD('PROPRIETÁRIO(A), INTERMEDIADORA e COMPRADOR, cada qual no que lhe couber,'),
    `<b>Disposições gerais e foro.</b> Este termo integra a compra e venda do veículo, obriga as partes e seus sucessores e, assinado por duas testemunhas, constitui título executivo extrajudicial (art. 784, III, do CPC). Fica eleito o foro da comarca de ${f(d.cidade, SHORT)}${d.uf ? `/${esc(d.uf)}` : ''}, ressalvado ao COMPRADOR, quando consumidor, o foro de seu domicílio (art. 101, I, do CDC).`,
  ]
  return wrap(`${cabecalho(d, 'TERMO DE INTERMEDIAÇÃO DE COMPRA E VENDA DE VEÍCULO')}
<section><h2>Partes</h2>${qualifica(prop as Party, 'PROPRIETÁRIO(A)/VENDEDOR(A)')}${qualifica(d.loja, 'INTERMEDIADORA')}${qualifica(d.comprador, 'COMPRADOR(A)')}</section>
<section><h2>1. Veículo intermediado</h2>${veiculoTabela(d.veiculo)}</section>
${d.trocas.length ? `<section><h2>2. Veículo dado na troca</h2>${d.trocas.map((t) => veiculoTabela(t)).join('')}</section>` : ''}
<section><h2>${d.trocas.length ? '3' : '2'}. Quadro de débitos</h2>${quadroDebitos(e)}</section>
<section><h2>${d.trocas.length ? '4' : '3'}. Quadro de pagamentos</h2>${quadroPagamentos(e)}</section>
<section><h2>${d.trocas.length ? '5' : '4'}. Cláusulas</h2>${cls(clausulas)}</section>
${assinaturas([{ papel: 'PROPRIETÁRIO(A)/VENDEDOR(A)', p: prop as Party }, { papel: 'INTERMEDIADORA', p: d.loja }, { papel: 'COMPRADOR(A)', p: d.comprador }], d)}`)
}

export function renderDocument(kind: DocKind, d: ContractData): string {
  return kind === 'SINAL' ? renderReservationTerm(d) : kind === 'INTERMEDIACAO' ? renderIntermediationTerm(d) : renderSaleContract(d)
}

// ── Estilo (escopo .ad-doc; serve na tela e na impressão A4) ─────────────────

const CSS = `
.ad-doc{font-family:Georgia,'Times New Roman',serif;color:#111;font-size:11.5pt;line-height:1.45;max-width:800px;margin:0 auto;background:#fff;padding:24px}
.ad-doc .hd{display:flex;align-items:center;gap:16px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
.ad-doc .logo{max-height:64px;max-width:200px;object-fit:contain}
.ad-doc .logo-txt{font:700 18pt Arial,sans-serif}
.ad-doc .hd-info{font:9pt Arial,sans-serif;color:#333;margin-left:auto;text-align:right}
.ad-doc h1{font:700 13.5pt Arial,sans-serif;text-align:center;margin:8px 0 2px;letter-spacing:.3px}
.ad-doc .num{text-align:center;font:9pt Arial,sans-serif;color:#555;margin:0 0 12px}
.ad-doc h2{font:700 10.5pt Arial,sans-serif;text-transform:uppercase;border-bottom:1px solid #999;margin:16px 0 6px;padding-bottom:2px}
.ad-doc p{margin:6px 0;text-align:justify}
.ad-doc .party{margin:6px 0}
.ad-doc .sub{font:700 10pt Arial,sans-serif;margin:8px 0 4px}
.ad-doc table{width:100%;border-collapse:collapse;font:9.5pt Arial,sans-serif;margin:4px 0 6px}
.ad-doc .kv th{background:#f3f4f6;text-align:left;width:18%;font-weight:600}
.ad-doc .kv th,.ad-doc .kv td,.ad-doc .grid th,.ad-doc .grid td{border:1px solid #bbb;padding:4px 6px;vertical-align:top}
.ad-doc .grid thead th{background:#111;color:#fff;text-align:left}
.ad-doc .grid tfoot td{background:#f3f4f6}
.ad-doc .r{text-align:right;white-space:nowrap}
.ad-doc .muted td{color:#555}
.ad-doc .tag{font-size:8.5pt;padding:1px 6px;border-radius:8px;white-space:nowrap}
.ad-doc .tag-c{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
.ad-doc .tag-d{background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe}
.ad-doc .small{font-size:9pt;color:#444}
.ad-doc .cl{padding-left:22px;margin:4px 0}
.ad-doc .cl li{margin:5px 0;text-align:justify}
.ad-doc .aware{border:1.5px solid #111;padding:8px 10px;margin:12px 0;background:#fafafa}
.ad-doc .blank{color:#777;letter-spacing:-1px}
.ad-doc .local{margin-top:18px}
.ad-doc .sigs{display:grid;grid-template-columns:1fr 1fr;gap:28px 36px;margin-top:22px;font:9pt Arial,sans-serif;text-align:center}
.ad-doc .sig .line{border-top:1px solid #111;margin:28px 0 4px}
.ad-doc .receipt{margin-top:26px;border-top:1px dashed #999;padding-top:6px}
@media print{.ad-doc{padding:0;max-width:none}.ad-doc section{break-inside:auto}.ad-doc .sigs,.ad-doc .receipt,.ad-doc tr{break-inside:avoid}}
`

function wrap(body: string): string {
  return `<div class="ad-doc"><style>${CSS}</style>${body}</div>`
}

/** Página completa para imprimir/salvar em PDF. */
export function printablePage(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>@page{size:A4;margin:16mm 14mm}body{margin:0;background:#e5e7eb}.bar{position:sticky;top:0;background:#111;color:#fff;font:14px Arial,sans-serif;padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between}.bar button{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}@media print{.bar{display:none}body{background:#fff}}</style></head>
<body><div class="bar"><span>${esc(title)}</span><button onclick="window.print()">Imprimir / salvar PDF</button></div><div style="padding:16px 0">${bodyHtml}</div></body></html>`
}
