// =============================================================================
// Procurações e termos de entrega da venda (PURO, testado). HTML A4.
//   • Procuração do VEÍCULO VENDIDO — o cliente (comprador) nomeia os
//     outorgados para transferir o veículo ao nome dele, inclusive assinando os
//     campos de comprador e de vendedor da ATPV-e/CRV (art. 654 do CC).
//   • Procuração do VEÍCULO DA TROCA/COMPRA — o cliente (proprietário) dá
//     poderes amplos, em causa própria, irrevogável (arts. 684 e 685 do CC).
//   • Procuração para INDICAÇÃO DE CONDUTOR (transferência de pontos) — art.
//     257, §7º, do CTB e Resolução CONTRAN nº 918/2022.
//   • Termos de ENTREGA E RESPONSABILIDADE — veículo vendido (entregue ao
//     comprador) e veículo da troca/compra (entregue à loja): data/hora/km,
//     itens, responsabilidade civil, criminal e administrativa a partir da
//     tradição (art. 1.267 do CC; arts. 123, §1º, e 134 do CTB).
// Campo sem dado sai em branco para preencher à mão.
// =============================================================================

import {
  assinaturas, BLANK, cabecalho, cls, dataBR, esc, f, qualifica, SHORT, veiculoTabela, wrap,
  type ContractData, type Party, type VehicleData,
} from './documents-core'
import { extenso } from './statement-core'

export type ProxyKind = 'PROC_VENDA' | 'PROC_TROCA' | 'PROC_MULTAS_VENDA' | 'PROC_MULTAS_TROCA' | 'ENTREGA_VENDA' | 'ENTREGA_TROCA'
export const PROXY_KIND_LABEL: Record<ProxyKind, string> = {
  PROC_VENDA: 'Procuração — veículo vendido',
  PROC_TROCA: 'Procuração — veículo da troca/compra',
  PROC_MULTAS_VENDA: 'Procuração de indicação de condutor — veículo vendido',
  PROC_MULTAS_TROCA: 'Procuração de indicação de condutor — veículo da troca/compra',
  ENTREGA_VENDA: 'Termo de entrega e responsabilidade — veículo vendido',
  ENTREGA_TROCA: 'Termo de entrega e responsabilidade — veículo da troca/compra',
}
export const isProxyKind = (x: unknown): x is ProxyKind => typeof x === 'string' && x in PROXY_KIND_LABEL

type Outorgado = NonNullable<ContractData['outorgados']>[number]

function qualificaOutorgado(o: Outorgado): string {
  return `<b>${f(o.nome)}</b>, ${f(o.nacionalidade, SHORT)}, ${f(o.estadoCivil, SHORT)}, ${f(o.profissao, SHORT)}, portador(a) do RG nº ${f(o.rg, SHORT)}${o.orgaoRg ? ` ${esc(o.orgaoRg)}` : ''} e inscrito(a) no CPF sob o nº ${f(o.cpf)}, residente e domiciliado(a) em ${f(o.endereco)}`
}

function outorgadosBloco(d: ContractData): string {
  const list = d.outorgados ?? []
  if (!list.length) return `<p class="party"><b>OUTORGADO(S):</b> ${BLANK}, nacionalidade ${SHORT}, estado civil ${SHORT}, profissão ${SHORT}, portador(a) do RG nº ${SHORT} e inscrito(a) no CPF sob o nº ${BLANK}, residente e domiciliado(a) em ${BLANK}.</p>`
  return `<p class="party"><b>OUTORGADO${list.length > 1 ? 'S' : ''}:</b> ${list.map(qualificaOutorgado).join('; ')}${list.length > 1 ? ', aos quais confere poderes para agir <b>em conjunto ou separadamente</b>, independentemente da ordem de nomeação' : ''}.</p>`
}

const firma = (d: ContractData) => (d.firmaReconhecida === false ? '' : '<p class="small"><b>Reconhecimento de firma:</b> a assinatura do(a) OUTORGANTE deve ser reconhecida em cartório, por autenticidade, para uso perante o DETRAN e terceiros (art. 654, §2º, do Código Civil).</p>')

