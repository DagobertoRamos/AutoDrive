# Checklist de profissionalização da fila

## 0. Pré-requisitos
- [ ] Definir os estados oficiais da fila
- [ ] Definir quem pode executar cada ação
- [ ] Definir o modelo de configuração por unidade/tenant
- [ ] Definir a estratégia de auditoria

## 1. Estabilização da fila
- [ ] Centralizar a lógica de entrada, chamada, aceite, finalização, pausa e bloqueio em um único serviço
- [ ] Criar validações de transição de estado
- [ ] Impedir ações inválidas em estados incompatíveis
- [ ] Registrar auditoria em cada mudança de estado
- [ ] Garantir que a fila não fique em estado inconsistente

## 2. Regras configuráveis
- [ ] Criar configuração de timeout de atendimento
- [ ] Criar configuração de tempo de pausa
- [ ] Criar configuração de horário de funcionamento
- [ ] Criar configuração de prioridade de atendimento
- [ ] Criar configuração de bloqueio e desbloqueio
- [ ] Criar configuração de alertas/notificações
- [ ] Criar painel ou endpoint para editar essas configurações

## 3. Processamento assíncrono
- [ ] Mover expiração de chamadas para job em background
- [ ] Mover bloqueio por timeout para job
- [ ] Mover limpeza de pausas antigas para job
- [ ] Mover notificações para fila assíncrona
- [ ] Garantir que a API não fique responsável por tudo em tempo real

## 4. Tempo real
- [ ] Implementar atualização em tempo real para a fila
- [ ] Evitar polling excessivo
- [ ] Atualizar apenas os dados que mudaram
- [ ] Notificar a interface quando houver transição de estado

## 5. Segurança e idempotência
- [ ] Validar permissões por ação
- [ ] Evitar duplicidade de chamada ou aceite
- [ ] Garantir idempotência em eventos repetidos
- [ ] Registrar motivo de cada ação
- [ ] Proteger contra concorrência de múltiplos agentes

## 6. Observabilidade
- [ ] Criar logs estruturados para operações da fila
- [ ] Medir tempo médio de atendimento
- [ ] Medir taxa de timeout
- [ ] Medir taxa de abandono
- [ ] Criar alertas simples para falhas críticas

## 7. Qualidade e confiabilidade
- [ ] Criar testes para transições de estado
- [ ] Criar testes para cenários de timeout
- [ ] Criar testes para pausa e retorno
- [ ] Criar testes para chamada simultânea
- [ ] Criar feature flags para ativar mudanças gradualmente

## 8. Entregas por prioridade
### Prioridade 1 — Essencial
- [ ] Serviço central de transições
- [ ] Auditoria
- [ ] Validação de estado
- [ ] Idempotência

### Prioridade 2 — Operação
- [ ] Configurações por unidade
- [ ] Jobs de timeout e pausa
- [ ] Métricas básicas

### Prioridade 3 — Escala
- [ ] Tempo real
- [ ] Painel operacional
- [ ] Testes automatizados
