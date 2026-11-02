import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import {
  getTelegramMode,
  canReadTelegramUpdate,
  isProductionRuntime,
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
  if (!secret) {
    // Without the shared secret anyone who learns this URL can forge updates
    // and approve or reject leads. Fail closed in production, warn locally.
    if (isProductionRuntime()) {
      console.error(
        "TELEGRAM_WEBHOOK_SECRET is not set; refusing to process webhook updates.",
      );
      response.status(500).json({
        ok: false,
        error: {
          code: "WEBHOOK_SECRET_MISSING",
          message: "The Telegram webhook is not configured securely.",
        },
      });
      return;
    }
    console.warn(
      "TELEGRAM_WEBHOOK_SECRET is not set; the webhook endpoint is unauthenticated.",
    );
  } else {
    const provided = request.get("X-Telegram-Bot-Api-Secret-Token");
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
  if (!canReadTelegramUpdate(request.body)) {
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
  // Always acknowledge: a non-2xx response makes Telegram replay the update,
  // which duplicates cards and re-runs approval actions.
  response.sendStatus(200);
};
