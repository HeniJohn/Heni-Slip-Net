const { redis, K, redisMissing, resolveId, getCfg, getBody, cleanDevice } = require("./_lib");

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

    // Device kun duraan import godheera? Yoo eeyyee slot hin xiqqaatu.
    if ((await redis.sismember(K.dev(id), deviceId)) === 1) {
      const u = Number((await redis.get(K.used(id))) || 0);
      return res.status(200).json({ imported: true, already: true, slotsLeft: Math.max(0, cfg.total - u) });
    }

    // Link fudhate (claim) qofa slot qabsiisuu danda'a
    const stored = await redis.get(K.claim(id, deviceId));
    if (!stored || String(stored) !== String(body.nonce || "")) {
      return res.status(403).json({ error: "claim" });
    }

    const added = await redis.sadd(K.dev(id), deviceId);
    if (added === 0) {
      const u = Number((await redis.get(K.used(id))) || 0);
      return res.status(200).json({ imported: true, already: true, slotsLeft: Math.max(0, cfg.total - u) });
    }

    const used = await redis.incr(K.used(id));         // atomic
    if (used > cfg.total) {
      await redis.decr(K.used(id));
      await redis.srem(K.dev(id), deviceId);
      return res.status(409).json({ error: "full", slotsLeft: 0 });
    }
    await redis.del(K.claim(id, deviceId));

    return res.status(200).json({ imported: true, slotsLeft: cfg.total - used });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server", message: String(e && e.message) });
  }
};
