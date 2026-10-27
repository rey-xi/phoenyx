import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import {
  getTelegramMode,
  testTelegramUpdate,
} from "../methods/telegram.methods";
import { bot } from "../clients/grammy.client";

export const telegramHandler: RequestHandler = async (request, response) => {
  if (getTelegramMode() !== "webhook") {
    response.status(409).json({
      ok: false,
      error: {
        code: "WRONG_TELEGRAM_MODE",
        message: "The Telegram bot is not in webhook mode.",
      },
    });
    return;
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.get("X-Telegram-Bot-Api-Secret-Token");
  if (!secret || !provided) {
    response.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Webhook authorization failed." },
    });
    return;
  }
  const expectedBytes = Buffer.from(secret);
  const providedBytes = Buffer.from(provided);
  if (
    expectedBytes.length !== providedBytes.length ||
    !timingSafeEqual(expectedBytes, providedBytes)
  ) {
    response.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Webhook authorization failed." },
    });
    return;
  }
  if (!testTelegramUpdate(request.body)) {
    response.status(400).json({
      ok: false,
      error: {
        code: "INVALID_UPDATE",
        message: "The Telegram update is invalid.",
      },
    });
    return;
  }
  try {
    await bot.handleUpdate(request.body);
    response.sendStatus(200);
  } catch {
    console.error("Telegram webhook update could not be processed.");
    response.status(503).json({
      ok: false,
      error: {
        code: "WEBHOOK_UNAVAILABLE",
        message: "The Telegram update could not be processed.",
      },
    });
  }
};