function assinaturaOutorgante(p: Party, d: ContractData): string {
  return `<p class="local">${f(d.cidade, SHORT)}${d.uf ? `/${esc(d.uf)}` : ''}, ${dataBR(d.data)}.</p>
<div class="sigs"><div class="sig"><div class="line"></div><b>${esc(p.nome)}</b><br>OUTORGANTE${p.documento ? `<br>${p.tipo === 'PJ' ? 'CNPJ' : 'CPF'} ${esc(p.documento)}` : ''}</div></div>`
}

const veiculosDe = (list: VehicleData[] | undefined, titulo: string) => (list?.length ? list.map((v, i) => veiculoTabela(v, list.length > 1 ? `${titulo} ${i + 1}` : undefined)).join('') : veiculoTabela({}))
const placa = (v?: VehicleData) => (v?.placa ? ` placa ${esc(v.placa)}` : '')

// ── Procuração do veículo vendido (cliente comprador outorga) ───────────────
export function renderProcVenda(d: ContractData): string {
  const dias = d.validadeProcuracaoDias ?? 180
  const poderes = [
    `promover a <b>transferência da propriedade</b> do veículo descrito para o nome do OUTORGANTE, <b>assinando em seu nome a Autorização para Transferência de Propriedade de Veículo (ATPV-e) e/ou o Certificado de Registro de Veículo (CRV), inclusive nos campos de COMPRADOR e de VENDEDOR</b>, e todos os requerimentos necessários;`,
    'requerer, assinar e retirar CRV, CRLV/CRLV-e, segundas vias, licenciamento, vistoria, laudo, emplacamento, alteração de características e de município;',
    'requerer a inclusão e a baixa de alienação fiduciária, reserva de domínio e demais gravames, assinando o que for necessário perante a instituição financeira;',
    'pagar e emitir guias de taxas, IPVA, seguro obrigatório, licenciamento e multas;',
    'fazer e acompanhar a comunicação de venda e quaisquer comunicações ao órgão de trânsito;',
    'indicar o OUTORGANTE como condutor de infrações cometidas com o veículo a partir da data de sua entrega, assinando o formulário de identificação de condutor;',
    'assinar declarações, requerimentos e termos, juntar e retirar documentos, prestar informações e praticar todos os demais atos necessários ao fiel cumprimento deste mandato;',
    'substabelecer, no todo ou em parte, com ou sem reserva de poderes.',
  ]
  return wrap(`${cabecalho(d, 'PROCURAÇÃO PARTICULAR — VEÍCULO ADQUIRIDO')}
<section><h2>Partes</h2>
${qualifica(d.comprador, 'OUTORGANTE')}
${outorgadosBloco(d)}</section>
<section><h2>Veículo</h2>${veiculoTabela({ ...d.veiculo, valor: null })}</section>
<section><h2>Poderes</h2>
<p>Pelo presente instrumento particular de mandato (arts. 653 e seguintes do Código Civil), o(a) OUTORGANTE nomeia e constitui seu(s) bastante(s) procurador(es) o(s) OUTORGADO(S) acima qualificado(s), com poderes para representá-lo(a) perante o <b>DETRAN de qualquer Estado da Federação, CIRETRANs, Poupatempo, SENATRAN, polícias rodoviárias, prefeituras, secretarias da Fazenda, cartórios, instituições financeiras e seguradoras</b>, especialmente para, em relação ao veículo acima${placa(d.veiculo)}, adquirido na negociação nº ${esc(d.numero)}:</p>
${cls(poderes)}
<p>Esta procuração é válida por <b>${dias} (${extenso(dias).replace(/ reais?$/, '')}) dias</b> a contar desta data, ou até a conclusão da transferência, o que ocorrer primeiro.</p>
${firma(d)}</section>
${assinaturaOutorgante(d.comprador, d)}`)
}

