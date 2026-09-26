// =============================================================================
// Catálogo de opcionais — GERADO a partir da lista da AutoDrive (não editar à mão
// item a item; manter a estrutura). 16 grupos, cada item com o tipo:
//   EQUIPAMENTO  item de série/opcional do carro (teto solar, ACC, airbags)
//   ACESSORIO    instalado depois (película, engate, capota marítima)
//   HISTORICO    estado/procedência (único dono, IPVA pago, laudo aprovado)
// A loja marca em Marketing › Publicações; grava em SiteListing.options.
// =============================================================================

export type OptionKind = 'EQUIPAMENTO' | 'ACESSORIO' | 'HISTORICO'
export interface OptionSection { section: string; kind: OptionKind; items: string[] }
export interface OptionGroup { group: string; sections: OptionSection[] }

export const OPTION_CATALOG: OptionGroup[] = [
  { group: "Segurança", sections: [
    { section: "Segurança ativa", kind: 'EQUIPAMENTO', items: [
      "ABS", "ABS com EBD", "Assistente de frenagem de emergência – BAS/EBA", "Controle eletrônico de estabilidade – ESC/ESP",
      "Controle eletrônico de tração – TCS/ASR", "Controle de estabilidade para reboque", "Controle de descida – HDC",
      "Assistente de partida em rampa – HSA/HHC", "Frenagem automática de emergência – AEB", "Frenagem automática em manobras",
      "Frenagem pós-colisão", "Alerta de colisão frontal", "Alerta de colisão traseira", "Alerta de tráfego cruzado traseiro",
      "Alerta de tráfego cruzado dianteiro", "Alerta de ponto cego", "Monitoramento de ponto cego",
      "Assistente de mudança de faixa", "Alerta de saída de faixa", "Assistente de permanência em faixa",
      "Centralização automática em faixa", "Assistente de evasão", "Assistente de desvio de obstáculos", "Detector de fadiga",
      "Detector de sonolência", "Monitoramento da atenção do motorista", "Monitoramento facial do motorista",
      "Reconhecimento de placas de trânsito", "Alerta de limite de velocidade", "Alerta de abertura de portas",
      "Alerta de veículo se aproximando", "Controle automático de velocidade em descidas",
      "Controle eletrônico de estabilidade em curvas", "Controle de torque em curvas", "Vetorização de torque",
      "Luz de frenagem de emergência", "Sistema pré-colisão", "Sistema de proteção preventiva dos ocupantes",
      "Chamada automática de emergência", "Botão SOS", "Sistema de assistência em acidentes",
    ] },
    { section: "Airbags", kind: 'EQUIPAMENTO', items: [
      "Airbag motorista", "Airbag passageiro", "Airbags frontais", "Airbags laterais dianteiros", "Airbags laterais traseiros",
      "Airbags de cortina", "Airbag de joelho do motorista", "Airbag de joelho do passageiro", "Airbag central dianteiro",
      "Airbag central traseiro", "Airbag de assento", "Desativação do airbag do passageiro",
    ] },
    { section: "Cintos e proteção", kind: 'EQUIPAMENTO', items: [
      "Cintos dianteiros de 3 pontos", "Cintos traseiros de 3 pontos", "Pré-tensionadores dos cintos",
      "Limitadores de força dos cintos", "Regulagem de altura dos cintos", "Alerta de cinto do motorista",
      "Alerta de cinto do passageiro", "Alerta de cintos traseiros", "ISOFIX", "Top Tether", "Travas de segurança infantil",
      "Proteção contra abertura das portas traseiras", "Encostos de cabeça ativos", "Encostos de cabeça para todos os ocupantes",
    ] },
    { section: "Proteção e antifurto", kind: 'EQUIPAMENTO', items: [
      "Alarme", "Alarme volumétrico", "Alarme perimétrico", "Imobilizador eletrônico", "Bloqueador", "Monitoramento remoto",
      "Localizador", "Chave codificada", "Trava antifurto", "Trava de estepe", "Trava de roda", "Porca antifurto",
      "Proteção contra furto de componentes", "Sensor de invasão", "Sensor de inclinação", "Gravação por câmeras do veículo",
    ] },
  ] },
  { group: "ADAS", sections: [
    { section: "Sensores e estacionamento", kind: 'EQUIPAMENTO', items: [
      "Sensor de estacionamento traseiro", "Sensor de estacionamento dianteiro", "Sensores de estacionamento laterais",
      "Sensor 360°", "Câmera de ré", "Câmera dianteira", "Câmeras laterais", "Câmera 360°", "Visão panorâmica",
      "Visão 3D do veículo", "Visão de chassi transparente", "Câmera para guia de reboque", "Linhas dinâmicas na câmera de ré",
      "Assistente automático de estacionamento", "Estacionamento semiautônomo", "Estacionamento totalmente automático",
      "Estacionamento remoto", "Assistente de saída da vaga", "Memória de percurso para estacionamento", "Sensor de obstáculos",
      "Sensor ultrassônico",
    ] },
    { section: "Controle de velocidade e condução semiautônoma", kind: 'EQUIPAMENTO', items: [
      "Piloto automático", "Controle de cruzeiro", "Controle de cruzeiro adaptativo – ACC", "ACC com Stop & Go",
      "Limitador de velocidade", "Limitador inteligente de velocidade", "Piloto automático adaptativo",
      "Assistente de condução em congestionamentos", "Traffic Jam Assist", "Highway Assist", "Assistente de condução em rodovia",
      "Condução semiautônoma nível 2", "Assistente de ultrapassagem", "Troca automática de faixa", "Centralização em faixa",
      "Navegação integrada ao ACC", "Redução automática de velocidade em curvas",
    ] },
  ] },
  { group: "Conforto", sections: [
    { section: "Vidros, portas e travas", kind: 'EQUIPAMENTO', items: [
      "Vidros elétricos dianteiros", "Vidros elétricos traseiros", "Vidros elétricos nas quatro portas",
      "Vidros com função um toque", "Vidros antiesmagamento", "Fechamento automático dos vidros",
      "Fechamento dos vidros pela chave", "Abertura dos vidros pela chave", "Vidros acústicos", "Vidros laminados",
      "Vidros verdes", "Vidros escurecidos", "Vidros privativos", "Para-brisa acústico", "Para-brisa térmico",
      "Desembaçador traseiro", "Limpador traseiro", "Travas elétricas", "Travamento automático em movimento",
      "Destravamento automático em colisão", "Fechamento automático das portas", "Porta com fechamento suave – Soft Close",
      "Portas elétricas", "Portas laterais deslizantes", "Portas laterais elétricas",
    ] },
    { section: "Chaves e acesso", kind: 'EQUIPAMENTO', items: [
      "Chave convencional", "Chave canivete", "Controle remoto", "Chave presencial", "Smart Key", "Keyless Entry", "Keyless Go",
      "Acesso sem chave", "Partida sem chave", "Botão Start/Stop", "Partida por botão", "Partida remota",
      "Controle remoto do motor", "Chave digital pelo celular", "NFC", "Cartão-chave", "Reconhecimento por smartphone",
      "Reconhecimento facial", "Biometria", "Sensor de aproximação", "Travamento por aproximação",
    ] },
    { section: "Retrovisores", kind: 'EQUIPAMENTO', items: [
      "Retrovisores com ajuste manual", "Retrovisores elétricos", "Retrovisores rebatíveis eletricamente",
      "Retrovisores com rebatimento automático", "Retrovisores aquecidos", "Retrovisores eletrocrômicos",
      "Retrovisor interno fotocrômico", "Retrovisor interno digital", "Retrovisores com memória",
      "Retrovisores com indicador de direção", "Luz de cortesia nos retrovisores", "Projeção de logotipo",
      "Ajuste automático do retrovisor ao engatar ré",
    ] },
    { section: "Limpadores e sensores", kind: 'EQUIPAMENTO', items: [
      "Limpador dianteiro", "Lavador traseiro", "Lavador dos faróis", "Sensor de chuva", "Limpadores automáticos",
      "Limpadores com velocidade variável", "Desembaçador do para-brisa", "Para-brisa aquecido", "Esguicho aquecido",
    ] },
    { section: "Conforto e conveniência", kind: 'EQUIPAMENTO', items: [
      "Descanso de braço", "Porta-copos dianteiros", "Porta-copos traseiros", "Porta-objetos", "Porta-óculos", "Console central",
      "Console refrigerado", "Porta-luvas refrigerado", "Porta-luvas iluminado", "Cortinas laterais",
      "Cortina elétrica traseira", "Cortinas traseiras", "Relógio digital", "Bússola", "Termômetro externo", "Pedais esportivos",
      "Descanso de pé", "Entrada Easy Entry", "Easy Exit", "Memória de posições", "Ajustes elétricos", "Fechamento Soft Close",
    ] },
    { section: "Itens premium", kind: 'EQUIPAMENTO', items: [
      "Head-Up Display", "Visão noturna", "Night Vision", "Câmera infravermelha", "Bancos massageadores", "Bancos ventilados",
      "Bancos multicontorno", "Apoio elétrico para pernas", "Teto panorâmico", "Teto eletrocrômico", "Vidros eletrocrômicos",
      "Cortinas elétricas", "Soft Close", "Direção nas quatro rodas", "Frigobar", "Compartimento refrigerado", "Mesas traseiras",
      "Tela para passageiros traseiros", "Controle individual traseiro", "Perfume/ambientador integrado", "Ionizador",
      "Microfones para comunicação interna", "Cancelamento ativo de ruído",
    ] },
    { section: "Acessibilidade", kind: 'EQUIPAMENTO', items: [
      "Banco giratório", "Banco com elevação", "Plataforma elevatória", "Rampa de acesso", "Comandos manuais",
      "Acelerador manual", "Freio manual", "Acelerador à esquerda", "Prolongador de pedais", "Pomo giratório no volante",
      "Automatização de embreagem", "Porta elétrica", "Elevador para cadeira de rodas", "Fixação para cadeira de rodas",
    ] },
  ] },
  { group: "Climatização", sections: [
    { section: "Ar-condicionado e climatização", kind: 'EQUIPAMENTO', items: [
      "Ar-condicionado", "Ar-condicionado digital", "Ar-condicionado automático", "Ar-condicionado digital automático",
      "Climatizador automático", "Ar-condicionado de uma zona", "Dual Zone", "Tri Zone", "Four Zone", "Saída de ar traseira",
      "Saídas de ar para terceira fileira", "Controle de temperatura traseiro", "Ar-condicionado traseiro independente",
      "Filtro antipólen", "Filtro de carvão ativado", "Purificador de ar", "Ionizador de ar", "Sensor de qualidade do ar",
      "Recirculação automática", "Pré-climatização", "Climatização remota pelo aplicativo",
    ] },
  ] },
  { group: "Bancos", sections: [
    { section: "Bancos", kind: 'EQUIPAMENTO', items: [
      "Bancos em tecido", "Bancos em couro", "Bancos em couro sintético", "Bancos em Alcantara", "Bancos mistos",
      "Bancos esportivos", "Bancos tipo concha", "Bancos comfort", "Banco do motorista com regulagem de altura",
      "Banco do passageiro com regulagem de altura", "Banco do motorista elétrico", "Banco do passageiro elétrico",
      "Bancos dianteiros elétricos", "Ajuste lombar", "Ajuste lombar elétrico", "Apoio de pernas", "Extensor de assento",
      "Memória do banco do motorista", "Memória do banco do passageiro", "Bancos dianteiros aquecidos",
      "Bancos traseiros aquecidos", "Bancos dianteiros ventilados", "Bancos traseiros ventilados", "Bancos climatizados",
      "Banco com massagem", "Bancos com função relaxamento", "Banco traseiro reclinável", "Banco traseiro deslizante",
      "Banco traseiro bipartido", "Banco traseiro rebatível", "Banco traseiro 60/40", "Banco traseiro 40/20/40",
      "Banco traseiro inteiriço", "Terceira fileira de bancos", "5 lugares", "6 lugares", "7 lugares", "8 lugares",
      "Apoio de braço dianteiro", "Apoio de braço traseiro",
    ] },
  ] },
  { group: "Multimídia", sections: [
    { section: "Multimídia e entretenimento", kind: 'EQUIPAMENTO', items: [
      "Rádio AM/FM", "Rádio digital", "CD Player", "DVD Player", "MP3", "Central multimídia", "Tela touch", "Tela capacitiva",
      "Tela retrátil", "Tela vertical", "Segunda tela para passageiro", "Telas traseiras", "Navegação GPS", "GPS integrado",
      "Bluetooth", "USB", "USB-A", "USB-C", "Entrada auxiliar", "Entrada HDMI", "Leitor de cartão SD", "Wi-Fi", "Hotspot Wi-Fi",
      "Internet embarcada", "Apple CarPlay", "Apple CarPlay sem fio", "Android Auto", "Android Auto sem fio", "MirrorLink",
      "Espelhamento de smartphone", "Comando de voz", "Assistente virtual", "Atualização OTA", "Aplicativos embarcados",
      "Streaming de áudio", "Streaming de vídeo", "TV digital",
    ] },
    { section: "Sistema de som", kind: 'EQUIPAMENTO', items: [
      "Alto-falantes", "Tweeters", "Subwoofer", "Amplificador", "Sistema de som premium", "Bose", "JBL", "Harman Kardon",
      "Bang & Olufsen", "Burmester", "Meridian", "Bowers & Wilkins", "Beats", "Infinity", "Alpine", "Fender", "Sony", "Lexicon",
      "Mark Levinson", "Devialet",
    ] },
  ] },
  { group: "Conectividade", sections: [
    { section: "Conectividade e carregamento", kind: 'EQUIPAMENTO', items: [
      "4G", "5G", "GPS", "Telemetria", "Aplicativo do veículo", "Controle remoto pelo celular", "Localização pelo aplicativo",
      "Diagnóstico remoto", "Carregador de celular sem fio", "Carregamento por indução", "USB dianteiro", "USB traseiro",
      "USB-C dianteiro", "USB-C traseiro", "Tomada 12 V", "Tomada 110 V", "Tomada 220 V", "Inversor de energia",
    ] },
  ] },
  { group: "Iluminação", sections: [
    { section: "Iluminação externa", kind: 'EQUIPAMENTO', items: [
      "Faróis halógenos", "Faróis de xenônio", "Faróis bi-xenônio", "Faróis LED", "Faróis Full LED", "Faróis Matrix LED",
      "Faróis Laser", "Faróis adaptativos", "Faróis direcionais", "Faróis com ajuste automático",
      "Regulagem elétrica de altura dos faróis", "Nivelamento automático", "Farol alto automático", "Assistente de farol alto",
      "Luzes diurnas – DRL", "DRL em LED", "Lanterna em LED", "Lanternas OLED", "Faróis de neblina", "Lanternas de neblina",
      "Luz de conversão", "Luz de curva", "Iluminação de boas-vindas", "Acendimento automático dos faróis", "Sensor crepuscular",
    ] },
    { section: "Iluminação interna", kind: 'EQUIPAMENTO', items: [
      "Luz de leitura", "Luzes individuais", "Luzes traseiras", "Iluminação ambiente", "Iluminação ambiente multicolorida",
      "Iluminação configurável", "Luz no porta-luvas", "Luz no porta-malas", "Luzes de cortesia", "Luzes nas portas",
      "Luzes nos pés", "Iluminação dos porta-copos", "Teto estrelado", "LEDs internos",
    ] },
  ] },
  { group: "Exterior", sections: [
    { section: "Teto", kind: 'EQUIPAMENTO', items: [
      "Teto convencional", "Teto solar", "Teto solar elétrico", "Teto solar panorâmico", "Teto panorâmico fixo",
      "Teto panorâmico elétrico", "Teto solar duplo", "Teto de vidro", "Teto conversível", "Capota elétrica",
      "Capota rígida retrátil", "Capota de lona", "Cortina elétrica do teto", "Cortina manual do teto",
    ] },
    { section: "Exterior e estética", kind: 'EQUIPAMENTO', items: [
      "Pintura sólida", "Pintura metálica", "Pintura perolizada", "Pintura fosca", "Pintura biton", "Teto em cor contrastante",
      "Aerofólio", "Spoiler", "Saias laterais", "Body kit", "Para-choques esportivos", "Grade esportiva", "Grade cromada",
      "Grade iluminada", "Acabamentos Black Piano", "Pacote Black", "Pacote cromado", "Estribos laterais", "Estribo elétrico",
      "Protetores de para-lamas", "Molduras de caixa de roda", "Protetor frontal",
    ] },
    { section: "Porta-malas", kind: 'EQUIPAMENTO', items: [
      "Abertura interna do porta-malas", "Abertura pela chave", "Abertura elétrica", "Fechamento elétrico", "Tampa elétrica",
      "Porta-malas automático", "Porta-malas Hands-Free", "Abertura por movimento do pé", "Altura programável da tampa",
      "Rede de porta-malas", "Divisor de bagagem", "Ganchos para bagagem", "Fundo duplo", "Esteira de porta-malas",
      "Tomada no porta-malas",
    ] },
  ] },
  { group: "Interior", sections: [
    { section: "Painel e instrumentos", kind: 'EQUIPAMENTO', items: [
      "Painel analógico", "Painel digital", "Painel 100% digital", "Virtual Cockpit", "Cluster digital", "Computador de bordo",
      "Conta-giros", "Indicador de temperatura", "Indicador de consumo", "Autonomia", "Velocímetro digital",
      "Indicador de pressão dos pneus", "Indicador de marcha", "Indicador de condução econômica", "Head-Up Display – HUD",
      "HUD no para-brisa", "HUD com realidade aumentada", "Tela configurável", "Painel com mapas de navegação",
    ] },
  ] },
  { group: "Rodas/Pneus", sections: [
    { section: "Rodas e pneus", kind: 'EQUIPAMENTO', items: [
      "Rodas de aço", "Calotas", "Rodas de liga leve", "Rodas diamantadas", "Rodas esportivas", "Rodas forjadas",
      "Pneus convencionais", "Pneus Run Flat", "Pneus All Terrain", "Pneus Mud Terrain", "Pneus de baixa resistência",
      "Estepe convencional", "Estepe temporário", "Kit reparo de pneus", "Compressor", "Sensor de pressão dos pneus – TPMS",
      "Monitoramento individual dos pneus", "Porcas antifurto",
    ] },
  ] },
  { group: "Motor/Câmbio", sections: [
    { section: "Direção", kind: 'EQUIPAMENTO', items: [
      "Direção mecânica", "Direção hidráulica", "Direção eletro-hidráulica", "Direção elétrica", "Direção elétrica progressiva",
      "Direção com assistência variável", "Direção esportiva", "Direção integral", "Esterçamento das rodas traseiras",
      "Volante com regulagem de altura", "Volante com regulagem de profundidade", "Coluna de direção elétrica",
      "Memória da posição do volante", "Volante multifuncional", "Volante esportivo", "Volante revestido em couro",
      "Volante revestido em material sintético", "Volante aquecido", "Volante com base achatada", "Volante com paddle shifts",
      "Comandos de áudio no volante", "Comandos de telefone no volante", "Comando de voz no volante",
    ] },
    { section: "Freios", kind: 'EQUIPAMENTO', items: [
      "Freios ABS", "Freios a disco dianteiros", "Freios a disco nas quatro rodas", "Discos ventilados", "Discos perfurados",
      "Freios esportivos", "Freios Brembo", "Freio de estacionamento manual", "Freio de estacionamento eletrônico", "Auto Hold",
      "Assistente de frenagem", "Distribuição eletrônica de frenagem", "Regeneração de energia na frenagem",
      "Frenagem regenerativa ajustável", "One Pedal Drive",
    ] },
    { section: "Suspensão e condução", kind: 'EQUIPAMENTO', items: [
      "Suspensão independente", "Suspensão multilink", "Suspensão McPherson", "Suspensão esportiva", "Suspensão adaptativa",
      "Suspensão eletrônica", "Suspensão pneumática", "Suspensão com regulagem de altura", "Suspensão autonivelante",
      "Amortecedores adaptativos", "Controle eletrônico de amortecimento", "Controle ativo de carroceria", "Modos de condução",
      "Modo Eco", "Modo Comfort", "Modo Normal", "Modo Sport", "Modo Sport+", "Modo Individual", "Modo Snow", "Modo Mud",
      "Modo Sand", "Modo Rock", "Modo Off-Road", "Modo EV", "Modo Hybrid", "Modo regenerativo", "Launch Control",
    ] },
    { section: "Câmbio", kind: 'EQUIPAMENTO', items: [
      "Câmbio manual", "Câmbio automático", "Câmbio automatizado", "Câmbio CVT", "Câmbio de dupla embreagem",
      "Câmbio sequencial", "Tiptronic", "Paddle shift", "Borboletas no volante", "Trocas manuais pelo câmbio",
      "Seletor eletrônico de marchas", "Seletor rotativo", "Câmbio shift-by-wire", "Overdrive",
    ] },
    { section: "Motor", kind: 'EQUIPAMENTO', items: [
      "Motor aspirado", "Motor turbo", "Motor biturbo", "Motor supercharged", "Injeção eletrônica", "Injeção direta",
      "Injeção multiponto", "Flex", "Gasolina", "Etanol", "Diesel", "Híbrido leve – MHEV", "Híbrido – HEV",
      "Híbrido plug-in – PHEV", "Elétrico – BEV", "Start-Stop", "Desativação de cilindros", "Gerenciamento eletrônico do motor",
      "Intercooler",
    ] },
  ] },
  { group: "Tração/Off-road", sections: [
    { section: "Tração", kind: 'EQUIPAMENTO', items: [
      "Tração dianteira", "Tração traseira", "Tração integral", "AWD", "4x4", "4WD", "4x4 reduzida", "Caixa de transferência",
      "Bloqueio de diferencial", "Bloqueio eletrônico de diferencial", "Diferencial autoblocante",
      "Diferencial de deslizamento limitado", "Diferencial eletrônico", "Seletor eletrônico de tração", "Controle de terreno",
    ] },
    { section: "SUVs e 4x4", kind: 'EQUIPAMENTO', items: [
      "Tração 4x4", "Tração AWD", "Seletor de terreno", "Assistente de subida", "Modo lama", "Modo areia", "Modo neve",
      "Modo pedra", "Câmera off-road", "Visão 360°", "Visão sob o veículo", "Controle de cruzeiro off-road", "Suspensão elevada",
      "Regulagem de altura", "Ganchos de reboque",
    ] },
  ] },
  { group: "Elétricos/Híbridos", sections: [
    { section: "Híbridos e elétricos", kind: 'EQUIPAMENTO', items: [
      "Motor elétrico", "Motor elétrico dianteiro", "Motor elétrico traseiro", "Dois motores elétricos",
      "Tração elétrica integral", "Bateria de alta tensão", "Carregador AC", "Carregamento DC", "Carregamento rápido",
      "Carregamento ultrarrápido", "Conector Tipo 1", "Conector Tipo 2", "CCS", "CHAdeMO", "Carregador portátil", "Wallbox",
      "Cabo de carregamento", "Pré-condicionamento da bateria", "Bomba de calor", "Frenagem regenerativa",
      "Regeneração ajustável", "One Pedal", "V2L", "V2G", "V2H", "Vehicle-to-Load", "Vehicle-to-Grid", "Vehicle-to-Home",
      "Programação de recarga", "Controle de recarga pelo aplicativo", "Monitoramento da bateria",
      "Rota inteligente considerando carregadores", "Planejamento automático de recarga", "Modo híbrido",
      "Modo de preservação da bateria", "Gerador de som externo para pedestres",
    ] },
  ] },
  { group: "Acessórios", sections: [
    { section: "Acessórios externos", kind: 'ACESSORIO', items: [
      "Rack de teto", "Travessas de teto", "Longarinas de teto", "Bagageiro de teto", "Maleiro de teto",
      "Suporte para bicicleta", "Suporte para prancha", "Engate para reboque", "Engate removível", "Engate elétrico",
      "Tomada de reboque", "Protetor de caçamba", "Capota marítima", "Capota rígida", "Santo Antônio", "Estribo",
      "Protetor de cárter", "Protetor de motor", "Protetor de tanque", "Quebra-mato", "Defletor de chuva", "Defletor de capô",
      "Apara-barro", "Snorkel",
    ] },
    { section: "Acessórios internos", kind: 'ACESSORIO', items: [
      "Tapetes de borracha", "Tapetes de carpete", "Tapetes personalizados", "Bandeja de porta-malas",
      "Organizador de porta-malas", "Capa de banco", "Protetor de banco", "Apoio para celular", "Suporte para tablet",
      "Carregador veicular", "Câmera veicular/Dashcam", "Câmera interna", "Rastreador", "Localizador GPS", "Película automotiva",
      "Película de segurança", "Película térmica",
    ] },
    { section: "Pick-ups e utilitários", kind: 'ACESSORIO', items: [
      "Estribo lateral", "Estribo traseiro", "Gancho de reboque", "Engate", "Divisor de caçamba", "Extensor de caçamba",
      "Iluminação da caçamba", "Tomada na caçamba", "Degrau de acesso", "Tampa traseira com amortecimento",
      "Tampa traseira elétrica", "Trava elétrica da caçamba", "Barras de proteção", "Rack", "Câmera para caçamba",
      "Câmera para reboque", "Controle de oscilação de reboque",
    ] },
  ] },
  { group: "Estado/Histórico", sections: [
    { section: "Estado e histórico", kind: 'HISTORICO', items: [
      "Manual do proprietário", "Chave reserva", "Nota fiscal", "Histórico de revisões", "Revisões em concessionária",
      "Revisões em dia", "Carimbo das revisões", "Laudo cautelar", "Laudo cautelar aprovado", "Sem passagem por leilão",
      "Sem sinistro", "Blindado", "Blindagem certificada", "Vidros blindados", "Certificado de blindagem", "Garantia de fábrica",
      "Garantia estendida", "Veículo de único dono", "Baixa quilometragem", "IPVA pago", "Licenciamento pago", "Pneus novos",
      "Pneus seminovos", "Bateria nova", "Estepe sem uso", "Todas as chaves", "Kit ferramentas", "Macaco", "Triângulo", "Manual",
      "Histórico de manutenção", "Preparação para reboque", "PCD/adaptado",
    ] },
  ] },
]
