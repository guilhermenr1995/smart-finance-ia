# Cloud Functions (AI Proxy)

Este diretório **não é um backend completo da aplicação**.
Ele contém apenas uma Cloud Function chamada `categorizeTransactions`, usada como **proxy seguro** entre o frontend e a API do Gemini.

## O que este projeto faz

- Recebe uma lista de descrições de transações.
- Valida se o usuário está autenticado via Firebase Auth (token JWT no header).
- Chama o modelo Gemini no servidor (sem expor chave no frontend).
- Retorna o mapeamento `{ "index": "categoria" }` para o app.

## Por que existe este proxy

Sem esse proxy, você teria que colocar a `GEMINI_API_KEY` no frontend, o que é inseguro.
Com ele:

- a chave fica no servidor;
- somente usuários autenticados podem categorizar;
- você consegue controlar CORS, limites e logs centralmente.

## Estrutura desta pasta

```text
backend/cloud-functions/
  index.js              # função HTTP categorizeTransactions
  package.json          # dependências da function
  .env.example          # exemplo de variáveis locais
  .env                  # variáveis reais (NÃO versionar)
```

## Pré-requisitos

- Node.js 22
- Firebase CLI instalado e logado
- Projeto Firebase já criado e selecionado (`firebase use <project-id>`)

## Configuração local (didática)

1. Entre na pasta da function:
   - `cd backend/cloud-functions`

2. Instale dependências:
   - `npm install`

3. Crie seu arquivo de ambiente local:
   - `cp .env.example .env`

4. Edite o `.env` com seus valores reais:
   - `GEMINI_API_KEY=...`
   - `GEMINI_MODEL=gemini-3.1-flash-lite` (ou outro modelo habilitado)

5. Volte para a raiz do projeto:
   - `cd ../..`

## Deploy

Na raiz do projeto (`smart-finance-ia`):

```bash
firebase deploy --only functions:categorizeTransactions
```

Se o deploy passar, você verá a URL da função no final (Cloud Run URL).

## Conectar o frontend à function

No arquivo `runtime-config.js` (local), configure:

```js
ai: {
  proxyUrl: 'https://SUA_URL_DA_FUNCTION.a.run.app',
  allowDirectRequest: false,
  directApiKey: ''
}
```

## Contrato da API

### Endpoint

- `POST /` na URL da function

### Headers obrigatórios

- `Content-Type: application/json`
- `Authorization: Bearer <firebase_id_token>`

### Body esperado

```json
{
  "items": [
    { "index": 0, "title": "UBER TRIP" },
    { "index": 1, "title": "IFOOD PIZZARIA" }
  ],
  "categories": ["Alimentação", "Transporte", "Outros"]
}
```

### Resposta de sucesso

```json
{
  "mapping": {
    "0": "Transporte",
    "1": "Alimentação"
  }
}
```

## Segurança implementada

- Verificação de token: `verifyIdToken` (Firebase Admin).
- CORS restrito por `ALLOWED_ORIGINS` no `index.js`.
- Chave Gemini fica no servidor (`.env`), não no frontend.

## Ajustar origens permitidas (CORS)

Se o domínio do frontend mudar, atualize `ALLOWED_ORIGINS` em `index.js` e faça novo deploy.

Exemplo de origem local já permitida:

- `http://localhost:5173`

## Tratamento de falhas de IA

A function já possui retry com backoff para status transitórios:

- `429`, `500`, `502`, `503`, `504`

Isso ajuda quando o Gemini está temporariamente sobrecarregado.

## Troubleshooting rápido

### 1) `Missing Authorization token`

A requisição não enviou token Firebase no header `Authorization`.

### 2) `Missing GEMINI_API_KEY environment variable`

O `.env` não está presente/preenchido corretamente na pasta da function no momento do deploy.

### 3) Erro de CORS

A origem do seu frontend não está em `ALLOWED_ORIGINS`.

### 4) `Gemini request failed (503/429)`

Limite temporário do modelo. A function já tenta novamente, mas em picos pode falhar mesmo assim.

## Observação importante

Este módulo é um proxy de categorização por IA.
Persistência de transações, cache, regras de negócio da UI e autenticação do app ficam no frontend + Firestore, fora desta pasta.
