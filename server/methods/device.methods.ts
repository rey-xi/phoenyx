import { Redis } from "@upstash/redis";
import { Device } from "../schemas/device.schema";

const redis = Redis.fromEnv();

type StoredDevice = {
  deviceId: string;
  clientId: string;
  fingerprint: string;
  components: Record<string, string | number | boolean>;
  userAgent: string;
  firstSeen: string;
  lastSeen: string;
  seenCount: number;
};

const MATCH_THRESHOLD = 0.7;
const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 365;

function scoreMatch(
  a: StoredDevice["components"],
  b: Device["components"],
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (keys.size === 0) return 0;
  let matches = 0;
  for (const k of keys) if (a[k] === b[k]) matches++;
  return matches / keys.size;
}

export async function secureDeviceSlot(device: Device): Promise<{
  deviceId: string;
  status: "known" | "migrated" | "new";
  trustScore: number;
}> {
  const byClient = await redis.get<StoredDevice>(
    `device:client:${device.clientId}`,
  );
  if (byClient) {
    const score = scoreMatch(byClient.components, device.components);
    if (score >= MATCH_THRESHOLD) {
      byClient.lastSeen = new Date().toISOString();
      byClient.seenCount += 1;
      await redis.set(`device:client:${device.clientId}`, byClient, {
        ex: DEVICE_TTL_SECONDS,
      });
      return {
        deviceId: byClient.deviceId,
        status: "known",
        trustScore: score,
      };
    }
  }
  const byFp = await redis.get<StoredDevice>(`device:fp:${device.fingerprint}`);
  if (byFp) {
    const score = scoreMatch(byFp.components, device.components);
    if (score >= MATCH_THRESHOLD) {
      const updated: StoredDevice = {
        ...byFp,
        clientId: device.clientId,
        lastSeen: new Date().toISOString(),
        seenCount: byFp.seenCount + 1,
      };
      await redis.set(`device:client:${device.clientId}`, updated, {
        ex: DEVICE_TTL_SECONDS,
      });
      return {
        deviceId: byFp.deviceId,
        status: "migrated",
        trustScore: score,
      };
    }
  }
  const deviceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: StoredDevice = {
    deviceId,
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
  return { deviceId, status: "new", trustScore: 1 };
}

export async function linkDeviceToAnchor(
  deviceId: string,
  anchor: string,
): Promise<void> {
  await Promise.all([
    redis.sadd(`device:${deviceId}:anchors`, anchor),
    redis.sadd(`anchor:${anchor}:devices`, deviceId),
  ]);
}

export async function isKnownDeviceForAnchor(
  deviceId: string,
  anchor: string,
): Promise<boolean> {
  return (await redis.sismember(`anchor:${anchor}:devices`, deviceId)) === 1;
}

export async function isKnownAnchorForDevice(
  deviceId: string,
  anchor: string,
): Promise<boolean> {
  return (await redis.sismember(`device:${deviceId}:anchors`, anchor)) === 1;
}
