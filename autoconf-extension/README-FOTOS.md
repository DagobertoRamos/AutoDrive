# Tratamento de fotos dos veículos

Módulo da extensão que pega as fotos dos carros que entraram pelo estoque dos
parceiros, trata no chat que você configurou e publica no site já com o fundo
de estúdio da Auto Drive.

Arquivos: `fotos-core.js` (service worker), `fotos-chat.js` (dentro da aba do
chat), seção "Tratamento de fotos dos veículos" em `popup.html` / `popup.js`.
Do lado do site: `src/lib/vehicle-photos.ts`, `/api/admin/photo-queue` e
`/api/admin/vehicles/{id}/photos`.

---

## O que acontece quando você clica em "Tratar agora"

1. **Retoma o que ficou no meio** — veículos em `EM_TRATAMENTO` vêm primeiro.
2. **Lê a fila** em `/api/admin/photo-queue`.
3. **Abre o grupo de abas** "AutoDrive — Tratamento de fotos" (painel + chat).
4. **Baixa as fotos da origem** em
   `Downloads/<raiz>/<parceiro>/<PLACA - carro>/nao tratadas/01.jpg…`
5. **Trava o veículo** em `EM_TRATAMENTO`, antes de começar.
6. **Manda UMA foto por mensagem**, espera a imagem, salva em `.../tratadas/`
   e já hospeda no site. Repete para cada foto.
7. **Publica**: troca a galeria pelas tratadas, apaga as antigas e mantém a trava.

### Por que uma foto por mensagem

Porque o chat devolve **uma imagem por mensagem**, não importa quantas você
anexe. Medido na conversa real: turno com 9 anexos voltou com 1 imagem; turno
com 6 anexos, 1 imagem. Mandar em lote era o que trazia uma arte solta em vez
da galeria.

Consequência prática: **um carro de 25 fotos são 25 idas e voltas**, cada uma
levando de 1 a 4 minutos. Passa de uma hora por carro. Por isso:

- o veículo é travado **desde o começo** (a sincronização roda a cada 15 min e
  devolveria as fotos do parceiro por cima do trabalho em andamento);
- cada foto tratada é hospedada **assim que chega**, e o progresso fica salvo;
- se a rodada cair na foto 18, a próxima **retoma da 18**, não do zero.

A trava do passo 7 é o que impede o ciclo infinito. Sem ela, a sincronização
devolveria as fotos do parceiro por cima das tratadas, e o mesmo carro voltaria
para a fila para sempre.

### O que a tela do chat exige (conferido em 17/09/2026)

| Detalhe | Por que importa |
| --- | --- |
| A imagem gerada fica em `div[class*="imagegen-image"]`, `alt="Imagem gerada"` | **Não** está dentro de `[data-message-author-role="assistant"]`. Era aqui que a rodada morria: a colheita voltava vazia. |
| Só vale imagem renderizada com 200px ou mais | Das 16 `<img alt="Imagem gerada">` da página, 14 são miniaturas do editor. |
| Enquanto gera, o botão de enviar **vira** o de parar | Mesmo `form button[type=submit]`, com `data-testid="stop-button"`. Clicar nele abortava a geração. |
| Existem 5 `input[type="file"]` | O que serve é o de dentro do `<form>`. |
| A imagem vem de `chatgpt.com/backend-api/estuary/...` | Mesma origem da aba, com assinatura. Responde 200 com `image/png` de ~2 MB — cabe no limite de 8 MB do site. |

### As pastas

```
Downloads/
└── AutoDrive/estoque/
    ├── Tchesco Car/
    │   └── DIO7790 - Chevrolet Celta Life 1.0 2008/
    │       ├── nao tratadas/01.jpg 02.jpg …
    │       └── tratadas/01.png 02.png …
    ├── Now Car/
    │   └── ABC1D23 - Fiat Argo Drive 2021/
    └── particular/
        └── XYZ9K87 - Honda Civic EXL 2019/
```

Parceiro sem nome cai em `particular`; estoque próprio vai para `autodrive`.
A placa vem primeiro no nome porque é o que se procura no Explorer.

O botão **"Baixar pasta"** no painel do site gera exatamente esta mesma
estrutura dentro de um ZIP — mesma função de nome dos dois lados, para a pasta
baixada pelo site e a criada aqui serem a mesma coisa.

---

## A capa com o nome da loja

As duas origens que o Beto apontou traziam, como **primeira foto**, material de
marketing do parceiro — e era isso que virava a capa do carro no site da Auto
Drive:

