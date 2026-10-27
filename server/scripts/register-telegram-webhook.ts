import "dotenv/config";
import { Bot } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");

if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN.");

const bot = new Bot(token);

if (process.argv.includes("--delete")) {
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  console.log("Telegram webhook removed; local polling can now be enabled.");
} else {
  if (!secret || !baseUrl) {
    throw new Error("Set TELEGRAM_WEBHOOK_SECRET and PUBLIC_BASE_URL.");
  }

  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(baseUrl)) {
    throw new Error("PUBLIC_BASE_URL must be an HTTPS origin without a path.");
  }

  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET must contain 1-256 letters, digits, underscores, or hyphens.",
    );
  }

  await bot.api.setWebhook(`${baseUrl}/api/telegram/webhook`, {
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });

  console.log(
    `Telegram webhook registered for ${baseUrl}/api/telegram/webhook.`,
  );
}
