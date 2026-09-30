# Documentos do Jotform → aba Contratos do AutoConf

Sobe o PDF assinado dos formulários do Jotform para a negociação certa do AutoConf,
como documento do tipo **Outros**. Hoje são dois:

| formulário | documento no AutoConf | onde anexa |
|---|---|---|
| **Check-list de entrega técnica** (`242636544600049`) | `Check list de entrega tecnica assinado` | negociação em que a placa está **na saída** (carro vendido) |
| **PROTOCOLO DE LAUDO** (`253485780669070`) | `Protocolo de laudo - ECV` / `- CAUTELAR` / `- AMBOS` | negociação **mais próxima da data**, compra ou venda |

O que não casar com segurança **não é anexado** — vai para a fila de revisão manual.

---

## Como usar

1. Deixe abertas e **logadas** as abas do Jotform e do AutoConf (se não estiverem,
   a extensão abre em segundo plano e fecha no fim).
2. Clique no ícone da extensão → **Abrir painel dos documentos**.
3. Escolha o formulário nas abas do topo.
4. **Simular** — nada é anexado; a tabela mostra o que subiria, o que já tem e o que
   precisa de revisão. Dá para baixar o CSV.
5. Conferiu? **Subir os pendentes**.
6. Opcional: ligue a **rotina automática** (padrão a cada 24 h) — ela roda os dois
   formulários e só trata o que é novo.

Filtros: `a partir de` (data do envio) e `limite` (conta anexos de verdade, então
`limite = 1` sobe exatamente um e para). **Limpar histórico** apaga só a memória da
extensão para o formulário aberto; nada é removido do AutoConf.

---

## O que a extensão faz por baixo

### Jotform (content script `jotform-checklist.js`)

| o quê | como |
|---|---|
| lista de envios | `GET /API/inbox/form/{formId}/submissions?limit=1000&orderby=created_at,desc` |
| PDF assinado | `GET /API/inbox/generatePDF?type=PDFv2&formid=…&submissionid=…&reportid=…&useNew=1&forDownload=1` |

O `reportid` é o **documento PDF customizado** do formulário — exatamente o que sai em
“⋮ → Baixar → *nome do documento*”. **Não é** o `/pdf-submission/{id}`, que é a
“Versão para impressão” e gera outro arquivo (no mesmo envio: 626 KB contra 682 KB).
Ids em uso: entrega `10242645391823056`, laudo `10253533054912049`. Se um documento for
recriado no Jotform o id muda: abra o menu com o DevTools na aba Network e leia o
`reportid` da chamada `/API/inbox/generatePDF`. De propósito **não há plano B** para o
`/pdf-submission`: anexar o documento errado calado é pior do que a linha cair como erro
e ser reprocessada.

qids conferidos na API:

- entrega: `26` placa, `3` cliente, `25` veículo, `9` vendedor, `6` data, `41`/`55` assinaturas.
- laudo: `13` placa, `12` veículo, `8` tipo de laudo, `17` vendedor, `7` data, `19`/`20` assinaturas.

É content script (e não fetch no service worker) porque a API e o PDF só respondem
com o cookie da sessão do Jotform — dentro da página a requisição é mesma-origem.

### AutoConf (content script `contrato-anexar.js`)

| o quê | como |
|---|---|
| busca por placa | `GET /api/ui/v1/negociacoes?page=1&q=PLACA` → `veiculosEntrada` / `veiculosSaida` / `tipo` / `status` / `criadoEm` / `cliente` |
| busca por cliente | mesma rota com o nome e com o sobrenome (só no resgate de placa errada) |
| documentos anexados | `GET /negociacao/{id}/contrato` (HTML — não existe API JSON); anexos são os itens da lista com link para o S3 |
| anexar | `POST /negociacao/{id}/contrato/store` (multipart): `_token` (CSRF), `tipo_documento_id=4` (Outros), `nome`, `documento_file` |

Depois de subir, a extensão **relê a lista** e só considera feito o que apareceu lá.

---

## Como a negociação é escolhida (`checklist-core.js`)

Regras comuns: **canceladas nunca entram**, e quando há mais de uma candidata vale a
mais próxima da data do documento. Duas candidatas do mesmo tipo a menos de 7 dias uma
da outra viram **AMBÍGUO** (ninguém recebe o anexo).

**Check-list de entrega** (`alvo: 'saida'`): a placa tem que ser a do carro vendido; a
negociação pode ser até 3 dias posterior ao checklist e até 240 dias anterior quando o
nome do cliente bate (45 dias quando não bate).

