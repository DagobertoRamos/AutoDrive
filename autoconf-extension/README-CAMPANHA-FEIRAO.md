# Campanha Feirão — convite de troca por WhatsApp

Módulo novo da extensão AutoConf → AutoDrive (v0.13.0). Monta a fila de clientes da
carteira, escreve a mensagem personalizada de cada um, controla o ritmo, abre a
conversa no WhatsApp Web com o texto pronto, dá o playbook de respostas para o
atendimento, guarda os horários agendados e exporta os contatos para a sua agenda.

**A extensão nunca envia sozinha. Você lê, ajusta se quiser e aperta Enter.**
Isso não é limitação técnica — é a decisão de projeto que mantém o número fora do
padrão que a Meta pune.

---

## 1. Por que assistido e não automático

Automatizar o envio dentro do `web.whatsapp.com` viola o Termo de Serviço do
WhatsApp e é exatamente o comportamento que a Meta passou a caçar em 2026 —
o volume de contas comerciais banidas ou restritas cresceu mais de 300% no
primeiro trimestre, com foco em APIs não oficiais e automação de sessão.

O gatilho do banimento **não é só volume**. É a combinação de:

| Sinal | O que a Meta lê | Como o módulo trata |
|---|---|---|
| Intervalo fixo entre envios | robô | sorteia 45–180s a cada contato |
| Mesmo texto para todo mundo | disparo em massa | 6 aberturas × variações internas de palavra |
| Rajada e madrugada | spam | teto diário + janela 9h–19h, sábado até 15h, domingo desligado |
| Taxa de bloqueio/denúncia alta | conteúdo indesejado | freio automático em 20% de rejeição |
| Muitas mensagens sem resposta | conta fria | máximo 2 toques por cliente, nunca um terceiro |
| Link em mensagem fria | phishing | auditoria bloqueia link no 1º contato |

O que sobra depois disso é uma pessoa trabalhando com uma boa ferramenta —
que é o que você é.

---

## 2. Instalação

Copie estes arquivos para `D:\Sistema de avisos\Robo\autoconf-extension\`:

**Novos:**

- `feirao-core.js` — motor: fila, telefones, textos de SDR, playbook, cadência, freios
- `wa-panel.js` — painel injetado no WhatsApp Web (fila + playbook + agendamento)
- `campanha.html` / `campanha.js` — tela de campanha: fila, importação, mensagens, agenda, ritmo, conformidade

**Substituem os existentes** (faça backup antes):

- `manifest.json` — v0.13.0, adiciona `https://web.whatsapp.com/*`
- `background.js` — passa a responder `abrirCampanha`
- `popup.js` — guarda a última busca do AutoConf para virar fila
- `popup.html` — botão "Abrir campanha de troca"

Depois: `chrome://extensions` → **Atualizar** na extensão. O Chrome vai pedir
confirmação da nova permissão de host do WhatsApp Web.

---

## 3. Operação (o dia a dia)

1. **Monte a fila.** Ícone da extensão → *Abrir campanha de troca* → aba
   **Importar clientes**. Três caminhos:
   - **Colar texto** — copie as páginas do PDF (Ctrl+A, Ctrl+C no leitor) e cole.
     O importador varre linha a linha procurando telefone brasileiro e usa o
     texto ao redor como nome e veículo.
   - **CSV/planilha** — cabeçalho na primeira linha; reconhece nome, telefone,
     veículo, ano, placa, data e vendedor sozinho. É por aqui que entra o
     `carteira-feirao-easycar.csv` gerado a partir do relatório impresso.
   - **Última busca do AutoConf** — usa o resultado da busca feita na tela
     principal, com filtro de "comprou entre X e Y meses atrás".

   A prévia mostra quantos entraram e por que cada descartado caiu fora
   (fixo, duplicado, já na fila, opt-out).

2. **Ajuste identificação e ritmo** na aba **Ritmo e segurança**: seu nome, a
   loja, até quando vai o feirão, teto diário.