// ── Procuração do veículo da troca/compra (em causa própria) ────────────────
export function renderProcTroca(d: ContractData): string {
  const veics = d.entrada ?? d.trocas
  const poderes = [
    '<b>vender, prometer vender, ceder e transferir</b> o veículo, inclusive para si mesmos ou para quem indicarem (art. 117 do Código Civil), pelo preço e nas condições que ajustarem, receber valores e dar a respectiva quitação;',
    '<b>assinar em nome do OUTORGANTE a Autorização para Transferência de Propriedade de Veículo (ATPV-e) e/ou o CRV, nos campos de VENDEDOR e de COMPRADOR</b>, preencher e reconhecer firmas, requerer a transferência e todos os atos de registro;',
    'requerer e retirar CRV, CRLV/CRLV-e, segundas vias, licenciamento, vistoria, laudos, alteração de características, emplacamento e mudança de município;',
    'quitar o financiamento junto à instituição financeira, receber o termo de quitação e requerer a <b>baixa de alienação fiduciária</b>, reserva de domínio ou qualquer gravame;',
    'pagar débitos de IPVA, licenciamento, seguro obrigatório, taxas e multas, emitir guias, apresentar defesas e recursos de infrações;',
    'fazer a comunicação de venda ao órgão de trânsito e indicar o condutor de infrações conforme o termo de entrega;',
    'representar o OUTORGANTE perante o DETRAN de qualquer Estado, CIRETRANs, Poupatempo, SENATRAN, polícias, prefeituras, secretarias da Fazenda, Receita Federal, cartórios, bancos, financeiras e seguradoras, assinando requerimentos, declarações, contratos e termos;',
    'substabelecer, no todo ou em parte, com ou sem reserva de poderes.',
  ]
  return wrap(`${cabecalho(d, 'PROCURAÇÃO PARTICULAR EM CAUSA PRÓPRIA — VEÍCULO ENTREGUE À LOJA')}
<section><h2>Partes</h2>
${qualifica(d.comprador, 'OUTORGANTE (PROPRIETÁRIO)')}
${outorgadosBloco(d)}</section>
<section><h2>Veículo</h2>${veiculosDe(veics, 'Veículo')}</section>
<section><h2>Poderes</h2>
<p>Pelo presente instrumento, o(a) OUTORGANTE, legítimo(a) proprietário(a) do(s) veículo(s) acima, nomeia e constitui seu(s) bastante(s) procurador(es) o(s) OUTORGADO(S), conferindo-lhes <b>amplos, gerais e ilimitados poderes</b> sobre o(s) referido(s) veículo(s), especialmente para:</p>
${cls(poderes)}
<p><b>Causa própria e irrevogabilidade.</b> Esta procuração é outorgada <b>em causa própria</b>, em caráter <b>irrevogável e irretratável</b>, nos termos dos arts. 684 e 685 do Código Civil, por ter sido o veículo entregue à ${esc(d.loja.nome)} como parte do pagamento ou objeto de compra na negociação nº ${esc(d.numero)}, cujo valor o(a) OUTORGANTE declara ter recebido ou ter sido abatido do preço. Os OUTORGADOS ficam dispensados de prestar contas, e o mandato não se extingue pela morte ou incapacidade de qualquer das partes.</p>
<p>O(A) OUTORGANTE declara que o veículo está livre de ônus, restrições, adulterações e débitos além dos informados na negociação, e responde pela evicção e pelos vícios ocultos (arts. 441 e 447 do Código Civil) e pelas infrações e débitos com fato gerador anterior à entrega.</p>
${firma(d)}</section>
${assinaturaOutorgante(d.comprador, d)}`)
}

