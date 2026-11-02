import { Redis } from "@upstash/redis";
import { Device } from "../schemas/device.schema.js";

const redis = Redis.fromEnv();

type DeviceSnapshot = {
  clientId: string;
  fingerprint: string;
  components: Record<string, string | number | boolean>;
  userAgent: string;
  firstSeen: string;
  lastSeen: string;
  seenCount: number;
};

export type DeviceStatus = {
  status: "known" | "migrated" | "new";
  trustScore: number;
  isNewSession: boolean;
  sessionCount: number;
};

const MATCH_THRESHOLD = 0.7;
const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 365;

export async function prospectDevice(device: Device): Promise<DeviceStatus> {
  const byClient = await redis.get<DeviceSnapshot>(
    `device:client:${device.clientId}`,
  );
  if (byClient) {
    const score = compareDevices(byClient.components, device.components);
    if (score >= MATCH_THRESHOLD) {
      const { isNewSession, sessionCount } = await trackDeviceSession(
        device.clientId,
        device.sessionId,
      );
      byClient.lastSeen = new Date().toISOString();
      byClient.seenCount += 1;
      await redis.set(`device:client:${device.clientId}`, byClient, {
        ex: DEVICE_TTL_SECONDS,
      });
      return {
        status: "known",
        trustScore: score,
        isNewSession,
        sessionCount,
      };
    }
  }
  const byFp = await redis.get<DeviceSnapshot>(
    `device:fp:${device.fingerprint}`,
  );
  if (byFp) {
    const score = compareDevices(byFp.components, device.components);
    if (score >= MATCH_THRESHOLD) {
      const oldClientId = byFp.clientId;
      const updated: DeviceSnapshot = {
        ...byFp,
        clientId: device.clientId,
        lastSeen: new Date().toISOString(),
        seenCount: byFp.seenCount + 1,
      };
      if (oldClientId !== device.clientId) {
        const priorSessions = await redis.smembers(
          `device:${oldClientId}:sessions`,
        );
        if (priorSessions.length > 0) {
          await redis.sadd(
            `device:${device.clientId}:sessions`,
            priorSessions[0],
            ...priorSessions.slice(1),
          );
        }
        await Promise.all([
          redis.del(`device:${oldClientId}:sessions`),
          redis.del(`device:client:${oldClientId}`),
        ]);
      }
      const { isNewSession, sessionCount } = await trackDeviceSession(
        device.clientId,
        device.sessionId,
      );
      await Promise.all([
        redis.set(`device:client:${device.clientId}`, updated, {
          ex: DEVICE_TTL_SECONDS,
        }),
        redis.set(`device:fp:${device.fingerprint}`, updated, {
          ex: DEVICE_TTL_SECONDS,
        }),
      ]);
      return {
        status: "migrated",
        trustScore: score,
        isNewSession,
        sessionCount,
      };
    }
  }
  const now = new Date().toISOString();
  const record: DeviceSnapshot = {
    clientId: device.clientId,
    fingerprint: device.fingerprint,
    components: device.components,
    userAgent: device.userAgent,
    firstSeen: now,
    lastSeen: now,
    seenCount: 1,
  };
  await Promise.all([
    redis.set(`device:client:${device.clientId}`, record, {
      ex: DEVICE_TTL_SECONDS,
    }),
    redis.set(`device:fp:${device.fingerprint}`, record, {
      ex: DEVICE_TTL_SECONDS,
    }),
  ]);
  const { isNewSession, sessionCount } = await trackDeviceSession(
    device.clientId,
    device.sessionId,
  );
  return {
    status: "new",
    trustScore: 1,
    isNewSession,
    sessionCount,
  };
}

function parseDeviceBrowser(ua: string): string {
  const edge = /Edg\/[\d.]+/.exec(ua);
  if (edge) return `Edge ${edge[1]}`;
  const firefox = /Firefox\/[\d.]+/.exec(ua);
  if (firefox) return `Firefox`;
  const chrome = /Chrome\/[\d.]+/.exec(ua);
  if (chrome) return `Chrome`;
  const safari = /Version\/[\d.]+ (?:Mobile\/[\w\d]+ )?Safari/.exec(ua);
  if (safari) return `Safari`;
  return "Unknown browser";
}

function parseDeviceOS(ua: string, platformHint: string): string {
  if (/Windows NT 10/.test(ua)) return "Windows 10+";
  if (/Windows NT 6\.3/.test(ua)) return "Windows 8.1";
  if (/Windows NT 6\.1/.test(ua)) return "Windows 7";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return platformHint || "Unknown OS";
}

export async function describeDevice(
  clientId: string,
): Promise<string | undefined> {
  try {
    const [leads, sessions, record] = await Promise.all([
      redis.scard(`client:${clientId}:leads`),
      redis.scard(`client:${clientId}:sessions`),
      redis.get<DeviceSnapshot>(`device:client:${clientId}`),
    ]);
    const intro =
      leads === 0
        ? sessions <= 1
          ? "New Sign In Device"
          : "New Sign In Session"
        : `Resume Sign In`;
    if (!record) return intro;
    const c = record.components ?? {};
    const ua = String(record.userAgent ?? "");
    const os = parseDeviceOS(ua, String(c.uaPlatform || c.platform || ""));
    const browser = parseDeviceBrowser(ua);
    const tz = c.timezone ? String(c.timezone) : "?";
    const lang = c.language ? String(c.language) : "?";
    const visits =
      record.seenCount === 1 ? "1 visit" : `${record.seenCount} visits`;
    return `${intro}\n\n${os}, ${browser}\n${tz}, ${lang}, ${visits}`;
  } catch {
    return undefined;
  }
}

function compareDevices(
  device1: Record<string, unknown>,
  device2: Record<string, unknown>,
): number {
  const keys = new Set([...Object.keys(device1), ...Object.keys(device2)]);
  if (keys.size === 0) return 0;
  let matches = 0;
  for (const k of keys) if (device1[k] === device2[k]) matches++;
  return matches / keys.size;
}

export async function linkDeviceToLead(
  clientId: string,
  leadIdentity: string,
): Promise<void> {
  await Promise.all([
    redis.sadd(`client:${clientId}:leads`, leadIdentity),
    redis.sadd(`lead:${leadIdentity}:clients`, clientId),
  ]);
}

export async function isKnownDeviceForLead(
  clientId: string,
  leadIdentity: string,
): Promise<boolean> {
  return (
    (await redis.sismember(`lead:${leadIdentity}:clients`, clientId)) === 1
  );
}

async function trackDeviceSession(
  clientId: string,
  sessionId: string,
): Promise<{ isNewSession: boolean; sessionCount: number }> {
  const key = `device:${clientId}:sessions`;
  const added = await redis.sadd(key, sessionId);
  const sessionCount = await redis.scard(key);
  await redis.expire(key, DEVICE_TTL_SECONDS);
  return { isNewSession: added === 1, sessionCount };
}
