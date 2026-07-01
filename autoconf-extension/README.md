# AutoConf → AutoDrive — extensão de importação (v0.2)

Lê as negociações do **AutoConf** (usando a sua sessão já logada) e **importa no
AutoDrive** (cria/atualiza as negociações, base para a comissão).

## O que ela faz (v0.2)
- Varre `GET /api/ui/v1/negociacoes` do **mês atual**.
- Filtra os status **Finalizada, Pendente Contrato, Pendente NFe**.
- Abre o **resumo** de cada negociação e pega o **vendedor que realizou** (campo real da comissão).
- Envia ao AutoDrive (`POST /api/integrations/autoconf/deals`) com o **token** — em **Prévia** (não grava, só mostra o que faria) ou **Importar** (grava).
- Dedup por `AC-<id>` (reimportar atualiza, não duplica).

## Fluxo de uso (3 passos)
1. **Salvar o token** do AutoDrive (campo no topo → Salvar). Peça o token ao suporte/admin.
2. **Ler negociações do mês** (passo 1).
3. **Prévia no AutoDrive** (passo 2 — confere unidade/vendedor sem gravar) → **Importar** (passo 3 — grava).

## Como instalar (carregar sem empacotar)
1. No Chrome, abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique **Carregar sem compactação** e selecione esta pasta `autoconf-extension`.
4. A extensão aparece na barra (ícone de quebra-cabeça → fixe-a).

## Como usar
1. Abra **https://app.autoconf.com.br/negociacao** e faça login (se já não estiver).
2. Com essa aba ativa, clique no ícone da extensão → **"Ler negociações do mês (teste)"**.
3. Acompanhe o progresso; ao final veja a contagem e clique **"Baixar JSON"** para conferir os dados.
4. Me mande o JSON (pode mascarar nomes/CPF) para ajustarmos o mapeamento final.

## Próximas fases
- **v0.2:** endpoint `POST /api/integrations/autoconf/deals` no AutoDrive (token por loja) reusando o `sheets-deal-processor` → cria/atualiza Deal (`source AUTOCONF`, `originRecordId`) → gera comissão.
- **v0.3:** sincronização automática + financiamento/retorno (módulo Financiamento do AutoConf).

## Notas
- Não guarda senha nem token do AutoConf — usa a sessão viva da aba.
- Respeita o servidor: faz pausas curtas entre as chamadas.
- `isVendaComissionada` do AutoConf veio sempre `false` (mesmo em venda finalizada) — por isso **não** é usado como gatilho; o gatilho é `tipo=Venda` + status fechado.
