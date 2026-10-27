# Invitation and Provider Sign-In Experience

A responsive React/Vite frontend with a TypeScript/Express API. The app opens with a premium invitation, then offers provider-specific sign-in forms and a Telegram lead-notification workflow.

Provider pages display a prominent notice that they are not official provider sign-in pages. OAuth is not yet integrated. The password field stays in the browser, is cleared after submission, and is never sent to the API or Telegram. Only the email, consent confirmation, and provider-specific non-secret field are sent to Telegram after the user consents.

## Requirements and local development

- Node.js 20 or newer
- npm 10 or newer

Install and run:

```sh
npm install
npm run dev
```

The frontend is at <http://localhost:5173>. The Express API is at <http://localhost:3001>; Vite proxies `/api` requests to it. Local mail-flow events use SQLite through libSQL at `mail-flow.local.db` by default. That local file is ignored by Git and is not used in production.

Copy `.env.example` to `.env` to configure local values. The app loads `.env` for the API and webhook registration script. Telegram configuration is optional for browsing; mail form submission requires a reachable, configured bot and chat.

Useful commands:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run build` type-checks before producing `dist/`. `npm test` runs the backend mail-flow tests using a local test database.

## Navigation and provider flows

The user flow is:

1. `/` — animated invitation landing.
2. `/invitation` — invitation card.
3. `/providers` — choose from six mail-provider experiences.
4. `/mail-flow/:provider` — provider-specific form.

The selector also has a **Classic provider flows** section. It includes Google, Microsoft, and Yahoo pages and `/api/auth/*` endpoints. Provider sign-in is not implemented until OAuth is integrated.

Mail provider identifiers are consistent across the API, storage, and Telegram notifications:

| Identifier | Display name |
| --- | --- |
| `google` | Google / Gmail |
| `outlook` | Outlook.com / Hotmail |
| `microsoft365` | Microsoft 365 / Office 365 |
| `yahoo` | Yahoo Mail |
| `aol` | AOL Mail |
| `other` | Other email provider |

Lead forms send an email address, consent, and the selected provider-specific field to `/api/leads`. Passwords are rejected by the API and are never forwarded. Reference-code mail-flow endpoints remain available separately for existing integrations.

## Telegram setup

### Create and configure the bot

1. In Telegram, open **@BotFather**, run `/newbot`, and follow its instructions.
2. Copy the bot token into `TELEGRAM_BOT_TOKEN` in your private local `.env` or Vercel environment settings. Never commit or share it.
3. Start the bot locally (instructions below) or deploy/register its webhook.
4. Send `/whoami` to the bot. It replies with the numeric Telegram user ID and the current chat ID. Use the chat where you want lead notifications delivered as `TELEGRAM_CHAT_ID`. Put only the numeric user IDs allowed to decide existing mail-flow events in the comma-separated `TELEGRAM_ALLOWED_USER_IDS` allowlist.
5. For a group chat, add the bot to the group and use `/whoami` in that group to get its chat ID; use the authorized decision-makers’ personal numeric user IDs in the allowlist.

Lead notifications require the bot token and destination chat. Existing mail-flow event decisions additionally require at least one valid numeric allowlisted user ID. Decision callbacks are accepted only from configured user IDs and the original notification message in the configured chat. Unauthorized, forwarded, stale, and duplicate callbacks cannot change an event.

### Local long polling

For local testing, set these values in `.env`:

```dotenv
TELEGRAM_MODE=polling
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_numeric_chat_id
TELEGRAM_ALLOWED_USER_IDS=123456789
```

Then run `npm run dev`. The local Express process starts grammY long polling. If the bot already has a Telegram webhook, remove it before switching to polling:

```sh
npm run telegram:webhook:delete
```

The polling process checks Telegram’s webhook state and refuses to run when a webhook is still registered. Do not run a local polling instance alongside the production webhook for the same bot.

### Vercel webhook

Vercel deployments use Telegram webhooks; no long-running bot process or polling loop is started in a serverless function.

1. Set these environment variables in Vercel and redeploy:

   - `TELEGRAM_MODE=webhook`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_ALLOWED_USER_IDS`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `PUBLIC_BASE_URL` (for example, `https://your-app.example`)
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`

2. Generate a webhook secret with a cryptographically secure random value containing letters, digits, `_` or `-` (for example, `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`).
3. With the variables available in your local shell or `.env`, run:

   ```sh
   npm run telegram:webhook
   ```

   This registers `https://<PUBLIC_BASE_URL>/api/telegram/webhook` with Telegram using grammY, including the secret token and only the message/callback update types the bot needs.

The webhook route requires Telegram’s `X-Telegram-Bot-Api-Secret-Token` header and uses a constant-time comparison. The `/whoami` command reports the sender and current chat IDs; keep the bot token and webhook secret private.

### Persistent event storage

Production event state must use a remote Turso/libSQL database so separate serverless invocations share durable records and atomic status transitions. Do not set a local `file:` URL in production.

Create a Turso database and token using the Turso CLI, then set:

```dotenv
TURSO_DATABASE_URL=libsql://your-database-name-your-org.turso.io
TURSO_AUTH_TOKEN=your_database_auth_token
```

For example, the Turso CLI commands are:

```sh
turso auth login
turso db create mail-flow
turso db show mail-flow --url
turso db tokens create mail-flow
```

The API initializes its event table automatically and migrates existing event records to the renamed table on first use. It refuses to fall back to a local file in production. No Supabase integration was present in the project.

## Existing reference-code mail-flow endpoints

1. A provider selection creates a UUID event in persistent storage with status `pending` and a 30-minute expiration.
2. The selected page submits the allowlisted form fields and event ID. The backend verifies provider/event association and sends a Telegram message with the submitted details and success/failure decision buttons.
3. The API reports a pending status only after Telegram accepts the notification. If delivery fails, the event remains pending, the API returns an explicit retryable error, and the same event can be safely retried without falsely reporting a decision.
4. The page polls the status endpoint every two seconds, with a bounded wait and request timeout. It stops polling on success, failure, expiration, timeout, or unmount.
5. A configured Telegram user presses **Approve Request** or **Decline Request**. The backend atomically changes only a pending, unexpired event; the first decision wins. The bot updates the original message and removes its buttons.
6. Pending events expire after 30 minutes. Expiration is enforced on status reads, submissions, and callback decisions without a background worker.

No notification contains credentials, email addresses, tokens, or other authentication secrets. The allowed notification values are event ID, provider, submission time, fictional display name, reference code, optional label, and status.

## API

API errors use `{ "ok": false, "error": { "code": "...", "message": "..." } }`. Request bodies are limited to 10 KB. The mail-flow write endpoints are limited to 20 requests/minute per client and status reads to 90/minute to accommodate two-second polling.

### Lead endpoint

`POST /api/leads` validates provider-specific lead details and sends them to the configured Telegram chat. The endpoint is rate-limited to 10 requests per minute. Telegram bot token and destination chat must be configured. It never accepts or forwards passwords.

Example:

```json
{
  "provider": "microsoft365",
  "email": "person@example.com",
  "consent": true,
  "customField": {
    "name": "workspace",
    "value": "Example organization"
  }
}
```

Required custom fields are `workspace` for Microsoft and Microsoft 365, `interest` for Yahoo, `folder` for Outlook and AOL, and `providerLabel` for Other. Google accepts an optional `label`.

### Reference-code endpoints

The forms below remain available for existing integrations; the provider sign-in pages use the lead endpoint instead.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/mail-flow/:provider/start` | Create a pending event for an allowlisted provider |
| `POST` | `/api/mail-flow/:provider/submit` | Validate a form submission and send its Telegram notice |
| `GET` | `/api/mail-flow/events/:eventId` | Read status; marks a pending event expired when needed |
| `POST` | `/api/telegram/webhook` | Receive secret-verified Telegram updates |

Start example:

```http
POST /api/mail-flow/google/start
```

```json
{
  "ok": true,
  "eventId": "generated-uuid",
  "provider": "google",
  "status": "pending"
}
```

Submit example:

```http
POST /api/mail-flow/google/submit
Content-Type: application/json
```

```json
{
  "eventId": "generated-uuid",
  "provider": "google",
  "displayName": "Alex Morgan",
  "referenceCode": "INV-AB1234",
  "note": "Sample inbox"
}
```

```json
{
  "ok": true,
  "eventId": "generated-uuid",
  "provider": "google",
  "status": "pending",
  "submittedAt": "2026-10-17T12:00:00.000Z"
}
```

The response means the Telegram notice was delivered; it is **not** a final success. Telegram delivery errors return HTTP 503 and a retryable error. The event status remains pending until Telegram records a decision.

Status example:

```http
GET /api/mail-flow/events/generated-uuid
```

```json
{
  "ok": true,
  "eventId": "generated-uuid",
  "provider": "google",
  "status": "pending",
  "createdAt": "2026-10-17T11:55:00.000Z",
  "expiresAt": "2026-10-17T12:25:00.000Z",
  "submittedAt": "2026-10-17T12:00:00.000Z",
  "submitted": true
}
```

Statuses are `pending`, `success`, `failed`, and `expired`. Unknown providers return 404; malformed fields or event IDs return 400; unknown events return 404; provider mismatches return 400; expired events return 410.

### Existing endpoints

`GET /api/health` remains available and reports general health plus boolean Telegram and persistent-storage configuration indicators without exposing secrets.

Example response:

```json
{
  "ok": true,
  "status": "healthy",
  "telegramConfigured": false,
  "persistentStorageConfigured": true
}
```

The classic provider API remains available:

| Method | Endpoint |
| --- | --- |
| `POST` | `/api/auth/google/start` |
| `POST` | `/api/auth/google/submit` |
| `POST` | `/api/auth/microsoft/start` |
| `POST` | `/api/auth/microsoft/submit` |
| `POST` | `/api/auth/yahoo/start` |
| `POST` | `/api/auth/yahoo/submit` |

All three `/start` endpoints take no body and return the existing route:

```json
{ "ok": true, "provider": "google", "next": "/provider-flow/google" }
```

Existing `/submit` request bodies are provider-specific:

```json
{ "provider": "google", "displayName": "Alex Morgan", "referenceCode": "INV-AB1234" }
```

```json
{ "provider": "microsoft", "displayName": "Alex Morgan", "referenceCode": "INV-AB1234", "workspace": "Northstar Studio" }
```

```json
{ "provider": "yahoo", "displayName": "Alex Morgan", "referenceCode": "INV-AB1234", "interest": "weekend gardening" }
```

Each successful provider submission returns `{ "ok": true, "provider": "<provider>", "status": "submitted", "message": "<provider> submission received successfully." }`. These reference-code endpoints do not perform authentication.

The webhook accepts Telegram JSON updates only with the configured secret header:

```http
POST /api/telegram/webhook
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
Content-Type: application/json
```

Telegram receives HTTP 200 for a processed update. A missing/invalid secret returns 401, an invalid update returns 400, and an unconfigured or temporarily unavailable bot returns 503.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Local Express port; defaults to `3001` |
| `TURSO_DATABASE_URL` | Remote Turso/libSQL URL in production; local SQLite default for development |
| `TURSO_AUTH_TOKEN` | Turso database token; leave blank for local SQLite |
| `TELEGRAM_MODE` | `polling` for local development or `webhook` for deployment |
| `TELEGRAM_BOT_TOKEN` | BotFather-issued bot token |
| `TELEGRAM_CHAT_ID` | Numeric destination chat ID |
| `TELEGRAM_ALLOWED_USER_IDS` | Comma-separated numeric user IDs allowed to decide |
| `TELEGRAM_WEBHOOK_SECRET` | Secret header value used by Telegram’s webhook |
| `PUBLIC_BASE_URL` | HTTPS origin used by webhook registration |

`.env.example` contains a local-only database path and blank secret placeholders. Do not commit `.env`, bot tokens, webhook secrets, allowlist details, or database credentials.

## Vercel deployment

The project uses `api/index.ts` as the Express function entry point, `vercel.json` for the Vite build and SPA page rewrites, and `/api/telegram/webhook` for incoming bot updates. `/invitation`, `/providers`, `/mail-flow/*`, and `/provider-flow/*` are routed to the SPA. Configure remote Turso storage and Telegram webhook environment variables before testing a production event.

Test the deployment with:

1. `GET /api/health`
2. Start a request for each provider and verify the returned identifier.
3. Submit test lead details and verify the Telegram message contains no password or authentication secret.
4. Try an unauthorized Telegram account, then an allowlisted account; verify only the latter can record a decision.
5. Confirm the frontend displays the stored final status and that an event cannot be decided twice.
