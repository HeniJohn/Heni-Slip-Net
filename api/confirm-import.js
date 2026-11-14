const { redis, KEYS, getConfig, missingEnv } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  try {
    const miss = missingEnv();
    if (miss.length) return res.status(500).json({ error: "env", missing: miss });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const deviceId = String(body.deviceId || "");
    if (deviceId.length < 8) return res.status(400).json({ error: "device" });

    const cfg = await getConfig();
    if (Date.now() > cfg.expiresAt) return res.status(410).json({ error: "expired" });

    // 1) Device kun duraan import godheera? Yoo eeyyee slot hin xiqqaatu.
    const added = await redis.sadd(KEYS.devices, deviceId);
    if (added === 0) {
      return res.status(200).json({ imported: true, slotsLeft: cfg.slotsLeft, already: true });
    }

    // 2) Slot haaraa fudhadhu (atomic INCR)
    const used = await redis.incr(KEYS.used);
    if (used > cfg.total) {
      await redis.decr(KEYS.used);
      await redis.srem(KEYS.devices, deviceId);
      return res.status(409).json({ error: "full", slotsLeft: 0 });
    }

    return res.status(200).json({ imported: true, slotsLeft: cfg.total - used });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server", message: String(e && e.message) });
  }
};
