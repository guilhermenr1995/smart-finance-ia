# Speckit + Codex — Planejamento completo da feature Open Finance (com foco UX/frontend)

> Objetivo: guiar a execução completa do workflow Speckit no Codex para entregar integração de transações via Open Finance com experiência simples para o usuário final.

---

## 1) Escopo da funcionalidade (alvo final)

Implementar um novo fluxo de entrada de transações via **Open Finance** para complementar/importação por arquivo (OFX/CSV/PDF), com prioridade em simplicidade de uso.

### Escopo funcional obrigatório

1. Conectar conta bancária via Open Finance com consentimento do usuário.
2. Sincronizar transações de forma segura e recorrente enquanto o consentimento estiver válido.
3. Permitir múltiplas conexões por usuário e status claro de cada conexão (ativa, expirada, erro, reconexão necessária).
4. Unificar transações importadas por Open Finance com as já existentes (sem duplicidade).
5. Suportar inicialmente: **Nubank, Itaú, Bradesco e Banco do Brasil**.

### Escopo de módulos de análise (para o plano ficar “redondo”)

- **MVP P1**: Ritmo do Mês
- **P2**: Vazamentos de Gasto
- **P3**: Compromissos Fixos de Despesa

---

## 2) Contexto Open Finance (para orientar os prompts)

Use este entendimento como base durante o Speckit:

1. Open Finance Brasil **não é “um lugar único”** para puxar dados de todos os bancos sem fluxo de consentimento.
2. O compartilhamento depende de:
   - consentimento explícito do usuário,
   - autenticação/autorização no banco transmissor,
   - escopos/permissões por tipo de dado,
   - ciclo de vida de consentimento (criação, consulta, renovação e revogação).
3. Em integração direta regulatória, normalmente há requisitos de participante/ecossistema (incluindo padrões de segurança e diretório de participantes).
4. Para acelerar produto, o plano pode prever duas trilhas:
   - **Trilha A (MVP recomendado)**: provedor agregador que já opera conectividade Open Finance (abstrai complexidade banco a banco).
   - **Trilha B (evolução)**: integração direta regulatória quando houver maturidade jurídica/compliance/operação.

---

## 3) Ordem de execução no Codex (Speckit)

> No Codex, use comandos no formato **`$speckit-*`**.

1. `$speckit-constitution`
2. `$speckit-specify`
3. `$speckit-clarify`
4. `$speckit-plan`
5. `$speckit-checklist`
6. `$speckit-tasks`
7. `$speckit-analyze`
8. `$speckit-implement`

---

## 4) Prompts prontos (copiar e colar) para cada etapa

## Etapa 1 — Constituição

Comando:

```text
$speckit-constitution
```

Prompt:

```text
Atualize a constituição do projeto para suportar Open Finance com foco em UX/frontend e segurança.

Princípios obrigatórios:
1) Consentimento explícito e transparência para o usuário em cada conexão bancária.
2) Segurança de dados financeiros (tokenização, segregação por usuário, logs auditáveis, menor privilégio).
3) Resiliência e confiabilidade (retry, idempotência, deduplicação e fallback de integração).
4) UX simples: conexão em poucos passos, feedback de status e linguagem clara para não técnicos.
5) Arquitetura incremental: começar com provedor agregador para MVP e preparar caminho para integração direta regulatória.
6) Qualidade de dados: normalização e reconciliação das transações para não quebrar dashboard/metas/insights.

Atualize também os templates para refletir gates de segurança, consentimento e usabilidade.
```

---

## Etapa 2 — Especificação da feature

Comando:

```text
$speckit-specify
```

Prompt:

```text
Criar feature: "Conexão Open Finance para ingestão automática de transações".

Objetivo do usuário final:
- Conectar conta bancária por Open Finance de forma simples.
- Sincronizar transações automaticamente sem precisar exportar arquivos.
- Ver status da conexão (ativa, expirada, erro, reconectar).

Escopo de bancos iniciais (MVP de compatibilidade): Nubank, Itaú, Bradesco e Banco do Brasil.

Histórias e prioridade:
- P1: Conectar conta e sincronizar transações com UX simples.
- P2: Módulo Ritmo do Mês usando dados também vindos de Open Finance.
- P3: Módulos Vazamentos de Gasto e Compromissos Fixos de Despesa com insights sobre dados sincronizados.

Requisitos funcionais obrigatórios:
1) Fluxo guiado de conexão com consentimento explícito.
2) Callback seguro da autorização e persistência de consentimento.
3) Rotina de sincronização inicial + incremental.
4) Deduplicação com transações já importadas manualmente.
5) Reconexão e renovação de consentimento antes de expiração.
6) Revogação/desconexão da conta pelo usuário.
7) Observabilidade mínima (logs de erro e métricas de sucesso/falha da sincronização).

UX obrigatória:
- Linguagem não técnica.
- Barra de progresso no onboarding de conexão.
- Mensagens acionáveis em erro (ex.: "Sua conexão expirou, reconecte em 1 toque").
- Estado vazio com CTA para conectar banco.

Adicionar seção de riscos e dependências (regulatórias/técnicas) de Open Finance.
```

---

## Etapa 3 — Clarificações críticas

Comando:

