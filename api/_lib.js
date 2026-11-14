import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
});

export const KEYS = {
  used: "slipnet:used",        // lakkoofsa slot itti fayyadaman
  devices: "slipnet:devices",  // device import godhan (set)
  expires: "slipnet:expiresAt"
};

export async function getConfig() {
  const total = Number(process.env.SLOTS_TOTAL || 100);

  // EXPIRES_AT (ISO) yoo kaa'e isa fayyadama; yoo hin kaa'in al tokko 24 sa'aatii eegala
  let expiresAt = process.env.EXPIRES_AT ? new Date(process.env.EXPIRES_AT).getTime() : 0;
  if (!expiresAt) {
    await redis.set(KEYS.expires, Date.now() + 24 * 3600 * 1000, { nx: true });
    expiresAt = Number(await redis.get(KEYS.expires));
  }

  const used = Number((await redis.get(KEYS.used)) || 0);
  return {
    name: process.env.CONFIG_NAME || "Heni SlipNet",
    total,
    used,
    slotsLeft: Math.max(0, total - used),
    expiresAt
  };
}
