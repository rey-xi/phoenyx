import { Bot } from "grammy";
import { Router } from "express";
import { telegramHandler } from "../handlers/telegram.handlers.js";
import { activateTelegramBot } from "../clients/grammy.client";

const router = Router();

function getWebhookConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!token || !host) {
    throw new Error(
      "Missing env vars: TELEGRAM_BOT_TOKEN and VERCEL_PROJECT_PRODUCTION_URL are required.",
    );
  }
  const url = `https://${host.replace(/\/+$/, "")}/api/telegram/webhook`;
  if (secret && !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET must be 1-256 chars: letters, digits, underscores, hyphens.",
    );
  }
  return { token, secret, url };
}

router.post("/webhook", telegramHandler);

router.get("/webhook/register", async (_req, res) => {
  try {
    const { token, secret, url } = getWebhookConfig();
    const bot = new Bot(token);
    const payload: Parameters<typeof bot.api.setWebhook>[1] = {
      allowed_updates: ["message", "callback_query"],
    };
    if (secret) payload.secret_token = secret;
    await bot.api.setWebhook(url, payload);
    await activateTelegramBot();
    res.json({
      ok: true,
      url,
      secretEnforced: Boolean(secret),
      message: secret
        ? `Webhook set to ${url} (secret enforced)`
        : `Webhook set to ${url} (no secret; endpoint is open)`,
    });
  } catch (err) {
    console.error("setWebhook failed:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get("/webhook/delete", async (_req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is required.");
    }
    const bot = new Bot(token);
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    res.json({ ok: true, message: "Webhook removed." });
  } catch (err) {
    console.error("deleteWebhook failed:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get("/webhook/info", async (_req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is required.");
    }
    const bot = new Bot(token);
    const info = await bot.api.getWebhookInfo();
    res.json({ ok: true, info });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
