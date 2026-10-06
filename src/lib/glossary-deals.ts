// =============================================================================
// Glossário complementar — Negociações, F&I, Comissões, Metas e Ranking.
// Termos que não estão em src/lib/glossary.ts. Uso:
//   <HelpHint {...DEAL_HINTS.SINAL} />
//   <FieldLabel helpText={DEAL_HINTS.SINAL.text}>Sinal</FieldLabel>
// =============================================================================

export interface DealHint { title: string; text: string }

export const DEAL_HINTS = {
  // ── Negociação ──────────────────────────────────────────────────────────────
  CONCILIACAO: { title: 'Conciliação', text: 'Só conta como recebido o pagamento que o financeiro conferiu com o extrato ou comprovante. "Aguardando conciliação" = lançado, mas ainda não conferido. "Falta lançar" = pagamento ainda não informado.' },
  DEBITOS: { title: 'Débitos e despesas', text: 'Multas, IPVA, licenciamento, transferência e outros débitos do veículo incluídos na negociação. O responsável define quem paga: comprador, vendedor ou a loja.' },
  RESPONSAVEL_DEBITO: { title: 'Responsável pelo débito', text: 'Quem arca com o débito: comprador (soma ao valor do cliente), vendedor/dono anterior (abate do que ele recebe) ou loja (vira custo da loja).' },
  TROCA: { title: 'Troca', text: 'Carro do cliente que entra como parte do pagamento. O valor avaliado abate do total a pagar.' },
  VALOR_AVALIADO: { title: 'Valor avaliado', text: 'Quanto a loja paga pelo carro da troca, definido na avaliação. É o valor que abate do total da negociação.' },
  QUITACAO: { title: 'Quitação', text: 'Saldo devedor do financiamento do carro da troca, que a loja paga ao banco. Esse valor é descontado do valor avaliado.' },
  SINAL: { title: 'Sinal', text: 'Valor adiantado pelo cliente para reservar o veículo. É abatido do total da negociação.' },
  CONSIGNACAO: { title: 'Consignação', text: 'O carro continua sendo do proprietário; a loja expõe e vende em nome dele e fica com a comissão ou margem combinada.' },
  VALOR_ACORDADO: { title: 'Valor acordado', text: 'Valor final combinado com o cliente para este carro. Pode ser diferente do valor avaliado e da FIPE.' },
  CONSIG_MINIMO: { title: 'Valor mínimo ao proprietário', text: 'Quanto o dono do carro consignado quer receber, no mínimo. O que for vendido acima disso é a margem da loja.' },
  CONSIG_COMISSAO: { title: 'Comissão da loja (consignação)', text: '% que a loja fica sobre o valor de venda do carro consignado.' },
  COMISSAO_SERVICO: { title: 'Comissão do serviço', text: 'Valor pago ao vendedor por este serviço. Entra no extrato de comissões quando a negociação é finalizada.' },
  TROCO: { title: 'Troco a devolver', text: 'O cliente pagou (ou deu na troca) mais do que o total: a diferença é devolvida a ele.' },
  DESCONTO_APROVACAO: { title: 'Desconto', text: 'Abatimento no total da negociação. Acima do limite do cargo, precisa da aprovação do gerente.' },
  VENDEDOR_PROVISORIO: { title: 'Vendedor provisório', text: 'O nome do vendedor veio da importação da planilha e ainda não foi ligado a um usuário do sistema.' },
  FORCAR_FINALIZACAO: { title: 'Forçar finalização', text: 'Finaliza mesmo com saldo aberto ou pagamento não conciliado. Só MASTER, para casos excepcionais.' },

  // ── Retorno / F&I ──────────────────────────────────────────────────────────
  PERCENTUAL_RETORNO: { title: '% de retorno', text: 'Percentual do valor financiado que o banco devolve à loja. Fica limitado à faixa configurada em F&I → Retornos.' },
  VALOR_FINANCIADO: { title: 'Valor financiado', text: 'Quanto o banco vai pagar pelo carro (valor total menos a entrada do cliente). É a base do retorno.' },
  BASE_DEDUCAO: { title: 'Base do ILA/IOF', text: 'Sobre o que o % de ILA e IOF é aplicado: o retorno bruto ou o valor financiado.' },
  FAIXA_RETORNO: { title: 'Faixa de retorno', text: 'Mínimo e máximo de % de retorno que o vendedor pode informar na negociação.' },
  APLICAR_FICHA: { title: 'Aplicar ficha', text: 'Leva o banco, o valor aprovado e as parcelas da ficha aprovada para os valores da negociação.' },
  FICHA_STATUS: { title: 'Situação da ficha', text: 'Simulação = só cálculo. Enviada = em análise no banco. Aprovada = crédito liberado. Recusada = banco negou. Cancelada = desistência.' },
  PROPONENTE: { title: 'Proponente', text: 'Quem pede o financiamento (o cliente ou o titular do crédito). Os dados dele vão para a ficha do banco.' },
  TAXA_AM: { title: 'Taxa % a.m.', text: 'Juros cobrados pelo banco ao mês. Quanto maior a taxa, maior a parcela do cliente (e, em geral, maior o retorno da loja).' },
  SUBMISSAO_STATUS: { title: 'Submissões', text: 'Cada envio da ficha a um banco. Enviada = recebida pelo banco. Em análise = banco avaliando. Pendente = banco pediu documento ou ajuste. Aprovada/Recusada = resposta final.' },
  ILA_IOF_ZERO: { title: 'Permitir zero quando faltar', text: 'Se marcado, a negociação pode salvar o retorno mesmo sem ILA/IOF cadastrado para o período (desconto considerado zero). Desmarcado, o vendedor é bloqueado até o financeiro cadastrar.' },
  TAXA_APROVACAO: { title: 'Taxa de aprovação', text: 'Fichas aprovadas divididas pelas que já tiveram resposta do banco (aprovadas + recusadas), em %.' },
  FUNIL_FI: { title: 'Funil de F&I', text: 'Quantas simulações viraram ficha, quantas fichas foram enviadas ao banco e quantas foram aprovadas. Mostra onde as vendas financiadas se perdem.' },
  RETORNO_ESTIMADO: { title: 'Retorno estimado', text: 'Soma do retorno previsto nas simulações (valor financiado × % de retorno de cada banco). É uma previsão, não o valor recebido.' },
  FAIXA_PARCELAS: { title: 'Faixa de parcelas', text: 'A regra de retorno só vale para financiamentos com número de parcelas dentro desta faixa (ex.: de 37 a 60). Sem faixa = vale para qualquer prazo.' },
  AMBIENTE_BANCO: { title: 'Ambiente', text: 'Homologação = ambiente de testes do banco (nada é enviado de verdade). Produção = envio real das fichas.' },
  PRIORIDADE_BANCO: { title: 'Prioridade dos bancos', text: 'Ordem em que os bancos são sugeridos ao enviar fichas. O primeiro da lista é tentado antes.' },

  // ── Garantia ────────────────────────────────────────────────────────────────
  GARANTIA_CHEIA_REDUZIDA: { title: 'Cheio × com desconto', text: 'Vendida pelo preço cheio ou mais = comissão cheia. Entre o preço com desconto e o cheio = comissão com desconto. Abaixo do preço com desconto = sem comissão.' },
  GARANTIA_PREMIUM: { title: 'Adicional prêmio', text: 'Cobertura extra opcional da garantia. Soma ao preço e paga uma comissão própria.' },
  GARANTIA_CUSTO: { title: 'Custo da garantia', text: 'O que a loja paga à empresa da garantia. O lucro da garantia é o valor vendido menos este custo.' },

  // ── Comissões ───────────────────────────────────────────────────────────────
  OPERACAO_REGRA: { title: 'Operação', text: 'Sobre qual ganho a regra paga: venda/troca, compra, consignação, garantia, retorno de F&I, serviço, documentação ou bônus.' },
  TIPO_REGRA: { title: 'Tipo de comissão', text: 'Percentual = % sobre a base (valor da venda, retorno líquido, preço do serviço…). Valor fixo = R$ por item. Escalonada = muda conforme a faixa. Bônus por quantidade = prêmio ao atingir um número de vendas.' },
  FAIXAS: { title: 'Faixa', text: 'A regra só vale dentro destes limites de quantidade de vendas e/ou valor do carro. Ex.: até 5 vendas = R$ 200; de 6 a 10 = R$ 300. Campo vazio = sem limite.' },
  PRIORIDADE_REGRA: { title: 'Prioridade', text: 'Quando mais de uma regra serve, vence a mais específica (vendedor > cargo > perfil > geral). A prioridade soma a esse critério: número maior vence o empate.' },
  APLICACAO_REGRA: { title: 'Aplicação', text: 'Para quem a regra vale. Campos vazios = vale para todos. Vendedor específico vence cargo, que vence perfil, que vence a regra geral.' },
  VIGENCIA: { title: 'Vigência', text: 'Período em que a regra vale. Vendas fora dessas datas usam outra regra. Vazio = sem data limite.' },
  BONUS_DEZENAL: { title: 'Bônus dezenal', text: 'O mês é dividido em três dezenas (1–10, 11–20, 21–fim). Atingiu a quantidade mínima de vendas na dezena, ganha o bônus dela.' },
  RECALCULO: { title: 'Recalcular', text: 'Reaplica as regras atuais às comissões previstas do mês (ex.: depois de mudar uma regra). Comissões aprovadas, pagas ou ajustadas não mudam.' },
  COMISSAO_DUPLICADA: { title: 'Comissão gerencial em venda própria', text: 'Quando o próprio gerente vende: marcado, ele recebe a comissão de vendedor e também a de gerente; desmarcado, só a de vendedor.' },
  RETORNO_IMPORTACAO: { title: 'Retorno nas importações', text: 'ILA, IOF e faixa de % usados para calcular o retorno das vendas importadas da planilha/AutoConf. Retorno padrão = % usado quando a venda não informa.' },
  PLANO_COMISSAO: { title: 'Plano de comissão', text: 'Resumo do que cada cargo ganha por venda, retorno, garantia, serviço e documentação, montado a partir das regras ativas.' },
  COMISSAO_STATUS: { title: 'Situação da comissão', text: 'Prevista = calculada, ainda pode mudar. Liberada = conferida e pronta para pagar. Paga = já paga. Ajustada = valor corrigido manualmente. Estornada = cancelada (venda desfeita).' },
  ESCOPO_COMISSAO: { title: 'Escopo', text: 'De onde vem o lançamento: comissão principal da venda, do gerente, de garantia, de retorno, de serviço, de documentação ou bônus.' },
  VALOR_BASE: { title: 'Base', text: 'Valor sobre o qual a comissão foi calculada (venda, retorno líquido, preço da garantia ou do serviço…).' },
  AJUSTES: { title: 'Ajustes', text: 'Créditos e descontos lançados à mão sobre a comissão calculada (prêmios, vales, correções).' },
  GARANTIA_REGRAS: { title: 'Regras de garantia', text: 'Definem a comissão das garantias vendidas: % sobre o valor quando vendida pelo valor padrão, e % menor quando vendida com desconto (até o valor mínimo).' },
  GARANTIA_VALOR_MINIMO: { title: 'Valor mínimo', text: 'Menor preço permitido para vender a garantia. Abaixo dele não há comissão.' },
  GARANTIA_DESCONTO_PCT: { title: 'Desconto (%)', text: '% de comissão quando a garantia é vendida abaixo do valor padrão (com desconto), mas acima do valor mínimo.' },
  LANCAMENTO_MANUAL: { title: 'Lançamento manual', text: 'Crédito ou débito avulso no extrato do colaborador (prêmio, vale, ajuste), fora das regras automáticas.' },
  COMISSAO_DOCUMENTO: { title: 'Comissão de documentação', text: 'Paga sobre a documentação cobrada do cliente: valor fixo ou % do lucro da documentação.' },
  BONUS_PERIODO: { title: 'Bônus de período', text: 'Prêmios pelo resultado do mês: produção da loja (R$ por carro vendido na unidade), meta da loja batida e bônus por cumprir as três dezenas do mês.' },
  SETOR_DOC: { title: 'Setor de documentação', text: 'Valor pago a cada pessoa do setor de documentação por venda nesta faixa. O gerente de documentação tem valor próprio.' },
  PAGADOR_CLIENTE: { title: 'Cliente como pagador', text: 'Só paga comissão quando a negociação confirma que o cliente pagou a documentação. Se a loja pagou (cortesia), não gera comissão.' },

  // ── Metas / Ranking ─────────────────────────────────────────────────────────
  META_ESCOPO: { title: 'Escopo da meta', text: 'A quem a meta vale: um vendedor, todos de um cargo/função, uma unidade ou a loja inteira.' },
  META_NIVEIS: { title: 'Metas progressivas', text: 'Degraus acima do alvo base (ex.: Bronze, Prata, Ouro), cada um com seu alvo. O progresso mostra qual nível foi alcançado.' },
  META_ALVO: { title: 'Alvo base', text: 'Quanto precisa ser atingido no período, na unidade de medida escolhida (quantidade, R$ ou %). 100% do alvo = meta batida.' },
  META_METRICA: { title: 'Tipo da meta', text: 'O que é medido: vendas e trocas, compras, retornos de F&I, documentação, garantia estendida ou serviços.' },
  META_ATINGIMENTO: { title: 'Atingimento', text: 'O % de cada meta é o realizado dividido pelo alvo. 100% = meta batida. Nas metas progressivas aparece o nível alcançado e o alvo do próximo.' },
  RANKING_PONTUACAO: { title: 'Pontos', text: 'Soma de cada resultado (vendas, compras, retornos, garantias…) multiplicado pelo peso configurado, menos as penalidades, mais os pontos de fila e conformidade.' },
  RANKING_PESO: { title: 'Pesos', text: 'Quantos pontos cada resultado vale no ranking. Peso maior = resultado mais importante. Penalizações usam número negativo (tiram pontos).' },
  RANKING_DESEMPATE: { title: 'Desempate', text: 'Com pontos iguais, ganha quem estiver melhor no primeiro critério da lista; persistindo o empate, vale o seguinte.' },
  RANKING_QUALIDADE: { title: 'Qualidade', text: 'Aproveitamento por venda: documentações + garantias + serviços + retornos divididos pelo número de vendas, em %. Ex.: 10 vendas com 9 docs e 6 retornos = 150%.' },
  RANKING_FILA: { title: 'Fila', text: 'Pontos da qualidade do atendimento na fila do vendedor da vez (atender rápido, registrar o resultado). Já somados nos pontos.' },
  RANKING_CONFORMIDADE: { title: 'Conformidade', text: 'Ajuste por seguir os processos da loja (pendências e cadastros em dia). Pode somar ou tirar pontos.' },
  RANKING_VENCIDAS: { title: 'Pendências vencidas', text: 'Pendências que passaram do prazo. Cada uma tira pontos do ranking.' },
} as const satisfies Record<string, DealHint>

export type DealHintKey = keyof typeof DEAL_HINTS