```text
$speckit-clarify
```

Prompt:

```text
Quero eliminar ambiguidades críticas da especificação.

Faça perguntas e já proponha alternativas para decisão sobre:
1) Estratégia do MVP: agregador Open Finance vs integração direta regulatória.
2) Frequência de sincronização (manual, agendada, event-driven) e impacto em custo/UX.
3) Política de deduplicação entre Open Finance e importação de arquivos.
4) Janela histórica inicial de transações (ex.: 90 dias, 12 meses) e limites por banco/provedor.
5) Fluxo de erro: consentimento expirado, banco indisponível, credenciais inválidas, timeout.
6) Critérios de "conexão saudável" no app (SLA percebido e sinais de alerta).
7) Regras para exibir bancos suportados (Nubank, Itaú, Bradesco, BB) e fallback quando algum indisponível.

Priorize decisões que destravam o plano técnico sem retrabalho.
```

---

## Etapa 4 — Plano técnico

Comando:

```text
$speckit-plan
```

Prompt:

```text
Criar plano técnico completo para Open Finance no projeto atual (frontend JS modular + Firebase).

Diretrizes arquiteturais:
1) Frontend:
   - Nova jornada "Conectar banco" na dashboard.
   - Telas/estados: lista de bancos, consentimento, conectando, sucesso, erro, reconexão, gerenciamento de conexões.
2) Backend (Cloud Functions):
   - Endpoint para iniciar conexão.
   - Endpoint callback para retorno de autorização.
   - Endpoint de sync manual.
   - Job/scheduler de sync incremental.
   - Endpoint para renovar/revogar conexão.
3) Dados:
   - Modelo para consentimentos, conexões por banco, tokens (nunca em claro), status da sincronização, cursor/paginação, auditoria.
4) Integração:
   - Planejar MVP com provedor agregador que suporte Open Finance Brasil.
   - Manter interface de integração desacoplada para trocar de provedor ou migrar para integração direta no futuro.
5) Qualidade e segurança:
   - Idempotência e deduplicação de transações.
   - Controle de erros por categoria (autorização, disponibilidade, validação).
   - Logs estruturados e métricas operacionais.

Resultados esperados do plano:
- plan.md, research.md, data-model.md, contracts/, quickstart.md
- decisões explícitas de UX e de risco regulatório/operação.
```

---

## Etapa 5 — Checklist de qualidade

Comando:

```text
$speckit-checklist
```

Prompt:

```text
Gerar checklist de validação final da solução Open Finance com foco em:
1) UX (clareza, simplicidade, tempo de conclusão da conexão)
2) Segurança e privacidade
3) Confiabilidade da sincronização
4) Integridade de dados e deduplicação
5) Aderência regulatória/consentimento
6) Cobertura de bancos alvo (Nubank, Itaú, Bradesco, BB)
7) Critérios de pronto para produção
```

---

## Etapa 6 — Geração de tarefas

Comando:

```text
$speckit-tasks
```

Prompt:

```text
Quebre em tarefas executáveis, com dependência clara e foco em entrega incremental:

Fase 1 (Fundação): contratos, modelo de dados, segurança, integração base.
Fase 2 (US1): conectar banco + consentimento + sync inicial.
Fase 3 (US2): sync incremental + gestão de conexões + reconexão.
Fase 4 (US3): refletir dados no Ritmo do Mês e preparar módulos Vazamentos/Compromissos.

Inclua caminhos de arquivo reais do projeto e tarefas de teste para fluxos críticos.
```

---

## Etapa 7 — Análise de consistência

Comando:

```text
$speckit-analyze
```

Prompt:

```text
Execute análise cruzada entre spec.md, plan.md e tasks.md para Open Finance.
Sinalize:
- lacunas de UX,
- riscos de segurança,
- pontos de retrabalho,
- dependências externas não tratadas,
- requisitos sem tarefa correspondente.

Proponha correções objetivas antes da implementação.
```

---

## Etapa 8 — Implementação

Comando:

```text
$speckit-implement
```

Prompt:

```text
Implemente por fases seguindo tasks.md, preservando estabilidade do sistema atual.

Condição de aceite por fase:
1) Fluxo conectar banco funcional ponta a ponta.
2) Sincronização inicial e incremental sem duplicidade.
3) Gestão de consentimento (status, renovação, revogação) visível para o usuário.
4) Dados Open Finance refletindo corretamente no dashboard e no módulo Ritmo do Mês.
5) Base pronta para evolução dos módulos Vazamentos e Compromissos.
```

---

## 5) O que você terá ao final da execução completa

Após executar todo o fluxo acima, você deve obter:

1. **Artefatos Speckit completos** (spec, plan, research, data-model, contracts, tasks, checklist/analyze).
2. **Funcionalidade Open Finance implementada** com onboarding simples de conexão bancária.
3. **Sincronização de transações automática** com deduplicação e observabilidade.
4. **Gestão de consentimento e conexões** dentro do app (status, renovar, revogar, reconectar).
5. **Cobertura inicial de bancos alvo** (via provedor compatível no MVP): Nubank, Itaú, Bradesco e Banco do Brasil.
6. **Ritmo do Mês alimentado por dados Open Finance**, com base preparada para Vazamentos e Compromissos.


