# Preparação do projeto para usar o Spec Kit (Speckit)

Este documento registra **o que foi instalado/configurado no PC** e **o que foi preparado no projeto** para usar o workflow do Spec Kit de ponta a ponta.

---

## 1) O que foi instalado/configurado no PC

### Pré-requisitos encontrados no ambiente

- `python3` já disponível (`Python 3.13.7`)
- `uv` já disponível (`uv 0.10.11`)
- `node` e `npm` já disponíveis (`node v20.19.4`, `npm 9.2.0`)

### Instalação realizada

Foi instalado o CLI oficial do Spec Kit:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
```

Resultado validado:

- `specify-cli` versão `0.4.2`
- executável `specify` instalado via `uv tool`

### Ajuste de PATH realizado

Foi executado:

```bash
uv tool update-shell
```

Esse comando atualizou:

- `/home/guilherme/.profile`
- `/home/guilherme/.bashrc`

Após isso, o comando `specify` passou a ser encontrado no shell.

### Comandos de verificação

```bash
specify version
specify check
uv tool list
```

---

## 2) O que foi instalado/configurado no projeto

### Inicialização do Spec Kit no repositório atual

Foi executado no root do projeto:

```bash
specify init --here --ai gemini --force
```

Isso preparou o projeto com:

- pasta `.specify/` (templates, scripts e memória da metodologia)
- pasta `.gemini/commands/` com os comandos do workflow:
  - `speckit.constitution`
  - `speckit.specify`
  - `speckit.clarify`
  - `speckit.plan`
  - `speckit.checklist`
  - `speckit.tasks`
  - `speckit.analyze`
  - `speckit.implement`

### Ajuste de segurança aplicado no repositório

No `.gitignore` foi adicionado:

```gitignore
.gemini/
```

Motivo: essa pasta pode conter artefatos locais do agente (sessões/tokens), evitando vazamento acidental em commit.

> Observação: a pasta `.specify/` ficou versionável (normal/recomendado para compartilhar o workflow no time).

---

## 3) Tutorial rápido: jornada completa Speckit (início ao fim)

> Exemplo de feature de referência (sem implementar agora): módulo **Ritmo do Mês** como MVP, com backlog para **Vazamentos de Gasto** e **Compromissos Fixos**.

### Etapa 0 — Preparar contexto

No root do projeto:

```bash
git checkout -b speckit/ritmo-mes
```

Abra o agente com suporte aos comandos `/speckit.*`.

---

### Etapa 1 — Definir princípios do projeto

Use:

```text
/speckit.constitution
```

Sugestão de foco para este projeto:

- qualidade e legibilidade em JS modular
- testes mínimos para regras de negócio financeira
- segurança de dados do usuário
- performance no dashboard

Saída esperada: atualização de `.specify/memory/constitution.md`.

---

### Etapa 2 — Especificar a feature (o que/por quê)

Use:

```text
/speckit.specify
```

Cole a descrição funcional da feature (ex.: Ritmo do Mês com semáforo e ação de redução de gasto).

Saída esperada:

- criação de branch de feature com prefixo numérico
- criação de `specs/<id-feature>/spec.md`
- criação de checklist de qualidade da spec

---

### Etapa 3 — Clarificar ambiguidades (opcional, mas recomendado)

Use:

```text
/speckit.clarify
```

Aqui você resolve dúvidas críticas (ex.: regra exata do semáforo, granularidade por categoria, cálculo de "deveria ter gasto até hoje").

---

### Etapa 4 — Planejamento técnico

Use:

```text
/speckit.plan
```

Informe stack e restrições reais do projeto (Firebase, Firestore, Cloud Functions, frontend JS atual etc.).

Saídas esperadas em `specs/<id-feature>/`:

- `plan.md`
- `research.md`
- `data-model.md`
- `contracts/` (se aplicável)
- `quickstart.md`

---

### Etapa 5 — Checklist de qualidade (opcional)

Use:

```text
/speckit.checklist
```

Valida consistência da especificação e prontidão antes de quebrar em tarefas.

---

### Etapa 6 — Quebrar em tarefas executáveis

Use:

```text
/speckit.tasks
```

Saída esperada: `specs/<id-feature>/tasks.md` com tarefas em ordem, dependências e paralelismo.

---

### Etapa 7 — Análise de consistência (opcional)

Use:

```text
/speckit.analyze
```

Checa alinhamento entre spec, plano e tarefas para reduzir retrabalho.

---

### Etapa 8 — Implementação (quando for codar)

Use:

```text
/speckit.implement
```

O agente executa as tasks definidas em `tasks.md`.

> Como você pediu, **não foi feita implementação da feature agora** — somente a preparação do ambiente e do fluxo.

---

### Etapa 9 — Validação final e entrega

Executar testes e validações do projeto, revisar diff e abrir PR:

```bash
git status
git diff
```

Depois seguir com pipeline/deploy habitual do projeto.

---

## 4) Prompt-base sugerido para sua feature de exemplo

Você pode usar este resumo no `/speckit.specify`:

1. MVP: **Ritmo do Mês** (Tudo, Crédito, Conta, Categoria)
2. Mostrar gasto realizado vs gasto esperado até hoje
3. Semáforo (verde/amarelo/vermelho) com thresholds explícitos
4. Insight acionável: “para fechar no alvo, reduza R$ X em Y dias”
5. Backlog futuro: “Vazamentos de Gasto” e “Compromissos Fixos de Despesa”

---

## 5) Guia completo (Codex): como tocar a feature do início ao fim com Speckit

> **Importante:** no Codex, os comandos são com **`$speckit-*`** (não `/speckit.*`).

### 5.1 Pré-check no terminal (uma vez)

No root do projeto (`/home/guilherme/src/smart-finance-ia`):

```bash
specify version
specify check
```

Se estiver usando Codex com skills, confirmar se existe:

```bash
ls -la .agents/skills
```

Deve conter `speckit-constitution`, `speckit-specify`, `speckit-plan`, `speckit-tasks`, `speckit-implement`.

---

### 5.2 Ordem oficial das chamadas no Codex

1. `$speckit-constitution`
2. `$speckit-specify`
3. `$speckit-clarify` *(opcional, recomendado)*
4. `$speckit-plan`
5. `$speckit-checklist` *(opcional)*
6. `$speckit-tasks`
7. `$speckit-analyze` *(opcional, recomendado antes de implementar)*
8. `$speckit-implement`

---

### 5.3 Prompts prontos para copiar e colar (Codex)

#### Etapa 1 — Constituição

Comando:

```text
$speckit-constitution
```

Prompt sugerido:

```text
Defina princípios para este projeto com foco em:
1) segurança e isolamento de dados por usuário no Firebase,
2) integridade das regras de transações (deduplicação, parcelas e transferências),
3) IA em camadas com fallback determinístico e controle de custo,
4) UX mobile/PWA com linguagem simples para usuário final,
5) evolução incremental orientada a valor e métricas de uso.
```

---

#### Etapa 2 — Especificação da feature (MVP + roadmap)

Comando:

```text
$speckit-specify
```

Prompt sugerido:

```text
Feature principal (MVP): Módulo Ritmo do Mês.

