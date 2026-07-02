# AutoConf → AutoDrive — extensão de importação (v0.3.6)

Lê negociações do **AutoConf** usando a sessão já logada no navegador e envia para o
**AutoDrive** pelo endpoint `POST /api/integrations/autoconf/deals`.

A importação cria ou atualiza negociações no AutoDrive e mantém deduplicação pelo
identificador do AutoConf (`AC-<id>`), então reimportar o mesmo filtro não duplica.

A partir da v0.3.3, a extensão também tenta capturar os detalhes reais do resumo
da negociação no AutoConf: dados do cliente, data real da negociação, pagamentos,
débitos, tabelas, campos do formulário e metadados estruturados disponíveis.

## Como instalar

1. No Chrome, abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `autoconf-extension`.
5. Fixe a extensão na barra do Chrome, se quiser.
6. Ao clicar no ícone com o AutoConf aberto, a interface abre em uma nova aba na
   mesma janela do Chrome.

## Pré-requisitos

- Estar logado no AutoConf em uma aba de `https://app.autoconf.com.br`.
- Ter o token de integração do AutoDrive.
- Não é necessário informar nem salvar senha do AutoConf.

## Fluxo de uso

1. Abra o AutoConf logado.
2. Abra a extensão.
3. Informe o token do AutoDrive e clique em **Salvar**.
4. Escolha o tipo de busca e os filtros.
5. Clique em **1) Buscar negociações filtradas**.
6. Confira o resumo e, se quiser, baixe o JSON ou veja um exemplo.
7. Clique em **2) Prévia no AutoDrive** para validar sem gravar.
8. Clique em **3) Importar tudo** para gravar no AutoDrive.

## Aba própria

A extensão não usa mais o popup padrão preso ao ícone do Chrome. O clique no
ícone abre uma aba da extensão na mesma janela onde o AutoConf está aberto.

Recomendado:

1. Abra o AutoConf logado em uma aba.
2. Com essa aba aberta, clique no ícone da extensão.
3. Deixe a aba da extensão aberta enquanto busca, confere ou usa atualização
   automática.

Se a extensão não encontrar a aba do AutoConf, recarregue a aba do AutoConf e
clique novamente no ícone.

## Tipos de busca

### Mês atual

Usa automaticamente o primeiro e o último dia do mês atual. É o comportamento
compatível com a versão anterior.

### Mês/Ano

Escolha o mês e informe o ano, por exemplo:

- mês: Junho
- ano: 2026

A extensão buscará todas as negociações criadas em `06/2026`.

### Ano completo

Informe o ano, por exemplo `2026`. A extensão buscará de `01/01/2026` até
`31/12/2026`.

### Período personalizado

Informe data inicial e final no formato `dd/mm/aaaa`, por exemplo:

- `01/06/2026`
- `30/06/2026`

A data final é inclusiva.

## Filtros complementares

### Status

Por padrão vêm marcados:

- Finalizada
- Pendente Contrato
- Pendente NFe

Também é possível marcar **Todos** para não filtrar status.

### Tipo

Pode filtrar por:

- Venda
- Troca
- Compra
- Consignação
- outro tipo digitado manualmente

Se deixar como **Todos**, nenhum filtro de tipo é aplicado.

### Loja/unidade

Filtro por texto no nome da loja/unidade detectada na negociação.

### Vendedor

O vendedor real é detectado abrindo o resumo da negociação. Por isso a extensão:

1. filtra primeiro por período, status, tipo, loja, cliente e placa;
2. abre o resumo das candidatas;
3. aplica o filtro de vendedor depois.

### Cliente

Busca no nome do cliente, e-mail e contato quando esses campos aparecem na lista
do AutoConf.

### Placa

Busca nas placas dos veículos de saída e de entrada. A comparação ignora hífen,
espaços e diferença entre maiúsculas/minúsculas.

### Sem vendedor

A opção **Incluir negociações sem vendedor detectado** vem marcada por padrão.
Se desmarcar, negociações sem vendedor lido no resumo são removidas do resultado.

## Resumo mostrado

Ao terminar, a extensão mostra:

- quantidade de negociações encontradas;
- período filtrado;
- páginas lidas;
- total de registros varridos;
- total por status;
- total por tipo;
- total por loja;
- quantidade sem vendedor;
- filtros aplicados.

O log mostra progresso por página e progresso da leitura de vendedor.

