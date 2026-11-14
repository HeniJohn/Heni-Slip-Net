const { redis, K, redisMissing, resolveId, getCfg } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const miss = redisMissing();
    if (miss.length) return res.status(500).json({ error: "env", missing: miss });

    const q = req.query || {};
    const id = await resolveId(q.c);
    const cfg = await getCfg(id);
    if (!cfg) return res.status(404).json({ error: "nocfg" });

    const deviceId = String(q.deviceId || "");
    const used = Number((await redis.get(K.used(id))) || 0);
    const slotsLeft = Math.max(0, cfg.total - used);
    const imported = deviceId ? (await redis.sismember(K.dev(id), deviceId)) === 1 : false;
    const expired = Date.now() > cfg.expiresAt;
    const canImport = !imported && !expired && slotsLeft > 0;

    res.status(200).json({
      id,
      name: cfg.name,
      expiresAt: cfg.expiresAt,
      slotsLeft,
      slotsTotal: cfg.total,
      imported,
      // Link kennamu yoo slot jiraate, yeroon hin darbin fi user kun hin import godhin qofa
      link: canImport ? cfg.link : ""
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server", message: String(e && e.message) });
  }
};
