# Plano de profissionalização da fila

## 1. Objetivo
Transformar a fila de atendimento em um módulo estável, configurável, leve e preparado para operação real, sem depender de alterações de código para pequenas mudanças de regra.

## 2. Princípios
- Centralizar a lógica de estado em um único ponto.
- Tratar a fila como um motor de estados e transições.
- Colocar regras operacionais em configuração.
- Mover tarefas automáticas para processamento assíncrono.
- Usar tempo real sem polling excessivo.
- Garantir auditoria, observabilidade e segurança.

## 3. Fase 1 — Estabilização da fila
### Objetivo
Tornar a fila previsível, consistente e segura.

### Entregáveis
- Estados bem definidos para cada participante.
- Regras de transição centralizadas.
- Validação de ações inválidas.
- Auditoria de cada mudança.

### Ações
1. Definir estados oficiais:
   - WAITING
   - CALLED
   - ACCEPTED
   - IN_ATTENDANCE
   - PAUSED
   - BLOCKED
   - EXPIRED
   - FINISHED
   - LEFT

2. Criar um serviço único para executar ações da fila:
   - entrar na fila
   - chamar o próximo
   - aceitar atendimento
   - finalizar atendimento
   - pausar
   - voltar
   - bloquear/desbloquear
   - expirar chamado

3. Garantir que toda mudança passe por uma função de transição única.

4. Registrar em log:
   - quem executou
   - quando
   - motivo
   - estado anterior
   - estado novo

### Resultado esperado
A fila deixa de depender de regras dispersas e passa a operar com um fluxo controlado.

## 4. Fase 2 — Regras configuráveis
### Objetivo
Evitar alteração de código para ajustar políticas de operação.

### Entregáveis
- Configurações por unidade/tenant.
- Regras editáveis sem deploy.

### Configurações recomendadas
- timeout de atendimento
- tempo de pausa
- tempo máximo de espera
- prioridade de atendimento
- regras de bloqueio
- horários de funcionamento
- alertas e notificações
- permissões operacionais

### Implementação
- Armazenar as configurações em tabela própria ou JSON em settings.
- Expor um endpoint administrativo simples para editar.

### Resultado esperado
A operação consegue ajustar a fila sem depender de desenvolvedor.

## 5. Fase 3 — Processamento assíncrono
### Objetivo
Remover da API tudo o que pode ser tratado em background.

### Tarefas que devem sair da requisição HTTP
- expirar chamados
- liberar o próximo vendedor
- bloquear por timeout
- limpar pausas antigas
- enviar notificações
- recalcular métricas

### Implementação
- Criar jobs/background workers.
- Usar fila de processamento assíncrono.
- A API só marca a intenção e grava o evento.

### Resultado esperado
A fila fica mais leve e mais resiliente.

## 6. Fase 4 — Tempo real sem overcarga
### Objetivo
Atualizar a fila de forma moderna sem usar polling excessivo.

### Estratégia
- WebSocket ou SSE para atualização em tempo real.
- Enviar mudanças somente quando houver alteração real.

### Evitar
- polling contínuo a cada segundo.
- reprocessamento desnecessário da fila.

### Resultado esperado
A interface fica responsiva sem sobrecarregar o servidor.

## 7. Fase 5 — Auditabilidade, segurança e observabilidade
### Objetivo
Tornar o sistema operável e confiável.

### Itens obrigatórios
- logs estruturados
- métricas de operação
- alertas de falha
- rastreio de transições
- contagem de timeouts, bloqueios, abandonos e aceites

### Segurança
- evitar duplicidade de ações
- validar permissões por ação
- proteger contra concorrência
- garantir idempotência em eventos repetidos

### Resultado esperado
O time consegue monitorar o comportamento da fila em produção.

## 8. Fase 6 — Qualidade e confiabilidade
### Objetivo
Garantir robustez para uso real.

### Ações
- testes automatizados para fluxo de estados
- testes para cenários críticos:
  - dois vendedores tentam a mesma ação
  - timeout
  - pausa
  - chamada simultânea
  - falha de processamento
- feature flags para habilitar mudanças graduais
- rollback seguro

### Resultado esperado
A fila fica preparada para crescer sem quebrar.

## 9. Estrutura recomendada do módulo
### Camadas
1. API
   - recebe a ação
   - valida autorização
   - delega ao serviço

2. Serviço de fila
   - decide o próximo estado
   - aplica regras
   - emite eventos

3. Repositório / banco
   - persiste o estado
   - grava auditoria

4. Workers / jobs
   - processa ações automáticas
   - executa expiração e notificações

5. Tempo real
   - notifica clientes e telas quando algo muda

## 10. Prioridade recomendada
### Prioridade 1 — Essencial
- centralizar transições
- auditoria
- validações de estado
- idempotência

### Prioridade 2 — Operação
- configuração por unidade
- workers para timeout e pausa
- métricas básicas

### Prioridade 3 — Escala
- WebSocket/SSE
- painel operacional
- testes automatizados

## 11. Critérios de sucesso
A fila estará profissional quando:
- não depender de deploy para trocar regras simples
- tiver estados consistentes
- o timeout funcione sem intervenção manual
- a tela atualize em tempo real
- o operador consiga acompanhar o fluxo
- não existam inconsistências frequentes

## 12. Roadmap sugerido
### Semana 1
- definir estados
- centralizar transições
- criar auditoria

### Semana 2
- mover timeouts para workers
- criar configuração por unidade
- melhorar validações

### Semana 3
- tempo real via WebSocket/SSE
- métricas básicas
- logs estruturados

### Semana 4
- testes automatizados
- painel operacional
- ajustes finais