| Origem | O que vinha na capa | Como é reconhecido |
| --- | --- | --- |
| **Now Car** (BNDV) | `sites-logo/clientes/766/logo.jpeg`, o logotipo da loja | caminho de logotipo/banner |
| **Tchesco Car** (AutoConf) | composição com "TCHESCOCAR MULTIMARCAS", tapa-placa da loja e tarja "CARRO DE REPASSE" | `.png` no meio de `.jpeg` |

Conferido em 18 veículos do Tchesco Car: **nenhuma foto crua veio em PNG**, e
todo PNG era arte da loja. No BNDV o logotipo aparecia antes das fotos do carro
no HTML, então virava `image_url`.

Regra implementada em `src/lib/vehicle-photos.ts` e usada por todo mundo — site,
sincronização, fila de tratamento e o ZIP do painel. A extensão **não** refiltra
nada: recebe a fila já limpa, justamente para as duas pontas não divergirem.

Duas exceções pensadas:

- **PNG tratado por nós não é descartado.** A regra do PNG só vale nos hosts do
  AutoConf; foto que voltou do chat mora em `/api/uploads/<uuid>.png`.
- **Carro que só tem arte** continua mostrando a arte no site (melhor do que
  card vazio), mas **nunca** entra na fila de tratamento. O painel avisa quantos
  estão nessa situação, para receberem foto nova pelo botão "Subir novas fotos".

---

## Configuração

| Campo | Para que serve |
| --- | --- |
| Endereço do site | Onde estão a fila e as APIs. Usa a sessão de admin já aberta no navegador. |
| Endereço do chat | A conversa que já conhece o padrão do estúdio. **Nada fica fixo no código.** |
| Pasta raiz | Dentro de Downloads. Padrão: `AutoDrive/estoque`. |
| Veículos/rodada | Quantos carros por clique. |
| Fotos por mensagem | Tamanho do lote anexado. 28 fotos de uma vez estouram o limite de anexo e deixam a resposta difícil de casar foto a foto. |
| Espera máxima | Quanto tempo aguardar a resposta antes de desistir daquele lote. |
| Comando | O texto enviado junto com as fotos. |
| Tratar e publicar sozinho | Desligado, o módulo só baixa e deixa o comando pronto para colar. |

A configuração é lida do `storage`, não da tela — por isso "Tratar agora" salva
antes de começar. Sem isso, mudar o comando e clicar direto usaria o antigo.

---

## Quando alguma coisa dá errado

- **"Não autorizado no painel"** — faça login em `/admin/login` na mesma janela.
- **"compositor do chat não encontrado"** ou **"botão de enviar não encontrado"**
  — a tela do chat mudou. Desligue "tratar e publicar sozinho" e trabalhe no
  modo manual (ele continua baixando e organizando tudo) até os seletores de
  `fotos-chat.js` serem ajustados.
- **"o chat não devolveu as fotos em N min"** — aumente a espera máxima ou
  diminua as fotos por mensagem.
- **"nenhuma tratada subiu para o site"** — as fotos ficaram salvas no disco, em
  `tratadas`. Dá para subir pelo painel, no botão "Subir novas fotos".
- **Um carro falhar não derruba a rodada.** O erro vai para o registro e o
  próximo veículo continua. Nada fica travado pela metade: a trava só acontece
  junto com a publicação.

O botão **Parar** encerra ao terminar o lote em andamento. Fechar o popup não
interrompe nada — o trabalho roda no service worker, e reabrir volta a
acompanhar.

---

## Sobre automatizar o chat

A extensão opera a sessão que já está aberta no navegador, fazendo os mesmos
cliques que a pessoa faria, em volume de algumas dezenas de fotos por rodada.
Não contorna login, captcha nem proteção nenhuma.

Ainda assim é interface de terceiro, que muda sem aviso — daí o modo manual
continuar existindo, e cada seletor ser uma lista de tentativas com erro que
diz qual peça faltou. Quando houver chave da API de imagens, só o passo 4 muda:
todo o resto (fila, pastas, trava, publicação) continua igual.

---

## Permissões novas nesta versão

`host_permissions` ganhou o chat (`chatgpt.com`, `chat.openai.com`,
`*.oaiusercontent.com`) e os CDNs de foto dos parceiros (autoconf, bndv,
blob.core.windows.net, supabase). Os CDNs são necessários porque o service
worker busca a foto para anexar no chat; a lista é a mesma do `img-src` do site,
em `next.config.ts`.
