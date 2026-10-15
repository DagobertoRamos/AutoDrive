// =============================================================================
// Banco BV — tabelas de códigos da API "Parceiros F&I" (spec OpenAPI 1.0.5,
// developers-sandbox.bvopen.com.br) e o de-para a partir da ficha universal.
// PURO (sem I/O) — testado em bv.test.ts.
// =============================================================================

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Estado civil (PersonData.maritalStatus). */
export function bvMaritalStatus(v: unknown): number | null {
  const s = norm(v)
  if (!s) return null
  if (s.startsWith('CASAD') || s.includes('UNIAO ESTAVEL') || s.includes('AMASIAD') || s.includes('CONVIVENTE')) return 5
  if (s.startsWith('SOLTEIR')) return 4
  if (s.startsWith('DIVORCIAD')) return 2
  if (s.startsWith('SEPARAD') || s.startsWith('DESQUITAD')) return 3
  if (s.startsWith('VIUV')) return 6
  return null
}

/** Sexo (PersonData.gender). */
export function bvGender(v: unknown): 'M' | 'F' | null {
  const s = norm(v)
  if (s === 'M' || s.startsWith('MASC')) return 'M'
  if (s === 'F' || s.startsWith('FEM')) return 'F'
  return null
}

/** Nacionalidade (PersonData.nationality.description). */
export function bvNationality(v: unknown): 'BRASILEIRA' | 'ESTRANGEIRA' | 'NATURALIZADO' {
  const s = norm(v)
  if (s.startsWith('NATURALIZ')) return 'NATURALIZADO'
  if (s && !s.startsWith('BRASIL')) return 'ESTRANGEIRA'
  return 'BRASILEIRA'
}

/** Tipo de residência (PersonData.residenceType). */
export function bvResidenceType(v: unknown): number | null {
  const s = norm(v)
  if (!s) return null
  if (s.includes('FINANC')) return 5
  if (s.startsWith('PROPRI')) return 1
  if (s.startsWith('ALUGAD')) return 3
  if (s.startsWith('FAMILIA') || s.includes('PAIS')) return 2
  if (s.startsWith('CEDID') || s === 'OUTRA') return 8
  return null
}

/** Tipo profissional (PersonData.professionalType) a partir da ocupação da ficha. */
export function bvProfessionalType(occupation: unknown): number {
  switch (occupation) {
    case 'CLT': return 1
    case 'EMPRESARIO': return 2
    case 'AUTONOMO': return 3
    case 'APOSENTADO_PENSIONISTA': return 7
    default: return 0
  }
}

/** Origem da renda (PersonData.incomeSourceType). */
export function bvIncomeSourceType(occupation: unknown): number {
  return occupation === 'CLT' || occupation === 'EMPRESARIO' ? 2 : occupation === 'APOSENTADO_PENSIONISTA' ? 5 : 1
}

/** Situação de crédito da pré-análise (personCreditsituation.code). */
export const BV_CREDIT_SITUATION: Record<number, string> = {
  0: 'Neutro', 1: 'Impedido de operar', 2: 'Negado', 3: 'Pré-aprovado', 4: 'Score alto', 5: 'Score médio', 6: 'Score baixo',
}

/** Status de aprovação da precificação que impedem originar naquele prazo. */
export const BV_PRICING_BLOCKED = ['AJUSTE VALOR DE ENTRADA', 'NAO APROVADO', 'RECUSADO']
export const bvPricingBlocked = (status: unknown) => BV_PRICING_BLOCKED.includes(norm(status))

