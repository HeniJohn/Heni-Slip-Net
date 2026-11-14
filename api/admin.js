const crypto = require("crypto");
const {
  redis, K, redisMissing, getCfg, getBody, getIp,
  passwordIsSet, setPassword, checkPassword, tooManyFails, addFail, clearFail
} = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method", message: "POST qofa" });

  try {
    const miss = redisMissing();
    if (miss.length) {
      return res.status(500).json({
        error: "env",
        message: "Redis hin hidhamne. Vercel → Storage → Upstash Redis → project hidhi, itti aansuun Redeploy godhi."
      });
    }

    const b = getBody(req);
    const action = String(b.action || "");
    const ip = getIp(req);
    const origin = "https://" + (req.headers.host || "");

    // Password kaa'ameera moo hin kaa'amne?
    if (action === "status") {
      return res.status(200).json({ setup: !(await passwordIsSet()) });
    }

    // Al tokko: password jalqabaa kaa'uu (ADMIN_PASSWORD env hin jiru yoo ta'e)
    if (action === "setup") {
      const pw = String(b.password || "");
      if (pw.length < 6) return res.status(400).json({ error: "short", message: "Password xiqqaate 6 qubee qabaachuu qaba." });
      if (await passwordIsSet()) return res.status(403).json({ error: "exists", message: "Password duraan kaa'ameera." });
      const ok = await setPassword(pw);
      if (!ok) return res.status(403).json({ error: "exists", message: "Password duraan kaa'ameera." });
      return res.status(200).json({ ok: true });
    }

    // Kaan hundi password barbaada
    if (await tooManyFails(ip)) {
      return res.status(429).json({ error: "locked", message: "Yaalii baay'ee. Daqiiqaa 10 booda yaali." });
    }
    if (!(await checkPassword(b.password))) {
      await addFail(ip);
      return res.status(401).json({ error: "password", message: "Password dogoggora." });
    }
    await clearFail(ip);

    if (action === "login") return res.status(200).json({ ok: true });

    if (action === "list") {
      const ids = (await redis.zrange(K.ids, 0, -1, { rev: true })) || [];
      const items = await Promise.all(ids.map(async id => {
        const cfg = await getCfg(id);
        if (!cfg) return null;
        const used = Number((await redis.get(K.used(id))) || 0);
        return {
          id, name: cfg.name, total: cfg.total, used,
          expiresAt: cfg.expiresAt, createdAt: cfg.createdAt,
          url: origin + "/?c=" + id
        };
      }));
      return res.status(200).json({ items: items.filter(Boolean) });
    }

    if (action === "create") {
      const name = String(b.name || "").trim().slice(0, 60);
      const link = String(b.link || "").trim();
      const total = Math.floor(Number(b.total));
      const hours = Number(b.hours);

      if (!name) return res.status(400).json({ error: "name", message: "Maqaa galchi." });
      if (!/^slipnet[a-z0-9-]*:\/\/\S+$/i.test(link) || link.length > 20000) {
        return res.status(400).json({ error: "link", message: "Config link sirrii miti. slipnet-bundle-enc://... ta'uu qaba." });
      }
      if (!(total >= 1 && total <= 100000)) return res.status(400).json({ error: "total", message: "Slot 1 hanga 100000 ta'uu qaba." });
      if (!(hours > 0 && hours <= 24 * 365)) return res.status(400).json({ error: "hours", message: "Yeroon sa'aatii 1 hanga 8760 ta'uu qaba." });

      const id = crypto.randomBytes(4).toString("hex");
      const now = Date.now();
      const cfg = { id, name, link, total, expiresAt: now + Math.round(hours * 3600 * 1000), createdAt: now };

      await redis.set(K.cfg(id), cfg);
      await redis.zadd(K.ids, { score: now, member: id });
      await redis.set(K.latest, id);

      return res.status(200).json({ ok: true, id, url: origin + "/?c=" + id });
    }

    if (action === "delete") {
      const id = String(b.id || "").replace(/[^a-zA-Z0-9]/g, "");
      if (!id) return res.status(400).json({ error: "id" });
      await redis.del(K.cfg(id), K.used(id), K.dev(id));
      await redis.zrem(K.ids, id);
      const latest = await redis.get(K.latest);
      if (latest && String(latest) === id) {
        const rest = (await redis.zrange(K.ids, 0, 0, { rev: true })) || [];
        if (rest.length) await redis.set(K.latest, rest[0]); else await redis.del(K.latest);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "action", message: "Ajaja hin beekamne." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server", message: "Server dogoggora: " + String(e && e.message) });
  }
};
