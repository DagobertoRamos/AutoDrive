# F&I — situação da plataforma (auditoria de 15/10/2026)

Documento de referência do módulo de financiamento de veículos (F&I). Diz o que funciona, o que foi feito nesta rodada e o que depende de terceiros (bancos, contratos, credenciais).

## 1. Arquitetura (o que já existe e foi preservado)

- **Multi-loja (BYOC):** cada loja cadastra as próprias credenciais de banco.
  - Ficam cifradas (AES-256-GCM) em `FinanceCredential` e são abertas só no momento da chamada (`gateway/resolve.ts`).
  - A plataforma nunca usa credencial de uma loja para outra.
- **Gateway único de bancos:** `src/lib/finance/fi/gateway/`.
  - O contrato é `BankProvider`, com 11 capacidades declaradas.
  - Banco sem API oficial responde "Banco ainda não integrado" e a ficha segue em modo manual.
  - Não há integração falsa nem automação de tela de banco.
- **Orquestrador** (`fi/orchestrator.ts`):
  - envio a vários bancos com chave de idempotência, trava por ficha e controle de revisão;
  - máquinas de estado da tentativa, da formalização, do gravame e do pagamento (`status-core.ts`);
  - timeout com "verificar antes de reenviar".
- **Webhook** (`/api/webhook/financing/[provider]`): assinatura HMAC ou chave por loja, deduplicação e escopo por canal.
- **Portal do cliente:** link com hash, para o cliente acompanhar, enviar documentos e completar a ficha.
- **Simulação do site:** simulação automática, com consentimento e limite por IP.
- **Financeiro:** a ficha aprovada vira recebimento na negociação, e o painel acompanha retorno, PLUS e estorno.
- **LGPD:**
  - consentimento registrado em cada envio (base legal, versão da política, IP, bancos);
  - CPF mascarado para perfis sem acesso a documentos;
  - retenção dos arquivos de documentos;
  - auditoria das ações críticas.

## 2. Conectores de banco

| Banco | Situação | Capacidades pela API |
|---|---|---|
| BV | Oficial (Parceiros F&I) | pré-análise, envio, webhook SOAP |
| PAN | Oficial (OpenAPI Veículos, Documentação v4) | pré-análise, envio, consulta de status, link de formalização |
| Santander, Itaú, Bradesco, C6, Safra, Daycoval | Sem API pública: modo manual | — |
| Agregador | Ponto de extensão (ex.: contrato com a Credere) | — |
| Banco de testes | Só fora de produção | todas, para testes |

## 3. O que foi feito nesta rodada

**Funções dos conectores que existiam mas ninguém chamava, agora ligadas ao fluxo:**
- **Pré-análise:** botão "Pré-análise" na ficha e `POST /api/financing/proposals/[id]/pre-analysis`.
  - Exige a autorização do cliente e grava o consentimento.
  - Vai para a linha do tempo e a auditoria.
  - Não cria proposta.
- **Consulta de status:**
  - botão "Atualizar situação" para propostas em análise em bancos que permitem consulta;
  - a rotina periódica passa a consultar sozinha os bancos sem webhook (PAN).
- **Formalização digital:**
  - `POST /api/financing/proposals/[id]/formalization-link` pede ao banco o link de documentos e assinatura;
  - o link aparece no painel de formalização e no portal do cliente ("Assinar o contrato");
  - a etapa passa a "Aguardando assinatura".
- **Retorno da loja por oferta:** cada oferta do banco recebe o % da regra de Configurações › Retornos (banco + prazo). Antes ficava vazio, e o ranking "melhor retorno" e o painel não tinham dado.

**Segurança e dados:**
- `/api/financing/proponents`:
  - passa pela guarda do F&I (capacidades `criarFicha`/`editarFicha` e loja ativa);
  - CPF/CNPJ, RG e renda vêm mascarados para quem não pode acessar documentos.
- **Webhook:** evento que falhou é reprocessado quando o banco reenvia. Antes era descartado como duplicado.
- **Retenção de documentos:** apagar o arquivo vencido não reabre mais a pendência de um documento já aprovado.
- **Rotina do F&I:** o segredo do cron é comparado em tempo constante.

**Testes:**
- 3 novos testes de integração em Postgres: retorno, reprocessamento do webhook, pré-análise e formalização.
- Suíte de `src/lib/finance`: 322 testes passando.

## 4. O que depende de terceiros

| Item | Depende de | Caminho |
|---|---|---|
| Santander, Itaú, Bradesco, C6, Safra, Daycoval, Omni, bancos de montadora, Porto, Mercado Pago, Creditas | Nenhum publica API de financiamento de veículo | Contrato de parceria com cada banco ou com um agregador (Credere, QI Tech, Serasa MOVA). O conector entra no gateway sem mudar telas. |
| PAN em produção | Credencial de sandbox (pedido em bancopanprd@service-now.com com aval do gerente comercial) e homologação | Validar os TODOs em `gateway/pan*.ts`: lista de status, URL de produção, versão Molicar |
| BV em produção | Credenciamento F&I e certificado mTLS da loja | Homologar com o BV |
| Assinatura eletrônica própria (contratos da loja) | Conta da loja no provedor | Clicksign, ZapSign, D4Sign, Autentique e DocuSign têm API pública com sandbox. A integração é a próxima etapa. |
| Gravame / registro de contrato | Só a instituição credora registra (Res. CONTRAN 807/2020) | O SaaS acompanha o status; não registra |
| Open Finance | Não serve para originar financiamento de veículo | Pode servir para dados de crédito com consentimento, numa etapa futura |

## 5. Pendências técnicas conhecidas

- **CPF e renda sem cifra no banco de dados.** Hoje só são mascarados na saída. Cifrar em coluna exige migração e índice cego para a busca.
- **Consentimento apagado junto com o proponente** (`onDelete: Cascade`). A evidência deveria sobreviver, o que exige migração.
- **Sem pedido do titular** (acesso, correção, eliminação) e sem anonimização após o prazo legal.
- **BV sem consulta de status.** Uma tentativa que estoura o tempo depende do webhook ou de registro manual.
- **Webhook ainda aceita o cabeçalho legado `x-webhook-secret`** com a chave da plataforma, e não checa carimbo de tempo.
- **Código legado sem uso:** `src/lib/finance/adapters/*`, `resolve-adapter.ts` e `FinanceRoutingRule`.