// ── Procuração para indicação de condutor (pontos) ──────────────────────────
function renderProcMultas(d: ContractData, lado: 'VENDA' | 'TROCA'): string {
  const veics = lado === 'VENDA' ? [d.veiculo] : (d.entrada ?? d.trocas)
  const periodo = lado === 'VENDA'
    ? `ocorridas <b>a partir da data e hora em que o veículo lhe foi entregue</b> (registradas no termo de entrega) <b>até a efetiva transferência</b> da propriedade para o seu nome`
    : `ocorridas <b>até a data e hora em que o veículo foi entregue à ${esc(d.loja.nome)}</b> (registradas no termo de entrega), período em que esteve na posse do(a) OUTORGANTE`
  return wrap(`${cabecalho(d, 'PROCURAÇÃO PARA INDICAÇÃO DE CONDUTOR INFRATOR (TRANSFERÊNCIA DE PONTUAÇÃO)')}
<section><h2>Partes</h2>
${qualifica(d.comprador, 'OUTORGANTE (CONDUTOR)')}
<p class="party"><b>CNH do OUTORGANTE:</b> nº ${BLANK}, categoria ${SHORT}, validade ${SHORT}, UF ${SHORT}.</p>
${outorgadosBloco(d)}</section>
<section><h2>Veículo</h2>${veiculosDe(veics, 'Veículo')}</section>
<section><h2>Objeto</h2>
<p>O(A) OUTORGANTE declara que foi o(a) <b>possuidor(a) e condutor(a) responsável</b> pelo veículo acima nas infrações de trânsito ${periodo}, e nomeia o(s) OUTORGADO(S) seus procuradores para, em seu nome:</p>
${cls([
    '<b>identificá-lo(a) como condutor(a) infrator(a)</b> perante o órgão ou entidade de trânsito autuador, nos termos do art. 257, §7º, do Código de Trânsito Brasileiro e da Resolução CONTRAN nº 918/2022, assinando o Formulário de Identificação do Condutor Infrator (FICI) ou a indicação eletrônica e apresentando cópia de sua CNH;',
    'receber e encaminhar notificações de autuação e de penalidade, apresentar defesa prévia, recursos e pedidos de conversão em advertência, quando cabíveis;',
    'substabelecer, com ou sem reserva de poderes.',
  ])}
<p>O(A) OUTORGANTE declara-se <b>ciente de que a pontuação</b> das infrações indicadas será lançada em seu prontuário de habilitação e de que responde pelo <b>pagamento das multas</b> correspondentes, obrigando-se a ressarcir quem as pagar, e autoriza a juntada de cópia de sua CNH a cada indicação.</p>
${firma(d)}</section>
${assinaturaOutorgante(d.comprador, d)}`)
}
export const renderProcMultasVenda = (d: ContractData) => renderProcMultas(d, 'VENDA')
export const renderProcMultasTroca = (d: ContractData) => renderProcMultas(d, 'TROCA')

// ── Termos de entrega e responsabilidade ────────────────────────────────────
const checklist = (itens: string[]) => `<p>${itens.map((i) => `( ) ${i}`).join('&nbsp;&nbsp; ')}</p>`

export function renderEntregaVenda(d: ContractData): string {
  const vend: Party = d.proprietario ?? d.loja
  return wrap(`${cabecalho(d, 'TERMO DE ENTREGA E RESPONSABILIDADE — VEÍCULO VENDIDO')}
<section><h2>Partes</h2>${qualifica(vend, d.proprietario ? 'VENDEDOR(A)' : 'VENDEDORA')}${d.proprietario ? qualifica(d.loja, 'INTERMEDIADORA') : ''}${qualifica(d.comprador, 'COMPRADOR(A)')}</section>
<section><h2>Veículo entregue</h2>${veiculoTabela({ ...d.veiculo, valor: null })}</section>
<section><h2>Entrega</h2>
<p>O(A) COMPRADOR(A) declara que <b>recebeu o veículo acima em ____/____/________, às ____:____ h, com __________ km</b>, referente à negociação nº ${esc(d.numero)}, nas condições em que o vistoriou, testou e aprovou, acompanhado de:</p>
${checklist(['chave principal', 'chave reserva', 'manual do proprietário', 'CRLV', 'estepe', 'macaco e chave de roda', 'triângulo', 'tapetes'])}
<p>Observações: ${BLANK}${BLANK}</p></section>
<section><h2>Responsabilidades</h2>
${cls([
    `A partir da data e hora acima, com a tradição (art. 1.267 do Código Civil), o(a) COMPRADOR(A) assume a <b>guarda do veículo e toda a responsabilidade civil, criminal e administrativa</b> por ele, inclusive por acidentes, danos a terceiros, infrações de trânsito, pontuação, pedágios, estacionamento, apreensões e encargos (IPVA, licenciamento e seguro) relativos a fatos posteriores.`,
    `O(A) COMPRADOR(A) obriga-se a promover a <b>transferência de propriedade em até 30 (trinta) dias</b> (art. 123, §1º, do CTB), sob pena de arcar com multa e demais consequências, e autoriza ${d.proprietario ? 'o(a) VENDEDOR(A)' : 'a VENDEDORA'} a fazer a <b>comunicação de venda</b> ao órgão de trânsito (art. 134 do CTB).`,
    'Infrações cometidas a partir da entrega e notificadas ao antigo proprietário serão indicadas ao(à) COMPRADOR(A) como condutor(a), que se obriga a assinar a indicação ou a reembolsar valores e assumir a pontuação.',
    `${d.proprietario ? 'O(A) VENDEDOR(A)' : 'A VENDEDORA'} responde pelos débitos, multas e encargos com fato gerador anterior à entrega, salvo os assumidos pelo(a) COMPRADOR(A) na negociação.`,
  ])}</section>
${assinaturas([{ papel: d.proprietario ? 'VENDEDOR(A)' : 'VENDEDORA', p: vend }, { papel: 'COMPRADOR(A)', p: d.comprador }], d)}`)
}

