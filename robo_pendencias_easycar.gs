/****************************************************
 * ROBÔ DE PENDÊNCIAS - EASYCAR VEÍCULOS LOJA MATRIZ
 * VERSÃO COMPLETA CORRIGIDA
 *
 * PRINCIPAIS AJUSTES DESTA VERSÃO:
 * 1) Trava de horário corrigida:
 *    - "Trava de horário ativa?" = Sim  -> respeita horário, dias, slots e próximo envio.
 *    - "Trava de horário ativa?" = Não  -> EXECUTAR AGORA roda em qualquer horário.
 *
 * 2) Templates oficiais Meta corrigidos:
 *    - Envia imagem no HEADER quando houver URL/Media ID configurado.
 *    - Controla a quantidade exata de parâmetros do BODY pela aba CONFIGURACOES.
 *    - Evita erro 132000: quantidade de parâmetros diferente do template.
 *
 * 3) Disparo manual corrigido:
 *    - Removida função duplicada que estava dentro de enviarDisparosManuais().
 *
 * 4) Organização:
 *    - Títulos grandes por seção para facilitar busca no Apps Script.
 *
 * ORDEM DE USO APÓS COLAR:
 * 1) Salvar o Apps Script.
 * 2) Atualizar a planilha.
 * 3) Menu Robo de Pendencias > Ajustar configurações Meta/Templates.
 * 4) Menu Robo de Pendencias > Preparar parâmetros dos templates Meta.
 * 5) Menu Robo de Pendencias > Preparar trava de horário.
 ****************************************************/

var ABAS = {
  PENDENCIAS: "PENDENCIAS",
  TEMPLATES: "TEMPLATES",
  RESPONSAVEIS: "RESPONSAVEIS",
  HISTORICO: "HISTORICO_ENVIOS",
  CONFIGURACOES: "CONFIGURACOES",
  RETORNOS: "RETORNOS",
  LISTAS: "LISTAS"
};

var PLANILHA_FONTE_PADRAO_ID = "1F2LPZceYodS46dhflN48BkZDQr9uREhmoAT73mfj4sQ";

var ABAS_FONTE_POR_MES = [
  { mes: "Abril", gid: 1507200471 },
  { mes: "Maio", gid: 164932782 },
  { mes: "Junho", gid: 1319104448 },
  { mes: "Julho", gid: 859891656 },
  { mes: "Agosto", gid: 1403958723 },
  { mes: "Setembro", gid: 685417053 },
  { mes: "Outubro", gid: 1983508956 },
  { mes: "Novembro", gid: 589881343 },
  { mes: "Dezembro", gid: 644554508 }
];

var HISTORICO_HEADERS = [
  "Data/Hora",
  "ID Pendencia",
  "Cliente",
  "WhatsApp Cliente",
  "Tipo",
  "Descricao",
  "Responsavel",
  "WhatsApp Responsavel",
  "Loja",
  "Negociacao",
  "Lead",
  "Placa",
  "Veiculo",
  "Prioridade",
  "Destinatario da Cobranca",
  "Status da Pendencia",
  "Template",
  "Mensagem Enviada",
  "Status do Envio",
  "Retorno da API",
  "Proximo Envio Calculado",
  "Usuario/Sistema",
  "Link WhatsApp",
  "WhatsApp Message ID",
  "Status Webhook",
  "Data/Hora Webhook",
  "Erro Webhook",
  "Webhook Raw"
];

/****************************************************
 * NOVO MAPA DA ABA PENDENCIAS
 * Sequência solicitada:
 * A ID | B RESPONSÁVEL | C WHATSAPP | D CLIENTE | E PLACA
 * F VEÍCULO | G NEGOCIAÇÃO | H DESCRIÇÃO | I LEAD | J PRIORIDADE | K STATUS
 ****************************************************/

var PEND_COL = {
  ID: 1,
  RESPONSAVEL: 2,
  WHATSAPP: 3,
  CLIENTE: 4,
  PLACA: 5,
  VEICULO: 6,
  NEGOCIACAO: 7,
  DESCRICAO: 8,
  LEAD: 9,
  PRIORIDADE: 10,
  STATUS: 11,
  TIPO: 12,
  LOJA: 13,
  DESTINATARIO: 14,
  DATA_INICIAL: 15,
  DATA_VENCIMENTO: 16,
  FREQUENCIA: 17,
  DIAS_PERMITIDOS: 18,
  HORA_INICIO: 19,
  HORA_FIM: 20,
  ULTIMO_ENVIO: 21,
  PROXIMO_ENVIO: 22,
  MAXIMO_ENVIOS: 23,
  TOTAL_ENVIADO: 24,
  TEMPLATE: 25,
  OBSERVACOES: 26,
  ENVIOS_POR_DIA: 27,
  ENVIO_AUTOMATICO: 28,
  MES_REFERENCIA: 29,
  FONTE: 30
};

var PEND_HEADERS_NOVO = [
  "ID",
  "Responsável",
  "WhatsApp",
  "Cliente",
  "Placa",
  "Veículo",
  "Negociação",
  "Descrição",
  "Lead",
  "Prioridade",
  "Status",
  "Tipo",
  "Loja",
  "Destinatário da Cobrança",
  "Data Inicial",
  "Data Vencimento",
  "Frequência",
  "Dias Permitidos",
  "Hora Início",
  "Hora Fim",
  "Último Envio",
  "Próximo Envio",
  "Máximo de Envios",
  "Total Enviado",
  "Template",
  "Observações",
  "Envios por Dia",
  "Envio Automático?",
  "Mês Referência",
  "Fonte"
];

var ABA_DISPARO_MANUAL = "DISPARO_MANUAL";

var DISPARO_COL = {
  ID: 1,
  RESPONSAVEL: 2,
  WHATSAPP: 3,
  TEMPLATE: 4,
  MENSAGEM: 5,
  CLIENTE: 6,
  PLACA: 7,
  VEICULO: 8,
  NEGOCIACAO: 9,
  PRIORIDADE: 10,
  ENVIAR: 11,
  STATUS_ENVIO: 12,
  RETORNO_API: 13,
  DATA_HORA: 14
};

var DISPARO_HEADERS = [
  "ID",
  "Responsável",
  "WhatsApp",
  "Template",
  "Mensagem/Descrição",
  "Cliente",
  "Placa",
  "Veículo",
  "Negociação",
  "Prioridade",
  "Enviar?",
  "Status Envio",
  "Retorno API",
  "Data/Hora"
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Robo de Pendencias")
    .addItem("Importar pendencias da planilha fonte", "importarPendenciasAgora")
    .addItem("Importar e processar agora", "importarEProcessarPendenciasManual")
    .addItem("Remover duplicadas por negociacao", "removerDuplicadasPorNegociacao")
    .addSeparator()
    .addItem("Configurar nova aba PENDENCIAS", "configurarAbaPendenciasNovoLayout")
    .addItem("Ajustar configurações Meta/Templates", "ajustarConfiguracoesMetaTemplates")
    .addItem("Corrigir validacoes da aba PENDENCIAS", "garantirValidacoesPendencias")
    .addItem("Gerar/arrumar IDs automaticos", "configurarIdAutomaticoPendencias")
    .addItem("Configurar preenchimento automático de WhatsApp", "configurarAcionadorEdicaoPendencias")
    .addSeparator()
    .addItem("Preparar aba RETORNOS", "prepararAbaRetornos")
    .addItem("Testar gravação de retorno", "testarGravacaoRetornoManual")
    .addSeparator()
    .addItem("Preparar disparo manual", "prepararDisparoManual")
    .addItem("Enviar disparos manuais pendentes", "enviarDisparosManuais")
    .addSeparator()
    .addItem("Atualizar Dashboard", "atualizarDashboardPendenciasAutomatico")
    .addItem("Ativar Dashboard em tempo real", "ativarDashboardTempoReal")
    .addItem("Desativar Dashboard em tempo real", "desativarDashboardTempoReal")
    .addSeparator()
    .addItem("Executar teste agora", "executarRoboPendenciasTeste")
    .addItem("Executar automatico agora", "executarRoboPendenciasAutomaticoManual")
    .addSeparator()
    .addItem("Preparar historico para Webhook", "prepararHistoricoWebhookManual")
    .addItem("Testar atualizacao Webhook no historico", "testarAtualizacaoWebhookNoHistorico")
    .addItem("Criar acionador automático configurável", "configurarAcionadorAutomaticoConfiguravel")
    .addSeparator()
    .addItem("Preparar trava de horário", "prepararConfiguracaoTravaHorario")
    .addItem("Ativar trava de horário", "ativarTravaHorarioRobo")
    .addItem("Desativar trava de horário", "desativarTravaHorarioRobo")
    .addItem("Ver status da trava de horário", "verStatusTravaHorarioRobo")
    .addSeparator()
    .addItem("Verificar status da configuracao", "verificarConfiguracaoRobo")
    .addToUi();
}



function ajustarConfiguracoesMetaTemplates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.CONFIGURACOES);

  if (!aba) {
    aba = ss.insertSheet(ABAS.CONFIGURACOES);
    aba.getRange(1, 1, 1, 3).setValues([["Configuração", "Valor", "Observações"]]);
  }

  /****************************************************
   * CONFIGURAÇÕES USADAS PELO CÓDIGO
   * Mantém somente chaves úteis para o robô atual.
   ****************************************************/
  var configs = [
    ["Modo Envio WhatsApp", "Real", "Define se o envio será em TESTE ou REAL."],
    ["WhatsApp API Version", "v25.0", "Versão da Graph API usada no envio oficial da Meta."],
    ["WhatsApp Phone Number ID", "", "ID do número de telefone no painel da Meta."],
    ["WhatsApp Access Token", "", "Token atual/permanente da API oficial da Meta."],
    ["Usar templates oficiais Meta?", "Sim", "Quando Sim, envia pelos templates aprovados da Meta."],
    ["Idioma templates Meta", "pt_BR", "Idioma dos templates aprovados na Meta."],
    ["Fallback texto livre se template falhar?", "Não", "Se Sim, tenta texto livre se o template falhar."],
    ["URL imagem padrão templates Meta", "https://res.cloudinary.com/dvjfypkzz/image/upload/v1778265726/f80cf79a-bda9-4b81-9577-b505c09c2310_ra27ex.png", "Imagem padrão usada no cabeçalho dos templates Meta."],

    ["Token API", "EASYCARROBO2026", "Chave de segurança para chamadas externas/Mini API."],
    ["Webhook Verify Token", "EASYCAR_WEBHOOK_2026", "Token usado para validação do webhook da Meta."],

    ["Planilha Fonte ID", PLANILHA_FONTE_PADRAO_ID, "ID da planilha fonte VENDAS MATRIZ."],
    ["Importacao Automatica Ativa?", "Sim", "Permite ou bloqueia a importação automática da planilha fonte."],
    ["Importar somente status fonte listados?", "Sim", "Quando Sim, importa somente os tipos/status aceitos pelo código/listas."],
    ["Intervalo atualização fonte minutos", "20", "Intervalo mínimo entre importações automáticas."],
    ["Delay envio nova pendência segundos", "30", "Tempo de espera antes de avisar sobre nova pendência importada."],
    ["Notificar novas pendências importadas?", "Sim", "Envia aviso ao gerente quando uma nova pendência é importada."],
    ["WhatsApp gerente novas pendências", "11934718276", "Número que recebe aviso de nova pendência importada."],
    ["Template nova pendência importada", "nova_pendencia_importada", "Template usado para aviso de nova pendência ao gerente."],

    ["Unidade Padrao", "EasyCar Matriz", "Unidade padrão usada nas pendências importadas/criadas."],
    ["Status padrao de nova pendencia", "Pendente", "Status inicial quando uma nova pendência é criada via API/importação."],
    ["Prioridade padrao", "Média", "Prioridade padrão ao criar/importar nova pendência."],
    ["Frequencia padrao", "Diário", "Frequência padrão da cobrança."],
    ["Hora inicial padrao", "09:00", "Horário inicial padrão da pendência."],
    ["Hora final padrao", "18:40", "Horário final padrão da pendência."],

    ["Trava de horário ativa?", "Não", "Quando Sim, respeita a janela de horário. Quando Não, o robô roda em qualquer horário."],
    ["Trava horário inicial envio", "00:00", "Horário mínimo permitido para envio automático."],
    ["Trava horário final envio", "23:59", "Horário máximo permitido para envio automático."],
    ["Usar horários por prioridade?", "Sim", "Quando Sim, usa os horários específicos de cada prioridade."],
    ["Janela tolerância envio minutos", "20", "Tolerância em minutos após cada horário configurado."],
    ["Quantidade cobranças por dia", "2", "Limite padrão quando não houver regra específica por prioridade."],
    ["Envios por dia prioridade baixa", "1", "Quantidade máxima diária para prioridade baixa."],
    ["Envios por dia prioridade média", "2", "Quantidade máxima diária para prioridade média."],
    ["Envios por dia prioridade alta", "4", "Quantidade máxima diária para prioridade alta."],
    ["Envios por dia prioridade crítica", "5", "Quantidade máxima diária para prioridade crítica."],
    ["Horários envio prioridade baixa", "10:00", "Horário de envio para prioridade baixa."],
    ["Horários envio prioridade média", "09:30,17:00", "Horários de envio para prioridade média."],
    ["Horários envio prioridade alta", "09:30,14:00,18:00", "Horários de envio para prioridade alta."],
    ["Horários envio prioridade crítica", "09:30,12:00,15:00,18:00", "Horários de envio para prioridade crítica."],
    ["Máximo de envios por pendência", "99999", "Limite total de envios por pendência."],

    ["Parametros Body entrega_pendente", "RESPONSAVEL,DESCRICAO,CLIENTE,PLACA,VEICULO,NEGOCIACAO", "Ordem exata dos 6 parâmetros do corpo do template entrega_pendente na Meta."],
    ["Parametros Body venda_pendente", "RESPONSAVEL,DESCRICAO,CLIENTE,PLACA,VEICULO,NEGOCIACAO", "Ordem exata dos 6 parâmetros do corpo do template venda_pendente na Meta."],
    ["Parametros Body followup_sistema", "RESPONSAVEL,DESCRICAO,CLIENTE,PLACA,VEICULO,NEGOCIACAO", "Ordem exata dos 6 parâmetros do corpo do template followup_sistema na Meta."],
    ["Parametros Body escalonamento_gerente", "RESPONSAVEL,DESCRICAO,CLIENTE,PLACA,VEICULO,NEGOCIACAO", "Ordem exata dos 6 parâmetros do corpo do template escalonamento_gerente na Meta."],
    ["Parametros Body nova_pendencia_importada", "RESPONSAVEL,LOJA,NEGOCIACAO,PLACA,CLIENTE,VEICULO", "Ajuste conforme a quantidade de variáveis do template nova_pendencia_importada na Meta."]
  ];

  var dados = aba.getDataRange().getValues();
  var existentes = {};

  for (var i = 1; i < dados.length; i++) {
    existentes[normalizarTexto(dados[i][0])] = i + 1;
  }

  var adicionadas = 0;
  var preservadas = 0;

  for (var c = 0; c < configs.length; c++) {
    var chaveNorm = normalizarTexto(configs[c][0]);
    var linhaExistente = existentes[chaveNorm];

    if (!linhaExistente) {
      aba.appendRow(configs[c]);
      adicionadas++;
      continue;
    }

    // Não sobrescreve token, phone ID, horários e WhatsApps já existentes.
    // Só completa observação vazia.
    if (String(aba.getRange(linhaExistente, 3).getValue() || "").trim() === "") {
      aba.getRange(linhaExistente, 3).setValue(configs[c][2]);
    }
    preservadas++;
  }

  prepararParametrosTemplatesMetaEasyCar(false);
  garantirConfiguracaoTravaHorario_();

  SpreadsheetApp.getUi().alert(
    "Configurações Meta/Templates verificadas.\n\n" +
    "Novas configurações adicionadas: " + adicionadas + "\n" +
    "Configurações já existentes preservadas: " + preservadas
  );
}

function verificarConfiguracaoRobo() {
  var modo = buscarConfiguracaoSegura("Modo Envio WhatsApp", "TESTE");
  var tokenApi = buscarConfiguracaoSegura("Token API", "");
  var webhookToken = buscarConfiguracaoSegura("Webhook Verify Token", "");
  var planilhaFonteId = buscarConfiguracaoSegura("Planilha Fonte ID", "");
  var phoneNumberId = buscarConfiguracaoSegura("WhatsApp Phone Number ID", "");
  var accessToken = buscarConfiguracaoSegura("WhatsApp Access Token", "");

  SpreadsheetApp.getUi().alert(
    "Configuracao atual do robo:\n\n" +
    "Modo Envio WhatsApp: " + modo + "\n" +
    "Token API configurado: " + (tokenApi ? "Sim" : "Nao") + "\n" +
    "Webhook Verify Token configurado: " + (webhookToken ? "Sim" : "Nao") + "\n" +
    "Planilha Fonte ID configurada: " + (planilhaFonteId ? "Sim" : "Nao") + "\n" +
    "Phone Number ID configurado: " + (phoneNumberId ? "Sim" : "Nao") + "\n" +
    "Access Token configurado: " + (accessToken ? "Sim" : "Nao") + "\n" +
    "Abas fonte por GID: " + ABAS_FONTE_POR_MES.length
  );
}

/****************************************************
 * ROTINAS DE EXECUCAO
 ****************************************************/

function executarRoboPendenciasTeste() {
  var resumo = processarPendencias(true);

  var avisoBloqueio = resumo.bloqueadoHorario
    ? "\n\nATENÇÃO: execução bloqueada pela trava de horário. Para testar agora, use: Desativar trava de horário."
    : "";

  SpreadsheetApp.getUi().alert(
    "Teste finalizado.\n\n" +
    "Pendencias processadas: " + resumo.processadas + "\n" +
    "Pendencias ignoradas: " + resumo.ignoradas + "\n" +
    "Erros encontrados: " + resumo.erros +
    avisoBloqueio
  );
}

function executarRoboPendenciasAutomaticoManual() {
  var modo = String(buscarConfiguracaoSegura("Modo Envio WhatsApp", "TESTE")).trim().toUpperCase();
  var modoTeste = modo !== "REAL";
  var resumo = processarPendencias(modoTeste);

  var avisoBloqueio = resumo.bloqueadoHorario
    ? "\n\nATENÇÃO: execução bloqueada pela trava de horário. Para testar agora, use: Desativar trava de horário."
    : "";

  SpreadsheetApp.getUi().alert(
    "Execucao finalizada.\n\n" +
    "Modo: " + modo + "\n" +
    "Pendencias processadas: " + resumo.processadas + "\n" +
    "Pendencias ignoradas: " + resumo.ignoradas + "\n" +
    "Erros encontrados: " + resumo.erros +
    avisoBloqueio
  );
}

function executarRoboPendenciasAutomatico() {
  var modo = String(buscarConfiguracaoSegura("Modo Envio WhatsApp", "TESTE")).trim().toUpperCase();
  var modoTeste = modo !== "REAL";
  processarPendencias(modoTeste);
}

function importarEProcessarPendenciasAutomatico() {
  importarPendenciasDaPlanilhaFonte({
    notificarNovas: true,
    origem: "automatico"
  });

  executarRoboPendenciasAutomatico();
}

function importarEProcessarPendenciasManual() {
  var importacao = importarPendenciasDaPlanilhaFonte({ notificarNovas: false, origem: "manual" });
  var modo = String(buscarConfiguracaoSegura("Modo Envio WhatsApp", "TESTE")).trim().toUpperCase();
  var modoTeste = modo !== "REAL";
  var processamento = processarPendencias(modoTeste);

  SpreadsheetApp.getUi().alert(
    "Importacao e processamento finalizados.\n\n" +
    "Abas lidas: " + (importacao.abas_lidas || 0) + "\n" +
    "Abas nao encontradas: " + (importacao.abas_nao_encontradas || 0) + "\n" +
    "Importadas: " + (importacao.importadas || 0) + "\n" +
    "Ignoradas: " + (importacao.ignoradas || 0) + "\n" +
    "Duplicadas: " + (importacao.duplicadas || 0) + "\n\n" +
    "Processadas pelo robo: " + processamento.processadas + "\n" +
    "Ignoradas pelo robo: " + processamento.ignoradas + "\n" +
    "Erros: " + processamento.erros
  );
}

/****************************************************
 * CONFIGURACOES AUTOMATICAS
 ****************************************************/

function configurarAcionadorAutomaticoConfiguravel() {
  var funcao = "executarAtualizadorAutomaticoConfiguravel";
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (
      triggers[i].getHandlerFunction() === funcao ||
      triggers[i].getHandlerFunction() === "importarEProcessarPendenciasAutomatico"
    ) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // O Apps Script trabalha melhor com um acionador curto.
  // A frequencia real é controlada pela configuracao:
  // "Intervalo atualização fonte minutos".
  ScriptApp.newTrigger(funcao)
    .timeBased()
    .everyMinutes(5)
    .create();

  SpreadsheetApp.getUi().alert(
    "Acionador configurável criado com sucesso.\n\n" +
    "O Apps Script vai verificar a cada 5 minutos, mas só vai importar/processar quando passar o intervalo definido na aba CONFIGURACOES."
  );
}

function configurarAcionadorAutomatico15Minutos() {
  configurarAcionadorAutomaticoConfiguravel();
}