- **TCY3A71** — vendida em 12/08 (#770032), recomprada em 19/08 e revendida em 29/08 (#790272).
  O checklist de 12/08 tem que ir na **#770032**; “pegar a mais recente” erraria.
- **RTU9G33** — vendida em jun/26 (#709798) e de novo em 17/08/26 (#774853); checklist de 18/08 → **#774853**.
- **SVM8H14** — aparece em duas negociações: a compra (placa na entrada) é ignorada.
- **FHP1C66** — a placa digitada era o usado do Raimundo (#550873, troca do dia anterior);
  existia outra venda com a placa exata, de outro cliente, 18 dias depois — essa não pode ganhar o anexo.

**Protocolo de laudo** (`alvo: 'qualquer'`): o formulário não tem cliente, então a data é
o único sinal — vale a negociação mais próxima em até 180 dias para qualquer lado, seja a
compra ou a venda. Em empate técnico (menos de 15 dias entre uma compra e uma venda) fica
com a **venda**. Sem cliente para confirmar, o resgate de placa digitada errado fica
**desligado** nesse formulário.

- **GGI2D34** — laudo 25/04, venda 18/04 (7 dias) e compra 11/04 (14 dias) → venda **#653501**.
- **EZA3107** — laudo 05/05, compra 14/04 (21 dias) e venda só em 16/06 (42 dias) → compra **#648351**.

## Resgate de placa digitada errado (só no check-list de entrega)

Quando o caminho normal não acha nada (ou acha algo fora da janela), a extensão tenta
**uma segunda vez** — e aí o nome do cliente passa a ser obrigatório:

1. Busca também **pelo nome e pelo sobrenome** do cliente no AutoConf.
2. Aceita negociação cuja placa de saída difira da digitada por **1 caractere**
   (`FSR1884` × `FSR-1I84`) ou por **duas letras invertidas** (`QUI6I66` × `QIU-6I66`).
3. Aceita também quando a placa digitada é a do **usado que o cliente entregou na troca**
   (a negociação tem saída e o cliente é o mesmo): o checklist é dessa negociação.

Sem o nome batendo, nada disso vale. Na simulação de 08/09/2026 isso resolveu 14 dos 16
casos manuais; os dois que sobraram são legítimos (uma placa sem nenhuma negociação
parecida e um caso em que a venda foi **cancelada** e o carro acabou vendido para outra
pessoa — anexar seria errado).

## Como se detecta que já subiu

Cada formulário tem seu detector, porque o AutoConf já é cheio de documento parecido:

- **entrega** — só conta nome que fale de **entrega** + **técnica/check**. `CHECKLIST DE VENDA`,
  `CHECKLIST ENTRADA` e `PROCESSO DE VENDA` não contam; `CHECK-LIS DE ENTREGA TÉCNICA DO
  VEÍCULO` (subido à mão, com o typo) conta.
- **laudo** — conta qualquer `laudo`, `vistoria`, `inspecar`, `cautelar` ou `ecv` — inclusive o
  `PROTOCOLO INSPECAR` que a loja já subia à mão.

Além disso a extensão guarda em `chrome.storage` o que já processou, por formulário
(`submissionId → negociacaoId`), então nunca sobe duas vezes.

## Situações da tabela

| situação | significa |
|---|---|
| `VAI_SUBIR` | simulação: casou com uma negociação e o documento não existe lá |
| `ANEXADO` | subiu e foi confirmado na lista do AutoConf |
| `JA_TINHA` | a negociação já tem esse documento |
| `JA_PROCESSADO` | a extensão já tratou esse envio antes |
| `REVISAR` | `SEM_NEGOCIACAO_VENDA`, `AMBIGUO`, `FORA_DA_JANELA`, `PLACA_INVALIDA` — dá para resolver na mão |
| `NAO_ENCONTRADA` | a busca do AutoConf não devolve **nada** para a placa: negociação nunca cadastrada, carro de outra loja ou placa de teste. Não é decisão de anexo, por isso tem aba própria |
| `ERRO` | falha de rede/sessão; a rodada seguinte tenta de novo |

A coluna de detalhe marca os casos fora do padrão: `placa_corrigida`, `placa_do_usado`
e `na_compra`.

## Retrato das bases (levantado em 08/09/2026)

- **Entrega**: 252 envios (set/2024 → set/2026), 248 placas únicas. Simulação: 186 a subir,
  60 já resolvidos, 4 já tinham, 2 em revisão, 0 erros.
- **Laudo**: 125 envios (dez/2025 → mai/2026), 125 placas válidas, 6 sem assinatura.
  Tipos: 105 ECV, 18 CAUTELAR, 2 AMBOS. Simulação: 51 a subir, 67 já tinham, 7 em revisão
  (5 deles placas que o AutoConf não conhece), 0 erros.

Validações que a simulação do laudo trouxe:

- **QNW5871** tem dois laudos: o CAUTELAR de 20/12 foi para a **compra** (#549562, mesmo dia)
  e o ECV de 06/02 para a **venda** (#586900, do dia anterior). A regra separa sozinha.
- **FVF5J10** (laudo 32 dias depois) caiu na troca #549562, que é justamente onde esse carro
  saiu vendido — e a placa de entrada dessa troca é o QNW-5871 acima.
- **QUZ3J44** e **FDH6J08** são erros de digitação (`QUZ-3944` → #559327, `FDH-6J09` → #588869),
  mas ficam manuais: sem nome de cliente não há como confirmar o palpite.

## Testes

```bash
node teste-core.js   # regras de escolha e de detecção dos dois formulários
```
