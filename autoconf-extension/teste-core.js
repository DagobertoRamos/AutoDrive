require('./checklist-core.js')
const C = globalThis.CHK_CORE
let falhas = 0
const ok = (nome, real, esperado) => {
  const bom = String(real) === String(esperado)
  if (!bom) falhas++
  console.log((bom ? 'OK   ' : 'FALHA') + ' | ' + nome + ' -> ' + real + (bom ? '' : ' (esperado ' + esperado + ')'))
}

// Caso real 1: TCY3A71 vendida 12/08, recomprada 19/08 e revendida 29/08.
const tcy = C.escolherNegociacao({
  placa: 'TCY3A71', dataEnvio: '2026-08-12 16:39:29', cliente: 'Rodrigo Marangoni',
  candidatas: [
    { id: 790272, status: 'Finalizada', criadoEm: '29/08/26 às 18:06', cliente: 'ROSANGELA BRITO SANTOS', veiculosSaida: ['TCY-3A71'], veiculosEntrada: ['FWM-8B16'] },
    { id: 777313, status: 'Finalizada', criadoEm: '19/08/26 às 09:45', cliente: 'RODRIGO MARANGONI', veiculosSaida: [], veiculosEntrada: ['TCY-3A71'] },
    { id: 770032, status: 'Finalizada', criadoEm: '12/08/26 às 15:44', cliente: 'RODRIGO MARANGONI', veiculosSaida: ['TCY-3A71'], veiculosEntrada: [] },
  ],
})
ok('TCY3A71 escolhe a venda do dia do checklist', tcy.ok && tcy.negociacao.id, 770032)
ok('TCY3A71 confianca', tcy.confianca, 'alta')

// Caso real 2: RTU9G33 vendida em jun/26 e de novo em 17/08/26; checklist de 18/08.
const rtu = C.escolherNegociacao({
  placa: 'RTU9G33', dataEnvio: '2026-08-18 09:00:00', cliente: 'Cliente Novo',
  candidatas: [
    { id: 774853, status: 'Finalizada', criadoEm: '17/08/26 às 12:12', cliente: 'MARIA SILVA', veiculosSaida: ['RTU-9G33'] },
    { id: 763144, status: 'Finalizada', criadoEm: '06/08/26 às 11:15', cliente: 'X', veiculosSaida: ['SDW-2G22'], veiculosEntrada: ['RTU-9G33'] },
    { id: 709798, status: 'Finalizada', criadoEm: '17/06/26 às 11:48', cliente: 'JOAO', veiculosSaida: ['RTU-9G33'] },
  ],
})
ok('RTU9G33 escolhe a venda mais proxima anterior', rtu.ok && rtu.negociacao.id, 774853)

// Caso real 3: SVM8H14 — a compra (placa na entrada) nao pode ser escolhida.
const svm = C.escolherNegociacao({
  placa: 'SVM8H14', dataEnvio: '2026-09-01 15:46:46', cliente: 'Ana Paula lopes correa',
  candidatas: [
    { id: 790403, status: 'Finalizada', criadoEm: '30/08/26 às 14:13', cliente: 'ANA PAULA LOPES CORREA', veiculosSaida: ['SVM-8H14'], veiculosEntrada: ['EGX-0E58'] },
    { id: 744344, status: 'Pendente Contrato', criadoEm: '21/07/26 às 12:12', cliente: 'GRUPO AUTOMOB S.A.', veiculosSaida: [], veiculosEntrada: ['SVM-8H14'] },
  ],
})
ok('SVM8H14 ignora a compra', svm.ok && svm.negociacao.id, 790403)

// Placa sem venda ativa (so compra) e placa inexistente
ok('so compra -> sem negociacao', C.escolherNegociacao({ placa: 'AAA1B23', dataEnvio: '2026-01-10', cliente: 'x', candidatas: [{ id: 1, status: 'Finalizada', criadoEm: '01/01/26 às 10:00', cliente: 'y', veiculosSaida: [], veiculosEntrada: ['AAA-1B23'] }] }).motivo, 'SEM_NEGOCIACAO_VENDA')
ok('nada encontrado -> sem negociacao', C.escolherNegociacao({ placa: 'BWV4I56', dataEnvio: '2026-08-31', cliente: 'x', candidatas: [] }).motivo, 'SEM_NEGOCIACAO_VENDA')

