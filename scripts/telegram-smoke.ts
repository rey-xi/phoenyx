/**
 * Offline checks for the Telegram callback payloads and message text rules.
 *
 * Run with `npm run check:telegram`. No network, no credentials.
 */
import assert from "node:assert/strict";
import {
  CALLBACK_DATA_MAX_BYTES,
  callbackActions,
  callbackPatterns,
  reviewCallbackData,
  sanitizeCallbackDataField,
} from "../server/methods/callback.methods.js";
import {
  TELEGRAM_MESSAGE_MAX_CHARS,
  composeTelegramMessage,
} from "../server/methods/message.methods.js";

const sessionId = "8f14e45f-ceea-467a-9c1c-1d0c9a5e6b2d";

const cases: Array<{ pattern: RegExp; data: string; groups: string[] }> = [
  {
    pattern: callbackPatterns.auth,
    data: reviewCallbackData(sessionId, callbackActions.authApprove),
    groups: [sessionId, "pass"],
  },
  {
    pattern: callbackPatterns.auth,
    data: reviewCallbackData(sessionId, callbackActions.authReject),
    groups: [sessionId, "flag"],
  },
  {
    pattern: callbackPatterns.auth,
    data: reviewCallbackData(sessionId, callbackActions.authFlagEmail),
    groups: [sessionId, "flag-email"],
  },
  {
    pattern: callbackPatterns.code,
    data: reviewCallbackData(sessionId, callbackActions.smsCode),
    groups: [sessionId, "sms"],
  },
  {
    pattern: callbackPatterns.code,
    data: reviewCallbackData(sessionId, callbackActions.emailCode),
    groups: [sessionId, "email"],
  },
  {
    pattern: callbackPatterns.codeDecision,
    data: reviewCallbackData(sessionId, callbackActions.verifySmsApprove),
    groups: [sessionId, "sms", "pass"],
  },
  {
    pattern: callbackPatterns.codeDecision,
    data: reviewCallbackData(sessionId, callbackActions.verifyEmailReject),
    groups: [sessionId, "email", "flag"],
  },
  {
    pattern: callbackPatterns.emailLink,
    data: reviewCallbackData(sessionId, callbackActions.emailLink),
    groups: [sessionId],
  },
  {
    pattern: callbackPatterns.emailLinkApprove,
    data: reviewCallbackData(sessionId, callbackActions.verifyLinkApprove),
    groups: [sessionId],
  },
  {
    pattern: callbackPatterns.promptYes,
    data: reviewCallbackData(sessionId, callbackActions.promptYes),
    groups: [sessionId],
  },
  {
    pattern: callbackPatterns.promptYesApprove,
    data: reviewCallbackData(sessionId, callbackActions.verifyPromptYesApprove),
    groups: [sessionId],
  },
  {
    pattern: callbackPatterns.promptNumPage,
    data: reviewCallbackData(sessionId, callbackActions.promptNumPage(1)),
    groups: [sessionId],
  },
  {
    pattern: callbackPatterns.promptNumApprove,
    data: reviewCallbackData(sessionId, callbackActions.verifyPromptNumApprove),
    groups: [sessionId],
  },
  {
    pattern: callbackPatterns.complete,
    data: reviewCallbackData(sessionId, callbackActions.complete),
    groups: [sessionId],
  },
  {
    pattern: callbackPatterns.restart,
    data: reviewCallbackData(sessionId, callbackActions.restart),
    groups: [sessionId],
  },
];

let widest = 0;
for (const testCase of cases) {
  const bytes = Buffer.byteLength(testCase.data, "utf8");
  widest = Math.max(widest, bytes);
  assert.ok(
    bytes <= CALLBACK_DATA_MAX_BYTES,
    `${testCase.data} is ${bytes} bytes`,
  );
  const match = testCase.pattern.exec(testCase.data);
  assert.ok(match, `${testCase.data} does not match ${testCase.pattern}`);
  assert.deepEqual(match.slice(1), testCase.groups);
}

for (const value of [1, 9, 10, 99]) {
  const data = reviewCallbackData(
    sessionId,
    callbackActions.promptNumValue(value),
  );
  widest = Math.max(widest, Buffer.byteLength(data, "utf8"));
  const match = callbackPatterns.promptNumValue.exec(data);
  assert.ok(match, `${data} does not match the prompt-num pattern`);
  assert.equal(match[2], String(value));
  // Every number button must also be matched by exactly one handler: the
  // generic prompt-num trigger is anchored on end-of-string, so it must not
  // swallow a numeric action.
  assert.equal(callbackPatterns.promptNumPage.test(data), false);
}

assert.throws(() => reviewCallbackData(sessionId, "x".repeat(40)), /max 64/);

// The previous scheme overflowed the limit; keep a regression witness.
assert.ok(
  Buffer.byteLength(`lead-review:${sessionId}:verify-email-code`, "utf8") > 64,
);

function assertNoLoneSurrogate(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      assert.ok(
        next >= 0xdc00 && next <= 0xdfff,
        `unpaired high surrogate at ${i}`,
      );
      i++;
    } else {
      assert.ok(
        code < 0xdc00 || code > 0xdfff,
        `unpaired low surrogate at ${i}`,
      );
    }
  }
}

const long = "a".repeat(TELEGRAM_MESSAGE_MAX_CHARS - 1) + "👍🏽".repeat(10);
const truncated = composeTelegramMessage(long);
assert.ok(truncated.length <= TELEGRAM_MESSAGE_MAX_CHARS);
assert.ok(truncated.endsWith("…"));
assertNoLoneSurrogate(truncated);

const exact = composeTelegramMessage("b".repeat(TELEGRAM_MESSAGE_MAX_CHARS));
assert.equal(exact.length, TELEGRAM_MESSAGE_MAX_CHARS);
assert.equal(exact.endsWith("…"), false);

assert.equal(
  composeTelegramMessage(undefined, "", "  header  ", null, "body"),
  "header\n\nbody",
);

assert.equal(
  sanitizeCallbackDataField("pass\u202Eword\u200B \n\t second"),
  "pass word second",
);
assert.equal(sanitizeCallbackDataField("\u0000\u0007 reset"), "reset");
assert.equal(sanitizeCallbackDataField("   "), "");

console.log(
  `ok: ${cases.length + 4} callback payloads, widest ${widest}/${CALLBACK_DATA_MAX_BYTES} bytes; text limits and sanitising hold`,
);