function executarAtualizadorAutomaticoConfiguravel() {
  if (!deveExecutarAtualizacaoFonteAgora()) {
    return;
  }

  registrarExecucaoAtualizacaoFonteAgora();

  importarPendenciasDaPlanilhaFonte({
    notificarNovas: true,
    origem: "automatico"
  });

  executarRoboPendenciasAutomatico();
}

function deveExecutarAtualizacaoFonteAgora() {
  var props = PropertiesService.getScriptProperties();
  var ultima = Number(props.getProperty("ULTIMA_ATUALIZACAO_FONTE_MS") || 0);
  var agora = new Date().getTime();
  var intervaloMinutos = obterIntervaloAtualizacaoFonteMinutos();
  var intervaloMs = intervaloMinutos * 60 * 1000;

  return !ultima || (agora - ultima) >= intervaloMs;
}

function registrarExecucaoAtualizacaoFonteAgora() {
  PropertiesService.getScriptProperties().setProperty("ULTIMA_ATUALIZACAO_FONTE_MS", String(new Date().getTime()));
}

function obterIntervaloAtualizacaoFonteMinutos() {
  var valor = Number(buscarConfiguracaoSegura("Intervalo atualização fonte minutos", 20));

  if (!valor || valor < 5) {
    return 20;
  }

  return valor;
}

function obterDelayNovaPendenciaSegundos() {
  var valor = Number(buscarConfiguracaoSegura("Delay envio nova pendência segundos", 30));

  if (isNaN(valor) || valor < 0) {
    return 30;
  }

  return valor;
}

function configurarIdAutomaticoPendencias() {
  configurarIdAutomaticoPendenciasBase_(true);
}


/****************************************************
 * VALIDACOES DINAMICAS DA ABA PENDENCIAS
 ****************************************************/

function garantirValidacoesPendencias() {
  garantirValidacoesPendenciasBase_(true);
}


function garantirValidacoesPendenciasSilencioso() {
  garantirValidacoesPendenciasBase_(false);
}


function obterValoresListaPorCabecalho(nomeCabecalho, colunaPadrao) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.LISTAS);

  if (!aba) {
    throw new Error("Aba LISTAS nao encontrada.");
  }

  var dados = aba.getDataRange().getValues();
  var valores = [];
  var vistos = {};

  if (dados.length < 2) return valores;

  var cabecalhos = [];

  for (var c = 0; c < dados[0].length; c++) {
    cabecalhos.push(normalizarTexto(dados[0][c]));
  }

  var indice = cabecalhos.indexOf(normalizarTexto(nomeCabecalho));
  if (indice < 0) indice = colunaPadrao - 1;

  for (var i = 1; i < dados.length; i++) {
    var valor = String(dados[i][indice] || "").trim();
    if (!valor) continue;

    var chave = normalizarTexto(valor);
    if (!vistos[chave]) {
      valores.push(valor);
      vistos[chave] = true;
    }
  }

  return valores;
}

function aplicarValidacaoComLista(aba, linhaInicial, coluna, qtdLinhas, valoresPermitidos) {
  if (!valoresPermitidos || valoresPermitidos.length === 0) return;

  var regra = SpreadsheetApp.newDataValidation()
    .requireValueInList(valoresPermitidos, true)
    .setAllowInvalid(false)
    .build();

  aba.getRange(linhaInicial, coluna, qtdLinhas, 1).setDataValidation(regra);
}

/****************************************************
 * IMPORTACAO DA PLANILHA FONTE
 ****************************************************/

function importarPendenciasDaPlanilhaFonte(opcoes) {
  opcoes = opcoes || {};
  var ssDestino = SpreadsheetApp.getActiveSpreadsheet();
  var abaPendencias = ssDestino.getSheetByName(ABAS.PENDENCIAS);

  if (!abaPendencias) {
    throw new Error("Aba PENDENCIAS nao encontrada.");
  }

  garantirValidacoesPendenciasSilencioso();

  var importacaoAtiva = String(buscarConfiguracaoSegura("Importacao Automatica Ativa?", "Sim")).trim();

  if (normalizarTexto(importacaoAtiva) !== "sim") {
    return { sucesso: false, mensagem: "Importacao automatica esta desativada.", abas_lidas: 0, abas_nao_encontradas: 0, importadas: 0, ignoradas: 0, duplicadas: 0 };
  }

  var planilhaFonteId = buscarConfiguracaoSegura("Planilha Fonte ID", PLANILHA_FONTE_PADRAO_ID);
  if (!planilhaFonteId) throw new Error("Planilha Fonte ID nao configurado.");

  var ssFonte = SpreadsheetApp.openById(planilhaFonteId);
  var resultadoAbas = obterAbasMensaisParaImportar(ssFonte);
  var abasMeses = resultadoAbas.abas;
  var chavesExistentes = montarChavesPendenciasExistentes(abaPendencias);

  var importadas = 0;
  var ignoradas = 0;
  var duplicadas = 0;
  var abasLidas = 0;
  var itensImportadosParaNotificar = [];

  for (var a = 0; a < abasMeses.length; a++) {
    var registroAba = abasMeses[a];
    var nomeMes = registroAba.mes;
    var abaFonte = registroAba.aba;
    var dadosFonte = abaFonte.getDataRange().getValues();

    if (dadosFonte.length <= 1) continue;
    abasLidas++;

    for (var i = 1; i < dadosFonte.length; i++) {
      var linhaFonte = dadosFonte[i];
      if (linhaVazia(linhaFonte)) continue;

      var itemFonte = extrairItemDaPlanilhaMensalFonte(linhaFonte, nomeMes);
      if (!linhaMensalEhImportavel(itemFonte)) {
        ignoradas++;
        continue;
      }

      var chave = criarChavePendenciaMensal(itemFonte);
      if (chavesExistentes[chave]) {
        duplicadas++;
        continue;
      }

      var novaLinha = montarLinhaPendenciaImportadaMensal(itemFonte);
      var linhaInserida = gravarLinhaPendencia(abaPendencias, novaLinha);
      itemFonte.linhaPendencia = linhaInserida;
      itemFonte.idPendencia = linhaInserida - 1;
      chavesExistentes[chave] = true;
      importadas++;
      itensImportadosParaNotificar.push(itemFonte);
    }
  }

  if (opcoes.notificarNovas && itensImportadosParaNotificar.length > 0) {
    notificarNovasPendenciasImportadas(itensImportadosParaNotificar, opcoes.origem || "automatico");
  }

  return {
    sucesso: true,
    mensagem: "Importacao mensal finalizada.",
    abas_lidas: abasLidas,
    abas_nao_encontradas: resultadoAbas.naoEncontradas.length,
    nao_encontradas: resultadoAbas.naoEncontradas,
    abas_detalhes: resultadoAbas.abas.map(function (item) {
      return { mes: item.mes, nomeReal: item.nomeReal, gid: item.gid };
    }),
    importadas: importadas,
    ignoradas: ignoradas,
    duplicadas: duplicadas
  };
}

function importarPendenciasAgora() {
  var resultado = importarPendenciasDaPlanilhaFonte({ notificarNovas: false, origem: "manual" });

  var detalhesAbas = (resultado.abas_detalhes || []).map(function (item) {
    return item.mes + " -> " + item.nomeReal + " (gid " + item.gid + ")";
  }).join("\n");

  SpreadsheetApp.getUi().alert(
    "Importacao finalizada.\n\n" +
    "Abas lidas: " + (resultado.abas_lidas || 0) + "\n" +
    "Abas nao encontradas: " + (resultado.abas_nao_encontradas || 0) + "\n" +
    "Importadas: " + (resultado.importadas || 0) + "\n" +
    "Ignoradas: " + (resultado.ignoradas || 0) + "\n" +
    "Duplicadas: " + (resultado.duplicadas || 0) + "\n\n" +
    "Abas consultadas:\n" + detalhesAbas + "\n\n" +
    "Mensagem: " + resultado.mensagem
  );
}

function obterAbasMensaisParaImportar(ssFonte) {
  var abas = [];
  var naoEncontradas = [];

  for (var i = 0; i < ABAS_FONTE_POR_MES.length; i++) {
    var config = ABAS_FONTE_POR_MES[i];
    var aba = null;

    if (config.gid !== null && typeof config.gid !== "undefined") {
      aba = ssFonte.getSheetById(Number(config.gid));
    }

    if (!aba) aba = ssFonte.getSheetByName(config.mes);

    if (aba) {
      abas.push({ mes: config.mes, aba: aba, gid: aba.getSheetId(), nomeReal: aba.getName() });
    } else {
      naoEncontradas.push(config.mes);
    }
  }

  return { abas: abas, naoEncontradas: naoEncontradas };
}

function extrairItemDaPlanilhaMensalFonte(linha, nomeMes) {
  var loja = linha[0];
  var dataVenda = linha[1];
  var vendedor = linha[2];
  var placa = linha[3];
  var modelo = linha[4];
  var tv = linha[5];
  var statusFonte = linha[6];
  var pendenciaDetalhe = linha[7];
  var negociacao = linha[8];
  var clienteFonte = linha[10];

  var responsavel = normalizarNomeResponsavelImportado(vendedor);
  var whatsappResponsavel = buscarWhatsappResponsavelConfiguracao(responsavel);
  var tipo = classificarTipoPendenciaMensal(statusFonte, modelo, placa);
  var negociacaoFormatada = formatarCodigoComHash(negociacao);

  var descricao =
    "Pendencia importada da aba " + nomeMes +
    " | Status na origem: " + (statusFonte || "Nao informado") +
    " | Detalhe: " + (pendenciaDetalhe || "Nao informado") +
    " | Data da venda: " + formatarDataTexto(dataVenda) +
    " | TV: " + (tv || "") +
    " | Negociacao: " + negociacaoFormatada;

  return {
    cliente: String(clienteFonte || "Cliente nao informado").trim(),
    whatsapp: whatsappResponsavel,
    tipo: tipo,
    descricao: descricao,
    responsavel: responsavel,
    loja: loja || buscarConfiguracaoSegura("Unidade Padrao", "EasyCar Matriz"),
    negociacao: negociacaoFormatada,
    lead: "",
    placa: String(placa || "").trim().toUpperCase(),
    veiculo: modelo,
    statusFonte: statusFonte,
    pendenciaDetalhe: pendenciaDetalhe,
    observacaoFonte: descricao,
    tipoFonte: statusFonte,
    dataVenda: dataVenda,
    mesReferencia: nomeMes,
    tv: tv
  };
}

function linhaMensalEhImportavel(item) {
  if (!item.negociacao) return false;
  if (!item.responsavel) return false;

  var statusNormalizado = normalizarTexto(item.statusFonte);
  if (!statusNormalizado) return false;

  var importarSomenteListados = normalizarTexto(buscarConfiguracaoSegura("Importar somente status fonte listados?", "Sim")) === "sim";
  if (!importarSomenteListados) return true;

  var tiposPermitidos = obterValoresListaPorCabecalho("Tipo", 8).map(function (tipo) {
    return normalizarTexto(tipo);
  });

  var statusExtras = [
    "carro nao entregue",
    "veiculo nao entregue",
    "processo com o vendedor",
    "processo com a gerencia",
    "pendencia vendedor",
    "pendencia gerencia",
    "outras pendencias",
    "entregue com pendencia vendedor",
    "entregue com pendencia gerencia",
    "processo entregue com pendencia vendedor",
    "processo entregue com pendencia gerencia"
  ];

  for (var i = 0; i < tiposPermitidos.length; i++) {
    if (statusNormalizado === tiposPermitidos[i]) return true;
  }

  for (var j = 0; j < statusExtras.length; j++) {
    if (statusNormalizado === statusExtras[j]) return true;
  }

  return false;
}

function classificarTipoPendenciaMensal(statusFonte, modelo, placa) {
  var status = normalizarTexto(statusFonte);
  var texto = normalizarTexto([statusFonte, modelo, placa].join(" "));

  if (status === "pendencia vendedor") return "Pendência vendedor";
  if (status === "pendencia gerencia") return "Pendência gerência";
  if (status === "outras pendencias") return "Outras pendências";
  if (status === "processo entregue com pendencia vendedor") return "Processo entregue com pendência vendedor";
  if (status === "entregue com pendencia vendedor") return "Processo entregue com pendência vendedor";
  if (status === "processo entregue com pendencia gerencia") return "Processo entregue com pendência gerência";
  if (status === "entregue com pendencia gerencia") return "Processo entregue com pendência gerência";
  if (status === "processo com o vendedor") return "Processo com o Vendedor";
  if (status === "processo com a gerencia") return "Processo com a gerência";
  if (status === "veiculo nao entregue" || status === "carro nao entregue") return "Veículo não entregue";

  if (texto.indexOf("nao entregue") >= 0 || texto.indexOf("não entregue") >= 0) return "Veículo não entregue";
  if (texto.indexOf("contrato") >= 0) return "Contrato pendente";
  if (texto.indexOf("financeiro") >= 0) return "Pendência financeira";
  if (texto.indexOf("documento") >= 0 || texto.indexOf("documentacao") >= 0 || texto.indexOf("documentação") >= 0) return "Documentação interna";
  if (texto.indexOf("renave") >= 0) return "Pendência Renave";
  if (texto.indexOf("laudo") >= 0 || texto.indexOf("vistoria") >= 0 || texto.indexOf("cautelar") >= 0) return "Laudo pendente";
  if (texto.indexOf("preparacao") >= 0 || texto.indexOf("preparação") >= 0) return "Preparação pendente";
  if (texto.indexOf("pos-venda") >= 0 || texto.indexOf("pós-venda") >= 0 || texto.indexOf("garantia") >= 0) return "Pós-venda pendente";
  if (texto.indexOf("compra") >= 0) return "Processo de compra pendente";
  if (texto.indexOf("venda") >= 0) return "Processo de venda pendente";

  return "Outras pendências";
}

function montarLinhaPendenciaImportadaMensal(item) {
  var dataInicial = item.dataVenda instanceof Date ? item.dataVenda : new Date();
  var dataVencimento = adicionarDias(new Date(), 3);
  var horaInicio = buscarConfiguracaoSegura("Hora inicial padrao", "09:00");
  var horaFim = buscarConfiguracaoSegura("Hora final padrao", "18:40");
  var prioridade = buscarConfiguracaoSegura("Prioridade padrao", "Alta");
  var proximoEnvio = calcularProximoHorarioConfiguradoPorPrioridade(prioridade, new Date());
  var maximoEnvios = Number(buscarConfiguracaoSegura("Máximo de envios por pendência", 5));

  if (!maximoEnvios || maximoEnvios < 1) {
    maximoEnvios = 5;
  }

  var responsavel = item.responsavel || "";
  var whatsappResponsavel = item.whatsapp || buscarWhatsappResponsavelConfiguracao(responsavel);

  return [
    "",
    responsavel,
    whatsappResponsavel,
    item.cliente,
    String(item.placa || "").trim().toUpperCase(),
    item.veiculo,
    item.negociacao,
    item.descricao,
    item.lead,
    prioridade,
    "Pendente",
    item.tipo,
    item.loja,
    "Responsável",
    dataInicial,
    dataVencimento,
    buscarConfiguracaoSegura("Frequencia padrao", "Diário"),
    "Seg, Ter, Qua, Qui, Sex",
    horaInicio,
    horaFim,
    "",
    proximoEnvio,
    maximoEnvios,
    0,
    obterTemplateSeguroParaTipo(item.tipo),
    "Importado automaticamente da planilha fonte mensal.",
    obterMaximoEnviosDiaPorPrioridade(prioridade, null),
    "Sim",
    item.mesReferencia,
    "Planilha VENDAS MATRIZ"
  ];
}


function notificarNovasPendenciasImportadas(itens, origem) {
  var ativo = normalizarTexto(buscarConfiguracaoSegura("Notificar novas pendências importadas?", "Sim"));
  if (ativo !== "sim") return;

  var telefone = limparTelefone(
    buscarConfiguracaoSegura("WhatsApp gerente novas pendências", "") ||
    buscarConfiguracaoSegura("WhatsApp Dagoberto Ramos", "11934718276")
  );

  if (!telefone) return;

  var delay = obterDelayNovaPendenciaSegundos();
  if (delay > 0) {
    Utilities.sleep(Math.min(delay, 120) * 1000);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaHistorico = ss.getSheetByName(ABAS.HISTORICO);
  if (abaHistorico) garantirCabecalhoHistorico(abaHistorico);

  for (var i = 0; i < itens.length; i++) {
    var item = itens[i];
    var codigoTemplate = buscarConfiguracaoSegura("Template nova pendência importada", "nova_pendencia_importada");
    var template = buscarTemplate(codigoTemplate);
    var mensagem = montarMensagemNovaPendenciaImportada(item);

    var itemHistorico = {
      id: item.idPendencia || "",
      cliente: item.cliente,
      whatsappCliente: telefone,
      tipo: "Nova pendência importada",
      descricao: item.descricao,
      responsavel: "Dagoberto Ramos",
      whatsappResponsavel: telefone,
      loja: item.loja,
      negociacao: item.negociacao,
      lead: item.lead,
      placa: item.placa,
      veiculo: item.veiculo,
      prioridade: buscarConfiguracaoSegura("Prioridade padrao", "Alta"),
      destinatario: "Gerente",
      status: "Pendente",
      template: codigoTemplate,
      totalEnviado: 0,
      mesReferencia: item.mesReferencia || "",
      fonte: "Planilha VENDAS MATRIZ"
    };

    var resultado;
    if (usarTemplatesMeta_() && template.encontrado) {
      resultado = enviarMensagemPendenciaMetaOuTexto_(telefone, mensagem, template, itemHistorico, { nome: "Dagoberto Ramos", whatsapp: telefone });
    } else {
      resultado = enviarWhatsAppReal(telefone, mensagem);
      resultado.statusSucesso = "NOVA PENDENCIA NOTIFICADA";
      resultado.statusErro = "ERRO AO NOTIFICAR NOVA PENDENCIA";
    }

    if (abaHistorico) {
      registrarHistorico(
        abaHistorico,
        itemHistorico,
        telefone,
        mensagem,
        resultado.sucesso ? (resultado.statusSucesso || "NOVA PENDENCIA NOTIFICADA") : (resultado.statusErro || "ERRO AO NOTIFICAR NOVA PENDENCIA"),
        resultado.retorno,
        "Atualizador automatico",
        "",
        resultado.messageId || "",
        "",
        "",
        ""
      );
    }
  }
}


function montarMensagemNovaPendenciaImportada(item) {
  var template = buscarTemplate("nova_pendencia_importada");
  var descricaoLimpa = extrairDescricaoLimpa(item.descricao);
  var mensagemPadrao =
    "🚨 *Nova Pendência Identificada* 🚨\n\n" +
    "Olá, *Dagoberto Ramos*.\n\n" +
    "O atualizador automático identificou uma nova pendência na planilha fonte.\n\n" +
    "👤 *Vendedor/Responsável:* [RESPONSAVEL]\n" +
    "🏢 *Loja:* [LOJA]\n" +
    "🤝 *Negociação:* [NEGOCIACAO]\n" +
    "🚗 *Placa:* [PLACA]\n" +
    "👤 *Cliente:* [CLIENTE]\n" +
    "🚗 *Veículo:* [VEICULO]\n" +
    "⚠️ *Pendência:* *[PENDENCIA]*\n\n" +
    "Por gentileza, acompanhar a cobrança e garantir a atualização do processo.\n\n" +
    "Central de Pendências – EasyCar Veículos.";

  var mensagem = template.encontrado ? String(template.mensagem || "") : mensagemPadrao;
  mensagem = mensagem.replace(/\\n/g, "\n");

  var substituicoes = {
    "[RESPONSAVEL]": item.responsavel,
    "[LOJA]": item.loja,
    "[NEGOCIACAO]": item.negociacao,
    "[PLACA]": item.placa,
    "[CLIENTE]": item.cliente,
    "[VEICULO]": item.veiculo,
    "[PENDENCIA]": descricaoLimpa,
    "[DESCRICAO_LIMPA]": descricaoLimpa,
    "[MES_REFERENCIA]": item.mesReferencia || ""
  };

  var chaves = Object.keys(substituicoes);
  for (var i = 0; i < chaves.length; i++) {
    mensagem = mensagem.split(chaves[i]).join(substituicoes[chaves[i]] || "");
  }

  return mensagem;
}

/****************************************************
 * DUPLICIDADE POR NEGOCIACAO
 ****************************************************/

function montarChavesPendenciasExistentes(abaPendencias) {
  var dados = abaPendencias.getDataRange().getValues();
  var chaves = {};

  for (var i = 1; i < dados.length; i++) {
    var chave = criarChavePendenciaMensal({ negociacao: dados[i][PEND_COL.NEGOCIACAO - 1] || "" });
    if (chave) chaves[chave] = true;
  }

  return chaves;
}


function criarChavePendenciaMensal(item) {
  var negociacao = normalizarTexto(item.negociacao || "");
  if (!negociacao) return "";
  return "negociacao|" + negociacao;
}

function removerDuplicadasPorNegociacao() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.PENDENCIAS);
  if (!aba) throw new Error("Aba PENDENCIAS nao encontrada.");

  var dados = aba.getDataRange().getValues();
  var chaves = {};
  var removidas = 0;

  for (var i = 1; i < dados.length; i++) {
    var chave = criarChavePendenciaMensal({ negociacao: dados[i][PEND_COL.NEGOCIACAO - 1] || "" });
    if (!chave) continue;

    if (chaves[chave]) {
      aba.getRange(i + 1, PEND_COL.RESPONSAVEL, 1, PEND_HEADERS_NOVO.length - 1).clearContent();
      removidas++;
    } else {
      chaves[chave] = true;
    }
  }

  SpreadsheetApp.getUi().alert("Duplicadas removidas por numero de negociacao: " + removidas);
}


