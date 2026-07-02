# AutoConf → AutoDrive — extensão de importação (v0.3)

Lê negociações do **AutoConf** usando a sessão já logada no navegador e envia para o
**AutoDrive** pelo endpoint `POST /api/integrations/autoconf/deals`.

A importação cria ou atualiza negociações no AutoDrive e mantém deduplicação pelo
identificador do AutoConf (`AC-<id>`), então reimportar o mesmo filtro não duplica.

## Como instalar

1. No Chrome, abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `autoconf-extension`.
5. Fixe a extensão na barra do Chrome, se quiser.

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

## Permissões

As permissões do Manifest V3 permanecem as mesmas:

- `storage`
- `activeTab`
- `downloads`

Host permissions:

- `https://app.autoconf.com.br/*`
- `https://auto-drive-mocha.vercel.app/*`
