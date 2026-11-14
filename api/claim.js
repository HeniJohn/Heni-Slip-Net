const crypto = require("crypto");
const { redis, K, redisMissing, resolveId, getCfg, getBody, getIp, rateLimited, cleanDevice } = require("./_lib");

// Link kennamu: user "Import" tuqe qofa, slot jiraate, device kun duraan import hin godhin
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  try {
    const miss = redisMissing();
    if (miss.length) return res.status(500).json({ error: "env", missing: miss });

    const body = getBody(req);
    const deviceId = cleanDevice(body.deviceId);
    if (deviceId.length < 8) return res.status(400).json({ error: "device" });

    const id = await resolveId(body.c);
    const cfg = await getCfg(id);
    if (!cfg) return res.status(404).json({ error: "nocfg" });
    if (Date.now() > cfg.expiresAt) return res.status(410).json({ error: "expired" });

    // IP tokkoon sa'aatii 1 keessatti yeroo 10 qofa
    if (await rateLimited("claim:" + id, getIp(req), 10, 3600)) {
      return res.status(429).json({ error: "rate" });
    }

    if ((await redis.sismember(K.dev(id), deviceId)) === 1) {
      return res.status(409).json({ error: "already" });
    }
    const used = Number((await redis.get(K.used(id))) || 0);
    if (cfg.total - used <= 0) return res.status(409).json({ error: "full" });

    // Nonce: confirm-import kana malee hin hojjetu (slot haala kam iyyuu hin dhumu)
    const nonce = "n" + crypto.randomBytes(16).toString("hex");
    await redis.set(K.claim(id, deviceId), nonce, { ex: 600 });

    return res.status(200).json({ link: cfg.link, nonce });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server", message: String(e && e.message) });
  }
};
