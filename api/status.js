import { redis, KEYS, getConfig } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const deviceId = String(req.query.deviceId || "");
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
    res.status(500).json({ error: "server" });
  }
}
