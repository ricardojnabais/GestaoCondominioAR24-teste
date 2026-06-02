# AR24 Push Notifications · Backend Vercel

Backend serverless para envio de Web Push Notifications aos condóminos.

## Stack

- **Vercel Functions** · 5 endpoints serverless Node.js
- **Vercel KV** (Upstash Redis) · armazena subscriptions
- **web-push** · biblioteca para enviar push notifications via VAPID

## Endpoints

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/vapid-public` | GET | público | Retorna chave pública VAPID |
| `/api/subscribe` | POST | público | Regista push subscription de um device |
| `/api/unsubscribe` | POST | público | Remove subscription |
| `/api/notify` | POST | `x-api-key` | Envia push notification (admin) |
| `/api/subscriptions` | GET | `x-api-key` | Lista subscriptions registadas (admin) |

## Setup · 7 passos

### 1. Criar repositório separado

Recomendação: criar um repo novo `ar24-push-api` (separado do `GestaoCondominioAR24`) com **apenas** o conteúdo da pasta `api/` + `vercel.json` na raiz + `package.json`. Mais limpo do que misturar com o frontend.

```bash
mkdir ar24-push-api && cd ar24-push-api
cp -r /caminho/GestaoCondominioAR24/api/* .
cp /caminho/GestaoCondominioAR24/vercel.json .
git init && git add . && git commit -m "init"
gh repo create ar24-push-api --private --source=. --push
```

Alternativa: pôr tudo no mesmo repo (GitHub Pages serve o frontend, Vercel detecta `api/` no monorepo).

### 2. Criar conta Vercel (se não tens)

Vai a https://vercel.com → "Sign Up" → escolhe GitHub.

### 3. Importar projeto na Vercel

- New Project → escolhe o repo `ar24-push-api`
- Framework Preset: **Other**
- Root Directory: `./`
- Deploy

### 4. Gerar VAPID keys

No terminal local:

```bash
npx web-push generate-vapid-keys
```

Vai mostrar algo como:

```
=======================================
Public Key:
BIxx...........zz

Private Key:
yyy............ww
=======================================
```

Guarda os dois valores.

### 5. Setup Vercel KV

- Painel da Vercel → projeto `ar24-push-api` → **Storage**
- "Create Database" → **KV** (Upstash Redis)
- Nome: `ar24-push-kv`
- Region: `Frankfurt` ou `Paris` (perto de Portugal)
- "Create" → "Connect to Project"

Isto adiciona automaticamente as env vars `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`.

### 6. Adicionar env vars manuais

Painel Vercel → projeto → Settings → Environment Variables. Adicionar:

| Nome | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | (a public key do passo 4) |
| `VAPID_PRIVATE_KEY` | (a private key do passo 4) |
| `VAPID_SUBJECT` | `mailto:condoamira24@gmail.com` |
| `ADMIN_API_KEY` | gera uma string aleatória longa (ex: `openssl rand -hex 32`) |

Após adicionar, faz **Redeploy** (Deployments → ... → Redeploy).

### 7. Configurar a app

Na app AR24, login admin → Definições → **Notificações Push**. Preenche:

- **URL Vercel Function**: `https://ar24-push-api.vercel.app` (ou o domínio do teu projeto Vercel)
- **Admin API Key**: o mesmo valor de `ADMIN_API_KEY`
- **VAPID Public Key**: opcional (a app pode buscar do backend)

Guarda. Clica **Testar** · deve receber uma notificação no device.

## Limites · free tier

- **Vercel Functions** · 100K invocações/mês · ilimitado para 10 condóminos
- **Vercel KV** · 30K comandos Redis/dia · sobra (cada push = ~3 comandos)
- **web-push** · sem limite (envia direto para FCM/APNs gratuitos)

Custo previsto: **0€/mês** para condomínio de 10 condóminos.

## Troubleshooting

**"x-api-key inválida"** → confere se `ADMIN_API_KEY` no Vercel = o valor na app

**"Sem subscriptions registadas"** → nenhum condómino activou ainda · pede para abrirem a app e ativarem no banner

**Push não chega no iPhone** → verificar:
1. PWA instalada no ecrã principal (não Safari)
2. iOS ≥ 16.4
3. Permissão concedida (Definições iOS → Notificações → AR24)
4. App deve ter sido aberta pelo menos uma vez

**404/410 nos envios** → subscription expirada · a app remove automaticamente do KV no próximo envio