3. **Preencha a campanha** na aba **Ritmo e segurança**: nome do feirão, período,
   data-limite e ano mínimo da melhor oferta — tudo isso entra nas mensagens.

4. **Confira as mensagens** na aba **Mensagens**, com a prévia rodando em cima
   de um cliente real da sua fila. Edite o que quiser — os campos e as
   alternativas `{Oi|Olá}` continuam funcionando.

5. **Abra o WhatsApp Web** pelo botão da aba Fila. O painel aparece no canto
   inferior direito.

6. **Ciclo por cliente:** o painel mostra quem é o próximo, o texto pronto e o
   cronômetro. Quando libera → *Abrir conversa com o texto pronto* → o WhatsApp
   abre a conversa com a mensagem já digitada → você lê, ajusta, **aperta Enter**
   → volta ao painel e marca o desfecho (*Enviei ✓*, *Sem WhatsApp*,
   *Pediu para não receber*, *Respondeu*, *Agendou ★*).

   Marcar o desfecho não é burocracia: é o que alimenta o cooldown, o freio
   automático e a trilha de opt-out.

---

## 4. O fluxo de SDR e a política comercial

### O princípio

> **O SDR não promete o resultado da negociação. Ele vende a oportunidade de negociar.**

A mensagem tem que fazer o cliente pensar *"pode valer a pena conversar com eles"* —
nunca *"eles já garantiram quanto vão pagar no meu carro"*. Promessa que o
atendimento não cumpre custa mais caro que qualquer banimento: queima o cliente,
queima o vendedor e queima a loja.

### A trava (Política Comercial de Mensagens)

Existe **uma única camada de regras**, em `feirao-core.js`, por onde passa todo
texto que a extensão produz — abertura, follow-up, playbook e qualquer mensagem
que você editar à mão. São 16 regras: 14 que **bloqueiam** o envio e 2 que
**avisam**.

| Bloqueia | Exemplo do que não passa |
|---|---|
| Valor em reais | "Consigo R$ 50 mil no seu carro" |
| Afirmar quanto o carro vale | "Seu carro vale aproximadamente…" |
| Valor cheio / tabela cheia | "Dá pra sair com o valor cheio na troca" |
| Prometer FIPE | "Pagamos a FIPE", "acima da FIPE", "avaliado pela FIPE" |
| Avaliação garantida ou superlativa | "A melhor avaliação do seu usado", "avaliação no topo" |
| Pagando acima do normal | "Estamos pagando acima do normal no seminovo" |
| Melhor valor / pico | "A avaliação sai no melhor valor esta semana" |
| Taxa garantida | "A menor taxa do mercado", "taxa melhor que a do mês normal" |
| Financiamento aprovado | "Seu financiamento já está aprovado" |
| Entrada ou parcela prometida | "Entrada de 10 mil", "a parcela fica em 890" |
| Verbo de garantia | "garanto", "pode contar com", "tenho certeza que" |
| Compromisso no futuro | "vamos pagar", "vamos chegar em", "fica por" |
| Prometer bom negócio | "Seu carro vai ser muito bem avaliado" |
| Marketing agressivo | "CORRE QUE É SÓ HOJE!!", "última chance" |

| Avisa (confira se está autorizado) | Por quê |
|---|---|
| Qualquer menção a FIPE | Só se for condição oficial da campanha, e sobre o preço do estoque — nunca sobre a avaliação do usado |
| Bônus, desconto, brinde, cortesia | Só o que estiver efetivamente configurado |

Onde a trava age:

- **Aba Mensagens** — a prévia mostra a violação e o botão *Salvar* recusa o texto,
  explicando o motivo e sugerindo a alternativa.
- **Painel do WhatsApp Web** — o botão de abrir conversa fica **desabilitado** com
  o aviso *"Promessa comercial — reescreva antes de enviar"*.
