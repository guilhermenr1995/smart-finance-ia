<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified principles:
  - V. Simplicidade operacional, evolução incremental e qualidade contínua →
    V. Simplicidade operacional, evolução incremental e qualidade verificável
- Added sections: Nenhuma
- Removed sections: Nenhuma
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
- Deferred TODOs: Nenhum
-->

# Constituição do Projeto Smart Finance IA

## Princípios Essenciais

### I. Valor diário ao usuário e foco em despesas
Cada evolução deve melhorar decisões financeiras do dia a dia, com linguagem simples e ação prática.
O produto é orientado a **controle de despesas**; qualquer funcionalidade nova precisa deixar claro:
- qual dor de gasto resolve,
- qual decisão prática habilita,
- e como se conecta aos fluxos já existentes (importar, categorizar, comparar períodos, metas, consultor IA).

### II. Segurança e isolamento de dados são inegociáveis
Dados devem permanecer isolados por usuário em todas as camadas.
Regras obrigatórias:
- validar autenticação/autorização no backend (não confiar apenas no frontend),
- manter escopo por `userId` no Firestore,
- evitar exposição de segredos no cliente,
- usar proxy backend para chamadas de IA em produção.

### III. IA em camadas com custo controlado e fallback confiável
O comportamento padrão é: memória local primeiro, IA depois.
Toda feature com IA deve:
- reduzir chamadas desnecessárias (cache/memória/reaproveitamento),
- registrar uso para operação e custo,
- ter fallback determinístico quando o modelo falhar,
- preservar consistência de categorização e experiência do usuário.

### IV. Integridade das regras financeiras e rastreabilidade
Mudanças não podem quebrar regras críticas já estabelecidas (deduplicação, parcelas, transferências, escopo de conta/categoria).
Toda automação deve manter rastreabilidade com metadados e origem das decisões para facilitar auditoria funcional e suporte.

### V. Simplicidade operacional, evolução incremental e qualidade verificável
Preferir mudanças pequenas, testáveis e com impacto claro.
Cada entrega deve ser observável e reversível, preservando:
- UX mobile/PWA,
- performance de dashboard,
- compatibilidade com arquitetura atual (HTML + JS modular + Firebase).
Além disso, toda funcionalidade nova MUST explicitar no `plan.md`:
- arquivos/flows afetados,
- estratégia de rollback,
- validações mínimas de regressão por fluxo impactado.

## Restrições Técnicas e de Plataforma

1. **Stack base**
   - Frontend: HTML + JavaScript ES Modules + CSS utilitário.
   - Backend: Firebase Cloud Functions (Node 22).
   - Dados: Cloud Firestore.
   - Auth: Firebase Authentication.

2. **Padrões de projeto**
   - Orquestração principal em `src/app.js` e `src/application/flows/`.
   - Regras de domínio concentradas em `src/utils/` e `src/services/`.
   - Endpoints administrativos e de IA devem manter contratos JSON previsíveis.

3. **Segurança e configuração**
   - Nunca versionar segredos reais (`.env`, chaves, configs sensíveis locais).
   - Runtime config local deve permanecer fora de versionamento quando necessário.

4. **Escalabilidade e custo**
   - Priorizar reaproveitamento de dados, cache e deduplicação de chamadas.
   - Qualquer aumento de custo operacional deve ser justificado no plano da feature.

## Workflow de Desenvolvimento e Portões de Qualidade

1. **Fluxo obrigatório Speckit**
   - `/speckit.constitution` → `/speckit.specify` → (opcional `/speckit.clarify`) → `/speckit.plan` → (opcional `/speckit.checklist`) → `/speckit.tasks` → (opcional `/speckit.analyze`) → `/speckit.implement`.

2. **Portões mínimos antes de implementar**
   - Especificação sem ambiguidades críticas.
   - Plano técnico coerente com stack real e com esta Constituição.
   - Tarefas rastreáveis por história de usuário e executáveis em incrementos.

3. **Validações obrigatórias após mudança relevante**
   - autenticação e isolamento de dados,
   - importação + deduplicação,
   - categorização (memória + IA),
   - dashboard com filtros/comparativo,
   - regras de parcelas/transferências,
   - fallback da IA e métricas operacionais.

4. **Admin e operação**
   - Alterações no painel admin devem manter autorização server-side, contrato do `getAdminDashboard` e consistência de métricas.

## Governança

- Esta Constituição prevalece sobre preferências locais de implementação.
- Exceções só são aceitas quando documentadas no `plan.md` (seção de complexidade/justificativa) com alternativa mais simples considerada.
- Toda PR/revisão deve checar conformidade com estes princípios.
- Em caso de conflito entre rapidez e segurança/integridade de dados, vence segurança/integridade.

**Versão**: 1.1.0 | **Ratificada em**: 2026-03-25 | **Última atualização**: 2026-04-28