Objetivo:
- Mostrar quanto já foi gasto vs. quanto deveria ter sido gasto até hoje no mês.
- Exibir visão por: Tudo, Crédito, Conta e Categoria.
- Exibir semáforo:
  - Verde: dentro do ritmo
  - Amarelo: atenção
  - Vermelho: acima do ritmo
- Trazer ação prática: “para fechar o mês no alvo, reduza R$ X em Y dias”.

Backlog planejado na mesma iniciativa:
1) Módulo Vazamentos de Gasto:
   - Detectar gastos pequenos recorrentes que somam impacto.
   - Exemplo de insight: “Pedidos em app + conveniência somaram R$ 420 em 18 transações”.
   - Sugerir cortes simples e mensuráveis (ex.: reduzir 25% economiza R$ 105/mês).
2) Módulo Compromissos Fixos de Despesa:
   - Identificar despesas recorrentes (assinaturas, parcelas, serviços).
   - Mostrar quanto do mês já está comprometido por gastos fixos.
   - Diferenciar gasto inevitável vs. ajustável.

Peço que a história P1 seja Ritmo do Mês (MVP) e que os demais módulos fiquem como P2/P3.
```

---

#### Etapa 3 — Clarificações críticas (recomendado)

Comando:

```text
$speckit-clarify
```

Prompt sugerido:

```text
Quero eliminar ambiguidades antes do plano técnico. Priorize clarificar:
1) fórmula de “gasto esperado até hoje” no mês,
2) thresholds exatos do semáforo,
3) como calcular “reduza R$ X em Y dias” quando faltar poucos dias no mês,
4) comportamento para meses incompletos e períodos sem histórico suficiente,
5) diferenças de cálculo entre Tudo, Crédito, Conta e Categoria.
```

---

#### Etapa 4 — Plano técnico aderente ao projeto

Comando:

```text
$speckit-plan
```

Prompt sugerido:

```text
Planejar implementação respeitando a stack atual do projeto:
- Frontend: HTML + JavaScript ES Modules + CSS utilitário
- Backend: Firebase Cloud Functions (Node 22)
- Dados: Firestore
- Auth: Firebase Authentication

