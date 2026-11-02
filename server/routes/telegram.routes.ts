import { Bot } from "grammy";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { telegramHandler } from "../handlers/telegram.handlers.js";
import { broadcastBotCommands } from "../clients/grammy.client.js";
import { getTelegramWebhookConfig } from "../methods/telegram.methods.js";
import { quickPanelAuth } from "../middleware/quickPanelAuth.js";

const router = Router();

// The passcode is short enough to guess at high volume, so throttle panel
// calls before the authentication check runs.
const quickPanelLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    ok: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many quick panel requests. Please wait a minute.",
    },
  },
});

router.post("/webhook", telegramHandler);

router.get("/webhook/register", quickPanelLimiter, quickPanelAuth, async (_req, res) => {
  try {
    const { token, secret, url } = getTelegramWebhookConfig();
    const bot = new Bot(token);
    const payload: Parameters<typeof bot.api.setWebhook>[1] = {
      allowed_updates: ["message", "callback_query"],
    };
    if (secret) payload.secret_token = secret;
    await bot.api.setWebhook(url, payload);
    void broadcastBotCommands().catch((error: unknown) => {
      console.error("Telegram bot activation failed:", error);
    });
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

router.get("/webhook/delete", quickPanelLimiter, quickPanelAuth, async (_req, res) => {
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

router.get("/webhook/info", quickPanelLimiter, quickPanelAuth, async (_req, res) => {
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