function removerDuplicadasImportadasPendencias() {
  removerDuplicadasPorNegociacao();
}

/****************************************************
 * GRAVAR NA PRIMEIRA LINHA VAZIA
 ****************************************************/

function encontrarPrimeiraLinhaVaziaPendencias(abaPendencias) {
  var linhaInicial = 2;
  var colunaBase = 2;
  var totalLinhas = abaPendencias.getMaxRows();
  var quantidade = totalLinhas - linhaInicial + 1;
  var valores = abaPendencias.getRange(linhaInicial, colunaBase, quantidade, 1).getDisplayValues();

  for (var i = 0; i < valores.length; i++) {
    var valor = String(valores[i][0] || "").trim();
    if (valor === "") return linhaInicial + i;
  }

  abaPendencias.insertRowsAfter(totalLinhas, 100);
  return totalLinhas + 1;
}

function gravarLinhaPendencia(abaPendencias, novaLinhaCompleta) {
  var linhaDestino = encontrarPrimeiraLinhaVaziaPendencias(abaPendencias);
  var dadosSemId = novaLinhaCompleta.slice(1);
  abaPendencias.getRange(linhaDestino, 2, 1, dadosSemId.length).setValues([dadosSemId]);
  return linhaDestino;
}

/****************************************************
 * PROCESSAMENTO DE COBRANCA
 ****************************************************/

function processarPendencias(modoTeste) {
  if (!bloquearExecucaoForaDoHorarioSeNecessario_()) {
    return { processadas: 0, ignoradas: 0, erros: 0, bloqueadoHorario: true };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaPendencias = ss.getSheetByName(ABAS.PENDENCIAS);
  var abaHistorico = ss.getSheetByName(ABAS.HISTORICO);

  if (!abaPendencias) throw new Error("Aba PENDENCIAS nao encontrada.");
  if (!abaHistorico) throw new Error("Aba HISTORICO_ENVIOS nao encontrada.");

  garantirCabecalhoHistorico(abaHistorico);
  garantirValidacoesPendenciasSilencioso();

  var dados = abaPendencias.getDataRange().getValues();
  var totalProcessadas = 0;
  var totalIgnoradas = 0;
  var totalErros = 0;

  for (var i = 1; i < dados.length; i++) {
    var item = montarItemPendencia(dados[i], i + 1);

    if (!item.temConteudo) continue;

    item = atualizarPrioridadeSeVencida(abaPendencias, item);

    var validacao = podeEnviarCobranca(item);
    if (!validacao.pode) {
      totalIgnoradas++;
      continue;
    }

    var responsavel = buscarResponsavel(item.responsavel);
    if (!responsavel.encontrado && item.whatsappResponsavel) {
      responsavel = { encontrado: true, nome: item.responsavel, whatsapp: item.whatsappResponsavel };
    }

    if (!responsavel.encontrado) {
      registrarHistorico(abaHistorico, item, "", "", "Nao enviado", "Responsavel nao encontrado ou sem WhatsApp configurado.", "Robo de Pendencias", "", "", "", "", "");
      totalErros++;
      continue;
    }

    var template = buscarTemplate(item.template);
    if (!template.encontrado) {
      registrarHistorico(abaHistorico, item, responsavel.whatsapp, "", "Nao enviado", "Template nao encontrado na aba TEMPLATES.", "Robo de Pendencias", "", "", "", "", "");
      totalErros++;
      continue;
    }

    var mensagem = montarMensagem(template.mensagem, item, responsavel);
    var statusEnvio = "";
    var retornoApi = "";
    var envioContabilizado = false;
    var whatsappMessageId = "";

    if (modoTeste) {
      statusEnvio = usarTemplatesMeta_() ? "SIMULADO - TEMPLATE META NAO ENVIADO" : "SIMULADO - TEXTO LIVRE NAO ENVIADO";
      retornoApi = "Mensagem montada em modo teste.";
      envioContabilizado = true;
    } else {
      var resultadoEnvio = enviarMensagemPendenciaMetaOuTexto_(responsavel.whatsapp, mensagem, template, item, responsavel);
      statusEnvio = resultadoEnvio.sucesso ? resultadoEnvio.statusSucesso : resultadoEnvio.statusErro;
      retornoApi = resultadoEnvio.retorno;
      whatsappMessageId = resultadoEnvio.messageId || "";
      envioContabilizado = resultadoEnvio.sucesso;
    }

    var proximoEnvio = envioContabilizado ? calcularProximoEnvioAposEnvio(item) : item.proximoEnvio || "";

    registrarHistorico(abaHistorico, item, responsavel.whatsapp, mensagem, statusEnvio, retornoApi, "Robo de Pendencias", proximoEnvio, whatsappMessageId, "", "", "");

    if (envioContabilizado) {
      atualizarPendenciaAposEnvio(abaPendencias, item.linhaPlanilha, item, proximoEnvio);
      totalProcessadas++;
    } else {
      totalErros++;
    }
  }

  return { processadas: totalProcessadas, ignoradas: totalIgnoradas, erros: totalErros };
}


function montarItemPendencia(linha, numeroLinha) {
  return {
    linhaPlanilha: numeroLinha,
    id: linha[PEND_COL.ID - 1] || (numeroLinha - 1),
    responsavel: linha[PEND_COL.RESPONSAVEL - 1],
    whatsappResponsavel: linha[PEND_COL.WHATSAPP - 1],
    cliente: linha[PEND_COL.CLIENTE - 1],
    whatsappCliente: linha[PEND_COL.WHATSAPP - 1],
    placa: linha[PEND_COL.PLACA - 1],
    veiculo: linha[PEND_COL.VEICULO - 1],
    negociacao: linha[PEND_COL.NEGOCIACAO - 1],
    descricao: linha[PEND_COL.DESCRICAO - 1],
    lead: linha[PEND_COL.LEAD - 1],
    prioridade: linha[PEND_COL.PRIORIDADE - 1],
    status: linha[PEND_COL.STATUS - 1],
    tipo: linha[PEND_COL.TIPO - 1],
    loja: linha[PEND_COL.LOJA - 1],
    destinatario: linha[PEND_COL.DESTINATARIO - 1],
    dataInicial: linha[PEND_COL.DATA_INICIAL - 1],
    dataVencimento: linha[PEND_COL.DATA_VENCIMENTO - 1],
    frequencia: linha[PEND_COL.FREQUENCIA - 1],
    diasPermitidos: linha[PEND_COL.DIAS_PERMITIDOS - 1],
    horaInicio: linha[PEND_COL.HORA_INICIO - 1],
    horaFim: linha[PEND_COL.HORA_FIM - 1],
    ultimoEnvio: linha[PEND_COL.ULTIMO_ENVIO - 1],
    proximoEnvio: linha[PEND_COL.PROXIMO_ENVIO - 1],
    maximoEnvios: linha[PEND_COL.MAXIMO_ENVIOS - 1],
    totalEnviado: linha[PEND_COL.TOTAL_ENVIADO - 1],
    template: linha[PEND_COL.TEMPLATE - 1],
    observacoes: linha[PEND_COL.OBSERVACOES - 1],
    enviosPorDia: linha[PEND_COL.ENVIOS_POR_DIA - 1],
    envioAutomatico: linha[PEND_COL.ENVIO_AUTOMATICO - 1],
    mesReferencia: linha[PEND_COL.MES_REFERENCIA - 1],
    fonte: linha[PEND_COL.FONTE - 1],
    temConteudo: Boolean(
      linha[PEND_COL.RESPONSAVEL - 1] ||
      linha[PEND_COL.CLIENTE - 1] ||
      linha[PEND_COL.DESCRICAO - 1] ||
      linha[PEND_COL.NEGOCIACAO - 1] ||
      linha[PEND_COL.PLACA - 1] ||
      linha[PEND_COL.VEICULO - 1]
    )
  };
}


function atualizarPrioridadeSeVencida(abaPendencias, item) {
  if (!(item.dataVencimento instanceof Date)) return item;

  var status = String(item.status || "").trim();
  if (status === "Resolvido" || status === "Pausado" || status === "Cancelado") return item;

  var hoje = zerarHorario(new Date());
  var vencimento = zerarHorario(item.dataVencimento);

  if (vencimento <= hoje && normalizarTexto(item.prioridade) !== "critica") {
    abaPendencias.getRange(item.linhaPlanilha, PEND_COL.PRIORIDADE).setValue("Crítica");
    item.prioridade = "Crítica";
  }

  return item;
}


function podeEnviarCobranca(item) {
  var status = normalizarTexto(item.status || "");

  /****************************************************
   * BLOQUEIOS QUE SEMPRE DEVEM SER RESPEITADOS
   ****************************************************/
  if (status === "resolvido" || status === "pausado" || status === "cancelado") {
    return { pode: false, motivo: "Status bloqueado." };
  }

  if (normalizarTexto(item.frequencia || "") === "manual") {
    return { pode: false, motivo: "Frequencia manual." };
  }

  if (normalizarTexto(item.envioAutomatico || "Sim") === "nao") {
    return { pode: false, motivo: "Envio automatico desligado." };
  }

  if (!item.responsavel) return { pode: false, motivo: "Sem responsavel." };
  if (!item.template) return { pode: false, motivo: "Sem template." };

  var totalEnviado = Number(item.totalEnviado || 0);
  var maximoEnvios = Number(item.maximoEnvios || 5);

  if (totalEnviado >= maximoEnvios) {
    return { pode: false, motivo: "Limite total atingido." };
  }

  /****************************************************
   * EXECUTAR AGORA SEM TRAVA DE HORÁRIO
   * Quando CONFIGURACOES > "Trava de horário ativa?" = "Não",
   * o robô ignora dia permitido, janela geral, hora da pendência,
   * limite diário, horário por prioridade e próximo envio.
   ****************************************************/
  if (travaHorarioEstaDesativadaParaEnvio_()) {
    return { pode: true, motivo: "Pode enviar. Trava de horário desativada." };
  }

  /****************************************************
   * REGRAS NORMAIS DE HORÁRIO
   ****************************************************/
  var agora = new Date();

  if (!diaPermitido(item.diasPermitidos, agora)) {
    return { pode: false, motivo: "Dia nao permitido." };
  }

  if (!dentroDaTravaGeralDeHorario(agora)) {
    return { pode: false, motivo: "Fora da trava geral de horario." };
  }

  if (!horarioPermitido(item.horaInicio, item.horaFim, agora)) {
    return { pode: false, motivo: "Fora do horario da pendencia." };
  }

  var limiteDia = obterLimiteEnviosPorDia(item);
  var enviadosHoje = contarEnviosHojePorPendencia(item.id);

  if (enviadosHoje >= limiteDia) {
    return { pode: false, motivo: "Limite diario atingido." };
  }

  if (usarHorariosPorPrioridade()) {
    var validacaoHorario = podeEnviarNoHorarioConfiguradoDaPrioridade(item, agora);
    if (!validacaoHorario.pode) return validacaoHorario;
  } else {
    if (item.proximoEnvio instanceof Date && item.proximoEnvio > agora) {
      return { pode: false, motivo: "Ainda nao chegou o proximo envio." };
    }
  }

  return { pode: true, motivo: "Pode enviar." };
}

function diaPermitido(diasPermitidos, dataAtual) {
  if (!diasPermitidos) return true;

  var texto = normalizarTexto(String(diasPermitidos));
  if (texto.indexOf("todos") >= 0) return true;

  var diaSemana = dataAtual.getDay();
  var mapa = {
    0: ["dom", "domingo"],
    1: ["seg", "segunda"],
    2: ["ter", "terca", "terca-feira"],
    3: ["qua", "quarta"],
    4: ["qui", "quinta"],
    5: ["sex", "sexta"],
    6: ["sab", "sabado"]
  };

  var opcoes = mapa[diaSemana];
  for (var i = 0; i < opcoes.length; i++) {
    if (texto.indexOf(opcoes[i]) >= 0) return true;
  }

  return false;
}

function horarioPermitido(horaInicio, horaFim, agora) {
  var minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  var inicio = converterHoraParaMinutos(horaInicio || buscarConfiguracaoSegura("Hora inicial padrao", "09:00"), 9 * 60);
  var fim = converterHoraParaMinutos(horaFim || buscarConfiguracaoSegura("Hora final padrao", "18:40"), 18 * 60 + 40);
  return minutosAgora >= inicio && minutosAgora <= fim;
}

function obterLimiteEnviosPorDia(item) {
  var prioridade = item ? item.prioridade : "";
  var porPrioridade = obterMaximoEnviosDiaPorPrioridade(prioridade, null);

  if (porPrioridade !== null && porPrioridade > 0) {
    return porPrioridade;
  }

  var valorItem = Number((item && item.enviosPorDia) || 0);
  if (valorItem > 0) return valorItem;

  var valorPadrao = Number(buscarConfiguracaoSegura("Quantidade cobranças por dia", 2));
  if (valorPadrao > 0) return valorPadrao;

  var frequencia = String((item && item.frequencia) || "").trim();
  if (frequencia === "Duas vezes ao dia") return 2;
  if (frequencia === "3x ao dia") return 3;
  if (frequencia === "4x ao dia") return 4;
  return 1;
}

function contarEnviosHojePorPendencia(idPendencia) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.HISTORICO);
  if (!aba || !idPendencia) return 0;

  var dados = aba.getDataRange().getValues();
  var hoje = new Date();
  var total = 0;

  for (var i = 1; i < dados.length; i++) {
    var dataEnvio = dados[i][0];
    var idHistorico = dados[i][1];
    var statusEnvio = normalizarTexto(dados[i][18] || "");

    if (!(dataEnvio instanceof Date)) continue;
    if (String(idHistorico).trim() !== String(idPendencia).trim()) continue;
    if (!mesmoDia(dataEnvio, hoje)) continue;
    if (statusEnvio === "nao enviado" || statusEnvio === "erro no envio") continue;

    total++;
  }

  return total;
}

function calcularProximoEnvioAposEnvio(item) {
  var agora = new Date();

  if (usarHorariosPorPrioridade()) {
    return calcularProximoHorarioConfiguradoPorPrioridade(item.prioridade, agora);
  }

  var proximo = new Date(agora);
  var frequencia = String(item.frequencia || "").trim();

  if (frequencia === "A cada 2 dias") {
    proximo.setDate(proximo.getDate() + 2);
    aplicarHoraInicial(item, proximo);
    return proximo;
  }

  if (frequencia === "A cada 3 dias") {
    proximo.setDate(proximo.getDate() + 3);
    aplicarHoraInicial(item, proximo);
    return proximo;
  }

  if (frequencia === "Semanal") {
    proximo.setDate(proximo.getDate() + 7);
    aplicarHoraInicial(item, proximo);
    return proximo;
  }

  var enviosPorDia = obterLimiteEnviosPorDia(item);
  var enviadosHojeAntes = contarEnviosHojePorPendencia(item.id);

  if (enviadosHojeAntes + 1 >= enviosPorDia) {
    proximo.setDate(proximo.getDate() + 1);
    aplicarHoraInicial(item, proximo);
    return proximo;
  }

  var intervalo = calcularIntervaloMinimoEntreEnvios(item);
  proximo.setMinutes(proximo.getMinutes() + intervalo);
  return proximo;
}

function calcularIntervaloMinimoEntreEnvios(item) {
  var enviosPorDia = obterLimiteEnviosPorDia(item);
  if (enviosPorDia <= 1) return 24 * 60;

  var inicio = converterHoraParaMinutos(item.horaInicio || "09:00", 9 * 60);
  var fim = converterHoraParaMinutos(item.horaFim || "18:40", 18 * 60 + 40);
  var janela = Math.max(fim - inicio, 60);
  return Math.floor(janela / enviosPorDia);
}

function aplicarHoraInicial(item, data) {
  var minutos = converterHoraParaMinutos(item.horaInicio || "09:00", 9 * 60);
  var horas = Math.floor(minutos / 60);
  var mins = minutos % 60;
  data.setHours(horas, mins, 0, 0);
}

function atualizarPendenciaAposEnvio(abaPendencias, numeroLinha, item, proximoEnvio) {
  var totalAtual = Number(item.totalEnviado || 0);
  abaPendencias.getRange(numeroLinha, PEND_COL.ULTIMO_ENVIO).setValue(new Date());
  abaPendencias.getRange(numeroLinha, PEND_COL.PROXIMO_ENVIO).setValue(proximoEnvio || "");
  abaPendencias.getRange(numeroLinha, PEND_COL.TOTAL_ENVIADO).setValue(totalAtual + 1);
}


/****************************************************
 * RESPONSAVEIS, TEMPLATES E MENSAGENS
 ****************************************************/

function buscarResponsavel(nomeResponsavel) {
  var whatsappConfig = buscarWhatsappResponsavelConfiguracao(nomeResponsavel);

  if (whatsappConfig) {
    return { encontrado: true, nome: nomeResponsavel, whatsapp: whatsappConfig };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.RESPONSAVEIS);
  if (!aba) return { encontrado: false };

  var dados = aba.getDataRange().getValues();
  var nomeBusca = normalizarTexto(nomeResponsavel);

  for (var i = 1; i < dados.length; i++) {
    var nome = dados[i][1];
    var whatsapp = dados[i][4];
    var ativo = dados[i][5];
    var recebeCobranca = dados[i][6];

    if (normalizarTexto(nome) === nomeBusca && normalizarTexto(ativo) === "sim" && normalizarTexto(recebeCobranca) === "sim" && limparTelefone(whatsapp)) {
      return { encontrado: true, nome: nome, whatsapp: limparTelefone(whatsapp) };
    }
  }

  return { encontrado: false };
}

function buscarWhatsappResponsavelConfiguracao(nomeResponsavel) {
  var nome = String(nomeResponsavel || "").trim();
  if (!nome) return "";

  var valorDireto = buscarConfiguracaoSegura("WhatsApp " + nome, "");
  if (valorDireto) return limparTelefone(valorDireto);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.CONFIGURACOES);
  if (!aba) return "";

  var dados = aba.getDataRange().getValues();
  var nomeBusca = normalizarTexto(nome);

  for (var i = 1; i < dados.length; i++) {
    var chave = String(dados[i][0] || "").trim();
    var valor = dados[i][1];
    if (!chave || !valor) continue;

    var chaveNorm = normalizarTexto(chave);
    if (chaveNorm.indexOf("whatsapp ") !== 0) continue;

    var nomeConfig = normalizarTexto(chave.replace(/^WhatsApp\s+/i, ""));
    if (nomeConfig === nomeBusca || nomeConfig.indexOf(nomeBusca) >= 0 || nomeBusca.indexOf(nomeConfig) >= 0) {
      return limparTelefone(valor);
    }
  }

  return "";
}


function buscarTemplate(codigoTemplate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.TEMPLATES);
  if (!aba) return { encontrado: false };

  var dados = aba.getDataRange().getValues();
  var codigoBusca = normalizarTexto(codigoTemplate);

  for (var i = 1; i < dados.length; i++) {
    var codigo = dados[i][0];
    var mensagem = dados[i][4];

    if (normalizarTexto(codigo) === codigoBusca) {
      return { encontrado: true, codigo: codigo, mensagem: mensagem };
    }
  }

  return { encontrado: false };
}

function buscarTemplatePorTipoApi(tipo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.LISTAS);
  if (!aba || !tipo) return "";

  var dados = aba.getDataRange().getValues();
  var tipoBusca = normalizarTexto(tipo);

  for (var i = 1; i < dados.length; i++) {
    var template = dados[i][5];
    var tipoLista = dados[i][7];

    if (normalizarTexto(tipoLista) === tipoBusca) return template || "";
  }

  return "";
}

function obterTemplateSeguroParaTipo(tipo) {
  var templateLista = buscarTemplatePorTipoApi(tipo);
  if (templateLista) return templateLista;

  var tipoNormalizado = normalizarTexto(tipo);
  var mapa = {
    "pendencia vendedor": "venda_pendente",
    "pendencia gerencia": "escalonamento_gerente",
    "outras pendencias": "outros_pendencia",
    "processo entregue com pendencia vendedor": "entrega_pendente",
    "entregue com pendencia vendedor": "entrega_pendente",
    "processo entregue com pendencia gerencia": "escalonamento_gerente",
    "entregue com pendencia gerencia": "escalonamento_gerente",
    "processo com o vendedor": "venda_pendente",
    "processo com a gerencia": "escalonamento_gerente",
    "veiculo nao entregue": "entrega_pendente",
    "carro nao entregue": "entrega_pendente"
  };

  return mapa[tipoNormalizado] || "outros_pendencia";
}