- **Verificador** — na aba Mensagens tem uma caixa onde você cola qualquer texto
  (inclusive de outro vendedor da equipe) e vê na hora o que a política diz.

A regra também roda nos testes: 20 casos negativos garantem que a extensão nunca
gere as frases proibidas, e 12 positivos garantem que ela continue capaz de gerar
a linguagem consultiva.

> **Os testes ficam FORA da pasta da extensão**, em `Robo\testes-feirao\`.
> O Chrome recusa carregar uma extensão que tenha qualquer arquivo começando com
> `_` — esses nomes são reservados pelo sistema. Rode com
> `node test.js`, `node test-rel.js` e `node test-dom.js` (este último pede
> `npm i jsdom` antes).

### Como falar sobre a avaliação

| Em vez de | Escreva |
|---|---|
| "Pode trazer que pagamos a FIPE" | "Vale a pena trazer seu usado para avaliarmos" |
| "Você terá a melhor avaliação" | "Estamos com condições especiais para avaliação e troca durante o feirão" |
| "Vamos chegar numa excelente avaliação" | "Dependendo do veículo e da avaliação, podemos encontrar uma condição interessante" |
| "A menor taxa do mercado pra você" | "Estamos com condições especiais de financiamento. Vale a pena simular" |
| "Consigo R$ X no seu" | "Quero entender melhor seu carro para verificar as possibilidades" |

### Benefícios: a extensão não inventa

O campo **Benefícios autorizados da campanha**, na aba Ritmo e segurança, é a única
fonte. O que estiver escrito ali entra nas mensagens; o que não estiver, não é
citado. Se você esvaziar o campo, a mensagem cai para "condições especiais durante
a campanha" e não menciona jantar nem seguro.

### Etapa 1 — Abertura (a única mensagem fria)

Estrutura: **contexto + oportunidade + curiosidade + pergunta**. Ela não tenta
fechar a venda; tenta conseguir uma resposta. Seis variações giram sozinhas, todas
terminando em pergunta.

> Olá, José! Boa tarde. Aqui é o Beto, da EasyCar Veículos — foi com a gente que
> você levou o Renault Kwid Zen.
>
> Estamos com o Feirão 10 Dias Easy até 30/08 e as condições comerciais desta
> semana estão bem interessantes para quem pensa em trocar.
>
> Você está considerando trocar o Kwid ou hoje ainda não é o momento?

Sem link, sem imagem, sem preço, sem valor. Link em mensagem fria é o gatilho nº 1
de denúncia.

### Etapa 2 — Playbook (o que fazer quando ele responde)

17 respostas agrupadas por momento da conversa, já personalizadas com o nome e o
carro do cliente, no botão **☰** do painel dentro do WhatsApp Web.

| Grupo | Cobre |
|---|---|
| **Canal** | prefere WhatsApp · prefere ligação (pede dia e faixa de horário) · confirmação do horário |
| **Valor** | "quanto vale meu carro?" · "quanto fica a entrada/parcela?" · "a parcela não cabe" |
| **Objeção** | "não quero trocar agora" · "me manda as opções" · "meu carro é mais antigo" · "quem é você" · qualificar compra/troca |
| **Agenda** | convite para avaliação · confirmação · lembrete na véspera · recuperação de no-show |
| **Encerrar** | pediu para não receber · encerrar com a porta aberta |

Duas regras que sustentam o playbook:

- **Nunca dar número por mensagem.** "Quanto vale meu carro?" é respondido com o
  que determina o valor (estado, km, documentação, mercado) e com o convite para a
  avaliação presencial — não com uma faixa inventada.
- **Qualificar antes de mandar estoque.** "Me manda as opções" vira "que tipo de
  carro e qual parcela cabe no seu mês?".

### Etapa 3 — Agendamento

É o único desfecho que conta. O botão **Agendou ★** guarda dia, hora e canal. A aba
**Agenda** lista os compromissos e mostra o funil:

```
Na fila → Contatados → Responderam → Agendaram → Compareceram
```

Resposta abaixo de 15% é problema **de abertura** — troque o texto antes de seguir
a fila. Resposta boa com poucos agendamentos é problema **de meio de conversa** —
use o playbook em vez de improvisar.

### Opt-out

Humano: *"me avisa que eu paro por aqui"*, não *"responda SAIR"*. Cumpre a LGPD sem
soar robô. E são **no máximo 2 toques frios** por cliente — depois que ele responde,
é conversa, e conversa não tem limite.

## 4b. Por que a extensão não aperta o Enter

É a pergunta que sempre volta: *"não dá pra enviar sozinho depois do tempo?"*
Tecnicamente dá — são poucas linhas. Não está aqui por três motivos concretos:

1. **Os Termos Comerciais proíbem nominalmente.** Seção 5(g): *"não desenvolver ou
   usar quaisquer aplicações que interajam com nossos Serviços Empresariais sem
   nosso consentimento prévio por escrito"*. Os Termos gerais proíbem *"bulk
   messaging, auto-messaging"*, sem exceção para volume pequeno.
2. **A detecção roda no servidor da Meta, não no navegador.** O whitepaper oficial
   deles cita inclusive o sinal de "conta que envia sem acionar o indicador de
   digitando". Intervalo aleatório no cliente não esconde um padrão que é lido do
   outro lado.
3. **A conta em risco é a da loja.** A Meta remove mais de 2 milhões de contas por
   mês por comportamento automatizado — 75% delas sem nenhuma denúncia de usuário.
   Recurso reverte entre 1% e 3%, pelos números que a própria Meta publica.

**O que existe no lugar:** a opção *Abrir a conversa automaticamente quando o
cronômetro zerar* (aba Ritmo e segurança). O painel abre a conversa sozinho com o
texto pronto, mostra uma carência de alguns segundos para você cancelar, e pausa
se perceber que você está digitando em outra conversa. Some o trabalho de vigiar o
relógio; a única ação que sobra é a que precisa ser humana.

**Para disparo realmente automático existe o caminho oficial:** WhatsApp Cloud API
com template de marketing aprovado. Custa cerca de US$ 0,0625 por mensagem de
marketing no Brasil (algo como R$ 80 para uma lista de 232 contatos), começa em
250 envios/dia por portfólio e escala sozinho. Exige opt-in explícito citando o
nome da empresa, e o texto vira template fixo com variáveis — mas assim que o
cliente responde abre a janela de 24h, onde a conversa é livre e gratuita: é
exatamente ali que o playbook entra.

---

## 4c. Gravar o contato e sincronizar com o celular

**O que não dá:** nenhuma extensão de navegador escreve na agenda do telefone.
Não existe API para isso — nem no Chrome, nem no Android, nem no iOS.

**O que dá, e é o caminho padrão da indústria:**

```
extensão gera .vcf → você importa no Google Contatos → o celular sincroniza
→ o WhatsApp lê a agenda do aparelho → o cliente aparece com o nome salvo
```

Como o WhatsApp usa a agenda do celular, o nome aparece também no WhatsApp Web.
Você deixa de atender "+55 11 96065-0122" e passa a ver
"José Junior · Feirão 08/2023 · Kwid".

### O padrão do nome

Configurável na aba **Fila**, com prévia ao vivo em cima de um cliente real da sua
lista. Padrão de fábrica:

```
{nomeCurto} · {campanha} {mesAno} · {modelo}    →  José Junior · Feirão 08/2023 · Kwid
```

Campos disponíveis: `{nome}` `{nomeCurto}` `{primeiroNome}` `{campanha}`
`{campanhaLonga}` `{mesAno}` `{mesAnoCurto}` `{ano}` `{modelo}` `{veiculo}`
`{placa}` `{vendedor}`.

A carteira vem toda em CAIXA ALTA no relatório; a extensão converte para
capitalização normal e mantém as preposições em minúscula ("de", "da", "dos"),
senão a agenda fica gritando.

### Quando grava

| Modo | Comportamento |
|---|---|
| **Em lote** (padrão) | Quem você marca como enviado, respondeu ou agendou entra numa fila de pendentes. O botão *Exportar novos contatos* baixa só os que ainda não foram gravados |
| **Imediato** | Baixa um .vcf por cliente, na hora em que você marca o desfecho |
| **Desligada** | Só exportação manual |

Quem pediu para não receber **nunca** é gravado — e se já tiver sido marcado,
sai da fila de pendentes.

Há também exportações avulsas: todos os já contatados, a fila inteira, ou só os
agendados (útil para passar a agenda do dia ao vendedor).

### Como importar

- **Android:** Google Contatos → *Importar* → selecione o .vcf. Sincroniza sozinho.
- **iPhone:** iCloud.com → Contatos → engrenagem → *Importar vCard*.

### Dois avisos que valem mais que a comodidade

1. **O nome gravado é só seu.** O cliente nunca vê como você o salvou.
2. **Mas salvar centenas de pessoas muda quem enxerga seu status do WhatsApp.**
   Se a privacidade do seu status estiver em "Meus contatos", todos eles passam a
   ver. Confira antes de importar em massa.

Por isso todo cartão sai com `CATEGORIES` = nome da campanha: no Google Contatos
isso vira um **rótulo**, e é por ele que você apaga o lote inteiro depois, de uma
vez, sem catar contato a contato.

### Detalhe técnico

vCard 3.0, UTF-8, com dobra de linha em **75 octetos** conforme a RFC 6350 — não
75 caracteres. Acento ocupa 2 bytes, e é exatamente aí que a maioria dos
geradores caseiros quebra e o Google recusa o arquivo. Telefone fixo é descartado
na geração: não adianta gravar na agenda um número que não tem WhatsApp.

---

## 4d. Detecção de resposta, follow-up e relatórios

### Quem respondeu — detecção automática

> **Corrigido na v0.13.0.** A primeira versão só olhava o balãozinho de mensagens
> não lidas — que **some assim que você abre a conversa**. Na prática, todo cliente
> cuja resposta você já tinha lido nunca era marcado. Agora o sinal principal é
> **de quem é a última mensagem**: o tiquinho de entrega só aparece quando a última
> foi nossa; sem tiquinho e com prévia, a última palavra foi do cliente.

Não existe recurso oficial que avise "este contato respondeu" no WhatsApp Web. O
único caminho sancionado é o webhook da Cloud API. O que o painel faz é **ler o
que já está desenhado na sua tela**: título da conversa, prévia da última
mensagem e o balãozinho de não lidas. Casa com a fila e vira o status para
**respondeu**, com carimbo de hora.

Nada é enviado, nada é clicado, nada sai do navegador — não gera sinal nenhum no
servidor da Meta, que é onde a detecção de automação roda. Ainda assim: **não é
um recurso apoiado por eles**, e você deve saber disso.

Duas coisas que fazem diferença na prática:

- **Importe os contatos pelo .vcf primeiro.** Aí o título da conversa é o nome
  que a extensão gravou, e o casamento é exato. Sem isso o WhatsApp mostra só o
  número, e o acerto cai.
- **O painel mostra no rodapé quantas conversas está lendo.** Se o WhatsApp mudar
  a tela e o leitor ficar cego, você vê na hora — em vez de achar que ninguém
  respondeu.

Quando um nome é ambíguo (duas "Maria Silva" na fila), a extensão **não marca
ninguém**. Marcar a pessoa errada como "respondeu" é pior que não marcar.

### Follow-up — o que precisa de você hoje

O painel mostra um bloco **PARA HOJE**, em ordem de prioridade:

| Prioridade | Situação | O que o botão faz |
|---|---|---|
| 1 | Visita marcada para amanhã, sem confirmação | Abre a conversa com o texto de lembrete |
| 2 | Horário passou e ninguém marcou nada | Abre com o texto de recuperação de no-show |
| 3 | Respondeu, esfriou e não agendou (3 dias) | Abre com o convite para a avaliação |
| 4 | Não respondeu e venceu o prazo (4 dias) | Abre o 2º e último toque |

Os prazos são configuráveis na aba Ritmo e segurança.

### Relatórios

Aba própria, com:

- **Funil** — na lista → contatados → responderam → agendaram → compareceram, com
  as taxas de conversão entre cada etapa.
- **Desempenho por abertura** — qual dos 6 textos puxa mais resposta. Abaixo de 5
  envios a taxa fica cinza, de propósito: com 2 envios, 1 resposta não é 50%, é
  ruído.
- **Por dia** — enviados, respostas, agendamentos e opt-outs.
- **Tempo mediano até a resposta** — mediana, não média, porque com poucos casos
  um cliente que respondeu depois de uma semana distorce a média inteira.
- **Alerta de opt-out acima de 5%** — em base própria isso é alto e costuma
  anteceder queda de qualidade do número.
- **Resumo em texto** pronto para colar no grupo da equipe, e **CSV completo**
  da campanha (com BOM, para o Excel em português abrir com acento certo).

---

## 4e. Auditoria e status editável

### Os três grupos que você pediu

Na aba **Fila**, o card *Auditoria da campanha* separa todo mundo em grupos
clicáveis — clicar filtra a tabela acima:

| Grupo | Quem entra |
|---|---|
| **Ainda não chamei** | zero toques |
| **Chamei e não responderam** | tem toque, sem resposta registrada |
| **Responderam** | tem carimbo de resposta, ou está em agendado/compareceu/não veio |
| **Sem WhatsApp** | marcado no desfecho |
| **Pediram para não receber** | opt-out |

Cada cliente cai em **um grupo só**. A ordem de avaliação é por precedência:
quem respondeu conta como "respondeu" mesmo que o registro de envio esteja
faltando — nesse caso a falta vira um alerta, não uma reclassificação.

A auditoria também aponta o que costuma estar errado e ninguém percebe:

- quem está na fila **sem celular válido** (nunca vai sair)
- quem está na **lista de não perturbe mas segue ativo** na fila
- **agendamentos vencidos** sem desfecho marcado
- **respostas órfãs** (marcado como respondeu, sem registro de envio)
- contatos **ainda não gravados na agenda**

E mostra quem está esperando resposta há mais tempo, em dias.

### Auditar pelo WhatsApp Web

O botão **Auditar agora pelo WhatsApp Web** pede ao painel que leia a lista de
conversas e marque quem respondeu desde a última verificação. Precisa da aba do
WhatsApp Web aberta — se ela estiver aberta mas o painel não responder, é porque
a aba foi carregada antes desta versão: dê F5 nela.

### Mudar o status na mão

A coluna **Status** virou um seletor. Mudar ali é **correção de cadastro**, e é
deliberadamente diferente de marcar um desfecho no painel:

- **não conta toque** (não consome o limite de 2 contatos frios)
- **não mexe no cooldown** nem alimenta o freio automático
- o log registra como `status_manual`, com o de-para

Duas coerências automáticas: marcar "não perturbe" também entra na lista de
bloqueio, e tirar de lá remove. Voltar alguém para "a chamar" limpa o carimbo de
resposta, para os relatórios não contarem uma resposta que você desfez.

### Gravação automática na agenda

> **Corrigido na v0.13.0.** Mudar o padrão no código não muda nada para quem já
> usou a extensão: `getConfig()` faz `{ ...padrão, ...salvo }`, e o que está salvo
> sempre vence. Quem tinha `lote` da versão anterior continuava sem gravar nada.
> Agora existe uma **migração de configuração** que roda no boot e corrige isso —
> respeitando quem escolheu "desligada" de propósito. E o botão
> **Gravar agora os que faltam** pega todo mundo que já foi chamado, inclusive os
> contatados antes desta função existir.

O modo padrão agora é **Automática**: enquanto você trabalha, a extensão junta
os contatos novos e baixa o `.vcf` sozinha — o que vier primeiro, o lote cheio
(10 por padrão) ou o tempo (30 minutos). É o meio-termo entre um arquivo por
cliente, que entope a pasta de Downloads, e você ter que lembrar de exportar.

**O .vcf virou a alternativa.** O caminho principal agora é a integração direta
com o Google Contatos — veja abaixo.

Telefone fixo nunca entra na gravação automática, e quem pediu para não receber
sai da fila de pendentes.

### Google Contatos — gravação de ponta a ponta

Conectado, a extensão escreve os clientes **direto na sua conta do Google**, e o
celular sincroniza sozinho. Sem baixar arquivo, sem importar nada. É a única
forma em que "salvar automático na agenda" acontece de verdade — e continua
sendo o Google, não a extensão, quem fala com o telefone.

**Configuração (uma vez, ~10 minutos)** — o passo a passo completo está dentro
da própria tela, no card *Google Contatos*, com o endereço de redirecionamento
pronto para copiar. Resumo:

1. Projeto no `console.cloud.google.com`
2. **Ativar a People API** na Biblioteca
3. Tela de consentimento OAuth → Externo → seu e-mail como usuário de teste
4. **Publicar o app** (sem verificação) — explicação abaixo
5. Credenciais → ID do cliente OAuth → **Aplicativo da Web**
6. Colar em *URIs de redirecionamento* o endereço mostrado na tela (termina em
   `.chromiumapp.org/`)
7. Colar o ID do cliente na extensão e conectar

**Por que publicar sem verificar.** Enquanto o projeto fica *Em teste*, o Google
**expira a autorização a cada 7 dias** para escopos sensíveis — e `contacts` é
sensível. Você teria que reconectar toda semana. Publicado, mesmo sem
verificação, a autorização não expira. Aparece uma tela de "app não verificado"
uma única vez: é esperado, porque o app é seu, roda na sua máquina e só acessa
os seus próprios contatos. Verificação só é exigida para distribuir a terceiros.

**Escopo:** apenas `contacts`. Nada de e-mail, agenda ou arquivos. Revogável a
qualquer momento no botão *Desconectar* ou em `myaccount.google.com/permissions`.

**Rótulo da campanha.** Todo contato entra num rótulo com o nome do feirão — é
por ele que você apaga o lote inteiro depois, de uma vez.

**Lotes grandes de propósito.** A People API cobra a mesma cota diária por um
lote de 5 e por um de 200. Por isso o gatilho automático espera juntar 40
contatos: mandar de 5 em 5 é o jeito mais rápido de estourar a cota do projeto.

**Duas ressalvas honestas:**

- O fluxo usado (`launchWebAuthFlow` com concessão implícita) **funciona hoje**,
  mas o Google o classifica como "suporte legado". Não há data de desligamento
  anunciada. A alternativa recomendada por eles (`getAuthToken`) exigiria fixar
  uma `key` no manifest — o que **muda o ID da extensão** e apagaria a fila, a
  configuração e o histórico, porque o armazenamento é por ID. Não vale o preço
  agora; se um dia o implícito parar, migramos com exportação e reimportação dos
  dados.
- **Não mova a pasta da extensão.** O ID vem do caminho; mover quebra o
  redirecionamento do OAuth — e, bem pior, apaga a campanha inteira.

Se o Google não estiver conectado, tudo continua funcionando: a gravação cai
para o arquivo `.vcf` automaticamente.

---

## 5. Ritmo recomendado

| Parâmetro | Padrão | Por quê |
|---|---|---|
| Máximo por dia, por número | **40** | ~5–8 por hora. Passa despercebido e dá tempo de atender quem responde. |
| Intervalo entre contatos | **45–180s sorteados** | Intervalo fixo é assinatura de robô. |
| Pausa longa | a cada 10 envios, 8–15 min | Quebra o bloco contínuo. |
| Janela | 9h–19h · sábado até 15h · domingo não | Mensagem fora de hora vira bloqueio. |
| Toques por cliente | 2 (o 2º após 4 dias) | O terceiro é o que vira denúncia. |
| Não repetir número | 90 dias | Protege quem já foi contatado em outra campanha. |
| Freio automático | 20% de rejeição nos últimos 20 | É a curva que antecede o banimento. |

**Para dobrar o alcance, dobre o número de vendedores — nunca o volume por
número.** Dois vendedores a 40/dia é seguro; um vendedor a 80/dia não é.

Conta rápida: 600 clientes na carteira ÷ 40/dia = 15 dias úteis com um número.
Se o feirão dura uma semana, divida entre 3 vendedores.

---

## 6. LGPD — a parte que protege a loja

**Quem pode entrar na lista:** só quem já comprou da loja. O relacionamento
prévio sustenta o *legítimo interesse* (LGPD art. 7º, IX) para oferta de produto
correlato ao que a pessoa comprou — troca de veículo é exatamente isso.

**Quem não pode:** lista comprada, lista de terceiro, número raspado de anúncio,
contato de quem só cotou e nunca fechou. Sem consentimento nem relacionamento não
há base legal — e é a causa nº 1 de autuação da ANPD.

**Obrigações que o módulo cumpre sozinho:**

- Pediu para parar → para na hora e entra na blocklist permanente, válida para
  todas as campanhas futuras.
- Trilha de auditoria exportável em CSV: quem, quando, qual variação, origem do
  dado. É a sua defesa se alguém reclamar na ANPD ou no Procon.
- Prazo legal de resposta ao titular: 15 dias.
- Cliente sem interação há mais de 24 meses deve sair da base ativa.

Isto é orientação prática de operação, não parecer jurídico. Se a campanha
escalar para toda a rede, vale passar pelo jurídico da loja.

---

## 7. Se um número for restringido mesmo assim

Sinais de alerta, em ordem: entregas param de virar duas marcações azuis →
clientes somem da lista sem responder → conta cai em "restrição temporária".

Ao primeiro sinal: **pare a campanha naquele número no mesmo dia.** Não migre a
mesma lista para outro número no dia seguinte — o padrão é o que foi marcado, não
o número. Revise a abertura, corte a faixa de clientes menos aderente e retome
com metade do volume.

Se a operação virar rotina e o volume passar de algumas centenas por mês, o
caminho definitivo é a **WhatsApp Cloud API oficial** com template de Marketing
aprovado — sem risco de banimento, com custo por conversa e limite de ~2
mensagens de marketing por usuário por dia entre todas as marcas. Você já tem
integração Cloud API no sistema EasyCar; migrar o primeiro toque para lá e
manter o WhatsApp Web só para o atendimento de quem responde é a evolução natural
deste módulo.

---

## Fontes

- [Onda de banimentos no WhatsApp em 2026 e APIs não oficiais — SocialHub](https://www.socialhub.pro/blog/onda-banimentos-whatsapp-2026-apis-nao-oficiais-proteger/)
- [WhatsApp messaging limits 2026: tiers, quality rating e cap de marketing por usuário — Chatarmin](https://chatarmin.com/en/blog/whats-app-messaging-limits)
- [LGPD, ANPD e marketing por WhatsApp: base legal, opt-out e multas — SocialHub](https://www.socialhub.pro/blog/lgpd-2026-anpd-multa-whatsapp-marketing-pme-base-legal-consentimento/)
- [Opt-in e opt-out no WhatsApp Business sob a LGPD — SocialHub](https://www.socialhub.pro/blog/opt-in-opt-out-whatsapp-business-lgpd-2026/)
- [Meta frequency capping para mensagens de marketing — AiSensy](https://m.aisensy.com/blog/meta-frequency-capping-for-whatsapp-marketing-messages/)
