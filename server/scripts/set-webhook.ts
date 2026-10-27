import "dotenv/config";
import { Bot } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;

if (!token || !host) {
  console.error(
    "Missing env vars: TELEGRAM_BOT_TOKEN and VERCEL_PROJECT_PRODUCTION_URL are required.",
  );
  process.exit(1);
}

const url = `https://${host.replace(/\/+$/, "")}/api/telegram/webhook`;

if (secret && !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error(
    "TELEGRAM_WEBHOOK_SECRET must be 1-256 chars: letters, digits, underscores, hyphens.",
  );
  process.exit(1);
}

const bot = new Bot(token);

const payload: Parameters<typeof bot.api.setWebhook>[1] = {
  allowed_updates: ["message", "callback_query"],
};

if (secret) payload.secret_token = secret;

bot.api
  .setWebhook(url, payload)
  .then(() => {
    console.log(
      secret
        ? `Webhook set to ${url} (secret enforced)`
        : `Webhook set to ${url} (no secret; endpoint is open)`,
    );
  })
  .catch((err) => {
    console.error("setWebhook failed:", err);
    process.exit(1);
  });
