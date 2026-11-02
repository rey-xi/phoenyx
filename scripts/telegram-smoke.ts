/**
 * Offline checks for the Telegram callback payloads and message text rules.
 *
 * Run with `npm run check:telegram`. No network, no credentials.
 */
import assert from "node:assert/strict";
import {
  CALLBACK_DATA_MAX_BYTES,
  reviewActions,
  reviewCallbackData,
  reviewCallbackPatterns,
} from "../server/methods/telegram.callbacks.js";
import {
  TELEGRAM_MESSAGE_MAX_CHARS,
  composeTelegramMessage,
  sanitizeCallbackDataField,
} from "../server/methods/callback.methods.js";

const sessionId = "8f14e45f-ceea-467a-9c1c-1d0c9a5e6b2d";

const cases: Array<{ pattern: RegExp; data: string; groups: string[] }> = [
  {
    pattern: reviewCallbackPatterns.auth,
    data: reviewCallbackData(sessionId, reviewActions.authApprove),
    groups: [sessionId, "pass"],
  },
  {
    pattern: reviewCallbackPatterns.auth,
    data: reviewCallbackData(sessionId, reviewActions.authReject),
    groups: [sessionId, "flag"],
  },
  {
    pattern: reviewCallbackPatterns.auth,
    data: reviewCallbackData(sessionId, reviewActions.authFlagEmail),
    groups: [sessionId, "flag-email"],
  },
  {
    pattern: reviewCallbackPatterns.code,
    data: reviewCallbackData(sessionId, reviewActions.smsCode),
    groups: [sessionId, "sms"],
  },
  {
    pattern: reviewCallbackPatterns.code,
    data: reviewCallbackData(sessionId, reviewActions.emailCode),
    groups: [sessionId, "email"],
  },
  {
    pattern: reviewCallbackPatterns.codeDecision,
    data: reviewCallbackData(sessionId, reviewActions.verifySmsApprove),
    groups: [sessionId, "sms", "pass"],
  },
  {
    pattern: reviewCallbackPatterns.codeDecision,
    data: reviewCallbackData(sessionId, reviewActions.verifyEmailReject),
    groups: [sessionId, "email", "flag"],
  },
  {
    pattern: reviewCallbackPatterns.emailLink,
    data: reviewCallbackData(sessionId, reviewActions.emailLink),
    groups: [sessionId],
  },
  {
    pattern: reviewCallbackPatterns.emailLinkApprove,
    data: reviewCallbackData(sessionId, reviewActions.verifyLinkApprove),
    groups: [sessionId],
  },
  {
    pattern: reviewCallbackPatterns.promptYes,
    data: reviewCallbackData(sessionId, reviewActions.promptYes),
    groups: [sessionId],
  },
  {
    pattern: reviewCallbackPatterns.promptYesApprove,
    data: reviewCallbackData(sessionId, reviewActions.verifyPromptYesApprove),
    groups: [sessionId],
  },
  {
    pattern: reviewCallbackPatterns.promptNum,
    data: reviewCallbackData(sessionId, reviewActions.promptNum),
    groups: [sessionId],
  },
  {
    pattern: reviewCallbackPatterns.promptNumApprove,
    data: reviewCallbackData(sessionId, reviewActions.verifyPromptNumApprove),
    groups: [sessionId],
  },
  {
    pattern: reviewCallbackPatterns.complete,
    data: reviewCallbackData(sessionId, reviewActions.complete),
    groups: [sessionId],
  },
  {
    pattern: reviewCallbackPatterns.restart,
    data: reviewCallbackData(sessionId, reviewActions.restart),
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
    reviewActions.promptNumValue(value),
  );
  widest = Math.max(widest, Buffer.byteLength(data, "utf8"));
  const match = reviewCallbackPatterns.promptNumValue.exec(data);
  assert.ok(match, `${data} does not match the prompt-num pattern`);
  assert.equal(match[2], String(value));
  // Every number button must also be matched by exactly one handler: the
  // generic prompt-num trigger is anchored on end-of-string, so it must not
  // swallow a numeric action.
  assert.equal(reviewCallbackPatterns.promptNum.test(data), false);
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
const truncated = composeTelegramMessage([long]);
assert.ok(truncated.length <= TELEGRAM_MESSAGE_MAX_CHARS);
assert.ok(truncated.endsWith("…"));
assertNoLoneSurrogate(truncated);

const exact = composeTelegramMessage(["b".repeat(TELEGRAM_MESSAGE_MAX_CHARS)]);
assert.equal(exact.length, TELEGRAM_MESSAGE_MAX_CHARS);
assert.equal(exact.endsWith("…"), false);

assert.equal(
  composeTelegramMessage([undefined, "", "  header  ", null, "body"]),
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