## Dados completos da negociação

Para cada negociação candidata, a extensão abre o resumo no AutoConf e tenta
capturar:

- vendedor real;
- data real da negociação;
- data de aprovação/finalização quando aparece;
- dados do cliente: nome, CPF/CNPJ, telefone, e-mail e endereço;
- pagamentos feitos ou previstos;
- débitos pagos/assumidos;
- veículos de entrada e saída;
- campos, tabelas e textos estruturados do resumo.

Esses dados entram no JSON baixado e também são enviados para o AutoDrive. No
AutoDrive, quando presentes, são usados para preencher:

- `saleDate`, `approvedAt` e `finalizedAt`;
- `Customer`;
- `DealPayment`;
- `DealDebt`;
- totais de pagamentos e débitos;
- auditoria da negociação com o detalhe completo capturado do AutoConf.

Como o AutoConf pode mudar o HTML do resumo, a leitura é defensiva: se algum
campo não for encontrado, a importação continua com os dados disponíveis.

## Atualização automática

A seção **Atualização automática** permite buscar novamente conforme os filtros
atuais a cada X minutos.

- Marque **Atualizar sozinho**.
- Informe o intervalo em minutos.
- A aba mostra a contagem até a próxima busca.
- A atualização automática apenas refaz a busca e atualiza o resumo.
- Ela **não importa automaticamente** para o AutoDrive.

Para parar, desmarque **Atualizar sozinho** ou feche a aba da extensão.

## Baixar JSON

O arquivo baixado usa o período no nome:

- `autoconf-negociacoes-2026-06.json`
- `autoconf-negociacoes-2026.json`
- `autoconf-negociacoes-2026-06-01-a-2026-06-30.json`

## Prévia e importação

A prévia envia:

```json
{
  "rows": [],
  "dryRun": true,
  "filters": {},
  "period": {}
}
```

A importação definitiva envia o mesmo corpo com `dryRun: false`.

O endpoint atual do AutoDrive continua sendo:

```txt
POST https://auto-drive-mocha.vercel.app/api/integrations/autoconf/deals
```

Headers:

```txt
Content-Type: application/json
x-autoconf-token: <token>
```

Campos extras como `filters` e `period` são metadados para auditoria/diagnóstico e
não mudam a deduplicação.

## Limite e segurança

- A extensão usa a sessão logada da aba do AutoConf.
- Não salva senha do AutoConf.
- Faz pausas curtas entre chamadas.
- Não busca histórico infinito.
- O limite atual é `MAX_PAGES = 500`.
- Se o limite for atingido, o resumo mostra um aviso para refinar o filtro.
- Períodos grandes, como um ano inteiro, podem demorar.

## Testes sugeridos

1. Carregar a extensão no Chrome.
2. Abrir o AutoConf logado.
3. Buscar mês atual.
4. Buscar um mês/ano específico.
5. Buscar ano completo.
6. Buscar intervalo `dd/mm/aaaa` até `dd/mm/aaaa`.
7. Testar data inicial maior que data final.
8. Filtrar por status.
9. Filtrar por tipo.
10. Filtrar por vendedor.
11. Filtrar por loja.
12. Filtrar por cliente.
13. Filtrar por placa.
14. Testar incluir e excluir negociações sem vendedor.
15. Baixar JSON.
16. Ver um exemplo.
17. Fazer prévia no AutoDrive.
18. Importar definitivamente.
19. Reimportar o mesmo resultado e confirmar que não duplica.
20. Confirmar que o popup não quebra quando não encontra nada.
21. Clicar em outra aba e confirmar que a aba da extensão continua aberta.
22. Ativar atualização automática com intervalo curto e confirmar nova busca.

## Permissões

As permissões do Manifest V3 permanecem as mesmas:

- `storage`
- `activeTab`
- `downloads`

Host permissions:

- `https://app.autoconf.com.br/*`
- `https://auto-drive-mocha.vercel.app/*`

## Changelog

### v0.3.6 — pagamentos/débitos reais (Títulos Financeiros) + histórico de auditoria

