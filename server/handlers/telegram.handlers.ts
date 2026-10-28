import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import {
  getTelegramMode,
  testTelegramUpdate,
} from "../methods/telegram.methods.js";
import { bot, ensureBotInitialized } from "../clients/grammy.client.js";

const PROCESSING_TIMEOUT_MS = 6000;

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

  if (secret) {
    if (!provided) {
      response.status(401).json({
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Webhook authorization failed.",
        },
      });
      return;
    }
    const expected = Buffer.from(secret);
    const actual = Buffer.from(provided);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      response.status(401).json({
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Webhook authorization failed.",
        },
      });
      return;
    }
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

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timeoutHandle = setTimeout(() => resolve("timeout"), PROCESSING_TIMEOUT_MS);
  });

  try {
    await ensureBotInitialized();
    const outcome = await Promise.race([
      bot.handleUpdate(request.body).then(() => "ok" as const),
      timeout,
    ]);
    if (outcome === "timeout") {
      console.warn(
        `Telegram update exceeded ${PROCESSING_TIMEOUT_MS}ms; acknowledging anyway.`,
      );
    }
  } catch (err) {
    console.error("Telegram webhook update could not be processed:", err);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
  response.sendStatus(200);
};
