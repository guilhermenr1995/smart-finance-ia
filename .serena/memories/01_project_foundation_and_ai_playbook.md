# Smart Finance IA — Memória Inicial de Alta Qualidade

## 1) Objetivo do produto

O **Smart Finance IA** é uma aplicação web/PWA para gestão financeira pessoal com foco em praticidade:
- importar extratos (CSV/OFX/PDF),
- deduplicar e organizar transações,
- categorizar com inteligência híbrida (memória + IA),
- comparar períodos e gerar insights acionáveis.

Principais diferenciais operacionais:
- **redução de custo de IA** via memória de categoria + cache local,
- **segurança** via proxy backend para chamadas Gemini,
- **isolamento por usuário** no Firestore,
- experiência com cara de app via PWA.

---

## 2) Stack e arquitetura (visão rápida)

### Frontend
- HTML + JS modular (ES Modules) + Tailwind.
- Entrada principal: `src/app.js`.
- Organização por camadas:
  - `src/config` (configuração)
  - `src/constants` (constantes, categorias)
  - `src/state` (estado da aplicação)
  - `src/services` (integrações/negócio)
  - `src/application/flows` (orquestração de casos de uso)
  - `src/ui` (views)
  - `src/utils` (utilitários)

### Backend
- Firebase Cloud Functions v2 (`backend/cloud-functions/index.js`).
- Endpoints principais:
  - `categorizeTransactions` (classificação de categorias via Gemini)
  - `analyzeSpendingInsights` (consultoria financeira comparativa)
  - `getAdminDashboard` (painel administrativo de métricas)

### Infra Firebase
- Hosting + Firestore + Auth + Functions.
- Configuração principal: `firebase.json`.

---

## 3) Fluxo funcional crítico

1. Usuário autentica (email/senha ou Google).
2. Importa transações (CSV/OFX/PDF).
3. Sistema deduplica por hash (`date + title + value + accountType`).
4. Memória local de categorias tenta classificar automaticamente.
5. Itens pendentes (`Outros`) podem ir para IA (Gemini via proxy).
6. Usuário revisa/edita categorias e contas bancárias.
7. Dashboard mostra totais, mix por categoria e comparação com período anterior.
8. Consultor IA gera recomendações e persiste insights no Firestore.

---

## 4) Regras de negócio que NÃO podem ser quebradas

1. **Isolamento por usuário**: dados sempre escopados por `userId`.
2. **Transações de transferência** (`Transferência`, `PIX`, etc.) devem respeitar regra específica de categoria e não seguir regras de parcela indevidas.
3. **Parcelas**:
   - detecção por padrões como `N/X`,
   - exibição como `Parcelas` para parcelas > 1,
   - propagação de categoria entre parcelas relacionadas quando aplicável.
4. **Deduplicação** por hash deve se manter consistente.
5. **Segurança IA**:
   - não expor chave Gemini no frontend em produção,
   - preferir sempre o proxy em Cloud Functions.

---

## 5) Pontos técnicos de alta relevância para IA (assertividade)

### 5.1 `src/app.js` é o ponto de orquestração
- Classe `SmartFinanceApplication` injeta dependências e conecta UI ↔ flows ↔ serviços.
- Alterações grandes devem priorizar as camadas de `application/flows` e `services`, evitando inflar `app.js`.

### 5.2 Memória de categoria é peça-chave de custo/qualidade
- Arquivo: `src/services/category-memory-service.js`.
- Estratégia:
  - normalização robusta de texto,
  - match exato com dominância por categoria,
  - fallback por similaridade (Dice coefficient),
  - tratamento de ambiguidade (`ambiguousDelta`).
- Qualquer mudança aqui impacta custo de IA e taxa de acerto.

### 5.3 Utilitários de transação concentram regras sensíveis
- Arquivo: `src/utils/transaction-utils.js`.
- Contém:
  - geração de hash,
  - detecção de parcelas,
  - busca textual/valor/categoria,
  - classificação inicial (`Transferência` vs `Outros`),
  - sumarização de dados para dashboard.

### 5.4 Backend possui fallback determinístico importante
- Em `analyzeSpendingInsights`, o sistema combina:
  - análise determinística (sempre disponível),
  - narrativa por Gemini (quando disponível),
  - fallback seguro em falha do modelo.

---

## 6) Estrutura de dados (Firestore)

Coleções principais por usuário:
- `artifacts/{appId}/users/{userId}/transacoes`
- `artifacts/{appId}/users/{userId}/categorias`
- `artifacts/{appId}/users/{userId}/contas_bancarias`
- `artifacts/{appId}/users/{userId}/consultor_insights`

Campos críticos de transação:
- `hash`, `date`, `title`, `value`, `category`, `accountType`, `bankAccount`, `active`.

---

## 7) Convenções práticas para futuras tarefas de IA

1. **Antes de codar**: mapear impacto em regras de deduplicação, categoria, parcela, isolamento por usuário.
2. **Ao mexer em IA**: manter estratégia em camadas (memória interna primeiro, IA depois).
3. **Ao editar backend**:
   - preservar CORS e autenticação (`Authorization Bearer` com Firebase ID token),
   - garantir respostas JSON previsíveis para frontend.
4. **Ao mexer em deploy/config**:
   - usar `runtime-config.example.js` como referência,
   - nunca versionar segredos reais.
5. **Em refactors**: priorizar mudanças pequenas e testáveis por fluxo (auth, import, categorização, insights, dashboard).

---

## 8) Checklist de validação pós-alteração (mínimo)

Após qualquer alteração relevante, validar:
1. Login/logout e isolamento por usuário.
2. Importação e deduplicação.
3. Categorização automática por memória.
4. Categorização IA para pendências.
5. Dashboard com filtros e comparação de período.
6. Consultor IA (incluindo fallback quando IA falhar).
7. Regras de parcela/transferência.

---

## 9) Próximas memórias recomendadas

Para elevar ainda mais a assertividade da IA, criar memórias complementares:
1. `02_architecture_map_frontend.md` — mapa de módulos/flows do frontend.
2. `03_backend_contracts_and_error_handling.md` — contratos JSON dos endpoints.
3. `04_business_rules_transactions_and_installments.md` — regras detalhadas de domínio.
4. `05_deploy_runbook_firebase.md` — passo a passo operacional de deploy/rollback.

---

## 10) Resumo executivo para agentes

Se o objetivo for melhorar precisão e velocidade de implementação neste projeto:
- comece por `src/app.js`, `src/services/category-memory-service.js`, `src/utils/transaction-utils.js` e `backend/cloud-functions/index.js`;
- preserve regras de usuário, deduplicação, parcelas e segurança da IA;
- trate memória interna como prioridade para reduzir custo e manter consistência de categorização.