function montarMensagem(template, item, responsavel) {
  var mensagem = String(template || "");
  mensagem = mensagem.replace(/\\n/g, "\n");

  var descricaoLimpa = extrairDescricaoLimpa(item.descricao);
  var prazoResolucao = calcularPrazoResolucao(item);

  var substituicoes = {
    "[ID]": item.id,
    "[CLIENTE]": item.cliente,
    "[WHATSAPP]": item.whatsappCliente,
    "[TIPO]": item.tipo,
    "[DESCRICAO]": item.descricao,
    "[DESCRICAO_LIMPA]": descricaoLimpa,
    "[PENDENCIA]": descricaoLimpa,
    "[PRAZO_RESOLUCAO]": prazoResolucao,
    "[RESPONSAVEL]": responsavel.nome || item.responsavel,
    "[LOJA]": item.loja,
    "[NEGOCIACAO]": item.negociacao,
    "[LEAD]": item.lead,
    "[PLACA]": item.placa,
    "[VEICULO]": item.veiculo,
    "[PRIORIDADE]": item.prioridade,
    "[DESTINATARIO]": item.destinatario,
    "[STATUS]": item.status,
    "[TOTAL_ENVIADO]": item.totalEnviado || 0,
    "[MES_REFERENCIA]": item.mesReferencia || "",
    "[FONTE]": item.fonte || ""
  };

  var chaves = Object.keys(substituicoes);
  for (var i = 0; i < chaves.length; i++) {
    var chave = chaves[i];
    var valor = substituicoes[chave] || "";
    mensagem = mensagem.split(chave).join(valor);
  }

  return mensagem;
}

function extrairDescricaoLimpa(descricao) {
  var texto = String(descricao || "").trim();

  if (!texto) return "Não informado";

  var marcadorDetalhe = "| Detalhe:";
  var marcadorData = "| Data da venda:";

  var idxDetalhe = texto.indexOf(marcadorDetalhe);
  var idxData = texto.indexOf(marcadorData);

  if (idxDetalhe >= 0) {
    var inicio = idxDetalhe + marcadorDetalhe.length;
    var fim = idxData > inicio ? idxData : texto.length;
    var detalhe = texto.substring(inicio, fim).trim();
    if (detalhe && normalizarTexto(detalhe) !== "nao informado") return detalhe;
  }

  return texto;
}

function calcularPrazoResolucao(item) {
  var agora = new Date();
  var vencimento = item.dataVencimento instanceof Date ? new Date(item.dataVencimento) : null;

  if (!vencimento) return "Prazo não informado";

  vencimento.setHours(23, 59, 0, 0);
  var diffMs = vencimento.getTime() - agora.getTime();

  if (diffMs < 0) return "PRAZO VENCIDO";

  var hoje = zerarHorario(agora);
  var vencimentoDia = zerarHorario(vencimento);
  var dias = Math.ceil((vencimentoDia.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));

  if (dias <= 0) return "VENCE HOJE ÀS 23:59";
  if (dias === 1) return "1 DIA - vence amanhã às 23:59";

  return dias + " DIAS - vence em " + formatarDataTexto(vencimento) + " às 23:59";
}

/****************************************************
 * HISTORICO E WEBHOOK STATUS
 ****************************************************/

function prepararHistoricoWebhookManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.HISTORICO);
  if (!aba) throw new Error("Aba HISTORICO_ENVIOS nao encontrada.");

  garantirCabecalhoHistorico(aba);
  SpreadsheetApp.getUi().alert("Historico preparado para registrar status do Webhook.");
}

function testarAtualizacaoWebhookNoHistorico() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.HISTORICO);
  if (!aba) throw new Error("Aba HISTORICO_ENVIOS nao encontrada.");

  garantirCabecalhoHistorico(aba);

  var lastRow = aba.getLastRow();
  var lastCol = aba.getLastColumn();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("Nao existe historico para testar.");
    return;
  }

  var headers = aba.getRange(1, 1, 1, lastCol).getValues()[0];
  var cols = montarMapaColunas(headers);
  var colMessageId = cols[normalizarTexto("WhatsApp Message ID")];

  if (!colMessageId) {
    SpreadsheetApp.getUi().alert("Coluna WhatsApp Message ID nao encontrada.");
    return;
  }

  var dados = aba.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var messageId = "";

  for (var i = dados.length - 1; i >= 0; i--) {
    var valor = String(dados[i][colMessageId - 1] || "").trim();
    if (valor) {
      messageId = valor;
      break;
    }
  }

  if (!messageId) {
    SpreadsheetApp.getUi().alert("Nenhum WhatsApp Message ID encontrado no historico.");
    return;
  }

  var rawTeste = JSON.stringify({
    teste_manual: true,
    object: "whatsapp_business_account",
    statuses: [{ id: messageId, status: "delivered", timestamp: Math.floor(new Date().getTime() / 1000) }]
  });

  var ok = atualizarHistoricoPorWebhook(messageId, "delivered", "", rawTeste, Math.floor(new Date().getTime() / 1000));

  SpreadsheetApp.getUi().alert(
    ok
      ? "Teste concluido: historico atualizado como delivered para o ultimo Message ID."
      : "Teste executado, mas o Message ID nao foi localizado no historico."
  );
}

function garantirCabecalhoHistorico(abaHistorico) {
  var lastRow = abaHistorico.getLastRow();

  if (lastRow === 0) {
    abaHistorico.appendRow(HISTORICO_HEADERS);
    return;
  }

  var lastCol = Math.max(abaHistorico.getLastColumn(), 1);
  var headers = abaHistorico.getRange(1, 1, 1, lastCol).getValues()[0];
  var headerMap = {};

  for (var i = 0; i < headers.length; i++) {
    headerMap[normalizarTexto(headers[i])] = i + 1;
  }

  for (var h = 0; h < HISTORICO_HEADERS.length; h++) {
    var header = HISTORICO_HEADERS[h];
    if (!headerMap[normalizarTexto(header)]) {
      abaHistorico.getRange(1, abaHistorico.getLastColumn() + 1).setValue(header);
    }
  }
}

function registrarHistorico(abaHistorico, item, whatsappResponsavel, mensagem, statusEnvio, retornoApi, usuarioSistema, proximoEnvioCalculado, whatsappMessageId, statusWebhook, erroWebhook, webhookRaw) {
  garantirCabecalhoHistorico(abaHistorico);

  var linkWhatsApp = gerarLinkWhatsApp(whatsappResponsavel, mensagem);

  abaHistorico.appendRow([
    new Date(),
    item.id,
    item.cliente,
    item.whatsappCliente,
    item.tipo,
    item.descricao,
    item.responsavel,
    whatsappResponsavel,
    item.loja,
    item.negociacao,
    item.lead,
    item.placa,
    item.veiculo,
    item.prioridade,
    item.destinatario,
    item.status,
    item.template,
    mensagem,
    statusEnvio,
    retornoApi,
    proximoEnvioCalculado || "",
    usuarioSistema,
    linkWhatsApp,
    whatsappMessageId || extrairMessageIdDoRetorno(retornoApi),
    statusWebhook || "",
    "",
    erroWebhook || "",
    webhookRaw || ""
  ]);
}

function atualizarHistoricoPorWebhook(messageId, statusWebhook, erroWebhook, webhookRaw, timestamp) {
  if (!messageId) return false;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.HISTORICO);
  if (!aba) return false;

  garantirCabecalhoHistorico(aba);

  var lastRow = aba.getLastRow();
  var lastCol = aba.getLastColumn();
  if (lastRow < 2) return false;

  var headers = aba.getRange(1, 1, 1, lastCol).getValues()[0];
  var cols = montarMapaColunas(headers);

  var colMessageId = cols[normalizarTexto("WhatsApp Message ID")];
  var colStatusWebhook = cols[normalizarTexto("Status Webhook")];
  var colDataWebhook = cols[normalizarTexto("Data/Hora Webhook")];
  var colErroWebhook = cols[normalizarTexto("Erro Webhook")];
  var colRawWebhook = cols[normalizarTexto("Webhook Raw")];

  if (!colMessageId || !colStatusWebhook || !colDataWebhook || !colErroWebhook || !colRawWebhook) return false;

  var ids = aba.getRange(2, colMessageId, lastRow - 1, 1).getValues();
  var linhaEncontrada = 0;

  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0] || "").trim() === String(messageId).trim()) {
      linhaEncontrada = i + 2;
      break;
    }
  }

  if (!linhaEncontrada) {
    aba.appendRow([new Date(), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "WEBHOOK SEM HISTORICO", "", "", "Webhook Meta", "", messageId, statusWebhook, converterTimestampMeta(timestamp), erroWebhook, webhookRaw]);
    return false;
  }

  aba.getRange(linhaEncontrada, colStatusWebhook).setValue(statusWebhook || "");
  aba.getRange(linhaEncontrada, colDataWebhook).setValue(converterTimestampMeta(timestamp));
  aba.getRange(linhaEncontrada, colErroWebhook).setValue(erroWebhook || "");
  aba.getRange(linhaEncontrada, colRawWebhook).setValue(webhookRaw || "");

  return true;
}

function montarMapaColunas(headers) {
  var mapa = {};
  for (var i = 0; i < headers.length; i++) {
    mapa[normalizarTexto(headers[i])] = i + 1;
  }
  return mapa;
}

function extrairMessageIdDoRetorno(retornoApi) {
  if (!retornoApi) return "";

  try {
    var texto = String(retornoApi);
    var idx = texto.indexOf("{");
    if (idx < 0) return "";

    var json = JSON.parse(texto.substring(idx));
    if (json.messages && json.messages.length > 0 && json.messages[0].id) {
      return json.messages[0].id;
    }
  } catch (erro) {
    return "";
  }

  return "";
}

function extrairErroWebhook(statusObj) {
  if (!statusObj || !statusObj.errors || statusObj.errors.length === 0) return "";

  var erro = statusObj.errors[0];
  return "code: " + (erro.code || "") + " | title: " + (erro.title || "") + " | details: " + ((erro.error_data && erro.error_data.details) ? erro.error_data.details : (erro.message || ""));
}

function converterTimestampMeta(timestamp) {
  if (!timestamp) return new Date();

  var numero = Number(timestamp);
  if (isNaN(numero)) return new Date();

  return new Date(numero * 1000);
}

/****************************************************
 * WHATSAPP
 ****************************************************/

function enviarWhatsAppReal(numeroDestino, mensagem) {
  var token = buscarConfiguracaoSegura("WhatsApp Access Token", "");
  var phoneNumberId = buscarConfiguracaoSegura("WhatsApp Phone Number ID", "");
  var apiVersion = buscarConfiguracaoSegura("WhatsApp API Version", "v25.0");

  if (!token || !phoneNumberId) {
    return { sucesso: false, retorno: "Token ou Phone Number ID nao configurado.", messageId: "" };
  }

  var telefone = formatarTelefoneBrasil(numeroDestino);
  if (!telefone) {
    return { sucesso: false, retorno: "Telefone de destino invalido ou vazio.", messageId: "" };
  }

  var url = "https://graph.facebook.com/" + apiVersion + "/" + phoneNumberId + "/messages";

  var payload = {
    messaging_product: "whatsapp",
    to: telefone,
    type: "text",
    text: { preview_url: false, body: mensagem }
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var resposta = UrlFetchApp.fetch(url, options);
    var codigo = resposta.getResponseCode();
    var texto = resposta.getContentText();
    var messageId = "";

    try {
      var json = JSON.parse(texto);
      if (json.messages && json.messages.length > 0 && json.messages[0].id) {
        messageId = json.messages[0].id;
      }
    } catch (e) {}

    return { sucesso: codigo >= 200 && codigo < 300, retorno: "HTTP " + codigo + " - " + texto, messageId: messageId };
  } catch (erro) {
    return { sucesso: false, retorno: erro.message, messageId: "" };
  }
}

function gerarLinkWhatsApp(numero, mensagem) {
  var telefone = formatarTelefoneBrasil(numero);
  if (!telefone || !mensagem) return "";
  return "https://wa.me/" + telefone + "?text=" + encodeURIComponent(mensagem);
}

function formatarTelefoneBrasil(numero) {
  var telefone = limparTelefone(numero);
  if (!telefone) return "";
  if (!telefone.startsWith("55")) telefone = "55" + telefone;
  return telefone;
}

/****************************************************
 * WEB APP: MINI API + WEBHOOK META
 ****************************************************/

function doGet(e) {
  try {
    var params = e && e.parameter ? e.parameter : {};

    // WEBHOOK META - validacao inicial.
    // A Meta envia: hub.mode, hub.challenge e hub.verify_token.
    // Algumas plataformas podem entregar as chaves com ponto ou com underline.
    var hubMode = params["hub.mode"] || params["hub_mode"] || "";
    var hubChallenge = params["hub.challenge"] || params["hub_challenge"] || "";
    var hubVerifyToken = params["hub.verify_token"] || params["hub_verify_token"] || "";

    if (hubMode || hubChallenge || hubVerifyToken) {
      return verificarWebhookMeta(hubMode, hubVerifyToken, hubChallenge);
    }

    // MINI API INTERNA DO ROBO
    var token = params.token;
    var acao = params.acao || "status";

    if (!validarTokenApi(token)) {
      return respostaJson({ sucesso: false, erro: "Token invalido ou nao informado." });
    }

    if (acao === "status") {
      return respostaJson({ sucesso: true, sistema: "Mini API - Robo de Pendencias EasyCar", status: "online", modo_envio: buscarConfiguracaoSegura("Modo Envio WhatsApp", "TESTE"), data_hora: new Date() });
    }

    if (acao === "listar_pendencias") return respostaJson(listarPendenciasApi());
    if (acao === "importar_pendencias") return respostaJson(importarPendenciasDaPlanilhaFonte());

    if (acao === "processar_pendencias") {
      var modo = String(buscarConfiguracaoSegura("Modo Envio WhatsApp", "TESTE")).trim().toUpperCase();
      var modoTeste = modo !== "REAL";
      var resumo = processarPendencias(modoTeste);
      return respostaJson({ sucesso: true, mensagem: "Robo processado com sucesso.", modo: modo, resumo: resumo });
    }

    if (acao === "importar_e_processar") {
      var importacao = importarPendenciasDaPlanilhaFonte();
      var modo2 = String(buscarConfiguracaoSegura("Modo Envio WhatsApp", "TESTE")).trim().toUpperCase();
      var modoTeste2 = modo2 !== "REAL";
      var processamento = processarPendencias(modoTeste2);
      return respostaJson({ sucesso: true, importacao: importacao, processamento: processamento });
    }

    return respostaJson({ sucesso: false, erro: "Acao GET nao reconhecida.", acao_recebida: acao });
  } catch (erro) {
    return respostaJson({ sucesso: false, erro: erro.message });
  }
}

function verificarWebhookMeta(mode, tokenRecebido, challenge) {
  // Token padrao de emergencia. Mesmo se a leitura da aba CONFIGURACOES falhar,
  // a validacao do webhook consegue responder para a Meta.
  var tokenPadrao = "EASYCAR_WEBHOOK_2026";
  var tokenConfigurado = buscarConfiguracaoSegura("Webhook Verify Token", tokenPadrao);

  mode = String(mode || "").trim();
  tokenRecebido = String(tokenRecebido || "").trim();
  challenge = String(challenge || "").trim();
  tokenConfigurado = String(tokenConfigurado || tokenPadrao).trim();

  if (mode === "subscribe" && tokenRecebido === tokenConfigurado) {
    return ContentService
      .createTextOutput(challenge)
      .setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService
    .createTextOutput("Forbidden")
    .setMimeType(ContentService.MimeType.TEXT);
}

function testarWebhookLocal() {
  var resposta = verificarWebhookMeta("subscribe", "EASYCAR_WEBHOOK_2026", "123456");
  Logger.log(resposta.getContent());
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respostaJson({ sucesso: false, erro: "Nenhum corpo JSON recebido." });
    }

    var texto = e.postData.contents;
    var corpo = JSON.parse(texto);

    if (corpo.object === "whatsapp_business_account") {
      var resultadoWebhook = processarWebhookMeta(corpo, texto);
      return respostaJson(resultadoWebhook);
    }

    var token = corpo.token;
    var acao = corpo.acao;

    if (!validarTokenApi(token)) {
      return respostaJson({ sucesso: false, erro: "Token invalido ou nao informado." });
    }

    if (!acao) {
      return respostaJson({ sucesso: false, erro: "Acao nao informada." });
    }

    if (acao === "criar_pendencia") return respostaJson(criarPendenciaApi(corpo.dados || {}));
    if (acao === "atualizar_status") return respostaJson(atualizarStatusPendenciaApi(corpo.id, corpo.novo_status, corpo.observacao || ""));
    if (acao === "importar_pendencias") return respostaJson(importarPendenciasDaPlanilhaFonte());

    if (acao === "processar_pendencias") {
      var modo = String(buscarConfiguracaoSegura("Modo Envio WhatsApp", "TESTE")).trim().toUpperCase();
      var modoTeste = modo !== "REAL";
      var resumo = processarPendencias(modoTeste);
      return respostaJson({ sucesso: true, mensagem: "Robo processado com sucesso.", modo: modo, resumo: resumo });
    }

    return respostaJson({ sucesso: false, erro: "Acao POST nao reconhecida.", acao_recebida: acao });
  } catch (erro) {
    return respostaJson({ sucesso: false, erro: erro.message });
  }
}

function processarWebhookMeta(corpo, raw) {
  var totalStatuses = 0;
  var atualizados = 0;
  var totalMensagens = 0;
  var retornosGravados = 0;

  if (!corpo.entry) {
    return {
      sucesso: true,
      mensagem: "Webhook recebido sem entry.",
      statuses_recebidos: 0,
      historicos_atualizados: 0,
      mensagens_recebidas: 0,
      retornos_gravados: 0
    };
  }

  for (var e = 0; e < corpo.entry.length; e++) {
    var entry = corpo.entry[e];
    var changes = entry.changes || [];

    for (var c = 0; c < changes.length; c++) {
      var value = changes[c].value || {};

      // 1) Atualiza status das mensagens enviadas
      var statuses = value.statuses || [];

      for (var s = 0; s < statuses.length; s++) {
        var statusObj = statuses[s];
        var messageId = statusObj.id || "";
        var statusWebhook = statusObj.status || "";
        var erroWebhook = extrairErroWebhook(statusObj);
        var timestampStatus = statusObj.timestamp || "";

        totalStatuses++;

        var ok = atualizarHistoricoPorWebhook(
          messageId,
          statusWebhook,
          erroWebhook,
          raw,
          timestampStatus
        );

        if (ok) atualizados++;
      }

      // 2) Grava mensagens recebidas dos vendedores na aba RETORNOS
      var mensagens = value.messages || [];
      var contatos = value.contacts || [];

      for (var m = 0; m < mensagens.length; m++) {
        var msg = mensagens[m];

        totalMensagens++;

        var retorno = extrairRetornoMensagemWebhook_(msg, contatos, raw);

        if (retorno && retorno.messageId) {
          var gravou = gravarRetornoVendedor_(retorno);
          if (gravou) retornosGravados++;
        }
      }
    }
  }

  return {
    sucesso: true,
    mensagem: "Webhook Meta processado.",
    statuses_recebidos: totalStatuses,
    historicos_atualizados: atualizados,
    mensagens_recebidas: totalMensagens,
    retornos_gravados: retornosGravados
  };
}

/****************************************************
 * MINI API - CRIAR, ATUALIZAR, LISTAR
 ****************************************************/

function criarPendenciaApi(dados) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.PENDENCIAS);
  if (!aba) return { sucesso: false, erro: "Aba PENDENCIAS nao encontrada." };

  var responsavel = dados.responsavel || "";
  var whatsappResponsavel = dados.whatsapp_responsavel || dados.whatsapp || buscarWhatsappResponsavelConfiguracao(responsavel);
  var cliente = dados.cliente || "";
  var placa = String(dados.placa || "").toUpperCase();
  var veiculo = dados.veiculo || "";
  var negociacao = dados.negociacao || "";
  var descricao = dados.descricao || "";
  var lead = dados.lead || "";
  var prioridade = dados.prioridade || buscarConfiguracaoSegura("Prioridade padrao", "Alta");
  var status = dados.status || buscarConfiguracaoSegura("Status padrao de nova pendencia", "Pendente");
  var tipo = dados.tipo || "";
  var loja = dados.loja || buscarConfiguracaoSegura("Unidade Padrao", "EasyCar Matriz");
  var destinatario = dados.destinatario || "Responsável";
  var dataInicial = dados.data_inicial ? new Date(dados.data_inicial) : new Date();
  var dataVencimento = dados.data_vencimento ? new Date(dados.data_vencimento) : adicionarDias(new Date(), 3);
  var frequencia = dados.frequencia || buscarConfiguracaoSegura("Frequencia padrao", "Diário");
  var diasPermitidos = dados.dias_permitidos || "Seg, Ter, Qua, Qui, Sex";
  var horaInicio = dados.hora_inicio || buscarConfiguracaoSegura("Hora inicial padrao", "09:00");
  var horaFim = dados.hora_fim || buscarConfiguracaoSegura("Hora final padrao", "18:40");
  var maximoEnvios = Number(dados.maximo_envios || buscarConfiguracaoSegura("Máximo de envios por pendência", 5));
  var template = dados.template || obterTemplateSeguroParaTipo(tipo);
  var observacoes = dados.observacoes || "";
  var enviosPorDia = Number(dados.envios_por_dia || obterMaximoEnviosDiaPorPrioridade(prioridade, null) || 1);
  var envioAutomatico = dados.envio_automatico || "Sim";
  var mesReferencia = dados.mes_referencia || "";
  var fonte = dados.fonte || "Mini API";

  if (!responsavel) return { sucesso: false, erro: "Campo obrigatorio ausente: responsavel." };
  if (!cliente && !placa && !veiculo && !negociacao) return { sucesso: false, erro: "Informe cliente, placa, veiculo ou negociacao." };
  if (!tipo) return { sucesso: false, erro: "Campo obrigatorio ausente: tipo." };
  if (!descricao) return { sucesso: false, erro: "Campo obrigatorio ausente: descricao." };

  var proximoEnvioInicial = montarDataComHora(dataInicial, horaInicio);

  var novaLinha = [
    "",
    responsavel,
    whatsappResponsavel,
    cliente,
    placa,
    veiculo,
    negociacao,
    descricao,
    lead,
    prioridade,
    status,
    tipo,
    loja,
    destinatario,
    dataInicial,
    dataVencimento,
    frequencia,
    diasPermitidos,
    horaInicio,
    horaFim,
    "",
    proximoEnvioInicial,
    maximoEnvios,
    0,
    template,
    observacoes,
    enviosPorDia,
    envioAutomatico,
    mesReferencia,
    fonte
  ];

  var linhaInserida = gravarLinhaPendencia(aba, novaLinha);
  return { sucesso: true, mensagem: "Pendencia criada com sucesso.", linha: linhaInserida, cliente: cliente, tipo: tipo, responsavel: responsavel, placa: placa, negociacao: negociacao, template: template };
}