/** Profissões (PersonData.profession) — tabela completa publicada pelo BV. */
export const BV_PROFESSIONS: [number, string][] = [
  [525, "Acougueiro"], [1017, "Acupunturista"], [125, "Administrador"], [1069, "Administrador De Comarca"],
  [1111, "Administrador De Tribunal"], [131, "Advogado"], [1018, "Aeronauta"], [189, "Aeroviario"],
  [405, "Agenciador De Propaganda"], [1004, "Agente Administrativo"], [1100, "Agente Comunitario De Saude"], [1009, "Agente De Servicos Funerarios E Embalsamador"],
  [594, "Agente De Viagem E Guia De Turismo"], [601, "Agricultor"], [1062, "Agrimensor"], [103, "Agronomo"],
  [1068, "Agropecuarista"], [591, "Alfaiate"], [410, "Ambulante"], [381, "Analista"],
  [126, "Analista De Sistema"], [1050, "Antiquario"], [1019, "Antropologo"], [1051, "Apicultor"],
  [923, "Aposentado / Pensionista"], [1108, "Aprendiz Banco Do Brasil"], [1079, "Aquicultor"], [1020, "Armeiro"],
  [1047, "Arqueologo E Museologo"], [102, "Arquiteto Ou Paisagista"], [199, "Artesao"], [1021, "Artista Plastico"],
  [134, "Assistente Social"], [1022, "Astrologo, Numerologo E Afins"], [128, "Astronomo"], [168, "Atleta Profissional E Tecnico Em Desportos"],
  [162, "Ator E Diretor De Espetaculos Publicos"], [802, "Auxiliar De Enfermagem"], [801, "Auxiliar De Escritorio E Assemelhados"], [1010, "Auxiliar De Laboratorio E Raios X"],
  [145, "Auxiliar De Nutricao"], [805, "Auxiliar De Servicos Gerais"], [1052, "Avicultor"], [395, "Bancario E Economiario"],
  [511, "Barbeiro, Cabeleireiro, Manicure E Pedicure"], [135, "Bibliotecario Ou Arquivista"], [1023, "Biofisico"], [116, "Biologo Ou Biomedico"],
  [1024, "Bioquimico"], [1101, "Bolsista Mestrado/Doutorado"], [1104, "Bolsista Outros"], [1008, "Bombeiro E Instalador De Gas, Agua, Esgoto E Assemelhados"],
  [549, "Borracheiro"], [163, "Cantor E Compositor"], [1115, "Capitalista"], [907, "Capitalista/Rentista/Locador"],
  [1025, "Carteiro"], [1032, "Cenografo"], [1054, "Ceramista"], [1026, "Chaveiro"],
  [537, "Cobrador De Transporte Coletivo"], [419, "Comerciario"], [136, "Comunicologo"], [1118, "Conselheiro Tutelar"],
  [1097, "Consultor Legislativo"], [124, "Contador"], [165, "Coreografo E Bailarino"], [1098, "Corregedor"],
  [403, "Corretor"], [740, "Costureiro"], [529, "Cozinheiro, Copeiro, Garcom, Barmen E Camareiro"], [193, "Decorador"],
  [1107, "Defensor Publico"], [1003, "Delegado De Polícia"], [1088, "Deputado Estadual/Distrital"], [1087, "Deputado Federal"],
  [205, "Desembargador"], [1120, "Desenhista"], [192, "Desenhista Comercial"], [105, "Desenhista Industrial"],
  [158, "Desenhista Tecnico"], [593, "Despachante, Inclusive O Aduaneiro"], [1081, "Detetive Particular"], [212, "Diplomata"],
  [1110, "Discotecario, Videotecario E Afins"], [932, "Do Lar"], [1027, "Ecologista"], [121, "Economista"],
  [542, "Eletricista E Assemelhados"], [1028, "Eletricitario"], [811, "Empregado Doméstico"], [906, "Empresario"],
  [161, "Empresario E Produtor De Espetaculos Publicos"], [113, "Enfermeiro"], [101, "Engenheiro"], [397, "Escrevente/Auxiliar De Cartorio"],
  [1029, "Escritor"], [191, "Escultor/Pintor Ou Assemelhado"], [1117, "Espolio"], [931, "Estagiario E Assemelhados"],
  [122, "Estatistico"], [1080, "Esteticista"], [1011, "Estivador, Carregador, Embalador E Assemelhados"], [1002, "Estudante"],
  [117, "Farmaceutico"], [1072, "Faxineiro"], [413, "Feirante"], [755, "Ferramenteiro"],
  [1074, "Ferroviario"], [1030, "Filologo"], [1031, "Filosofo"], [539, "Fiscal, Auditor E Assemelhados"],
  [106, "Fisico"], [114, "Fisioterapeuta Ou Terapeuta Ocupacional"], [1033, "Floricultor"], [118, "Fonoaudiologo"],
  [1000, "Fotografo"], [806, "Frentista"], [543, "Funileiro"], [742, "Gari Ou Varredor De Logradouros Publicos"],
  [605, "Garimpeiro"], [127, "Geografo"], [107, "Geologo"], [1086, "Governador De Estado/Distrito Federal"],
  [1055, "Historiador"], [903, "Industriario"], [1071, "Instrutor"], [810, "Jardineiro"],
  [717, "Joalheiro E Ourives"], [412, "Jornaleiro"], [171, "Jornalista"], [1007, "Lanterneiro E Pintor De Veiculos"],
  [404, "Leiloeiro, Avaliador E Assemelhados"], [166, "Locutor E Comentarista De Radio E Televisao E Radialista"], [1070, "Magistrado"], [535, "Maquinista E Foguista De Embarcacoes, Locomotivas E Assemelha"],
  [774, "Marceneiro E Trab.Artefatos Madeira"], [534, "Marinheiro"], [899, "Massagista"], [123, "Matematico E Atuario"],
  [762, "Mecanico De Manutencao De Maquinas Industriais"], [541, "Mecanico De Manutencao De Veiculos Automotores"], [111, "Medico"], [1102, "Menor Sem Atividade"],
  [1099, "Mergulhador"], [701, "Mestre E Contramestre"], [719, "Metalurgico E Siderurgico"], [1048, "Meteorologista"],
  [1114, "Militar Das Forcas Armadas Aeronautica"], [1112, "Militar Das Forcas Armadas Exercito"], [1113, "Militar Das Forcas Armadas Marinha"], [294, "Militar Em Geral"],
  [202, "Ministro De Estado"], [1001, "Missionario"], [1083, "Modelista E/Ou Cortador Vestuario"], [492, "Modelo De Modas"],
  [1035, "Modista"], [809, "Motociclista (Transp. De Mercadorias) E/Ou Assemelhados"], [1121, "Motorista"], [532, "Motorista De Veiculos De Transporte De Carga"],
  [531, "Motorista De Veiculos De Transporte De Passageiros"], [769, "Motorista/Operador De Maquinas Pesadas"], [164, "Musico"], [1049, "Nutricionista"],
  [1036, "Oceanografo"], [115, "Odontologo"], [216, "Oficial Das Forcas Armadas E Forcas Auxiliares"], [1095, "Oficial De Justica"],
  [1037, "Oleiro"], [386, "Operador De Computadores"], [1078, "Operador De Maquinas Agropecuarias"], [1109, "Operador De Telemarketing"],
  [1056, "Optico"], [1057, "Ornitologo"], [1038, "Padeiro E Confeiteiro"], [925, "Pastor"],
  [602, "Pecuarista"], [144, "Pedagogo"], [604, "Pescador"], [1067, "Pescador Com Fins Comerciais"],
  [1063, "Pesq/Produc De Mudas Ou Sement Fiscalizadas/Certificadas"], [1064, "Pesq/Produc De Semem Para Inseminacao Artificial"], [181, "Piloto De Aeronaves"], [1039, "Policial Civil"],
  [501, "Porteiro De Edificio, Ascensorista E Garagista"], [1073, "Portuario"], [1090, "Prefeito Municipal"], [1084, "Presidente Da Republica"],
  [1066, "Prest Serv De Inseminacao Artificial, Em Imovel Rural"], [1065, "Prest Serv Mecanizad,Natural,Rural Inclusive Protecao Solo"], [211, "Procurador Da Justica E Assemelhados"], [143, "Professor De Ensino Fundamental E Medio"],
  [142, "Professor De Ensino Superior"], [1119, "Professor/Demais"], [138, "Profissional De Letras E Artes"], [388, "Programador De Sistema"],
  [1089, "Promotor De Justica"], [499, "Promotor De Vendas E Demonstrador"], [592, "Protetico"], [132, "Psicologo E Psicanalista"],
  [172, "Publicitario"], [104, "Quimico"], [1040, "Radiotecnico"], [1053, "Redator"],
  [137, "Relacoes Publicas"], [1041, "Relojoeiro"], [1116, "Rentista Ou Locador"], [402, "Representante Comercial"],
  [1058, "Rodoviario"], [1042, "Sacerdote"], [1077, "Salva-Vidas Ou Bombeiro Particular/Autonomo"], [596, "Sapateiro E Demais Trab De Calcados E Artefatos De Couro"],
  [1093, "Secretario Estadual"], [1092, "Secretario Federal"], [1094, "Secretario Municipal"], [393, "Secretario/Estenografo/Datil/Recep/Telef Trab Assemelhados"],
  [396, "Securitario"], [807, "Seguranca/Vigilante"], [201, "Senador Da Republica"], [758, "Serralheiro"],
  [293, "Serventuario De Justica"], [297, "Servidor Publico Estadual"], [296, "Servidor Publico Federal"], [298, "Servidor Publico Municipal"],
  [133, "Sociologo"], [1043, "Sucateiro"], [760, "Supervisor, Inspetor E Agente De Compras E Vendas"], [1005, "Tabeliao/Oficial De Registro"],
  [1059, "Tapeceiro"], [1044, "Taquigrafo"], [536, "Taxista"], [153, "Tecnico Agricola"],
  [152, "Tecnico De Biologia"], [151, "Tecnico De Contabilidade E De Estatistica"], [1082, "Tecnico De Edificacoes"], [156, "Tecnico De Eletricidade, Eletronica E Telecomunicacoes"],
  [1106, "Tecnico De Enfermagem"], [1076, "Tecnico De Rmatica"], [157, "Tecnico De Laboratorio E Raios X"], [155, "Tecnico De Mecanica"],
  [154, "Tecnico De Quimica"], [167, "Tecnico Em Audio E Cenografia"], [1075, "Tecnico Em Seguranca Do Trabalho"], [761, "Tecnico Instrumentista"],
  [108, "Tecnologo"], [1060, "Tintureiro"],]