- **Nova fonte de pagamentos/débitos:** a extensão agora abre "Visualizar
  títulos financeiros" de cada negociação (mesmo menu "..." do AutoConf) e lê
  o **ledger real** — data, contraparte (CPF/CNPJ + nome), descrição,
  categoria, valor com sinal, status confirmado/pendente. É a fonte oficial de
  pagamentos e débitos (receita = `/a-receber/`, despesa = `/a-pagar/`, dá pra
  ver pelo link "Ver" de cada linha), muito mais confiável que adivinhar
  tabelas soltas do resumo (que geralmente vinham vazias: `pagamentos: []`,
  `debitos: []`). Essa fonte agora tem prioridade; o scrape antigo do resumo
  vira só um fallback se a página de títulos vier vazia.
- **Novo campo `historico`:** lê "Visualizar histórico" (trilha de auditoria:
  quem cadastrou/alterou o quê, quando — até 60 registros por negociação) e
  guarda um resumo em texto puro. É só informativo — fica no JSON baixado
  localmente, **não é enviado ao AutoDrive** (mantém o payload enxuto).
- Testado ao vivo contra uma negociação real com 2 recebimentos (Pix +
  Pix-sinal, ambos confirmados) e débitos de veículo (Gestauto, Documentação)
  — todos os valores/datas/status bateram exatamente com o que aparece na
  tela do AutoConf.

### v0.3.5 — CPF/CNPJ, endereço, cidade, estado e CEP do cliente vinham `null`

- **Causa:** a seção "Cliente" do resumo do AutoConf **não usa "chave: valor"**
  — é uma pilha de linhas soltas (nome, CPF/CNPJ, endereço, cidade-UF, CEP,
  cada um em uma linha, sem rótulo). O scraper antigo só sabia ler pares no
  formato "chave: valor" (dt/dd, tabela de 2 colunas, texto com `:`), então
  nunca encontrava esses campos.
- **Correção:** novo extrator `extractClientBlockFromText()` que lê o **texto
  puro** do resumo, localiza a seção do cliente pela posição real ("Cliente" /
  "Editar") e classifica as linhas seguintes por **padrão** (CPF `000.000.000-00`,
  CNPJ `00.000.000/0000-00`, CEP `00000-000`, "Cidade-UF"), robusto mesmo
  quando algum campo falta. Testado com cliente pessoa física (CPF) e pessoa
  jurídica (CNPJ) — todos os campos vieram corretos.
  - A página tem **duas** ocorrências do rótulo "Cliente" (uma no menu lateral,
    sem relação com o cliente da negociação); o extrator usa a que vem seguida
    de "Editar" pra achar a seção certa, com fallback pra última ocorrência.
  - CEP é dobrado dentro do campo `endereco` antes de enviar ao AutoDrive (o
    `Customer` do AutoDrive não tem coluna própria de CEP).
- **Sobre "(NÃO ACHADO: —)" no vendedor:** investigado e **não é bug** — são
  negociações **canceladas**, onde o próprio AutoConf mostra literalmente
  "**---**" no campo "Vendedor que realizou a negociação" (sem vendedor
  atribuído). O extrator está reportando certo.

### v0.3.4 — correção de HTTP 413 e nome de cliente incorreto

- **HTTP 413 (payload grande demais) ao importar muitas negociações:** cada
  negociação carregava, duplicado, o dump bruto da página do resumo (tabelas,
  formulários, JSON embutido, até 30 mil caracteres de texto). Com dezenas/
  centenas de negociações num único envio, o corpo da requisição estourava o
  limite da Vercel. Corrigido em duas frentes:
  - o envio ao AutoDrive agora manda só os campos que a API realmente usa
    (remove os dumps de diagnóstico, que ficam só no JSON baixado localmente);
  - o envio é feito em **lotes de até 20 negociações** por requisição, o que
    também evita estourar o tempo máximo (60s) da função na Vercel em
    importações grandes. A importação continua idempotente (dedup por
    `AC-<id>`), então reenviar após um erro de lote é seguro.
- **Nome do cliente incorreto** (ex.: aparecia um texto de "Limite reserva em:
  ... Imprimir recibo Ver comprovante" no lugar do nome real): a raspagem do
  resumo procurava qualquer bloco de texto que contivesse a palavra "cliente",
  o que podia casar avisos e textos da interface sem relação com o cliente.
  Corrigido: os campos `nome`/`email`/`telefone` do cliente agora vêm
  **primeiro da API de lista do AutoConf** (já confiável e estruturada); o
  scrape do resumo só complementa dados que a lista não tem (CPF/CNPJ,
  endereço, cidade, estado) e passa por um filtro que rejeita textos que
  parecem lixo de interface.