function atualizarStatusPendenciaApi(id, novoStatus, observacao) {
  if (!id) return { sucesso: false, erro: "ID nao informado." };
  if (!novoStatus) return { sucesso: false, erro: "Novo status nao informado." };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.PENDENCIAS);
  if (!aba) return { sucesso: false, erro: "Aba PENDENCIAS nao encontrada." };

  var dados = aba.getDataRange().getValues();

  for (var i = 1; i < dados.length; i++) {
    var idLinha = String(dados[i][PEND_COL.ID - 1]).trim();

    if (idLinha === String(id).trim()) {
      var linha = i + 1;
      var statusAnterior = dados[i][PEND_COL.STATUS - 1];
      aba.getRange(linha, PEND_COL.STATUS).setValue(novoStatus);

      var obsAtual = dados[i][PEND_COL.OBSERVACOES - 1] || "";
      var novaObs = montarObservacaoAtualizacaoApi(obsAtual, statusAnterior, novoStatus, observacao);
      aba.getRange(linha, PEND_COL.OBSERVACOES).setValue(novaObs);

      if (novoStatus === "Resolvido" || novoStatus === "Pausado" || novoStatus === "Cancelado") {
        aba.getRange(linha, PEND_COL.PROXIMO_ENVIO).setValue("");
      }

      registrarRetornoApi(dados[i], statusAnterior, novoStatus, observacao);
      return { sucesso: true, mensagem: "Status atualizado com sucesso.", id: id, status_anterior: statusAnterior, novo_status: novoStatus };
    }
  }

  return { sucesso: false, erro: "Pendencia nao encontrada para o ID informado.", id: id };
}


function listarPendenciasApi() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.PENDENCIAS);
  if (!aba) return { sucesso: false, erro: "Aba PENDENCIAS nao encontrada." };

  var dados = aba.getDataRange().getValues();
  var resultado = [];

  for (var i = 1; i < dados.length; i++) {
    if (!dados[i][PEND_COL.ID - 1] && !dados[i][PEND_COL.RESPONSAVEL - 1] && !dados[i][PEND_COL.NEGOCIACAO - 1]) continue;

    resultado.push({
      id: dados[i][PEND_COL.ID - 1],
      responsavel: dados[i][PEND_COL.RESPONSAVEL - 1],
      whatsapp: dados[i][PEND_COL.WHATSAPP - 1],
      whatsapp_responsavel: dados[i][PEND_COL.WHATSAPP - 1],
      cliente: dados[i][PEND_COL.CLIENTE - 1],
      placa: dados[i][PEND_COL.PLACA - 1],
      veiculo: dados[i][PEND_COL.VEICULO - 1],
      negociacao: dados[i][PEND_COL.NEGOCIACAO - 1],
      descricao: dados[i][PEND_COL.DESCRICAO - 1],
      lead: dados[i][PEND_COL.LEAD - 1],
      prioridade: dados[i][PEND_COL.PRIORIDADE - 1],
      status: dados[i][PEND_COL.STATUS - 1],
      tipo: dados[i][PEND_COL.TIPO - 1],
      loja: dados[i][PEND_COL.LOJA - 1],
      destinatario: dados[i][PEND_COL.DESTINATARIO - 1],
      data_inicial: dados[i][PEND_COL.DATA_INICIAL - 1],
      data_vencimento: dados[i][PEND_COL.DATA_VENCIMENTO - 1],
      frequencia: dados[i][PEND_COL.FREQUENCIA - 1],
      dias_permitidos: dados[i][PEND_COL.DIAS_PERMITIDOS - 1],
      hora_inicio: dados[i][PEND_COL.HORA_INICIO - 1],
      hora_fim: dados[i][PEND_COL.HORA_FIM - 1],
      ultimo_envio: dados[i][PEND_COL.ULTIMO_ENVIO - 1],
      proximo_envio: dados[i][PEND_COL.PROXIMO_ENVIO - 1],
      maximo_envios: dados[i][PEND_COL.MAXIMO_ENVIOS - 1],
      total_enviado: dados[i][PEND_COL.TOTAL_ENVIADO - 1],
      template: dados[i][PEND_COL.TEMPLATE - 1],
      observacoes: dados[i][PEND_COL.OBSERVACOES - 1],
      envios_por_dia: dados[i][PEND_COL.ENVIOS_POR_DIA - 1],
      envio_automatico: dados[i][PEND_COL.ENVIO_AUTOMATICO - 1],
      mes_referencia: dados[i][PEND_COL.MES_REFERENCIA - 1],
      fonte: dados[i][PEND_COL.FONTE - 1]
    });
  }

  return { sucesso: true, total: resultado.length, pendencias: resultado };
}


function registrarRetornoApi(linhaPendencia, statusAnterior, novoStatus, observacao) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.RETORNOS);
  if (!aba) return;

  aba.appendRow([
    new Date(),
    linhaPendencia[PEND_COL.ID - 1],
    linhaPendencia[PEND_COL.RESPONSAVEL - 1],
    linhaPendencia[PEND_COL.CLIENTE - 1],
    linhaPendencia[PEND_COL.NEGOCIACAO - 1],
    linhaPendencia[PEND_COL.LEAD - 1],
    linhaPendencia[PEND_COL.PLACA - 1],
    linhaPendencia[PEND_COL.TIPO - 1],
    observacao || "Status atualizado via Mini API.",
    "Atualizacao via Mini API",
    statusAnterior,
    novoStatus,
    "",
    "",
    "Mini API",
    observacao || ""
  ]);
}


function montarObservacaoAtualizacaoApi(obsAtual, statusAnterior, novoStatus, observacao) {
  var dataHora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  var bloco = "\n[" + dataHora + "] Status alterado via Mini API: " + statusAnterior + " -> " + novoStatus;
  if (observacao) bloco += " | Observacao: " + observacao;
  return String(obsAtual || "") + bloco;
}

/****************************************************
 * HORARIOS, PRIORIDADES E TRAVAS CONFIGURAVEIS
 ****************************************************/

function usarHorariosPorPrioridade() {
  return normalizarTexto(buscarConfiguracaoSegura("Usar horários por prioridade?", "Sim")) === "sim";
}

function dentroDaTravaGeralDeHorario(agora) {
  if (travaHorarioEstaDesativadaParaEnvio_()) {
    return true;
  }

  var inicioTexto = buscarConfiguracaoSegura("Trava horário inicial envio", buscarConfiguracaoSegura("Hora inicial padrao", "09:00"));
  var fimTexto = buscarConfiguracaoSegura("Trava horário final envio", buscarConfiguracaoSegura("Hora final padrao", "18:40"));

  var minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  var inicio = converterHoraParaMinutos(inicioTexto, 9 * 60);
  var fim = converterHoraParaMinutos(fimTexto, 18 * 60 + 40);

  if (inicio <= fim) {
    return minutosAgora >= inicio && minutosAgora <= fim;
  }

  // Permite janela virando o dia. Ex.: 22:00 até 06:00.
  return minutosAgora >= inicio || minutosAgora <= fim;
}

function obterNomePrioridadeConfig(prioridade) {
  var p = normalizarTexto(prioridade || "");

  if (p.indexOf("critic") >= 0) return "crítica";
  if (p.indexOf("alta") >= 0) return "alta";
  if (p.indexOf("media") >= 0) return "média";
  if (p.indexOf("baixa") >= 0) return "baixa";

  return "alta";
}

function obterMaximoEnviosDiaPorPrioridade(prioridade, valorPadrao) {
  var nome = obterNomePrioridadeConfig(prioridade);
  var chave = "Envios por dia prioridade " + nome;
  var valor = buscarConfiguracaoSegura(chave, "");

  if (valor === "" || valor === null || typeof valor === "undefined") {
    return valorPadrao;
  }

  var numero = Number(valor);
  if (isNaN(numero) || numero <= 0) return valorPadrao;

  return numero;
}

function obterHorariosConfiguradosPorPrioridade(prioridade) {
  var nome = obterNomePrioridadeConfig(prioridade);
  var chave = "Horários envio prioridade " + nome;
  var valorPadrao = "09:20,16:30";

  if (nome === "alta") valorPadrao = "09:40,12:00,16:00,18:30";
  if (nome === "crítica") valorPadrao = "09:00,11:00,14:00,16:30,18:30";

  var texto = String(buscarConfiguracaoSegura(chave, valorPadrao) || valorPadrao);
  var partes = texto.split(",");
  var horarios = [];

  for (var i = 0; i < partes.length; i++) {
    var h = String(partes[i] || "").trim();
    if (!h) continue;

    var minutos = converterHoraParaMinutos(h, null);
    if (minutos !== null && !isNaN(minutos)) {
      horarios.push({ texto: h, minutos: minutos });
    }
  }

  horarios.sort(function (a, b) { return a.minutos - b.minutos; });
  return horarios;
}

function podeEnviarNoHorarioConfiguradoDaPrioridade(item, agora) {
  var horarios = obterHorariosConfiguradosPorPrioridade(item.prioridade);
  if (!horarios.length) return { pode: false, motivo: "Sem horarios configurados para prioridade." };

  var tolerancia = Number(buscarConfiguracaoSegura("Janela tolerância envio minutos", 20));
  if (isNaN(tolerancia) || tolerancia < 1) tolerancia = 20;

  var minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  for (var i = 0; i < horarios.length; i++) {
    var horario = horarios[i];
    var inicio = horario.minutos;
    var fim = horario.minutos + tolerancia;

    if (minutosAgora >= inicio && minutosAgora <= fim) {
      if (!jaEnviouNoSlotHorario(item.id, agora, inicio)) {
        return { pode: true, motivo: "Horario de prioridade liberado." };
      }
    }
  }

  return { pode: false, motivo: "Fora dos horarios configurados da prioridade ou slot ja enviado." };
}

function jaEnviouNoSlotHorario(idPendencia, dataReferencia, minutoInicioSlot) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.HISTORICO);
  if (!aba || !idPendencia) return false;

  var dados = aba.getDataRange().getValues();
  var inicioSlot = new Date(dataReferencia);
  inicioSlot.setHours(Math.floor(minutoInicioSlot / 60), minutoInicioSlot % 60, 0, 0);

  for (var i = 1; i < dados.length; i++) {
    var dataEnvio = dados[i][0];
    var idHistorico = dados[i][1];
    var statusEnvio = normalizarTexto(dados[i][18] || "");

    if (!(dataEnvio instanceof Date)) continue;
    if (String(idHistorico).trim() !== String(idPendencia).trim()) continue;
    if (!mesmoDia(dataEnvio, dataReferencia)) continue;
    if (statusEnvio === "nao enviado" || statusEnvio === "erro no envio") continue;
    if (dataEnvio.getTime() >= inicioSlot.getTime()) return true;
  }

  return false;
}

function calcularProximoHorarioConfiguradoPorPrioridade(prioridade, dataBase) {
  var agora = dataBase instanceof Date ? new Date(dataBase) : new Date();
  var horarios = obterHorariosConfiguradosPorPrioridade(prioridade);

  if (!horarios.length) {
    return montarDataComHora(adicionarDias(agora, 1), buscarConfiguracaoSegura("Hora inicial padrao", "09:00"));
  }

  var minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  for (var i = 0; i < horarios.length; i++) {
    if (horarios[i].minutos > minutosAgora) {
      var hoje = new Date(agora);
      hoje.setHours(Math.floor(horarios[i].minutos / 60), horarios[i].minutos % 60, 0, 0);
      return hoje;
    }
  }

  var amanha = new Date(agora);
  amanha.setDate(amanha.getDate() + 1);
  amanha.setHours(Math.floor(horarios[0].minutos / 60), horarios[0].minutos % 60, 0, 0);
  return amanha;
}

/****************************************************
 * CONFIGURACOES E UTILITARIOS
 ****************************************************/

function validarTokenApi(tokenRecebido) {
  if (!tokenRecebido) return false;

  var tokenConfigurado = buscarConfiguracaoApi("Token API");
  if (!tokenConfigurado) throw new Error("Token API nao configurado na aba CONFIGURACOES.");

  return String(tokenRecebido).trim() === String(tokenConfigurado).trim();
}

function buscarConfiguracaoApi(nomeConfiguracao) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.CONFIGURACOES);
  if (!aba) throw new Error("Aba CONFIGURACOES nao encontrada.");

  var dados = aba.getDataRange().getValues();
  var busca = normalizarTexto(nomeConfiguracao);

  for (var i = 1; i < dados.length; i++) {
    var nome = dados[i][0];
    var valor = dados[i][1];

    if (normalizarTexto(nome) === busca) return valor;
  }

  return "";
}

function buscarConfiguracaoSegura(nomeConfiguracao, valorPadrao) {
  try {
    var valor = buscarConfiguracaoApi(nomeConfiguracao);
    if (valor === "" || valor === null || typeof valor === "undefined") return valorPadrao;
    return valor;
  } catch (erro) {
    return valorPadrao;
  }
}

function respostaJson(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto, null, 2)).setMimeType(ContentService.MimeType.JSON);
}

function limparTelefone(numero) {
  return String(numero || "").replace(/\D/g, "");
}

function normalizarTexto(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizarNomeResponsavelImportado(nome) {
  var n = normalizarTexto(nome);

  if (!n) return "";
  if (n.indexOf("anderson") >= 0) return "Anderson Lima";
  if (n.indexOf("bruno") >= 0) return "Bruno Ramos";
  if (n.indexOf("darcio") >= 0) return "Darcio Elias";
  if (n.indexOf("denis") >= 0) return "Dênis Pacheco";
  if (n.indexOf("vanessa") >= 0) return "Vanessa Cristina";
  if (n.indexOf("dagoberto") >= 0) return "Dagoberto Ramos";
  if (n.indexOf("marcelo") >= 0) return "Marcelo Bruno Rodrigues";
  if (n.indexOf("renan") >= 0) return "Renan Bium";

  return String(nome || "").trim();
}

function converterHoraParaMinutos(valor, padrao) {
  if (!valor) return padrao;
  if (valor instanceof Date) return valor.getHours() * 60 + valor.getMinutes();

  var texto = String(valor).trim();
  if (texto.indexOf(":") >= 0) {
    var partes = texto.split(":");
    var horas = Number(partes[0]);
    var minutos = Number(partes[1] || 0);
    if (!isNaN(horas) && !isNaN(minutos)) return horas * 60 + minutos;
  }

  return padrao;
}

function montarDataComHora(dataBase, hora) {
  var data = dataBase instanceof Date ? new Date(dataBase) : new Date();
  var minutos = converterHoraParaMinutos(hora, 9 * 60);
  var horas = Math.floor(minutos / 60);
  var mins = minutos % 60;
  data.setHours(horas, mins, 0, 0);
  return data;
}

function adicionarDias(data, dias) {
  var novaData = new Date(data);
  novaData.setDate(novaData.getDate() + Number(dias || 0));
  novaData.setHours(18, 40, 0, 0);
  return novaData;
}

function formatarCodigoComHash(valor) {
  var texto = String(valor || "").trim();
  if (!texto) return "";
  if (texto.charAt(0) === "#") return texto;
  return "#" + texto;
}

function linhaVazia(linha) {
  for (var i = 0; i < linha.length; i++) {
    if (String(linha[i] || "").trim() !== "") return false;
  }
  return true;
}

function formatarDataTexto(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, Session.getScriptTimeZone(), "dd/MM/yyyy");
  return String(valor || "");
}

function zerarHorario(data) {
  var d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function mesmoDia(data1, data2) {
  return data1.getFullYear() === data2.getFullYear() && data1.getMonth() === data2.getMonth() && data1.getDate() === data2.getDate();
}

/****************************************************
 * NOVO LAYOUT DA ABA PENDENCIAS
 ****************************************************/

function configurarAbaPendenciasNovoLayout() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.PENDENCIAS);

  if (!aba) {
    aba = ss.insertSheet(ABAS.PENDENCIAS);
  }

  migrarPendenciasParaNovoLayout_(aba);
  configurarIdAutomaticoPendenciasBase_(false);
  garantirValidacoesPendenciasBase_(false);
  preencherWhatsappsPendenciasExistentes();
  formatarAbaPendenciasNovoLayout_(aba);

  SpreadsheetApp.getUi().alert(
    "Aba PENDENCIAS configurada com o novo layout.\n\n" +
    "A: ID | B: Responsável | C: WhatsApp | D: Cliente | E: Placa | F: Veículo | G: Negociação | H: Descrição | I: Lead | J: Prioridade | K: Status"
  );
}

function abaPendenciasEstaNovoLayout_(aba) {
  if (!aba || aba.getLastRow() < 1) return false;
  var headers = aba.getRange(1, 1, 1, Math.max(aba.getLastColumn(), PEND_HEADERS_NOVO.length)).getValues()[0];
  return normalizarTexto(headers[1]) === normalizarTexto("Responsável") &&
    normalizarTexto(headers[2]) === normalizarTexto("WhatsApp") &&
    normalizarTexto(headers[3]) === normalizarTexto("Cliente") &&
    normalizarTexto(headers[10]) === normalizarTexto("Status");
}

function migrarPendenciasParaNovoLayout_(aba) {
  var lastRow = Math.max(aba.getLastRow(), 1);
  var lastCol = Math.max(aba.getLastColumn(), PEND_HEADERS_NOVO.length);
  var dados = aba.getRange(1, 1, lastRow, lastCol).getValues();

  if (lastRow === 1 && linhaVazia(dados[0])) {
    aba.getRange(1, 1, 1, PEND_HEADERS_NOVO.length).setValues([PEND_HEADERS_NOVO]);
    return;
  }

  if (abaPendenciasEstaNovoLayout_(aba)) {
    aba.getRange(1, 1, 1, PEND_HEADERS_NOVO.length).setValues([PEND_HEADERS_NOVO]);
    return;
  }

  var mapa = montarMapaCabecalho_(dados[0]);
  var novasLinhas = [PEND_HEADERS_NOVO];

  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];
    if (linhaVazia(row)) continue;

    var responsavel = obterValorPorCabecalho_(row, mapa, ["Responsável", "Responsavel"]);
    var whatsapp = obterValorPorCabecalho_(row, mapa, ["WhatsApp", "Whatsapp", "WhatsApp Cliente", "WhatsApp Responsavel"]);

    if (!whatsapp && responsavel) {
      whatsapp = buscarWhatsappResponsavelConfiguracao(responsavel);
    }

    novasLinhas.push([
      obterValorPorCabecalho_(row, mapa, ["ID"]),
      responsavel,
      whatsapp,
      obterValorPorCabecalho_(row, mapa, ["Cliente"]),
      obterValorPorCabecalho_(row, mapa, ["Placa"]),
      obterValorPorCabecalho_(row, mapa, ["Veículo", "Veiculo"]),
      obterValorPorCabecalho_(row, mapa, ["Negociação", "Negociacao"]),
      obterValorPorCabecalho_(row, mapa, ["Descrição", "Descricao"]),
      obterValorPorCabecalho_(row, mapa, ["Lead"]),
      obterValorPorCabecalho_(row, mapa, ["Prioridade"]),
      obterValorPorCabecalho_(row, mapa, ["Status"]),
      obterValorPorCabecalho_(row, mapa, ["Tipo"]),
      obterValorPorCabecalho_(row, mapa, ["Loja"]),
      obterValorPorCabecalho_(row, mapa, ["Destinatário da Cobrança", "Destinatario da Cobranca", "Destinatário", "Destinatario"]),
      obterValorPorCabecalho_(row, mapa, ["Data Inicial"]),
      obterValorPorCabecalho_(row, mapa, ["Data Vencimento"]),
      obterValorPorCabecalho_(row, mapa, ["Frequência", "Frequencia"]),
      obterValorPorCabecalho_(row, mapa, ["Dias Permitidos"]),
      obterValorPorCabecalho_(row, mapa, ["Hora Início", "Hora Inicio"]),
      obterValorPorCabecalho_(row, mapa, ["Hora Fim"]),
      obterValorPorCabecalho_(row, mapa, ["Último Envio", "Ultimo Envio"]),
      obterValorPorCabecalho_(row, mapa, ["Próximo Envio", "Proximo Envio"]),
      obterValorPorCabecalho_(row, mapa, ["Máximo de Envios", "Maximo de Envios"]),
      obterValorPorCabecalho_(row, mapa, ["Total Enviado", "Total Enviados", "Envios Realizados", "Cobranças Enviadas", "Cobrancas Enviadas"]),
      obterValorPorCabecalho_(row, mapa, ["Template"]),
      obterValorPorCabecalho_(row, mapa, ["Observações", "Observacoes"]),
      obterValorPorCabecalho_(row, mapa, ["Envios por Dia"]),
      obterValorPorCabecalho_(row, mapa, ["Envio Automático?", "Envio Automatico?"]),
      obterValorPorCabecalho_(row, mapa, ["Mês Referência", "Mes Referencia"]),
      obterValorPorCabecalho_(row, mapa, ["Fonte"])
    ]);
  }

  aba.clear();
  aba.getRange(1, 1, novasLinhas.length, PEND_HEADERS_NOVO.length).setValues(novasLinhas);
}

