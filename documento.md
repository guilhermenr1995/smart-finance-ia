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
