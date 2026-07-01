# AutoConf → AutoDrive — extensão de importação (v0.1, modo teste)

Lê as negociações do **AutoConf** (usando a sua sessão já logada) e prepara a
importação no AutoDrive para gerar comissão. **Esta versão 0.1 é só leitura
(dry-run): não grava nada no AutoDrive** — serve para validar a extração.

## O que ela faz (v0.1)
- Varre `GET /api/ui/v1/negociacoes` do **mês atual**.
- Filtra os status **Finalizada, Pendente Contrato, Pendente NFe**.
- Abre o **resumo** de cada negociação e pega o **vendedor que realizou** (campo real da comissão).
- Mostra a contagem por tipo/status e deixa **baixar um JSON** com tudo normalizado.

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