function formatarAbaPendenciasNovoLayout_(aba) {
  aba.setFrozenRows(1);
  aba.getRange(1, 1, 1, PEND_HEADERS_NOVO.length)
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#0F172A")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  aba.setColumnWidth(PEND_COL.ID, 60);
  aba.setColumnWidth(PEND_COL.RESPONSAVEL, 180);
  aba.setColumnWidth(PEND_COL.WHATSAPP, 130);
  aba.setColumnWidth(PEND_COL.CLIENTE, 230);
  aba.setColumnWidth(PEND_COL.PLACA, 100);
  aba.setColumnWidth(PEND_COL.VEICULO, 260);
  aba.setColumnWidth(PEND_COL.NEGOCIACAO, 115);
  aba.setColumnWidth(PEND_COL.DESCRICAO, 430);
  aba.setColumnWidth(PEND_COL.LEAD, 95);
  aba.setColumnWidth(PEND_COL.PRIORIDADE, 120);
  aba.setColumnWidth(PEND_COL.STATUS, 150);
  aba.setColumnWidth(PEND_COL.TIPO, 190);
  aba.setColumnWidth(PEND_COL.TEMPLATE, 190);
}

function montarMapaCabecalho_(headers) {
  var mapa = {};
  for (var i = 0; i < headers.length; i++) {
    var chave = normalizarTexto(headers[i]);
    if (chave) mapa[chave] = i;
  }
  return mapa;
}

function obterValorPorCabecalho_(row, mapa, nomesPossiveis) {
  for (var i = 0; i < nomesPossiveis.length; i++) {
    var chave = normalizarTexto(nomesPossiveis[i]);
    if (mapa.hasOwnProperty(chave)) {
      return row[mapa[chave]];
    }
  }
  return "";
}

function configurarIdAutomaticoPendenciasBase_(mostrarAlerta) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.PENDENCIAS);
  if (!aba) throw new Error("Aba PENDENCIAS nao encontrada.");

  var maxRows = Math.max(aba.getMaxRows(), 1000);
  if (maxRows > 2) {
    aba.getRange(3, PEND_COL.ID, maxRows - 2, 1).clearContent();
  }

  aba.getRange(1, PEND_COL.ID).setValue("ID");
  aba.getRange(2, PEND_COL.ID).setFormula('=ARRAYFORMULA(SE((B2:B<>"")+(D2:D<>"");LIN(B2:B)-1;""))');

  if (mostrarAlerta) {
    SpreadsheetApp.getUi().alert("ID automatico configurado em A2. Deixe A3 para baixo vazio.");
  }
}

function garantirValidacoesPendenciasBase_(mostrarAlerta) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ss.getSheetByName(ABAS.PENDENCIAS);
    if (!aba) throw new Error("Aba PENDENCIAS nao encontrada.");

    if (!abaPendenciasEstaNovoLayout_(aba)) {
      migrarPendenciasParaNovoLayout_(aba);
    }

    var maxRows = Math.max(aba.getMaxRows(), 1000);
    var qtdLinhas = maxRows - 1;

    // IMPORTANTE:
    // Limpa TODAS as validações antigas da aba PENDENCIAS antes de aplicar
    // as novas listas. Isso corrige o erro em que as listas de Tipo e
    // Responsável ficavam nas colunas antigas, como D e F.
    limparValidacoesPendenciasNovoLayout_(aba);

    aba.getRange(1, 1, 1, PEND_HEADERS_NOVO.length).setValues([PEND_HEADERS_NOVO]);

    // Validações corretas no novo layout:
    // B Responsável | J Prioridade | K Status | L Tipo | N Destinatário
    // Q Frequência | R Dias Permitidos | Y Template | AB Envio Automático
    aplicarValidacaoComLista(aba, 2, PEND_COL.RESPONSAVEL, qtdLinhas, obterResponsaveisDasConfiguracoes_());
    aplicarValidacaoComLista(aba, 2, PEND_COL.PRIORIDADE, qtdLinhas, obterValoresListaPorCabecalho("Prioridade", 2));
    aplicarValidacaoComLista(aba, 2, PEND_COL.STATUS, qtdLinhas, obterValoresListaPorCabecalho("Status", 1));
    aplicarValidacaoComLista(aba, 2, PEND_COL.TIPO, qtdLinhas, obterValoresListaPorCabecalho("Tipo", 8));
    aplicarValidacaoComLista(aba, 2, PEND_COL.DESTINATARIO, qtdLinhas, obterValoresListaPorCabecalho("Destinatario da Cobranca", 5));
    aplicarValidacaoComLista(aba, 2, PEND_COL.FREQUENCIA, qtdLinhas, obterValoresListaPorCabecalho("Frequencia", 3));
    aplicarValidacaoComLista(aba, 2, PEND_COL.DIAS_PERMITIDOS, qtdLinhas, obterValoresListaPorCabecalho("Dias Permitidos", 4));
    aplicarValidacaoComLista(aba, 2, PEND_COL.TEMPLATE, qtdLinhas, obterValoresListaPorCabecalho("Templates", 6));
    aplicarValidacaoComLista(aba, 2, PEND_COL.ENVIO_AUTOMATICO, qtdLinhas, ["Sim", "Nao", "Não"]);

    if (mostrarAlerta) {
      SpreadsheetApp.getUi().alert("Validações da aba PENDENCIAS corrigidas conforme o novo layout.");
    }
  } catch (erro) {
    if (mostrarAlerta) throw erro;
    Logger.log("Falha ao aplicar validações silenciosamente: " + erro.message);
  }
}

function limparValidacoesPendenciasNovoLayout_(aba) {
  if (!aba) return;

  var maxRows = Math.max(aba.getMaxRows(), 1000);
  var maxCols = Math.max(aba.getMaxColumns(), PEND_HEADERS_NOVO.length);

  if (maxRows > 1 && maxCols > 0) {
    aba.getRange(2, 1, maxRows - 1, maxCols).clearDataValidations();
  }
}

function obterResponsaveisDasConfiguracoes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.CONFIGURACOES);
  var nomes = [];
  var vistos = {};

  if (!aba) return nomes;

  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    var chave = String(dados[i][0] || "").trim();
    var valor = String(dados[i][1] || "").trim();
    if (!chave || !valor) continue;
    if (normalizarTexto(chave).indexOf("whatsapp ") !== 0) continue;

    var nome = chave.replace(/^WhatsApp\s+/i, "").trim();
    var n = normalizarTexto(nome);
    if (nome && !vistos[n]) {
      nomes.push(nome);
      vistos[n] = true;
    }
  }

  return nomes.sort();
}

function configurarAcionadorEdicaoPendencias() {
  var funcao = "aoEditarPendenciasEasyCar";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === funcao) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger(funcao)
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert("Acionador de edição configurado. Ao selecionar o responsável, o WhatsApp será preenchido automaticamente.");
}

function aoEditarPendenciasEasyCar(e) {
  try {
    if (!e || !e.range) return;
    preencherWhatsappResponsavelPorEdicao_(e);
    preencherWhatsappDisparoManualPorEdicao_(e);
    if (typeof atualizarDashboardComTrava_ === "function") {
      atualizarDashboardComTrava_("edicao");
    }
  } catch (erro) {
    Logger.log("Erro no acionador de edição: " + erro.message);
  }
}

function preencherWhatsappResponsavelPorEdicao_(e) {
  var aba = e.range.getSheet();
  if (!aba || aba.getName() !== ABAS.PENDENCIAS) return;

  var row = e.range.getRow();
  var col = e.range.getColumn();

  if (row < 2 || col !== PEND_COL.RESPONSAVEL) return;

  var responsavel = String(aba.getRange(row, PEND_COL.RESPONSAVEL).getValue() || "").trim();
  var whatsapp = buscarWhatsappResponsavelConfiguracao(responsavel);
  aba.getRange(row, PEND_COL.WHATSAPP).setValue(whatsapp || "");
}

function preencherWhatsappsPendenciasExistentes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.PENDENCIAS);
  if (!aba) throw new Error("Aba PENDENCIAS nao encontrada.");

  var lastRow = aba.getLastRow();
  if (lastRow < 2) return;

  var responsaveis = aba.getRange(2, PEND_COL.RESPONSAVEL, lastRow - 1, 1).getValues();
  var saida = [];

  for (var i = 0; i < responsaveis.length; i++) {
    var responsavel = responsaveis[i][0];
    saida.push([buscarWhatsappResponsavelConfiguracao(responsavel)]);
  }

  aba.getRange(2, PEND_COL.WHATSAPP, saida.length, 1).setValues(saida);
}


/****************************************************
 * ENVIO POR TEMPLATES OFICIAIS DA META
 ****************************************************/

function enviarMensagemPendenciaMetaOuTexto_(numeroDestino, mensagemTexto, template, item, responsavel) {
  if (usarTemplatesMeta_()) {
    var nomeTemplate = String((template && template.codigo) || item.template || "").trim();
    var parametros = montarParametrosTemplateMeta_(template.mensagem, item, responsavel, nomeTemplate);
    var idioma = buscarConfiguracaoSegura("Idioma templates Meta", "pt_BR");
    var resultadoTemplate = enviarWhatsAppTemplateMeta(numeroDestino, nomeTemplate, parametros, idioma);

    if (resultadoTemplate.sucesso) {
      return {
        sucesso: true,
        retorno: resultadoTemplate.retorno,
        messageId: resultadoTemplate.messageId,
        statusSucesso: "ENVIADO PELO WHATSAPP - TEMPLATE META",
        statusErro: "ERRO NO ENVIO DO TEMPLATE META"
      };
    }

    if (usarFallbackTextoLivre_()) {
      var resultadoTexto = enviarWhatsAppReal(numeroDestino, mensagemTexto);
      return {
        sucesso: resultadoTexto.sucesso,
        retorno: "TEMPLATE FALHOU: " + resultadoTemplate.retorno + " | FALLBACK TEXTO: " + resultadoTexto.retorno,
        messageId: resultadoTexto.messageId || "",
        statusSucesso: "ENVIADO PELO WHATSAPP - FALLBACK TEXTO",
        statusErro: "ERRO NO ENVIO DO TEMPLATE META E FALLBACK"
      };
    }

    return {
      sucesso: false,
      retorno: resultadoTemplate.retorno,
      messageId: resultadoTemplate.messageId || "",
      statusSucesso: "ENVIADO PELO WHATSAPP - TEMPLATE META",
      statusErro: "ERRO NO ENVIO DO TEMPLATE META"
    };
  }

  var resultado = enviarWhatsAppReal(numeroDestino, mensagemTexto);
  return {
    sucesso: resultado.sucesso,
    retorno: resultado.retorno,
    messageId: resultado.messageId || "",
    statusSucesso: "ENVIADO PELO WHATSAPP - TEXTO LIVRE",
    statusErro: "ERRO NO ENVIO"
  };
}

function enviarWhatsAppTemplateMeta(numeroDestino, nomeTemplate, parametrosBody, idioma) {
  var token = buscarConfiguracaoSegura("WhatsApp Access Token", "");
  var phoneNumberId = buscarConfiguracaoSegura("WhatsApp Phone Number ID", "");
  var apiVersion = buscarConfiguracaoSegura("WhatsApp API Version", "v25.0");

  if (!token || !phoneNumberId) {
    return { sucesso: false, retorno: "Token ou Phone Number ID nao configurado.", messageId: "" };
  }

  var telefone = formatarTelefoneBrasil(numeroDestino);
  if (!telefone) {
    return { sucesso: false, retorno: "Telefone de destino invalido ou vazio.", messageId: "" };
  }

  nomeTemplate = String(nomeTemplate || "").trim();
  if (!nomeTemplate) {
    return { sucesso: false, retorno: "Nome do template Meta nao informado.", messageId: "" };
  }

  var url = "https://graph.facebook.com/" + apiVersion + "/" + phoneNumberId + "/messages";

  var components = [];

  var mediaIdEspecifico = buscarConfiguracaoSegura("Header Image ID " + nomeTemplate, "");
  var mediaIdPadrao = buscarConfiguracaoSegura("Header Image ID padrão templates Meta", "");

  var urlImagemEspecifica = buscarConfiguracaoSegura("Header Image URL " + nomeTemplate, "");
  var urlImagemPadrao = buscarConfiguracaoSegura("URL imagem padrão templates Meta", "");

  var mediaIdFinal = String(mediaIdEspecifico || mediaIdPadrao || "").trim();
  var urlImagemFinal = String(urlImagemEspecifica || urlImagemPadrao || "").trim();

  if (mediaIdFinal) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            id: mediaIdFinal
          }
        }
      ]
    });
  } else if (urlImagemFinal) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: urlImagemFinal
          }
        }
      ]
    });
  }

  if (parametrosBody && parametrosBody.length > 0) {
    components.push({
      type: "body",
      parameters: parametrosBody.map(function (valor) {
        return {
          type: "text",
          text: limitarTextoParametroMeta_(valor)
        };
      })
    });
  }

  var payload = {
    messaging_product: "whatsapp",
    to: telefone,
    type: "template",
    template: {
      name: nomeTemplate,
      language: {
        code: idioma || "pt_BR"
      },
      components: components
    }
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var resposta = UrlFetchApp.fetch(url, options);
    var codigo = resposta.getResponseCode();
    var texto = resposta.getContentText();
    var messageId = "";

    try {
      var json = JSON.parse(texto);
      if (json.messages && json.messages.length > 0 && json.messages[0].id) {
        messageId = json.messages[0].id;
      }
    } catch (e) {}

    return {
      sucesso: codigo >= 200 && codigo < 300,
      retorno: "HTTP " + codigo + " - " + texto,
      messageId: messageId
    };
  } catch (erro) {
    return {
      sucesso: false,
      retorno: erro.message,
      messageId: ""
    };
  }
}

function usarTemplatesMeta_() {
  return normalizarTexto(buscarConfiguracaoSegura("Usar templates oficiais Meta?", "Nao")) === "sim";
}

function usarFallbackTextoLivre_() {
  return normalizarTexto(buscarConfiguracaoSegura("Fallback texto livre se template falhar?", "Não")) === "sim";
}

function montarParametrosTemplateMeta_(templateMensagem, item, responsavel, nomeTemplate) {
  nomeTemplate = String(nomeTemplate || item.template || "").trim();

  /****************************************************
   * PRIORIDADE 1: CONFIGURAÇÃO EXATA POR TEMPLATE
   * Exemplo na aba CONFIGURACOES:
   * Parametros Body entrega_pendente = RESPONSAVEL,DESCRICAO,CLIENTE,PLACA,VEICULO,NEGOCIACAO
   ****************************************************/
  var configuracaoParametros = buscarConfiguracaoSegura("Parametros Body " + nomeTemplate, "");

  if (configuracaoParametros) {
    var chaves = String(configuracaoParametros || "")
      .split(",")
      .map(function (p) { return String(p || "").trim(); })
      .filter(function (p) { return p !== ""; });

    return chaves.map(function (chave) {
      return resolverValorParametroTemplateMeta_(chave, item, responsavel);
    });
  }

  /****************************************************
   * PRIORIDADE 2: LEITURA AUTOMÁTICA DA ABA TEMPLATES
   * Usa placeholders [CLIENTE], [PLACA], etc.
   * Remove duplicados para evitar enviar parâmetros repetidos.
   ****************************************************/
  var texto = String(templateMensagem || "");
  var regex = /\[([^\]]+)\]/g;
  var parametros = [];
  var usados = {};
  var match;

  while ((match = regex.exec(texto)) !== null) {
    var nome = String(match[1] || "").trim();
    var chaveNormalizada = normalizarTexto(nome).replace(/\s+/g, "_");

    if (!nome || usados[chaveNormalizada]) continue;

    parametros.push(resolverValorParametroTemplateMeta_(nome, item, responsavel));
    usados[chaveNormalizada] = true;
  }

  return parametros;
}

function resolverValorParametroTemplateMeta_(nomeParametro, item, responsavel) {
  var chave = normalizarTexto(nomeParametro).replace(/\s+/g, "_");

  var mapa = {
    id: item.id,
    cliente: item.cliente,
    whatsapp: item.whatsappCliente || item.whatsappResponsavel,
    tipo: item.tipo,
    descricao: item.descricao,
    descricao_limpa: extrairDescricaoLimpa(item.descricao),
    pendencia: extrairDescricaoLimpa(item.descricao),
    prazo_resolucao: calcularPrazoResolucao(item),
    responsavel: responsavel.nome || item.responsavel,
    loja: item.loja,
    negociacao: item.negociacao,
    lead: item.lead,
    placa: item.placa,
    veiculo: item.veiculo,
    prioridade: item.prioridade,
    destinatario: item.destinatario,
    status: item.status,
    total_enviado: item.totalEnviado || 0,
    mes_referencia: item.mesReferencia || "",
    fonte: item.fonte || ""
  };

  var valor = mapa.hasOwnProperty(chave) ? mapa[chave] : "";
  return String(valor || "Não informado");
}

function limitarTextoParametroMeta_(valor) {
  var texto = String(valor || "Não informado").trim();
  if (!texto) texto = "Não informado";
  return texto.substring(0, 900);
}


/****************************************************
 * DISPARO MANUAL
 ****************************************************/

function prepararDisparoManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_DISPARO_MANUAL);

  if (!aba) {
    aba = ss.insertSheet(ABA_DISPARO_MANUAL);
  }

  aba.clear();
  aba.getRange(1, 1, 1, DISPARO_HEADERS.length).setValues([DISPARO_HEADERS]);

  aba.getRange(1, 1, 1, DISPARO_HEADERS.length)
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#0F172A")
    .setHorizontalAlignment("center");

  aba.setFrozenRows(1);
  aba.setColumnWidth(DISPARO_COL.ID, 60);
  aba.setColumnWidth(DISPARO_COL.RESPONSAVEL, 180);
  aba.setColumnWidth(DISPARO_COL.WHATSAPP, 130);
  aba.setColumnWidth(DISPARO_COL.TEMPLATE, 190);
  aba.setColumnWidth(DISPARO_COL.MENSAGEM, 420);
  aba.setColumnWidth(DISPARO_COL.CLIENTE, 220);
  aba.setColumnWidth(DISPARO_COL.PLACA, 100);
  aba.setColumnWidth(DISPARO_COL.VEICULO, 240);
  aba.setColumnWidth(DISPARO_COL.NEGOCIACAO, 110);
  aba.setColumnWidth(DISPARO_COL.PRIORIDADE, 110);
  aba.setColumnWidth(DISPARO_COL.ENVIAR, 100);
  aba.setColumnWidth(DISPARO_COL.STATUS_ENVIO, 210);
  aba.setColumnWidth(DISPARO_COL.RETORNO_API, 420);

  aplicarValidacaoComLista(aba, 2, DISPARO_COL.RESPONSAVEL, Math.max(aba.getMaxRows() - 1, 1000), obterResponsaveisDasConfiguracoes_());
  aplicarValidacaoComLista(aba, 2, DISPARO_COL.TEMPLATE, Math.max(aba.getMaxRows() - 1, 1000), obterTemplatesDisponiveis_());
  aplicarValidacaoComLista(aba, 2, DISPARO_COL.PRIORIDADE, Math.max(aba.getMaxRows() - 1, 1000), obterValoresListaPorCabecalho("Prioridade", 2));
  aplicarValidacaoComLista(aba, 2, DISPARO_COL.ENVIAR, Math.max(aba.getMaxRows() - 1, 1000), ["Enviar", "Não enviar", "Enviado"]);

  aba.getRange(2, DISPARO_COL.ID).setFormula('=ARRAYFORMULA(SE(B2:B<>"";LIN(B2:B)-1;""))');

  SpreadsheetApp.getUi().alert(
    "Aba DISPARO_MANUAL criada/configurada.\n\n" +
    "Preencha o responsável, a mensagem e marque a coluna ENVIAR? como 'Enviar'.\n" +
    "Depois use o menu: Robo de Pendencias > Enviar disparos manuais pendentes."
  );
}

function obterTemplatesDisponiveis_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.TEMPLATES);
  var templates = [];
  var vistos = {};

  if (aba) {
    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      var codigo = String(dados[i][0] || "").trim();
      if (!codigo) continue;
      var chave = normalizarTexto(codigo);
      if (!vistos[chave]) {
        templates.push(codigo);
        vistos[chave] = true;
      }
    }
  }

  var aprovadosMeta = [
    "escalonamento_gerente",
    "nova_pendencia_importada",
    "followup_sistema",
    "venda_pendente",
    "entrega_pendente",
    "hello_world"
  ];

  for (var j = 0; j < aprovadosMeta.length; j++) {
    var ch = normalizarTexto(aprovadosMeta[j]);
    if (!vistos[ch]) {
      templates.push(aprovadosMeta[j]);
      vistos[ch] = true;
    }
  }

  return templates.sort();
}

