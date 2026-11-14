const { redis, KEYS, getConfig, missingEnv } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const miss = missingEnv();
    if (miss.length) return res.status(500).json({ error: "env", missing: miss });

    const deviceId = String((req.query && req.query.deviceId) || "");
    const cfg = await getConfig();

    const imported = deviceId
      ? (await redis.sismember(KEYS.devices, deviceId)) === 1
      : false;

    const expired = Date.now() > cfg.expiresAt;
    const canImport = !imported && !expired && cfg.slotsLeft > 0;

    res.status(200).json({
      name: cfg.name,
      expiresAt: cfg.expiresAt,
      slotsLeft: cfg.slotsLeft,
      slotsTotal: cfg.total,
      imported,
      // Link kennamu yoo slot jiraate fi user kun hin import godhin qofa
      link: canImport ? process.env.CONFIG_LINK : ""
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server", message: String(e && e.message) });
  }
};