// Venda cancelada nao vale
ok('cancelada e descartada', C.escolherNegociacao({ placa: 'CCC1D23', dataEnvio: '2026-03-10', cliente: 'x', candidatas: [{ id: 9, status: 'Cancelada', criadoEm: '09/03/26 às 10:00', cliente: 'x', veiculosSaida: ['CCC-1D23'] }] }).motivo, 'SEM_NEGOCIACAO_VENDA')

// Duas vendas quase coladas, nomes igualmente ruins -> ambiguo
ok('empate vira revisao', C.escolherNegociacao({ placa: 'DDD1E23', dataEnvio: '2026-05-20', cliente: 'Zezinho', candidatas: [
  { id: 11, status: 'Finalizada', criadoEm: '18/05/26 às 10:00', cliente: 'MARIA', veiculosSaida: ['DDD-1E23'] },
  { id: 12, status: 'Finalizada', criadoEm: '15/05/26 às 10:00', cliente: 'JOSE', veiculosSaida: ['DDD-1E23'] },
] }).motivo, 'AMBIGUO')

// Venda posterior ao checklist (nao pode)
ok('venda posterior -> fora da janela', C.escolherNegociacao({ placa: 'EEE1F23', dataEnvio: '2026-05-01', cliente: 'x', candidatas: [{ id: 20, status: 'Finalizada', criadoEm: '20/05/26 às 10:00', cliente: 'x', veiculosSaida: ['EEE-1F23'] }] }).motivo, 'FORA_DA_JANELA')

// Deteccao de anexo existente
ok('checklist de venda NAO conta', C.jaAnexado(['CHECKLIST DE VENDA - RTU9G33', 'PROCESSO DE VENDA - RTU9G33']), false)
ok('checklist entrada NAO conta', C.jaAnexado(['CHECKLIST ENTRADA - EGX0E58', 'CHECKLIST SAIDA - SVM8H14']), false)
ok('nosso nome conta', C.jaAnexado(['Check list de entrega tecnica assinado']), true)
ok('variacao com acento conta', C.jaAnexado(['CHECK LIST DE ENTREGA TÉCNICA - ABC1D23']), true)
ok('termo de entrega e responsabilidade NAO conta', C.jaAnexado(['Termo de entrega e responsabilidade - SVM-8H14']), false)

// Placas
ok('placa mercosul', C.placaValida('SVM-8H14'), true)
ok('placa antiga', C.placaValida('elh5302'), true)
ok('placa lixo', C.placaValida('12345'), false)
ok('nome do arquivo', C.nomeArquivo('entrega', 'svm-8h14', '664101'), 'checklist-entrega-SVM8H14-664101.pdf')


// --- resgates (casos reais da simulação de 08/09/2026) -----------------------
const apx = (o) => C.escolherNegociacao(Object.assign({ aproximada: true }, o))

// Placa digitada errado: FSR1884 no formulário, FSR-1I84 no AutoConf.
const fsr = apx({ placa: 'FSR1884', dataEnvio: '2024-09-26', cliente: 'Sheila Cruz', candidatas: [
  { id: 240571, tipo: 'Troca', status: 'Finalizada', criadoEm: '21/09/24 às 10:00', cliente: 'SHEILA CRUZ VIEIRA', veiculosSaida: ['FSR-1I84'], veiculosEntrada: ['NPS-7H92'] },
  { id: 237321, tipo: 'Troca', status: 'Finalizada', criadoEm: '16/09/24 às 10:00', cliente: 'GILBERTO CORDEIRO', veiculosSaida: ['GDX-1I71'], veiculosEntrada: ['FSR-1I84'] },
] })
ok('placa com 1 char errado casa pela venda', fsr.ok && fsr.negociacao.id, 240571)
ok('e marca o ajuste', fsr.casamento, 'placa_corrigida')

// Letras invertidas: QUI6I66 no formulário, QIU-6I66 no AutoConf.
const qui = apx({ placa: 'QUI6I66', dataEnvio: '2026-04-02', cliente: 'Carlos Alberto Cerqueira dos Santos', candidatas: [
  { id: 638761, tipo: 'Venda', status: 'Finalizada', criadoEm: '02/04/26 às 11:00', cliente: 'CARLOS ALBERTO CERQUEIRA DOS SANTOS', veiculosSaida: ['QIU-6I66'], veiculosEntrada: [] },
] })
ok('letras invertidas tambem casam', qui.ok && qui.negociacao.id, 638761)