function preencherWhatsappDisparoManualPorEdicao_(e) {
  var aba = e.range.getSheet();
  if (!aba || aba.getName() !== ABA_DISPARO_MANUAL) return;

  var row = e.range.getRow();
  var col = e.range.getColumn();

  if (row < 2) return;

  if (col === DISPARO_COL.RESPONSAVEL) {
    var responsavel = String(aba.getRange(row, DISPARO_COL.RESPONSAVEL).getValue() || "").trim();
    var whatsapp = buscarWhatsappResponsavelConfiguracao(responsavel);
    aba.getRange(row, DISPARO_COL.WHATSAPP).setValue(whatsapp || "");
  }

  if (col === DISPARO_COL.ENVIAR) {
    var acao = normalizarTexto(aba.getRange(row, DISPARO_COL.ENVIAR).getValue());
    if (acao === "enviar") {
      enviarDisparoManualLinha_(aba, row);
    }
  }
}

function enviarDisparosManuais() {
  if (!bloquearExecucaoForaDoHorarioSeNecessario_()) {
    SpreadsheetApp.getUi().alert(
      "Disparo manual bloqueado pela trava de horário.\n\n" +
      "Para testar em qualquer horário, use: Robo de Pendencias > Desativar trava de horário."
    );
    return { enviados: 0, erros: 0, bloqueadoHorario: true };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_DISPARO_MANUAL);

  if (!aba) {
    SpreadsheetApp.getUi().alert("A aba DISPARO_MANUAL não existe. Execute primeiro: Preparar disparo manual.");
    return { enviados: 0, erros: 0, bloqueadoHorario: false };
  }

  var lastRow = aba.getLastRow();
  var enviados = 0;
  var erros = 0;

  for (var row = 2; row <= lastRow; row++) {
    var acao = normalizarTexto(aba.getRange(row, DISPARO_COL.ENVIAR).getValue());
    if (acao !== "enviar") continue;

    var resultado = enviarDisparoManualLinha_(aba, row);
    if (resultado && resultado.sucesso) enviados++; else erros++;
  }

  SpreadsheetApp.getUi().alert("Disparo manual finalizado.\n\nEnviados: " + enviados + "\nErros: " + erros);
  return { enviados: enviados, erros: erros, bloqueadoHorario: false };
}

function enviarDisparoManualLinha_(aba, row) {
  var responsavel = String(aba.getRange(row, DISPARO_COL.RESPONSAVEL).getValue() || "").trim();
  var whatsapp = limparTelefone(aba.getRange(row, DISPARO_COL.WHATSAPP).getValue());
  var codigoTemplate = String(aba.getRange(row, DISPARO_COL.TEMPLATE).getValue() || "").trim();
  var mensagemManual = String(aba.getRange(row, DISPARO_COL.MENSAGEM).getValue() || "").trim();

  if (!responsavel) {
    return registrarResultadoDisparoManual_(aba, row, false, "Responsável não informado.", "");
  }

  if (!whatsapp) {
    whatsapp = buscarWhatsappResponsavelConfiguracao(responsavel);
    aba.getRange(row, DISPARO_COL.WHATSAPP).setValue(whatsapp || "");
  }

  if (!whatsapp) {
    return registrarResultadoDisparoManual_(aba, row, false, "WhatsApp do responsável não encontrado.", "");
  }

  if (!codigoTemplate) {
    codigoTemplate = "followup_sistema";
    aba.getRange(row, DISPARO_COL.TEMPLATE).setValue(codigoTemplate);
  }

  if (!mensagemManual) {
    return registrarResultadoDisparoManual_(aba, row, false, "Mensagem/Descrição não informada.", "");
  }

  var item = {
    id: aba.getRange(row, DISPARO_COL.ID).getValue() || row - 1,
    responsavel: responsavel,
    whatsappResponsavel: whatsapp,
    cliente: aba.getRange(row, DISPARO_COL.CLIENTE).getValue() || "Disparo manual",
    whatsappCliente: whatsapp,
    placa: aba.getRange(row, DISPARO_COL.PLACA).getValue() || "",
    veiculo: aba.getRange(row, DISPARO_COL.VEICULO).getValue() || "",
    negociacao: aba.getRange(row, DISPARO_COL.NEGOCIACAO).getValue() || "",
    descricao: mensagemManual,
    lead: "",
    prioridade: aba.getRange(row, DISPARO_COL.PRIORIDADE).getValue() || "Alta",
    status: "Manual",
    tipo: "Disparo manual",
    loja: buscarConfiguracaoSegura("Unidade Padrao", "EasyCar Matriz"),
    destinatario: "Responsável",
    dataVencimento: new Date(),
    template: codigoTemplate,
    totalEnviado: 0,
    mesReferencia: "",
    fonte: "DISPARO_MANUAL"
  };

  var template = buscarTemplate(codigoTemplate);
  if (!template.encontrado) {
    template = {
      encontrado: true,
      codigo: codigoTemplate,
      mensagem: "[RESPONSAVEL] [PENDENCIA] [CLIENTE] [PLACA] [VEICULO] [NEGOCIACAO]"
    };
  }

  var responsavelObj = { nome: responsavel, whatsapp: whatsapp };
  var mensagemFinal = montarMensagem(template.mensagem, item, responsavelObj);
  if (!usarTemplatesMeta_()) {
    mensagemFinal = mensagemManual;
  }

  var resultado = enviarMensagemPendenciaMetaOuTexto_(whatsapp, mensagemFinal, template, item, responsavelObj);
  registrarHistoricoDisparoManual_(item, whatsapp, mensagemFinal, resultado);

  return registrarResultadoDisparoManual_(aba, row, resultado.sucesso, resultado.retorno, resultado.messageId || "");
}

function registrarResultadoDisparoManual_(aba, row, sucesso, retorno, messageId) {
  aba.getRange(row, DISPARO_COL.STATUS_ENVIO).setValue(sucesso ? "ENVIADO" : "ERRO");
  aba.getRange(row, DISPARO_COL.RETORNO_API).setValue(retorno || "");
  aba.getRange(row, DISPARO_COL.DATA_HORA).setValue(new Date());

  if (sucesso) {
    aba.getRange(row, DISPARO_COL.ENVIAR).setValue("Enviado");
  }

  return { sucesso: sucesso, retorno: retorno, messageId: messageId || "" };
}

function registrarHistoricoDisparoManual_(item, whatsapp, mensagem, resultado) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaHistorico = ss.getSheetByName(ABAS.HISTORICO);
  if (!abaHistorico) return;

  garantirCabecalhoHistorico(abaHistorico);

  registrarHistorico(
    abaHistorico,
    item,
    whatsapp,
    mensagem,
    resultado.sucesso ? "DISPARO MANUAL ENVIADO" : "ERRO NO DISPARO MANUAL",
    resultado.retorno,
    "Disparo Manual",
    "",
    resultado.messageId || "",
    "",
    "",
    ""
  );
}

// ==========================================================
// DASHBOARD EM TEMPO REAL - EASYCAR VEÍCULOS
// ==========================================================

/****************************************************
 * CONFIGURAÇÃO DO DASHBOARD EM TEMPO REAL
 ****************************************************/

function ativarDashboardTempoReal() {
  desativarDashboardTempoReal(false);

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.newTrigger("atualizarDashboardPorEdicao")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ScriptApp.newTrigger("atualizarDashboardPorAlteracao")
    .forSpreadsheet(ss)
    .onChange()
    .create();

  ScriptApp.newTrigger("atualizarDashboardPorTempo")
    .timeBased()
    .everyMinutes(1)
    .create();

  atualizarDashboardPendenciasSilencioso_();

  SpreadsheetApp.getUi().alert(
    "Dashboard em tempo real ativado com sucesso.\n\n" +
    "Ele será atualizado ao editar a aba PENDENCIAS e também automaticamente a cada 1 minuto."
  );
}

function desativarDashboardTempoReal(mostrarAlerta) {
  if (typeof mostrarAlerta === "undefined") mostrarAlerta = true;

  var nomesFuncoes = [
    "atualizarDashboardPorEdicao",
    "atualizarDashboardPorAlteracao",
    "atualizarDashboardPorTempo"
  ];

  var triggers = ScriptApp.getProjectTriggers();
  var removidos = 0;

  for (var i = 0; i < triggers.length; i++) {
    if (nomesFuncoes.indexOf(triggers[i].getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(triggers[i]);
      removidos++;
    }
  }

  if (mostrarAlerta) {
    SpreadsheetApp.getUi().alert("Dashboard em tempo real desativado. Acionadores removidos: " + removidos);
  }
}

function atualizarDashboardPorEdicao(e) {
  try {
    if (!e || !e.range) return;

    var aba = e.range.getSheet();
    if (!aba) return;

    var nomeAba = aba.getName();
    if (nomeAba !== ABAS.PENDENCIAS) return;

    atualizarDashboardComTrava_("edicao");
  } catch (erro) {
    Logger.log("Erro ao atualizar dashboard por edição: " + erro.message);
  }
}

function atualizarDashboardPorAlteracao(e) {
  try {
    atualizarDashboardComTrava_("alteracao");
  } catch (erro) {
    Logger.log("Erro ao atualizar dashboard por alteração: " + erro.message);
  }
}

function atualizarDashboardPorTempo() {
  try {
    atualizarDashboardComTrava_("tempo");
  } catch (erro) {
    Logger.log("Erro ao atualizar dashboard por tempo: " + erro.message);
  }
}

function atualizarDashboardComTrava_(origem) {
  var props = PropertiesService.getScriptProperties();
  var agora = new Date().getTime();
  var ultima = Number(props.getProperty("ULTIMA_ATUALIZACAO_DASHBOARD_MS") || 0);

  if (origem !== "tempo" && ultima && agora - ultima < 10000) {
    return;
  }

  props.setProperty("ULTIMA_ATUALIZACAO_DASHBOARD_MS", String(agora));
  atualizarDashboardPendenciasSilencioso_();
}

/****************************************************
 * FUNÇÕES PRINCIPAIS DO DASHBOARD
 ****************************************************/

function atualizarDashboardPendenciasAutomatico() {
  atualizarDashboardPendenciasBase_(false);
}

function atualizarDashboardPendenciasSilencioso_() {
  atualizarDashboardPendenciasBase_(true);
}

function atualizarDashboardPendenciasBase_(silencioso) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName("DASHBOARD");
  var pendencias = ss.getSheetByName(ABAS.PENDENCIAS);

  if (!dashboard) {
    dashboard = ss.insertSheet("DASHBOARD");
  }

  if (!pendencias) {
    if (!silencioso) SpreadsheetApp.getUi().alert("A aba PENDENCIAS não foi encontrada.");
    return;
  }

  var dados = pendencias.getDataRange().getValues();

  if (!dados || dados.length < 2) {
    if (!silencioso) SpreadsheetApp.getUi().alert("A aba PENDENCIAS não possui dados suficientes para montar o dashboard.");
    return;
  }

  var indicadores = calcularIndicadoresDashboardPendencias_(dados);
  montarLayoutDashboardModeloLargo_(dashboard, indicadores);

  if (!silencioso) {
    SpreadsheetApp.getUi().alert("Dashboard atualizado com sucesso.");
  }
}

function calcularIndicadoresDashboardPendencias_(dados) {
  var cabecalhoOriginal = dados[0];
  var cabecalho = cabecalhoOriginal.map(function (h) {
    return normalizarDash_(h);
  });

  var colCliente = obterIndiceColunaDash_(cabecalho, ["cliente"]);
  var colTipo = obterIndiceColunaDash_(cabecalho, ["tipo"]);
  var colDescricao = obterIndiceColunaDash_(cabecalho, ["descricao", "descrição"]);
  var colPrioridade = obterIndiceColunaDash_(cabecalho, ["prioridade"]);
  var colStatus = obterIndiceColunaDash_(cabecalho, ["status"]);
  var colNegociacao = obterIndiceColunaDash_(cabecalho, ["negociacao", "negociação"]);
  var colPlaca = obterIndiceColunaDash_(cabecalho, ["placa"]);
  var colMaximoEnvios = obterIndiceColunaDash_(cabecalho, ["maximo de envios", "máximo de envios"]);
  var colTotalEnviado = obterIndiceColunaDash_(cabecalho, [
    "total enviado",
    "total enviados",
    "envios realizados",
    "cobrancas enviadas",
    "cobranças enviadas",
    "envios"
  ]);

  if (colTotalEnviado === -1 && colMaximoEnvios !== -1 && colStatus === colMaximoEnvios + 2) {
    colTotalEnviado = colMaximoEnvios + 1;
  }

  var linhas = [];

  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];
    var temConteudo = false;
    var colunasBase = [colCliente, colTipo, colDescricao, colNegociacao, colPlaca];

    for (var c = 0; c < colunasBase.length; c++) {
      var idx = colunasBase[c];
      if (idx >= 0 && String(row[idx] || "").trim() !== "") {
        temConteudo = true;
        break;
      }
    }

    if (temConteudo) {
      linhas.push(row);
    }
  }

  function status(row) {
    return colStatus >= 0 ? normalizarDash_(row[colStatus]) : "";
  }

  function prioridade(row) {
    return colPrioridade >= 0 ? normalizarDash_(row[colPrioridade]) : "";
  }

  function tipo(row) {
    return colTipo >= 0 ? normalizarDash_(row[colTipo]) : "";
  }

  function descricao(row) {
    return colDescricao >= 0 ? normalizarDash_(row[colDescricao]) : "";
  }

  function textoGeral(row) {
    return [tipo(row), status(row), descricao(row)].join(" ");
  }

  function contarPorStatus(valor) {
    var alvo = normalizarDash_(valor);
    return linhas.filter(function (row) { return status(row) === alvo; }).length;
  }

  function contarStatusContem(valor) {
    var alvo = normalizarDash_(valor);
    return linhas.filter(function (row) { return status(row).indexOf(alvo) >= 0; }).length;
  }

  function contarPrioridade(valor) {
    var alvo = normalizarDash_(valor);
    return linhas.filter(function (row) { return prioridade(row) === alvo; }).length;
  }

  function contarTextoContem(listaTermos) {
    return linhas.filter(function (row) {
      var texto = textoGeral(row);
      for (var t = 0; t < listaTermos.length; t++) {
        if (texto.indexOf(normalizarDash_(listaTermos[t])) >= 0) return true;
      }
      return false;
    }).length;
  }

  function somarEnvios() {
    if (colTotalEnviado === -1) return 0;
    return linhas.reduce(function (total, row) {
      return total + converterNumeroDash_(row[colTotalEnviado]);
    }, 0);
  }

  var totalAtivas = linhas.filter(function (row) {
    var st = status(row);
    return st !== "resolvido" && st !== "resolvida" && st !== "resolvidas" && st !== "pausado" && st !== "cancelado";
  }).length;

  return [
    ["TOTAL DE PENDÊNCIAS", totalAtivas, "Ativas no sistema", "#1E3A8A"],
    ["PENDENTES", contarPorStatus("Pendente"), "Aguardando ação", "#DC2626"],
    ["EM ANDAMENTO", contarStatusContem("Andamento"), "Em execução", "#2563EB"],
    ["AGUARDANDO CLIENTE", contarStatusContem("Aguardando Cliente"), "Retorno do cliente", "#D97706"],
    ["AGUARDANDO FINANCEIRO", contarStatusContem("Aguardando Financeiro"), "Análise financeira", "#7C3AED"],

    ["DOCUMENTAÇÃO", contarStatusContem("Aguardando Documentação"), "Pendência documental", "#F97316"],
    ["VENDEDOR", contarStatusContem("Aguardando Vendedor"), "Responsável comercial", "#374151"],
    ["RESOLVIDAS", contarStatusContem("Resolvid"), "Finalizadas", "#16A34A"],
    ["PAUSADAS", contarPorStatus("Pausado"), "Temporariamente paradas", "#6B7280"],
    ["CANCELADAS", contarPorStatus("Cancelado"), "Canceladas", "#991B1B"],

    ["CRÍTICAS", contarPrioridade("Crítica"), "Ação imediata", "#B91C1C"],
    ["ALTA PRIORIDADE", contarPrioridade("Alta"), "Prioridade alta", "#EA580C"],
    ["MÉDIA PRIORIDADE", contarPrioridade("Média"), "Prioridade média", "#CA8A04"],
    ["BAIXA PRIORIDADE", contarPrioridade("Baixa"), "Baixa urgência", "#15803D"],
    ["COBRANÇAS ENVIADAS", somarEnvios(), "Total enviado", "#0F766E"]
  ];
}

/****************************************************
 * LAYOUT DO DASHBOARD - MODELO LARGO
 ****************************************************/

function montarLayoutDashboardModeloLargo_(sheet, cards) {
  var area = sheet.getRange("A1:O21");
  area.breakApart();
  area.clearContent();
  area.clearFormat();
  area.setBorder(false, false, false, false, false, false);

  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(0);

  sheet.getRange("A1:O21").setBackground("#F1F5F9");

  for (var c = 1; c <= 15; c++) {
    sheet.setColumnWidth(c, 84);
  }

  for (var r = 1; r <= 21; r++) {
    sheet.setRowHeight(r, 22);
  }

  sheet.setRowHeight(1, 30);
  sheet.setRowHeight(2, 23);
  sheet.setRowHeight(3, 14);
  sheet.setRowHeight(4, 23);
  sheet.setRowHeight(5, 35);
  sheet.setRowHeight(6, 25);
  sheet.setRowHeight(8, 23);
  sheet.setRowHeight(9, 35);
  sheet.setRowHeight(10, 25);
  sheet.setRowHeight(12, 23);
  sheet.setRowHeight(13, 35);
  sheet.setRowHeight(14, 25);

  var header = sheet.getRange("A1:O1");
  header.merge();
  header
    .setValue("CENTRAL DE PENDÊNCIAS – EASYCAR VEÍCULOS LOJA MATRIZ")
    .setFontFamily("Arial")
    .setFontSize(14)
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBackground("#0F172A");

  var subheader = sheet.getRange("A2:O2");
  subheader.merge();
  subheader
    .setValue("Resumo automático da aba PENDENCIAS")
    .setFontFamily("Arial")
    .setFontSize(8)
    .setFontColor("#334155")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBackground("#E2E8F0");

  var cardStartRows = [4, 8, 12];
  var cardStartCols = [1, 4, 7, 10, 13];
  var index = 0;

  for (var linha = 0; linha < 3; linha++) {
    for (var coluna = 0; coluna < 5; coluna++) {
      if (index >= cards.length) break;

      var card = cards[index];
      var titulo = card[0];
      var valor = card[1];
      var subtitulo = card[2];
      var cor = card[3];
      var row = cardStartRows[linha];
      var col = cardStartCols[coluna];

      var cardRange = sheet.getRange(row, col, 3, 3);
      cardRange
        .setBackground("#FFFFFF")
        .setBorder(true, true, true, true, true, true, "#CBD5E1", SpreadsheetApp.BorderStyle.SOLID);

      var titleRange = sheet.getRange(row, col, 1, 3);
      titleRange.merge();
      titleRange
        .setValue(titulo)
        .setFontFamily("Arial")
        .setFontSize(7)
        .setFontWeight("bold")
        .setFontColor("#FFFFFF")
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle")
        .setWrap(true)
        .setBackground(cor);

      var valueRange = sheet.getRange(row + 1, col, 1, 3);
      valueRange.merge();
      valueRange
        .setValue(valor)
        .setFontFamily("Arial")
        .setFontSize(21)
        .setFontWeight("bold")
        .setFontColor(cor)
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle")
        .setBackground("#FFFFFF");

      var footerRange = sheet.getRange(row + 2, col, 1, 3);
      footerRange.merge();
      footerRange
        .setValue(subtitulo)
        .setFontFamily("Arial")
        .setFontSize(7)
        .setFontColor("#475569")
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle")
        .setWrap(true)
        .setBackground("#F8FAFC");

      index++;
    }
  }

  sheet.getRange("A16:O19")
    .setBackground("#DBEAFE")
    .setBorder(true, true, true, true, false, false, "#60A5FA", SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange("A1:O21")
    .setFontFamily("Arial")
    .setVerticalAlignment("middle");

  sheet.setActiveRange(sheet.getRange("A1:O19"));
}

/****************************************************
 * FUNÇÕES AUXILIARES DO DASHBOARD
 ****************************************************/

function obterIndiceColunaDash_(cabecalhoNormalizado, nomesPossiveis) {
  var alvos = nomesPossiveis.map(function (nome) {
    return normalizarDash_(nome);
  });

  for (var i = 0; i < cabecalhoNormalizado.length; i++) {
    if (alvos.indexOf(cabecalhoNormalizado[i]) >= 0) return i;
  }

  return -1;
}

function converterNumeroDash_(valor) {
  if (typeof valor === "number") return valor;

  var texto = String(valor || "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");

  var numero = Number(texto);
  return isNaN(numero) ? 0 : numero;
}

function normalizarDash_(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}



/****************************************************
 * CONFIGURAÇÃO DOS PARÂMETROS DOS TEMPLATES META
 ****************************************************/

function prepararParametrosTemplatesMetaEasyCar(mostrarAlerta) {
  if (typeof mostrarAlerta === "undefined") mostrarAlerta = true;

  garantirLinhaConfiguracaoMetaParametros_(
    "Parametros Body entrega_pendente",
    "RESPONSAVEL,DESCRICAO,CLIENTE,PLACA,VEICULO,NEGOCIACAO",
    "Ordem exata dos 6 parâmetros do corpo do template entrega_pendente na Meta."
  );

  garantirLinhaConfiguracaoMetaParametros_(
    "Parametros Body venda_pendente",
    "RESPONSAVEL,DESCRICAO,CLIENTE,PLACA,VEICULO,NEGOCIACAO",
    "Ordem exata dos 6 parâmetros do corpo do template venda_pendente na Meta."
  );

  garantirLinhaConfiguracaoMetaParametros_(
    "Parametros Body followup_sistema",
    "RESPONSAVEL,DESCRICAO,CLIENTE,PLACA,VEICULO,NEGOCIACAO",
    "Ordem exata dos 6 parâmetros do corpo do template followup_sistema na Meta."
  );

  garantirLinhaConfiguracaoMetaParametros_(
    "Parametros Body escalonamento_gerente",
    "RESPONSAVEL,DESCRICAO,CLIENTE,PLACA,VEICULO,NEGOCIACAO",
    "Ordem exata dos 6 parâmetros do corpo do template escalonamento_gerente na Meta."
  );

  garantirLinhaConfiguracaoMetaParametros_(
    "Parametros Body nova_pendencia_importada",
    "RESPONSAVEL,LOJA,NEGOCIACAO,PLACA,CLIENTE,VEICULO",
    "Ajuste conforme a quantidade de variáveis do template nova_pendencia_importada na Meta."
  );

  if (mostrarAlerta) {
    SpreadsheetApp.getUi().alert(
      "Parâmetros dos templates Meta preparados com sucesso.\n\n" +
      "Confira na aba CONFIGURACOES as linhas Parametros Body ..."
    );
  }
}

function garantirLinhaConfiguracaoMetaParametros_(chave, valor, observacao) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nomeAba = typeof ABAS !== "undefined" && ABAS.CONFIGURACOES ? ABAS.CONFIGURACOES : "CONFIGURACOES";
  var aba = ss.getSheetByName(nomeAba);

  if (!aba) {
    aba = ss.insertSheet(nomeAba);
    aba.getRange(1, 1, 1, 3).setValues([["Configuração", "Valor", "Observações"]]);
  }

  var linha = localizarLinhaConfiguracaoMetaParametros_(aba, chave);

  if (linha > 0) {
    var valorAtual = String(aba.getRange(linha, 2).getValue() || "").trim();

    if (!valorAtual) {
      aba.getRange(linha, 2).setValue(valor);
    }

    if (String(aba.getRange(linha, 3).getValue() || "").trim() === "") {
      aba.getRange(linha, 3).setValue(observacao || "");
    }

    return;
  }

  aba.appendRow([chave, valor, observacao || ""]);
}