export function renderEntregaTroca(d: ContractData): string {
  const veics = d.entrada ?? d.trocas
  return wrap(`${cabecalho(d, 'TERMO DE ENTREGA E RESPONSABILIDADE — VEÍCULO ENTREGUE À LOJA (TROCA/COMPRA)')}
<section><h2>Partes</h2>${qualifica(d.comprador, 'PROPRIETÁRIO(A) / CEDENTE')}${qualifica(d.loja, 'LOJA (RECEBEDORA)')}</section>
<section><h2>Veículo entregue</h2>${veiculosDe(veics.map((v) => ({ ...v, valor: null })), 'Veículo')}</section>
<section><h2>Entrega</h2>
<p>O(A) PROPRIETÁRIO(A) declara que <b>entregou o veículo acima à LOJA em ____/____/________, às ____:____ h, com __________ km</b>, referente à negociação nº ${esc(d.numero)}, acompanhado de:</p>
${checklist(['chave principal', 'chave reserva', 'manual do proprietário', 'CRLV', 'ATPV-e/CRV assinado', 'termo de quitação do financiamento', 'estepe', 'macaco e chave de roda', 'triângulo'])}
<p>Observações: ${BLANK}${BLANK}</p></section>
<section><h2>Declarações e responsabilidades</h2>
${cls([
    'O(A) PROPRIETÁRIO(A) declara ser o(a) <b>legítimo(a) proprietário(a)</b> e possuidor(a) do veículo, que ele está <b>livre de ônus, restrições, busca e apreensão, adulterações e sinistro de grande monta</b>, salvo o financiamento informado na negociação, cuja quitação autoriza.',
    'O(A) PROPRIETÁRIO(A) responde, civil, criminal e administrativamente, por todos os fatos, <b>infrações de trânsito, multas, pontuação, débitos e encargos com fato gerador até a data e hora da entrega</b>, obrigando-se a assinar a indicação de condutor e a ressarcir a LOJA de qualquer valor que ela venha a pagar.',
    'O(A) PROPRIETÁRIO(A) responde pelos <b>vícios ocultos e pela evicção</b> (arts. 441 a 457 do Código Civil), inclusive por adulteração de chassi, motor ou hodômetro, constatados após a entrega.',
    'A partir da data e hora da entrega, a LOJA assume a guarda do veículo e a responsabilidade pelos fatos posteriores, e providenciará a transferência e a comunicação de venda conforme a procuração outorgada.',
    'O(A) PROPRIETÁRIO(A) compromete-se a entregar, quando solicitado, qualquer documento necessário à transferência ou à baixa de gravame.',
  ])}</section>
${assinaturas([{ papel: 'PROPRIETÁRIO(A) / CEDENTE', p: d.comprador }, { papel: 'LOJA (RECEBEDORA)', p: d.loja }], d)}`)
}

export function renderProxyDocument(kind: ProxyKind, d: ContractData): string {
  switch (kind) {
    case 'PROC_VENDA': return renderProcVenda(d)
    case 'PROC_TROCA': return renderProcTroca(d)
    case 'PROC_MULTAS_VENDA': return renderProcMultasVenda(d)
    case 'PROC_MULTAS_TROCA': return renderProcMultasTroca(d)
    case 'ENTREGA_VENDA': return renderEntregaVenda(d)
    case 'ENTREGA_TROCA': return renderEntregaTroca(d)
  }
}
