const { Redis } = require("@upstash/redis");

const KEYS = {
  used: "slipnet:used",        // lakkoofsa slot itti fayyadaman
  devices: "slipnet:devices",  // device import godhan (set)
  expires: "slipnet:expiresAt"
};

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Env hin jiru yoo function hin cabu, JSON dogoggora ibsu deebisa
function missingEnv() {
  const miss = [];
  if (!REDIS_URL) miss.push("UPSTASH_REDIS_REST_URL");
  if (!REDIS_TOKEN) miss.push("UPSTASH_REDIS_REST_TOKEN");
  if (!process.env.CONFIG_LINK) miss.push("CONFIG_LINK");
  return miss;
}

const redis = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

async function getConfig() {
  const total = Number(process.env.SLOTS_TOTAL || 100);

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

module.exports = { redis, KEYS, getConfig, missingEnv };
