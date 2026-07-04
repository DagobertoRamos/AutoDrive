# Responsividade AutoDrive

Este documento define o padrao de responsividade para novas telas e para revisoes incrementais das telas existentes.

## Fase 1 - base global

Use os componentes de `src/components/ui/responsive.tsx` antes de criar novos wrappers locais:

- `PageContainer`: largura maxima, padding responsivo e protecao contra overflow horizontal.
- `ResponsiveGrid`: 1 coluna no mobile, 2 no tablet e ate 4 no desktop.
- `ResponsiveCard`: card sem largura fixa, com padding adaptavel e `min-w-0`.
- `ResponsiveActions`: botoes empilhados no mobile e em linha no desktop.
- `ResponsiveTable`: tabela no desktop e cards no mobile.
- `ResponsiveModalFrame` e `ResponsiveModalFooter`: modal com limite de altura, scroll interno e rodape acessivel.
- `ResponsiveTabs`: abas com scroll controlado no mobile.
- `ResponsiveDashboardSection`: secao de dashboard com titulo, descricao e acoes responsivas.

## Regras para telas novas

1. Comece pelo celular.
2. Evite `width` fixo maior que o viewport.
3. Todo container que recebe conteudo dinamico deve ter `min-w-0`.
4. Tabelas precisam usar `ResponsiveTable` ou scroll horizontal contido.
5. Modais precisam usar altura maxima e scroll interno.
6. Acoes principais devem ficar visiveis e com area de toque confortavel.
7. Nomes longos, placas, emails, telefones e observacoes devem quebrar linha sem vazar.
8. Nao use cards dentro de cards para estruturar pagina inteira.
9. Nao altere regra comercial, tenant ou permissao para corrigir layout.
10. Quando uma tela existente for revisada, registre no README_ROBOTS.md o modulo e os breakpoints testados.

## Breakpoints de QA

Validar manualmente, sempre que possivel:

- 320px
- 360px
- 375px
- 390px
- 414px
- 430px
- 768px
- 820px
- 1024px
- 1280px
- 1366px
- 1440px
- 1536px
- 1920px

## Checklist por tela

- A pagina nao cria scroll horizontal no `body`.
- Cards nao ficam sobrepostos.
- Botoes principais nao ficam cortados.
- Modais cabem na tela e tem rodape acessivel.
- Tabelas nao estouram o layout no mobile.
- Filtros nao ficam espremidos em uma linha no celular.
- Textos longos quebram sem vazar.
- Menus e drawers continuam clicaveis por toque.
- Estados vazios, loading e erro tambem cabem no mobile.
- Zoom do navegador nao esconde acoes criticas.

## Modulos prioritarios para as proximas fases

1. Dashboard da fila e modais da fila.
2. Central de Pendencias.
3. Negociacoes e filtros.
4. Comissoes e Plano de Comissao.
5. Financeiro e relatorios.
6. Configuracoes e permissoes.
7. CRM/Leads quando o modulo evoluir.

## Observacao de coordenacao

Ha trabalho recente e ativo na fila registrado nos logs 0175-0183. Evite mexer nos arquivos da fila sem revisar o diff atual e sem validar que nao esta sobrescrevendo outra IA.