// Placa do usado: FHP1C66 é a entrada da troca do Raimundo; ele levou RNT-1C62.
// Existe outra venda com a placa exata (outro cliente, 18 dias depois) que NÃO pode ganhar.
const fhp = apx({ placa: 'FHP1C66', dataEnvio: '2025-12-23', cliente: 'Raimundo Nonato', candidatas: [
  { id: 562413, tipo: 'Venda', status: 'Pendente NFe', criadoEm: '10/01/26 às 15:39', cliente: 'IGOR ALBERTO RODRIGUES', veiculosSaida: ['FHP-1C66'], veiculosEntrada: [] },
  { id: 550873, tipo: 'Troca', status: 'Finalizada', criadoEm: '22/12/25 às 16:39', cliente: 'RAIMUNDO NONATO DE CARVALHO', veiculosSaida: ['RNT-1C62'], veiculosEntrada: ['FHP-1C66'] },
] })
ok('placa do usado vai para a troca do cliente', fhp.ok && fhp.negociacao.id, 550873)
ok('e nao para a venda do outro cliente', fhp.negociacao.cliente.slice(0, 8), 'RAIMUNDO')

// Venda cancelada para o cliente e o carro revendido a outra pessoa: continua manual.
const rvw = apx({ placa: 'RVW9E96', dataEnvio: '2026-02-28', cliente: 'Emerson Santinho de lima', candidatas: [
  { id: 613462, tipo: 'Venda', status: 'Finalizada', criadoEm: '07/03/26 às 12:29', cliente: 'Julio cesar da silva ramos', veiculosSaida: ['RVW-9E96'], veiculosEntrada: [] },
  { id: 599534, tipo: 'Troca', status: 'Cancelada', criadoEm: '21/02/26 às 10:15', cliente: 'emerson santinho de lima', veiculosSaida: ['RVW-9E96'], veiculosEntrada: ['EXN-5E75'] },
] })
ok('venda cancelada nao resgata (fica manual)', rvw.ok === false && rvw.motivo, 'FORA_DA_JANELA')

// Nome que nao bate nao resgata, mesmo com placa parecida.
const semNome = apx({ placa: 'ADH8373', dataEnvio: '2025-12-17', cliente: 'Alexandre Rodrigues', candidatas: [
  { id: 130285, tipo: 'Venda', status: 'Finalizada', criadoEm: '26/01/24 às 10:00', cliente: 'ALEXANDRE DA SILVA RODRIGUES', veiculosSaida: ['RFZ-2A86'], veiculosEntrada: [] },
] })
ok('placa totalmente diferente nao resgata', semNome.ok === false && semNome.motivo, 'SEM_NEGOCIACAO_VENDA')

// Com o resgate desligado (é o caso do laudo), a placa tem que ser exata.
ok('resgate pode ser desligado', C.escolherNegociacao({ placa: 'FSR1884', dataEnvio: '2024-09-26', cliente: 'Sheila Cruz', aproximada: false, candidatas: [
  { id: 240571, tipo: 'Troca', status: 'Finalizada', criadoEm: '21/09/24 às 10:00', cliente: 'SHEILA CRUZ VIEIRA', veiculosSaida: ['FSR-1I84'] },
] }).motivo, 'SEM_NEGOCIACAO_VENDA')

// Distancia de placa
ok('distancia igual', C.distanciaPlaca('ABC1D23', 'abc-1d23'), 0)
ok('distancia 1 char', C.distanciaPlaca('FSR1884', 'FSR1I84'), 1)
ok('distancia invertida', C.distanciaPlaca('QUI6I66', 'QIU6I66'), 2)
ok('distancia grande', C.distanciaPlaca('ADH8373', 'RFZ2A86'), 99)


// --- PROTOCOLO DE LAUDO ------------------------------------------------------
// Formulário sem cliente: vale a negociação mais próxima da data, compra ou venda.
const LAUDO = C.FORMULARIOS.laudo
const laudo = (o) => C.escolherNegociacao(Object.assign({ regra: LAUDO.regra }, o))

// EZA3107: laudo 05/05; compra 14/04 (21 dias antes), venda 16/06 (42 dias depois).
const eza = laudo({ placa: 'EZA3107', dataEnvio: '2026-05-05', cliente: '', candidatas: [
  { id: 708523, tipo: 'Troca', status: 'Finalizada', criadoEm: '16/06/26 às 10:00', cliente: 'X', veiculosSaida: ['EZA-3107'], veiculosEntrada: ['PVH-3J17'] },
  { id: 648351, tipo: 'Troca', status: 'Finalizada', criadoEm: '14/04/26 às 10:00', cliente: 'Y', veiculosSaida: ['FGV-8E47'], veiculosEntrada: ['EZA-3107'] },
] })
ok('laudo pega a negociacao mais proxima (compra)', eza.ok && eza.negociacao.id, 648351)
ok('e avisa que foi na compra', eza.onde, 'entrada')