Diretrizes técnicas:
- Reaproveitar filtros já existentes de período, conta e categoria na dashboard.
- Não quebrar regras atuais de deduplicação e classificação de transações.
- Preservar isolamento por usuário.
- Manter performance para uso mobile.
- Projetar contratos e modelo de dados para suportar evolução futura dos módulos
  Vazamentos de Gasto e Compromissos Fixos sem retrabalho grande.
```

---

#### Etapa 5 — Checklist de qualidade (opcional)

Comando:

```text
$speckit-checklist
```

Prompt sugerido:

```text
Gerar checklist de qualidade para validar:
- consistência da especificação,
- critérios de sucesso mensuráveis,
- aderência à constituição,
- prontidão para quebrar em tarefas implementáveis.
```

---

#### Etapa 6 — Geração de tarefas executáveis

Comando:

```text
$speckit-tasks
```

Prompt sugerido:

```text
Gerar tasks em ordem de dependência, priorizando MVP (Ritmo do Mês) primeiro.
Organizar por histórias (US1, US2, US3), com caminhos de arquivo exatos e pontos de paralelismo.
```

---

#### Etapa 7 — Análise de consistência (opcional, recomendado)

Comando:

```text
$speckit-analyze
```

Prompt sugerido:

```text
Executar análise de consistência cruzada entre spec.md, plan.md e tasks.md.
Apontar riscos, lacunas e ajustes recomendados antes da implementação.
```

---

#### Etapa 8 — Implementação

Comando:

```text
$speckit-implement
```

Prompt sugerido:

```text
Implementar por fases conforme tasks.md, entregando primeiro o MVP Ritmo do Mês (US1),
depois US2 e US3. A cada fase, validar critérios de aceite e evitar regressões no dashboard atual.
```

---

### 5.4 Critério de “concluído” para esta feature

Considere a jornada concluída quando:

1. `spec.md`, `plan.md` e `tasks.md` estiverem consistentes e sem ambiguidades críticas.
2. MVP Ritmo do Mês estiver funcional com:
   - comparação gasto realizado vs esperado até hoje,
   - visões por Tudo/Crédito/Conta/Categoria,
   - semáforo,
   - recomendação de redução R$ X em Y dias.
3. Backlog dos módulos Vazamentos e Compromissos estiver especificado e planejado (mesmo que não implementado no MVP).

---

### 5.5 Troubleshooting rápido (Codex)

- Se `$speckit-*` não aparecer:
  1. Reabrir o Codex na pasta do projeto.
  2. Verificar `.agents/skills/`.
  3. Reexecutar:
     ```bash
     specify init --here --ai codex --ai-skills --force --ignore-agent-tools
     ```