function localizarLinhaConfiguracaoMetaParametros_(aba, chave) {
  var lastRow = aba.getLastRow();
  if (lastRow < 1) return 0;

  var dados = aba.getRange(1, 1, lastRow, 1).getValues();
  var alvo = normalizarTexto(chave);

  for (var i = 0; i < dados.length; i++) {
    if (normalizarTexto(dados[i][0]) === alvo) {
      return i + 1;
    }
  }

  return 0;
}

/****************************************************
 * RETORNOS DOS VENDEDORES - WEBHOOK WHATSAPP
 ****************************************************/

var RETORNOS_HEADERS = [
  "Data/Hora",
  "WhatsApp Remetente",
  "Nome Perfil WhatsApp",
  "Tipo Mensagem",
  "Mensagem Recebida",
  "WhatsApp Message ID",
  "ID Pendencia Vinculada",
  "Responsavel Vinculado",
  "Cliente",
  "Placa",
  "Veiculo",
  "Negociacao",
  "Status da Pendencia",
  "Origem do Vinculo",
  "Webhook Raw"
];

function prepararAbaRetornos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABAS.RETORNOS);

  if (!aba) {
    aba = ss.insertSheet(ABAS.RETORNOS);
  }

  garantirCabecalhoRetornos_(aba);
  formatarAbaRetornos_(aba);

  SpreadsheetApp.getUi().alert("Aba RETORNOS preparada com sucesso.");
}

function garantirCabecalhoRetornos_(aba) {
  var lastRow = aba.getLastRow();

  if (lastRow === 0) {
    aba.appendRow(RETORNOS_HEADERS);
    return;
  }

  var lastCol = Math.max(aba.getLastColumn(), 1);
  var headers = aba.getRange(1, 1, 1, lastCol).getValues()[0];
  var mapa = {};

  for (var i = 0; i < headers.length; i++) {
    mapa[normalizarTexto(headers[i])] = i + 1;
  }

  for (var h = 0; h < RETORNOS_HEADERS.length; h++) {
    var header = RETORNOS_HEADERS[h];

    if (!mapa[normalizarTexto(header)]) {
      aba.getRange(1, aba.getLastColumn() + 1).setValue(header);
    }
  }
}

function formatarAbaRetornos_(aba) {
  aba.setFrozenRows(1);

  aba.getRange(1, 1, 1, RETORNOS_HEADERS.length)
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#0F172A")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  aba.setColumnWidth(1, 140);
  aba.setColumnWidth(2, 140);
  aba.setColumnWidth(3, 180);
  aba.setColumnWidth(4, 120);
  aba.setColumnWidth(5, 420);
  aba.setColumnWidth(6, 360);
  aba.setColumnWidth(7, 130);
  aba.setColumnWidth(8, 190);
  aba.setColumnWidth(9, 230);
  aba.setColumnWidth(10, 100);
  aba.setColumnWidth(11, 260);
  aba.setColumnWidth(12, 130);
  aba.setColumnWidth(13, 150);
  aba.setColumnWidth(14, 180);
  aba.setColumnWidth(15, 500);
}

function extrairRetornoMensagemWebhook_(msg, contatos, raw) {
  if (!msg) return null;

  var from = limparTelefone(msg.from || "");
  var messageId = String(msg.id || "").trim();
  var timestamp = msg.timestamp ? converterTimestampMeta(msg.timestamp) : new Date();
  var tipo = String(msg.type || "").trim();
  var texto = extrairTextoMensagemRecebida_(msg);
  var nomePerfil = localizarNomePerfilContato_(from, contatos);

  return {
    dataHora: timestamp,
    whatsappRemetente: from,
    nomePerfil: nomePerfil,
    tipoMensagem: tipo,
    mensagem: texto,
    messageId: messageId,
    raw: raw
  };
}

function extrairTextoMensagemRecebida_(msg) {
  if (!msg) return "";

  var tipo = String(msg.type || "").trim();

  if (tipo === "text" && msg.text && msg.text.body) {
    return String(msg.text.body || "").trim();
  }

  if (tipo === "button" && msg.button) {
    return String(msg.button.text || msg.button.payload || "").trim();
  }

  if (tipo === "interactive" && msg.interactive) {
    if (msg.interactive.button_reply) {
      return String(msg.interactive.button_reply.title || msg.interactive.button_reply.id || "").trim();
    }

    if (msg.interactive.list_reply) {
      return String(msg.interactive.list_reply.title || msg.interactive.list_reply.id || "").trim();
    }
  }

  if (tipo === "image" && msg.image) {
    return String(msg.image.caption || "[Imagem recebida]").trim();
  }

  if (tipo === "document" && msg.document) {
    return String(msg.document.caption || msg.document.filename || "[Documento recebido]").trim();
  }

  if (tipo === "audio") {
    return "[Áudio recebido]";
  }

  if (tipo === "video" && msg.video) {
    return String(msg.video.caption || "[Vídeo recebido]").trim();
  }

  if (tipo === "sticker") {
    return "[Figurinha recebida]";
  }

  if (tipo === "location") {
    return "[Localização recebida]";
  }

  return "[Mensagem recebida tipo: " + tipo + "]";
}

function localizarNomePerfilContato_(telefone, contatos) {
  telefone = limparTelefone(telefone);

  if (!telefone || !contatos || contatos.length === 0) {
    return "";
  }

  for (var i = 0; i < contatos.length; i++) {
    var contato = contatos[i] || {};
    var waId = limparTelefone(contato.wa_id || "");

    if (waId === telefone) {
      if (contato.profile && contato.profile.name) {
        return String(contato.profile.name || "").trim();
      }
    }
  }

  return "";
}

function gravarRetornoVendedor_(retorno) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaRetornos = ss.getSheetByName(ABAS.RETORNOS);

  if (!abaRetornos) {
    abaRetornos = ss.insertSheet(ABAS.RETORNOS);
  }

  garantirCabecalhoRetornos_(abaRetornos);

  if (retornoJaRegistrado_(abaRetornos, retorno.messageId)) {
    return false;
  }

  var vinculo = localizarUltimoHistoricoPorWhatsapp_(retorno.whatsappRemetente);

  abaRetornos.appendRow([
    retorno.dataHora || new Date(),
    retorno.whatsappRemetente || "",
    retorno.nomePerfil || "",
    retorno.tipoMensagem || "",
    retorno.mensagem || "",
    retorno.messageId || "",
    vinculo.idPendencia || "",
    vinculo.responsavel || "",
    vinculo.cliente || "",
    vinculo.placa || "",
    vinculo.veiculo || "",
    vinculo.negociacao || "",
    vinculo.statusPendencia || "",
    vinculo.origem || "Sem vínculo localizado",
    retorno.raw || ""
  ]);

  return true;
}

function retornoJaRegistrado_(abaRetornos, messageId) {
  if (!messageId) return false;

  var lastRow = abaRetornos.getLastRow();
  var lastCol = abaRetornos.getLastColumn();

  if (lastRow < 2) return false;

  var headers = abaRetornos.getRange(1, 1, 1, lastCol).getValues()[0];
  var cols = montarMapaColunas(headers);
  var colMessageId = cols[normalizarTexto("WhatsApp Message ID")];

  if (!colMessageId) return false;

  var ids = abaRetornos.getRange(2, colMessageId, lastRow - 1, 1).getValues();

  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === String(messageId).trim()) {
      return true;
    }
  }

  return false;
}

function localizarUltimoHistoricoPorWhatsapp_(whatsappRemetente) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaHistorico = ss.getSheetByName(ABAS.HISTORICO);

  if (!abaHistorico) {
    return {};
  }

  var lastRow = abaHistorico.getLastRow();
  var lastCol = abaHistorico.getLastColumn();

  if (lastRow < 2) {
    return {};
  }

  var headers = abaHistorico.getRange(1, 1, 1, lastCol).getValues()[0];
  var cols = montarMapaColunas(headers);

  var colDataHora = cols[normalizarTexto("Data/Hora")];
  var colIdPendencia = cols[normalizarTexto("ID Pendencia")];
  var colCliente = cols[normalizarTexto("Cliente")];
  var colResponsavel = cols[normalizarTexto("Responsavel")];
  var colWhatsResp = cols[normalizarTexto("WhatsApp Responsavel")];
  var colNegociacao = cols[normalizarTexto("Negociacao")];
  var colPlaca = cols[normalizarTexto("Placa")];
  var colVeiculo = cols[normalizarTexto("Veiculo")];
  var colStatusPendencia = cols[normalizarTexto("Status da Pendencia")];
  var colStatusEnvio = cols[normalizarTexto("Status do Envio")];

  if (!colWhatsResp) {
    return {};
  }

  var dados = abaHistorico.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var telefoneBusca = limparTelefone(whatsappRemetente);

  for (var i = dados.length - 1; i >= 0; i--) {
    var row = dados[i];
    var telefoneHistorico = limparTelefone(row[colWhatsResp - 1] || "");

    if (telefoneHistorico !== telefoneBusca) {
      continue;
    }

    var statusEnvio = colStatusEnvio ? normalizarTexto(row[colStatusEnvio - 1] || "") : "";

    if (statusEnvio.indexOf("erro") >= 0 || statusEnvio.indexOf("nao enviado") >= 0) {
      continue;
    }

    return {
      dataHora: colDataHora ? row[colDataHora - 1] : "",
      idPendencia: colIdPendencia ? row[colIdPendencia - 1] : "",
      cliente: colCliente ? row[colCliente - 1] : "",
      responsavel: colResponsavel ? row[colResponsavel - 1] : "",
      negociacao: colNegociacao ? row[colNegociacao - 1] : "",
      placa: colPlaca ? row[colPlaca - 1] : "",
      veiculo: colVeiculo ? row[colVeiculo - 1] : "",
      statusPendencia: colStatusPendencia ? row[colStatusPendencia - 1] : "",
      origem: "Vinculado pelo último envio ao WhatsApp do responsável"
    };
  }

  return {};
}

function testarGravacaoRetornoManual() {
  var rawTeste = JSON.stringify({
    teste_manual: true,
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [
                {
                  profile: { name: "Teste Vendedor" },
                  wa_id: "5511999999999"
                }
              ],
              messages: [
                {
                  from: "5511999999999",
                  id: "wamid.TESTE_RETORNO_" + new Date().getTime(),
                  timestamp: Math.floor(new Date().getTime() / 1000),
                  type: "text",
                  text: {
                    body: "Teste de resposta do vendedor gravada na aba RETORNOS."
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  });

  var corpo = JSON.parse(rawTeste);
  var resultado = processarWebhookMeta(corpo, rawTeste);

  SpreadsheetApp.getUi().alert(
    "Teste de retorno finalizado.\n\n" +
    "Mensagens recebidas: " + resultado.mensagens_recebidas + "\n" +
    "Retornos gravados: " + resultado.retornos_gravados
  );
}

/****************************************************
 * PATCH COMPLETO - TRAVA DE HORÁRIO DO ROBÔ
 * EasyCar Veículos - Google Apps Script
 ****************************************************/

// Cole este bloco no FINAL do script, fora de qualquer função.
// Depois salve o Apps Script, atualize a planilha e execute:
// prepararConfiguracaoTravaHorario

function prepararConfiguracaoTravaHorario() {
  garantirConfiguracaoTravaHorario_();
  SpreadsheetApp.getUi().alert("Trava de horário preparada com sucesso.");
}

function ativarTravaHorarioRobo() {
  setarConfiguracaoTravaHorario_("Trava de horário ativa?", "Sim");
  SpreadsheetApp.getUi().alert("Trava de horário ATIVADA. O robô respeitará a janela de envio configurada.");
}

function desativarTravaHorarioRobo() {
  setarConfiguracaoTravaHorario_("Trava de horário ativa?", "Não");
  SpreadsheetApp.getUi().alert("Trava de horário DESATIVADA. O robô poderá rodar em qualquer horário.");
}

function verStatusTravaHorarioRobo() {
  garantirConfiguracaoTravaHorario_();

  var ativa = buscarConfiguracaoTravaHorario_("Trava de horário ativa?", "Sim");
  var inicio = buscarConfiguracaoTravaHorario_("Trava horário inicial envio", "09:00");
  var fim = buscarConfiguracaoTravaHorario_("Trava horário final envio", "18:40");
  var podeRodar = podeRodarRoboNesteHorario_();

  SpreadsheetApp.getUi().alert(
    "STATUS DA TRAVA DE HORÁRIO\n\n" +
    "Trava ativa: " + ativa + "\n" +
    "Horário inicial: " + inicio + "\n" +
    "Horário final: " + fim + "\n\n" +
    "Robô liberado agora? " + (podeRodar ? "SIM" : "NÃO")
  );
}


function travaHorarioEstaDesativadaParaEnvio_() {
  var valor = buscarConfiguracaoTravaHorario_("Trava de horário ativa?", buscarConfiguracaoSegura("Trava de horário ativa?", "Sim"));
  var normalizado = normalizarTravaHorario_(valor);

  return (
    normalizado === "nao" ||
    normalizado === "desativada" ||
    normalizado === "desativado" ||
    normalizado === "false" ||
    normalizado === "0"
  );
}

function bloquearExecucaoForaDoHorarioSeNecessario_() {
  return podeRodarRoboNesteHorario_();
}

function podeRodarRoboNesteHorario_() {
  garantirConfiguracaoTravaHorario_();

  var travaAtiva = buscarConfiguracaoTravaHorario_("Trava de horário ativa?", "Sim");
  var trava = normalizarTravaHorario_(travaAtiva);

  if (trava === "nao" || trava === "desativada" || trava === "desativado" || trava === "false" || trava === "0") {
    return true;
  }

  var inicio = buscarConfiguracaoTravaHorario_("Trava horário inicial envio", "09:00");
  var fim = buscarConfiguracaoTravaHorario_("Trava horário final envio", "18:40");

  return horarioAtualDentroDaJanelaTrava_(inicio, fim);
}

function garantirConfiguracaoTravaHorario_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nomeAba = obterNomeAbaConfiguracoesTrava_();
  var aba = ss.getSheetByName(nomeAba);

  if (!aba) {
    aba = ss.insertSheet(nomeAba);
  }

  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, 3).setValues([["Configuração", "Valor", "Observações"]]);
  }

  garantirLinhaConfiguracaoTrava_(aba, "Trava de horário ativa?", "Sim", "Quando Sim, respeita a janela de horário. Quando Não, o robô roda em qualquer horário.");
  garantirLinhaConfiguracaoTrava_(aba, "Trava horário inicial envio", "09:00", "Horário mínimo permitido para envio automático.");
  garantirLinhaConfiguracaoTrava_(aba, "Trava horário final envio", "18:40", "Horário máximo permitido para envio automático.");
}

function garantirLinhaConfiguracaoTrava_(aba, chave, valorPadrao, observacao) {
  var linha = localizarLinhaConfiguracaoTrava_(aba, chave);

  if (linha > 0) {
    if (String(aba.getRange(linha, 2).getValue() || "").trim() === "") {
      aba.getRange(linha, 2).setValue(valorPadrao);
    }

    if (String(aba.getRange(linha, 3).getValue() || "").trim() === "") {
      aba.getRange(linha, 3).setValue(observacao);
    }

    return;
  }

  aba.appendRow([chave, valorPadrao, observacao]);
}

function setarConfiguracaoTravaHorario_(chave, valor) {
  garantirConfiguracaoTravaHorario_();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(obterNomeAbaConfiguracoesTrava_());
  var linha = localizarLinhaConfiguracaoTrava_(aba, chave);

  if (linha > 0) {
    aba.getRange(linha, 2).setValue(valor);
  } else {
    aba.appendRow([chave, valor, ""]);
  }
}

function buscarConfiguracaoTravaHorario_(chave, valorPadrao) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(obterNomeAbaConfiguracoesTrava_());

  if (!aba) return valorPadrao;

  var lastRow = aba.getLastRow();
  if (lastRow < 1) return valorPadrao;

  var dados = aba.getRange(1, 1, lastRow, Math.min(2, Math.max(aba.getLastColumn(), 2))).getValues();
  var alvo = normalizarTravaHorario_(chave);

  for (var i = 0; i < dados.length; i++) {
    if (normalizarTravaHorario_(dados[i][0]) === alvo) {
      var valor = dados[i][1];
      return String(valor || "").trim() !== "" ? valor : valorPadrao;
    }
  }

  return valorPadrao;
}

function localizarLinhaConfiguracaoTrava_(aba, chave) {
  var lastRow = aba.getLastRow();
  if (lastRow < 1) return 0;

  var valores = aba.getRange(1, 1, lastRow, 1).getValues();
  var alvo = normalizarTravaHorario_(chave);

  for (var i = 0; i < valores.length; i++) {
    if (normalizarTravaHorario_(valores[i][0]) === alvo) {
      return i + 1;
    }
  }

  return 0;
}

function obterNomeAbaConfiguracoesTrava_() {
  if (typeof ABAS !== "undefined" && ABAS.CONFIGURACOES) {
    return ABAS.CONFIGURACOES;
  }

  return "CONFIGURACOES";
}

function horarioAtualDentroDaJanelaTrava_(horaInicio, horaFim) {
  var agora = new Date();
  var minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  var minutosInicio = converterHorarioTravaParaMinutos_(horaInicio, 0);
  var minutosFim = converterHorarioTravaParaMinutos_(horaFim, 1439);

  if (minutosInicio <= minutosFim) {
    return minutosAgora >= minutosInicio && minutosAgora <= minutosFim;
  }

  return minutosAgora >= minutosInicio || minutosAgora <= minutosFim;
}

function converterHorarioTravaParaMinutos_(valor, padrao) {
  if (valor instanceof Date) {
    return valor.getHours() * 60 + valor.getMinutes();
  }

  var texto = String(valor || "").trim();
  var partes = texto.split(":");

  if (partes.length < 2) return padrao;

  var hora = Number(partes[0]);
  var minuto = Number(partes[1]);

  if (isNaN(hora) || isNaN(minuto)) return padrao;

  hora = Math.max(0, Math.min(23, hora));
  minuto = Math.max(0, Math.min(59, minuto));

  return hora * 60 + minuto;
}

function normalizarTravaHorario_(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/****************************************************
 * FIM DO CÓDIGO COMPLETO CORRIGIDO
 * EasyCar Veículos - Robô de Pendências
 ****************************************************/
