// =============================================================================
// Glossário do sistema — explicações curtas usadas pelo "?" (HelpHint).
// Uma explicação por termo, igual em todas as telas. Linguagem de loja, sem
// jargão desnecessário.
// =============================================================================

export const GLOSSARY = {
  // ── Financeiro / DRE ───────────────────────────────────────────────────────
  AV: { title: 'AV — Análise Vertical', text: 'Quanto a linha representa, em %, da receita líquida do mesmo período. Ex.: aluguel −8.000 com receita líquida de 100.000 = −8%.' },
  DRE: { title: 'DRE', text: 'Demonstração do Resultado: receitas menos custos e despesas do período, até chegar ao lucro ou prejuízo.' },
  COMPETENCIA: { title: 'Regime de competência', text: 'Conta a receita e a despesa no mês em que aconteceram (venda, serviço, conta do mês), mesmo que o dinheiro entre ou saia depois.' },
  CAIXA: { title: 'Regime de caixa', text: 'Conta só o dinheiro que efetivamente entrou ou saiu, na data do pagamento ou recebimento.' },
  RECEITA_BRUTA: { title: 'Receita bruta', text: 'Tudo o que foi vendido no período, antes de impostos, devoluções e descontos.' },
  RECEITA_LIQUIDA: { title: 'Receita líquida', text: 'Receita bruta menos impostos sobre vendas, devoluções e descontos. É a base do AV.' },
  CMV: { title: 'CMV — Custo das mercadorias vendidas', text: 'Custo dos veículos vendidos (compra, preparação, documentação) e dos serviços vendidos. Entra no mês da venda.' },
  MARGEM_BRUTA: { title: 'Margem bruta', text: 'Receita líquida menos o CMV: quanto sobra das vendas antes das despesas da loja.' },
  EBITDA: { title: 'EBITDA / Resultado operacional', text: 'Resultado da operação da loja antes de juros, impostos sobre o lucro e depreciação.' },
  RESULTADO_LIQUIDO: { title: 'Resultado líquido', text: 'O que sobra no final: lucro (positivo) ou prejuízo (negativo) do período.' },
  CUSTO_ESTOQUE: { title: 'Custo em estoque', text: 'Gastos com veículos ainda não vendidos (compra, preparação, documentação). Só entram na DRE no mês em que o carro for vendido.' },
  MARGEM: { title: 'Margem', text: 'Resultado dividido pela receita, em %.' },
  CENTRO_RESULTADO: { title: 'Centro de resultado', text: 'Área com receita e custo próprios (documentação, funilaria, F&I…). Mostra se a área deu lucro ou prejuízo.' },
  CENTRO_CUSTO: { title: 'Centro de custo', text: 'Área que só gasta (marketing, administrativo). Mostra quanto cada área consome.' },
  PLANO_CONTAS: { title: 'Plano de contas', text: 'Lista de categorias de receitas e despesas, em árvore. Cada categoria aponta para uma linha da DRE.' },
  SALDO_CONSOLIDADO: { title: 'Saldo consolidado', text: 'Soma do saldo de todas as contas marcadas para entrar no consolidado, mais os lançamentos sem conta.' },
  SALDO_INICIAL: { title: 'Saldo inicial', text: 'Quanto havia na conta na data informada. O extrato e o saldo atual partem desse valor.' },
  SALDO_PROJETADO: { title: 'Saldo projetado', text: 'Saldo de hoje mais o que está a receber menos o que está a pagar, pelas datas de vencimento.' },
  FLUXO_CAIXA: { title: 'Fluxo de caixa', text: 'Entradas e saídas por dia ou por mês: o que já aconteceu (realizado) e o que está previsto pelos vencimentos.' },
  REALIZADO: { title: 'Realizado', text: 'Já pago ou recebido.' },
  PREVISTO: { title: 'Previsto', text: 'Ainda em aberto: a pagar ou a receber, pela data de vencimento.' },
  VENCIDO: { title: 'Vencido', text: 'Em aberto com vencimento anterior a hoje.' },
  ORCADO_REALIZADO: { title: 'Orçado × realizado', text: 'Compara o orçamento definido para cada categoria com o que aconteceu de fato no período.' },
  AGING: { title: 'Idade das contas', text: 'Contas vencidas separadas por tempo de atraso (até 30, 31–60, 61–90, mais de 90 dias).' },
  BAIXA: { title: 'Baixa', text: 'Registro do pagamento ou recebimento de uma conta.' },
  BAIXA_PARCIAL: { title: 'Baixa parcial', text: 'Pagamento de parte da conta. O restante continua em aberto com o mesmo vencimento ou um novo.' },
  BAIXA_LOTE: { title: 'Baixa em lote', text: 'Várias contas baixadas de uma vez, com a mesma data, conta e forma. Cada uma pode ter valor, juros e desconto próprios.' },
  QUITAR_DESCONTO: { title: 'Quitar o restante como desconto', text: 'Pagou menos que o saldo e a conta deve ser encerrada: a diferença vira desconto obtido (ou concedido) e o título fica quitado.' },
  ESTORNO: { title: 'Estorno', text: 'Desfaz uma baixa: o valor volta para o saldo em aberto. Sempre pede o motivo e fica registrado.' },
  JUROS_MULTA: { title: 'Juros / multa', text: 'Valor pago a mais por atraso. Vai para despesas (ou receitas) financeiras, não para a categoria da conta.' },
  DESCONTO: { title: 'Desconto', text: 'Valor abatido no pagamento. Desconto obtido em conta a pagar vira receita financeira.' },
  TRANSFERENCIA: { title: 'Transferência', text: 'Dinheiro movido entre contas da própria loja. Muda os saldos, mas não é receita nem despesa.' },
  CONCILIADO: { title: 'Conciliado', text: 'Pagamento conferido pelo financeiro com o extrato do banco ou o comprovante.' },
  RECORRENCIA: { title: 'Despesa fixa', text: 'Conta que se repete todo mês (aluguel, internet, salário). O sistema gera as próximas automaticamente.' },
  PARCELADO: { title: 'Parcelado', text: 'Divide o valor em parcelas mensais com vencimentos seguidos.' },
  COBRADO_CUSTO: { title: 'Cobrado × custo', text: 'Cobrado = o que o cliente pagou. Custo = o que a loja gastou de fato. Lucro = cobrado − custo − comissões.' },

  // ── F&I / financiamento ───────────────────────────────────────────────────
  FI: { title: 'F&I', text: 'Financiamento e seguros: receitas da loja com bancos e seguradoras (retorno, PLUS, comissões de seguro, bonificações).' },
  RETORNO: { title: 'Retorno', text: 'Valor que o banco paga à loja por um financiamento: % sobre o valor financiado. Ex.: 100.000 a 6% = 6.000 de retorno bruto.' },
  RETORNO_BRUTO: { title: 'Retorno bruto', text: 'Valor financiado × % de retorno, antes dos descontos do banco (ILA, IOF, IRRF).' },
  RETORNO_LIQUIDO: { title: 'Retorno líquido', text: 'Retorno bruto menos ILA, IOF e IRRF. As comissões de retorno são calculadas sobre este valor.' },
  ILA: { title: 'ILA — Índice de Liquidação Antecipada', text: 'Desconto que o banco aplica sobre o retorno, ligado às quitações antecipadas. Varia todo mês. Ex.: 20% de 6.000 = 1.200.' },
  IOF: { title: 'IOF', text: 'Imposto descontado do retorno, normalmente em torno de 1,5%. Ex.: 1,5% de 6.000 = 90.' },
  IRRF: { title: 'IRRF', text: 'Imposto de renda retido pelo banco sobre o retorno, quando houver.' },
  PLUS: { title: 'PLUS', text: 'Valor fixo por contrato que o banco paga à loja, além do retorno.' },
  AGREGADOS: { title: 'Agregados', text: 'Itens embutidos no financiamento além do carro (seguro prestamista, garantia, rastreador…). Os de terceiros são pagos pelo banco a eles; a loja pode ganhar comissão.' },
  VALOR_A_RECEBER_BANCO: { title: 'Valor a receber do banco', text: 'Valor financiado menos os agregados pagos a terceiros.' },
  BONIFICACAO: { title: 'Bonificação', text: 'Prêmio pago por banco ou montadora por metas e campanhas.' },

  // ── Negociação / estoque / comissões ──────────────────────────────────────
  FIPE: { title: 'FIPE', text: 'Preço médio de mercado do veículo, pela tabela FIPE do mês.' },
  SALDO_NEGOCIACAO: { title: 'Saldo da negociação', text: 'Total da negociação menos o que já foi pago. Zero = tudo pago.' },
  DOCUMENTACAO_COBRADA: { title: 'Documentação cobrada', text: 'Valor cobrado do cliente pela documentação/despachante. O lucro é a diferença para o custo real.' },
  COMISSAO_RETORNO: { title: 'Comissão de retorno', text: 'Calculada sobre o retorno líquido, pelo % configurado para cada cargo (vendedor, gerente, F&I).' },
  DIAS_ESTOQUE: { title: 'Dias em estoque', text: 'Dias entre a entrada do carro e a venda.' },
  LUCRO_VEICULO: { title: 'Lucro do veículo', text: 'Venda − compra − preparação − documentação − comissões + retorno de F&I.' },
  SLA: { title: 'SLA', text: 'Prazo combinado para resolver ou responder. Passou do prazo, o item fica atrasado e a gestão é avisada.' },
} as const

export type GlossaryTerm = keyof typeof GLOSSARY
