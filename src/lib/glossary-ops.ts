// =============================================================================
// Glossário operacional — complementa src/lib/glossary.ts com termos de
// estoque, avaliação, fila, pendências, CRM, publicações, cadastros e Master.
// Uso: <HelpHint {...opsHint('GIRO')} />  ou  <WithHint text={opsText('GIRO')}>Giro</WithHint>
// =============================================================================

export const OPS_GLOSSARY = {
  // ── Estoque / avaliação / preparação ──────────────────────────────────────
  PRECO_SUGERIDO: { title: 'Preço sugerido', text: 'Valor de venda recomendado a partir da FIPE, do custo total do carro e da margem desejada. Serve de referência; o preço final é decidido pela gestão.' },
  MARGEM_ALVO: { title: 'Margem desejada', text: 'Quanto a loja quer ganhar sobre o custo total do carro, em %. Usada para calcular o preço sugerido.' },
  CUSTO_TOTAL_VEICULO: { title: 'Custo total do veículo', text: 'Compra + preparação (serviços, peças) + documentação. É a base para saber o lucro na venda.' },
  GIRO: { title: 'Giro de estoque', text: 'Quanto tempo, em média, o carro fica parado até ser vendido. Quanto menor, mais rápido o dinheiro volta para o caixa.' },
  DIAS_PARADO: { title: 'Dias em estoque', text: 'Dias desde a entrada do carro no estoque até hoje (ou até a venda). Carros parados há muito tempo pedem revisão de preço.' },
  STATUS_ESTOQUE: { title: 'Status do estoque', text: 'Em que ponto o carro está: aguardando precificação (sem preço definido), em serviço (em preparação/oficina), disponível (pronto para vender), reservado/em negociação (com cliente), vendido.' },
  EM_PRECIFICACAO: { title: 'Aguardando precificação', text: 'O carro entrou no estoque, mas a gestão ainda não definiu o preço de venda. Não aparece no site enquanto estiver assim.' },
  EM_SERVICO: { title: 'Em serviço', text: 'O carro está em preparação (funilaria, mecânica, estética, documentação) e ainda não está pronto para a vitrine.' },
  SITUACAO_ESTOQUE: { title: 'Situação', text: 'Onde o carro está: showroom (à venda na loja), atacado (vendido para outras lojas, sem varejo) ou fora do estoque.' },
  CONSIGNADO: { title: 'Consignado', text: 'Carro de terceiro que a loja vende sem comprar. O dono recebe o valor combinado após a venda; a loja fica com a diferença ou comissão.' },
  ATACADO: { title: 'Atacado', text: 'Carro destinado à venda para outras lojas/repasse, normalmente abaixo do preço de varejo.' },
  ESTEIRA: { title: 'Esteira de entrada', text: 'Etapas que o carro percorre da avaliação até a vitrine. Cada portão precisa ser liberado antes do próximo.' },
  PORTAO: { title: 'Portão', text: 'Etapa obrigatória da esteira (ex.: documentos conferidos, perícia aprovada, preço definido). Enquanto não for liberado, o carro não avança.' },
  PERICIA: { title: 'Perícia / cautelar', text: 'Vistoria técnica que confirma chassi, motor, histórico de sinistro, leilão e restrições. Laudo reprovado bloqueia a entrada do carro.' },
  LAUDO_ECV: { title: 'Laudo ECV', text: 'Laudo de vistoria emitido por uma Empresa Credenciada de Vistoria (ECV) do Detran, exigido para transferência.' },
  AVALIACAO: { title: 'Avaliação', text: 'Análise do carro que o cliente quer vender ou dar na troca: estado, itens, serviços necessários e valor oferecido.' },
  VALOR_AVALIACAO: { title: 'Valor de avaliação', text: 'Quanto a loja oferece pelo carro do cliente, já descontando os serviços necessários para revendê-lo.' },
  CRLV: { title: 'CRLV', text: 'Documento do veículo (Certificado de Registro e Licenciamento). O sistema lê placa, chassi, RENAVAM e proprietário a partir dele.' },
  RENAVAM: { title: 'RENAVAM', text: 'Número de registro do veículo no Detran. Fica no CRLV e é usado para consultar débitos e transferir.' },
  PREPARACAO: { title: 'Preparação', text: 'Serviços feitos no carro antes de ir para a vitrine (mecânica, funilaria, polimento, higienização). Os custos entram no custo do veículo.' },
  RECEBIMENTO: { title: 'Recebimento', text: 'Conferência do carro quando chega à loja: km, chaves, manual, itens e avarias, comparados com a avaliação.' },
  LOJA_PARCEIRA: { title: 'Loja parceira', text: 'Outra loja que compra ou vende carros com você (repasse). Fica no cadastro de fornecedores.' },

  // ── Fila / vendedor da vez ────────────────────────────────────────────────
  VENDEDOR_DA_VEZ: { title: 'Vendedor da vez', text: 'Rodízio que define quem atende o próximo cliente. Quem atende vai para o fim da fila.' },
  RODIZIO: { title: 'Rodízio', text: 'Ordem de atendimento entre os vendedores disponíveis. A cada atendimento, o vendedor volta para o final.' },
  PERDA_VEZ: { title: 'Perda da vez', text: 'Quando o vendedor não aceita o cliente no prazo, a vez passa para o próximo e ele vai para o fim da fila.' },
  TEMPO_ACEITE: { title: 'Tempo para aceitar', text: 'Prazo que o vendedor tem para confirmar que vai atender o cliente. Passou, a vez vai para o próximo.' },
  COOLDOWN: { title: 'Intervalo de espera', text: 'Tempo mínimo depois de um atendimento antes de o vendedor poder ser chamado de novo.' },
  ESCALONAMENTO: { title: 'Escalonamento', text: 'Quando ninguém assume no prazo, o sistema avisa o próximo nível (gerente, depois diretoria).' },
  FALLBACK_GERENTE: { title: 'Gerente como reserva', text: 'Sem vendedor disponível, o gerente é acionado para atender. O gerente não entra no rodízio normal.' },
  PARTICIPACAO_FILA: { title: 'Participação na fila', text: 'Quanto tempo o vendedor ficou disponível na fila e quantos clientes recebeu, comparado ao time.' },
  CONFORMIDADE: { title: 'Conformidade', text: 'Se os atendimentos seguiram as regras: aceitos no prazo, registrados e finalizados com resultado.' },
  QUALIDADE_ATENDIMENTO: { title: 'Qualidade do atendimento', text: 'Nota que combina tempo de resposta, registro do atendimento e resultado (venda, retorno agendado).' },
  PAUSA: { title: 'Pausa', text: 'Vendedor fora da fila por um tempo (almoço, entrega, reunião). Não recebe clientes enquanto estiver pausado.' },

  // ── Pendências ────────────────────────────────────────────────────────────
  PENALIDADE: { title: 'Penalidade', text: 'Registro de pendência atrasada além do limite. Hoje só avisa a gestão; não tira o vendedor da fila.' },
  LEMBRETE: { title: 'Lembretes', text: 'Avisos repetidos ao responsável enquanto a pendência estiver aberta, no intervalo configurado.' },
  PRIORIDADE: { title: 'Prioridade', text: 'Define a ordem de atenção e o prazo (SLA) da pendência ou do lead: quanto mais alta, menor o prazo.' },

  // ── CRM ───────────────────────────────────────────────────────────────────
  LEAD: { title: 'Lead', text: 'Contato interessado que ainda não comprou: veio do site, portal, rede social, telefone ou loja.' },
  TEMPERATURA: { title: 'Temperatura do lead', text: 'Chance de compra: quente (pronto para fechar), morno (interessado) e frio (sem resposta ou só pesquisando).' },
  ORIGEM: { title: 'Origem / canal', text: 'De onde o lead veio (site, Instagram, Facebook, OLX, Webmotors, indicação, loja). Mostra quais canais trazem vendas.' },
  DISTRIBUICAO_AUTO: { title: 'Distribuição automática', text: 'O sistema entrega o lead novo para um vendedor pelas regras (rodízio, carteira, disponibilidade), sem precisar de alguém repassar.' },
  FUNIL: { title: 'Funil / pipeline', text: 'Etapas do atendimento até a venda (novo, contato, visita, proposta, fechado). Cada coluna é uma etapa.' },
  TEMPO_PRIMEIRA_RESPOSTA: { title: 'Tempo de primeira resposta', text: 'Tempo entre a chegada do lead e o primeiro contato do vendedor. Responder rápido aumenta muito a chance de venda.' },
  CONVERSAO: { title: 'Conversão', text: 'Percentual de leads ou atendimentos que viraram venda no período.' },
  CARTEIRA: { title: 'Carteira', text: 'Clientes que já são de um vendedor. Novos contatos desse cliente voltam para o mesmo vendedor.' },
  AUTOMACAO: { title: 'Automação', text: 'Ação que o sistema faz sozinho quando algo acontece (ex.: lead sem resposta em 1 h → avisa o gerente).' },
  URL_ENTRADA: { title: 'URL de entrada', text: 'Endereço para onde o canal (formulário, anúncio, portal) envia os leads. Cada canal tem a sua, para saber a origem.' },

  // ── Marketing / publicações / site ────────────────────────────────────────
  PILOTO_AUTOMATICO: { title: 'Piloto automático', text: 'O sistema cria e publica os posts sozinho, dentro da janela de horário e do limite diário configurados.' },
  JANELA_PUBLICACAO: { title: 'Janela de publicação', text: 'Faixa de horário em que as publicações automáticas podem sair.' },
  LIMITE_DIARIO: { title: 'Limite por dia', text: 'Quantidade máxima de publicações automáticas por dia, para não lotar o perfil.' },
  FEED: { title: 'Feed / importação', text: 'Lista de veículos lida automaticamente de outro sistema ou site para atualizar o estoque.' },
  CATALOGO_META: { title: 'Catálogo da Meta', text: 'Lista dos carros enviada ao Facebook/Instagram para anúncios dinâmicos de estoque.' },
  DOMINIO: { title: 'Domínio', text: 'Endereço do site da loja (ex.: www.sualoja.com.br). Precisa apontar para o sistema no provedor do domínio (DNS).' },
  SDR: { title: 'SDR', text: 'Pré-vendedor que faz o primeiro contato com o lead, qualifica e agenda a visita para o vendedor.' },

  // ── Cadastros / permissões / Master ───────────────────────────────────────
  NIVEL_ACESSO: { title: 'Nível de acesso', text: 'Define o que a pessoa vê e pode fazer no sistema. Níveis mais altos veem valores, custos e relatórios da loja.' },
  PERMISSAO_SENSIVEL: { title: 'Permissão sensível', text: 'Libera dados ou ações críticas (custos, lucros, excluir, aprovar). Dê só a quem precisa.' },
  UNIDADE: { title: 'Unidade', text: 'Loja ou filial. Estoque, fila, metas e relatórios podem ser separados por unidade.' },
  TENANT: { title: 'Loja (cliente do sistema)', text: 'Cada empresa que usa o sistema, com dados, usuários e configurações separados das demais.' },
  MODULO: { title: 'Módulo', text: 'Parte do sistema que pode ser ligada ou desligada para a loja, conforme o plano contratado.' },
  FEATURE_FLAG: { title: 'Recurso liberado', text: 'Chave que liga um recurso para todas as lojas, para algumas, ou só para teste, sem precisar publicar nova versão.' },
  PLANO: { title: 'Plano', text: 'Pacote contratado pela loja: define os módulos, os limites de usuários e o valor mensal.' },
  SESSAO: { title: 'Duração da sessão', text: 'Tempo que o usuário continua logado sem uso. Cada acesso renova o prazo; passou do limite sem uso, pede login de novo.' },
  INTEGRACAO: { title: 'Integração', text: 'Conexão com outro sistema (banco, portal, WhatsApp, planilha) usando as credenciais da própria loja.' },
  WEBHOOK: { title: 'Webhook', text: 'Endereço que outro sistema chama automaticamente para avisar de um evento (ex.: nova mensagem, novo lead).' },
} as const

export type OpsTerm = keyof typeof OPS_GLOSSARY

/** Props prontas para <HelpHint /> / <WithHint />: `{...opsHint('GIRO')}`. */
export function opsHint(term: OpsTerm): { text: string; title: string } {
  const e = OPS_GLOSSARY[term]
  return { text: e.text, title: e.title }
}

/** Só o texto — para <WithHint text={opsText('GIRO')}> (WithHint não recebe título). */
export function opsText(term: OpsTerm): string {
  return OPS_GLOSSARY[term].text
}