const PROF_INDEX = BV_PROFESSIONS.map(([code, name]) => ({ code, key: norm(name) }))

/**
 * Código de profissão do BV a partir do texto livre da ficha. Ordem: igual →
 * começa com → contém. Sem texto, usa a ocupação (aposentado/empresário).
 */
export function bvProfession(profissao: unknown, occupation?: unknown): number | null {
  const s = norm(profissao)
  if (s) {
    const exact = PROF_INDEX.find((p) => p.key === s)
    if (exact) return exact.code
    const starts = PROF_INDEX.find((p) => p.key.startsWith(s) || s.startsWith(p.key))
    if (starts) return starts.code
    const part = PROF_INDEX.find((p) => p.key.split(' ').some((w) => w.length > 3 && w === s))
    if (part) return part.code
  }
  if (occupation === 'APOSENTADO_PENSIONISTA') return 923
  if (occupation === 'EMPRESARIO') return 906
  return null
}

/** Nome do estado por extenso (o BV pede o nome em alguns objetos de endereço). */
export const UF_NAME: Record<string, string> = {
  AC: 'ACRE', AL: 'ALAGOAS', AP: 'AMAPA', AM: 'AMAZONAS', BA: 'BAHIA', CE: 'CEARA', DF: 'DISTRITO FEDERAL', ES: 'ESPIRITO SANTO',
  GO: 'GOIAS', MA: 'MARANHAO', MT: 'MATO GROSSO', MS: 'MATO GROSSO DO SUL', MG: 'MINAS GERAIS', PA: 'PARA', PB: 'PARAIBA',
  PR: 'PARANA', PE: 'PERNAMBUCO', PI: 'PIAUI', RJ: 'RIO DE JANEIRO', RN: 'RIO GRANDE DO NORTE', RS: 'RIO GRANDE DO SUL',
  RO: 'RONDONIA', RR: 'RORAIMA', SC: 'SANTA CATARINA', SP: 'SAO PAULO', SE: 'SERGIPE', TO: 'TOCANTINS',
}

export const upperClean = (s: unknown) => norm(s)
