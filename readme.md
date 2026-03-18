# Smart Finance IA

Aplicação web/PWA para controle financeiro pessoal com foco em simplicidade: importar CSV, categorizar automaticamente e acompanhar gastos por período.

## Proposta de valor

- Controle financeiro em poucos cliques, mesmo para quem não domina tecnologia.
- Importação de planilha de banco/cartão sem retrabalho manual.
- Categorização inteligente com memória interna para reduzir custo de IA.
- Painel comparativo para apoiar decisões de consumo.

## Funcionalidades implementadas

### 1) Autenticação completa

- Login com e-mail/senha.
- Cadastro com e-mail/senha.
- Login com Google.
- Fluxo de esqueci senha (reset por e-mail).
- Logout.
- Isolamento de dados por usuário autenticado.

### 2) Importação de transações (CSV e OFX)

- Importa CSV de cartão de crédito.
- Importa CSV de conta corrente.
- Importa OFX de conta/cartão (ex.: Nu, Itaú e outros bancos compatíveis).
- Ignora entradas inválidas (pagamentos, estornos e receitas quando aplicável).
- Evita duplicidade por hash (`date + title + value + accountType`).
- Após importar, já tenta reaproveitar categoria com base no histórico do usuário.

### 3) Categorização inteligente (camadas)

- Camada 1: memória interna (sem IA), usando histórico do próprio usuário.
- Camada 2: IA (Gemini via proxy seguro), apenas para itens ainda pendentes.
- Re-tentativa automática com backoff para falhas temporárias de IA (ex.: 503).
- Processamento em lotes com controle de progresso.

### 4) Regras de categoria e parcelas

- Transações cujo título começa com `Transferência` **nunca** são tratadas como parcela.
- Regra visual de `Parcelas` no mix respeita detecção robusta de `N/X`.
- Ao editar a categoria de uma transação parcelada, a aplicação propaga a categoria para as demais parcelas relacionadas da mesma compra.
- Quando existe transação igual/similar já categorizada na base, a categoria é reaproveitada automaticamente.

### 5) Categorias personalizadas por usuário

- Lista padrão + categorias criadas pelo usuário.
- Ao editar categoria na tabela, campo com busca.
- Se não existir categoria, aparece ação `+ Criar "..."`.
- Nova categoria é criada e aplicada imediatamente à transação.

### 6) Dashboard e análise

- Filtros por período, tipo de conta e categoria.
- Busca global na base do usuário (por descrição ou valor).
- Totalizador da busca: mostra valor encontrado e participação sobre a base ativa.
- Mix de gastos com comparação:
  - barra amarela: período atual filtrado
  - barra cinza: mesmo range do período anterior
- Lista de transações com edição de categoria e ação de ignorar/reativar item.
- Indicadores de total gasto e total ignorado.

### 7) Consultor IA (insights comparativos)

- Botão dedicado de Consultor IA na dashboard.
- Analisa período filtrado atual vs mesmo range anterior.
- Retorna insights úteis: categorias que aumentaram, reduziram, ações críticas e cortes dispensáveis.
- Salva automaticamente os insights por período/filtro no Firestore para reaproveitar sem nova consulta.
- Limite diário por usuário já está preparado no backend e pode ser ativado quando necessário.

### 8) Cache e performance

- Cache local por usuário para reduzir leituras recorrentes no Firestore.
- Sincronização inteligente com nuvem (evita fetch desnecessário quando cache está fresco).
- Objetivo: reduzir custo operacional e melhorar tempo de resposta.

### 9) PWA e acesso mobile

- Instalável no Android/iOS (Add to Home Screen).
- `manifest.webmanifest` + `service-worker.js`.
- Experiência de app com botão de instalação.

## Jornada do cliente (fim a fim)

1. Usuário cria conta (ou entra com Google).
2. Abre o painel e importa o CSV de cartão e/ou conta.
3. O sistema deduplica e reaproveita categorias já conhecidas.
4. Usuário clica em `Categorizar ciclo com IA` para pendências.
5. Revisa a tabela e ajusta manualmente apenas o necessário.
6. Se faltar categoria, cria na hora pelo seletor.
7. Usa a busca global para localizar rapidamente lançamentos por descrição/valor.
8. Aciona o Consultor IA para receber insights comparativos e recomendações práticas.
9. Observa o mix atual x período anterior e toma decisões de gasto.
10. Nas próximas importações, a memória interna melhora automaticamente e reduz dependência da IA.

## Stack técnica

- Frontend: HTML + Tailwind + JavaScript ES Modules.
- Auth: Firebase Authentication.
- Banco: Cloud Firestore.
- IA: Gemini (proxy em Cloud Functions recomendado para produção).
- Hospedagem: Firebase Hosting.
- App móvel: PWA instalável.

## Estrutura do projeto

```text
smart-finance-ia/
  index.html
  runtime-config.js
  manifest.webmanifest
  service-worker.js
  firestore.rules
  firebase.json
  src/
    app.js
    styles.css
    config/
    constants/
    state/
    services/
    ui/
    utils/
  backend/
    cloud-functions/
```

## Modelo de dados (Firestore)

Coleção de transações:

`artifacts/{appId}/users/{userId}/transacoes/{documentId}`

Campos principais:

- `hash: string`
- `date: string`
- `title: string`
- `value: number`
- `category: string`
- `accountType: "Crédito" | "Conta"`
- `active: boolean`

Coleção de categorias do usuário:

`artifacts/{appId}/users/{userId}/categorias/{categoryId}`

Campos principais:

- `name: string`
- `normalizedName: string`
- `createdAt: string (ISO)`

## Segurança

- Regras do Firestore em `firestore.rules`.
- Isolamento obrigatório por `request.auth.uid == userId`.
- Validação de shape/tipos para transações e categorias.
- `.gitignore` preparado para bloquear arquivos locais sensíveis (`.env`, `runtime-config.js`, caches).
- Versionar apenas arquivos de exemplo (`runtime-config.example.js` e `backend/cloud-functions/.env.example`).

## Configuração rápida local

1. Criar config local do frontend:
   - `cp runtime-config.example.js runtime-config.js`
   - preencher com seu Firebase e URL da function.
2. Criar config local da function:
   - `cp backend/cloud-functions/.env.example backend/cloud-functions/.env`
   - preencher `GEMINI_API_KEY`.
3. Rodar servidor HTTP na pasta do projeto (não usar `file://`).
4. Abrir no navegador, autenticar e testar importação.

## Deploy (resumo)

- Frontend/Hosting: `firebase deploy --only hosting`
- Regras Firestore: `firebase deploy --only firestore:rules`
- Cloud Functions (IA proxy): `firebase deploy --only functions`

## Observações operacionais

- Para produção, manter IA via proxy (não expor API key no frontend).
- Monitorar custo/limites de API Gemini e leituras Firestore.
- A memória interna e o cache local existem para reduzir chamadas pagas.
- Se alguma chave já foi exposta em commit antigo, faça rotação imediata da chave no provedor antes de publicar o repositório.
