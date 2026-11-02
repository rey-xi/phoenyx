export const TELEGRAM_MESSAGE_MAX_CHARS = 4096;

/**
 * Joins the card sections and trims the result to Telegram's limit without
 * splitting a surrogate pair (which would make the Bot API reject the whole
 * message with a 400).
 */
export function composeTelegramMessage(
  ...parts: (string | undefined | null)[]
): string {
  const body = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("\n\n")
    .trim();
  if (body.length <= TELEGRAM_MESSAGE_MAX_CHARS) return body;
  let truncated = "";
  let length = 0;
  for (const character of body) {
    if (length + character.length > TELEGRAM_MESSAGE_MAX_CHARS - 1) break;
    truncated += character;
    length += character.length;
  }
  return `${truncated}…`;
}
