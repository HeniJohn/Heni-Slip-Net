const { Redis } = require("@upstash/redis");
const crypto = require("crypto");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

// Redis keessatti furtuuwwan (keys)
const K = {
  cfg: id => `slipnet:cfg:${id}`,       // config (maqaa, link, slot, yeroo)
  used: id => `slipnet:used:${id}`,     // slot itti fayyadaman
  dev: id => `slipnet:dev:${id}`,       // device import godhan
  ids: "slipnet:ids",                   // config hundaa (sorted set)
  latest: "slipnet:latest",             // config dhumaa
  pw: "slipnet:admin:pw",               // admin password (hash)
  fail: ip => `slipnet:fail:${ip}`      // yaalii password dogoggoraa
};

function redisMissing() {
  return redis ? [] : ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
}

function parseJson(v) {
  if (v && typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

function cleanId(c) {
  return String(c || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
}

async function resolveId(c) {
  const id = cleanId(c);
  if (id) return id;
  const latest = await redis.get(K.latest);
  return latest ? String(latest) : "";
}

async function getCfg(id) {
  if (!id) return null;
  return parseJson(await redis.get(K.cfg(id)));
}

function getBody(req) {
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch { return {}; } }
  return req.body || {};
}

function getIp(req) {
  const h = req.headers || {};
  return String(h["x-forwarded-for"] || h["x-real-ip"] || "unknown").split(",")[0].trim();
}

/* ====== Admin password ====== */
function safeEq(a, b) {
  const A = crypto.createHash("sha256").update(String(a)).digest();
  const B = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(A, B);
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");

async function passwordIsSet() {
  if (process.env.ADMIN_PASSWORD) return true;
  return !!(await redis.get(K.pw));
}

async function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  // nx: al tokko qofa kaa'ama, nama biraa irra hin barreessu
  const r = await redis.set(K.pw, salt + ":" + hashPw(pw, salt), { nx: true });
  return r !== null;
}

async function checkPassword(pw) {
  pw = String(pw || "");
  if (process.env.ADMIN_PASSWORD) return safeEq(pw, process.env.ADMIN_PASSWORD);
  const rec = await redis.get(K.pw);
  if (!rec) return false;
  const [salt, hash] = String(rec).split(":");
  return safeEq(hashPw(pw, salt), hash);
}

async function tooManyFails(ip) {
  return Number((await redis.get(K.fail(ip))) || 0) >= 10;
}
async function addFail(ip) {
  const n = await redis.incr(K.fail(ip));
  if (n === 1) await redis.expire(K.fail(ip), 600);
}
const clearFail = ip => redis.del(K.fail(ip));

module.exports = {
  redis, K, redisMissing, parseJson, cleanId, resolveId, getCfg, getBody, getIp,
  passwordIsSet, setPassword, checkPassword, tooManyFails, addFail, clearFail
};