// GGI2D34: laudo 25/04; venda 18/04 (7 dias) e compra 11/04 (14 dias) -> venda.
const ggi = laudo({ placa: 'GGI2D34', dataEnvio: '2026-04-25', cliente: '', candidatas: [
  { id: 653501, tipo: 'Venda', status: 'Finalizada', criadoEm: '18/04/26 às 10:00', cliente: 'A', veiculosSaida: ['GGI-2D34'], veiculosEntrada: [] },
  { id: 646020, tipo: 'Compra', status: 'Finalizada', criadoEm: '11/04/26 às 10:00', cliente: 'B', veiculosSaida: [], veiculosEntrada: ['GGI-2D34'] },
] })
ok('empate tecnico entre compra e venda fica com a venda', ggi.ok && ggi.negociacao.id, 653501)

// RBK0E19: a troca cancelada do mesmo dia nao pode ser escolhida.
const rbk = laudo({ placa: 'RBK0E19', dataEnvio: '2026-05-05', cliente: '', candidatas: [
  { id: 662186, tipo: 'Troca', status: 'Pendente NFe', criadoEm: '28/04/26 às 10:00', cliente: 'A', veiculosSaida: ['RBK-0E19'], veiculosEntrada: [] },
  { id: 661519, tipo: 'Troca', status: 'Cancelada', criadoEm: '28/04/26 às 09:00', cliente: 'A', veiculosSaida: ['RBK-0E19'], veiculosEntrada: [] },
  { id: 618647, tipo: 'Compra', status: 'Pendente NFe', criadoEm: '13/03/26 às 10:00', cliente: 'C', veiculosSaida: [], veiculosEntrada: ['RBK-0E19'] },
] })
ok('laudo ignora a cancelada', rbk.ok && rbk.negociacao.id, 662186)

// Sem resgate de placa no laudo (nao ha cliente para confirmar).
ok('laudo nao resgata placa parecida', laudo({ placa: 'GGI2D35', dataEnvio: '2026-04-25', cliente: '', candidatas: [
  { id: 653501, tipo: 'Venda', status: 'Finalizada', criadoEm: '18/04/26 às 10:00', cliente: 'A', veiculosSaida: ['GGI-2D34'], veiculosEntrada: [] },
] }).motivo, 'SEM_NEGOCIACAO_VENDA')

// Deteccao do laudo ja anexado
ok('protocolo inspecar conta como laudo', C.jaAnexado(['PROTOCOLO INSPECAR-BYX5A11'], 'laudo'), true)
ok('nosso nome de laudo conta', C.jaAnexado(['Protocolo de laudo - ECV'], 'laudo'), true)
ok('checklist de venda nao conta como laudo', C.jaAnexado(['CHECKLIST DE VENDA - GGI2D34', 'PROCESSO DE VENDA - GGI2D34'], 'laudo'), false)
ok('e o checklist de entrega nao conta como laudo', C.jaAnexado(['Check list de entrega tecnica assinado'], 'laudo'), false)

// Nome do documento do laudo leva o tipo
ok('nome do doc com tipo', LAUDO.nomeDocumento({ tipo: 'CAUTELAR' }), 'Protocolo de laudo - CAUTELAR')
ok('nome do doc sem tipo cai em ECV', LAUDO.nomeDocumento({}), 'Protocolo de laudo - ECV')
ok('arquivo do laudo', C.nomeArquivo('laudo', 'eza-3107', '65380'), 'protocolo-laudo-EZA3107-65380.pdf')

// A regra do checklist de entrega continua sem aceitar compra
ok('entrega nao aceita a compra', C.escolherNegociacao({ placa: 'EZA3107', dataEnvio: '2026-05-05', cliente: 'Fulano', regra: C.FORMULARIOS.entrega.regra, candidatas: [
  { id: 648351, tipo: 'Troca', status: 'Finalizada', criadoEm: '14/04/26 às 10:00', cliente: 'Y', veiculosSaida: ['FGV-8E47'], veiculosEntrada: ['EZA-3107'] },
] }).ok, false)

console.log(falhas ? '\n' + falhas + ' teste(s) falharam' : '\nTodos os testes passaram')
process.exit(falhas ? 1 : 0)
