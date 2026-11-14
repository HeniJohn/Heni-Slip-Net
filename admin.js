const crypto = require('crypto');
const { db } = require('./_lib');

function authed(p) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  const h = (x) => crypto.createHash('sha256').update(String(x)).digest();
  return crypto.timingSafeEqual(h(p || ''), h(real));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !authed(req.headers['x-admin-password']))
    return res.status(401).json({ error: 'unauthorized' });
  const b = req.body || {};

  if (b.action === 'create') {
    const hours = Number(b.hours), max = Number(b.maxSlots);
    if (!b.name || !/^slipnet[a-z-]*:\/\//i.test(b.uri || '') || !(hours > 0) || !(max > 0))
      return res.status(400).json({ error: "Maqaa, slipnet:// link, sa'aatii fi slot sirrii galchi" });
    const token = crypto.randomBytes(18).toString('base64url');
    await db.collection('configs').doc(token).set({
      name: String(b.name).slice(0, 80), uri: b.uri.trim(), used: 0,
      maxSlots: Math.floor(max), expiresAt: Date.now() + hours * 3600e3,
      requireTelegram: !!b.requireTelegram, createdAt: Date.now(),
    });
    return res.json({ token });
  }
  if (b.action === 'list') {
    const q = await db.collection('configs').orderBy('createdAt', 'desc').limit(50).get();
    return res.json({ items: q.docs.map((d) => { const c = d.data();
      return { token: d.id, name: c.name, expiresAt: c.expiresAt, maxSlots: c.maxSlots, used: c.used || 0 }; }) });
  }
  if (b.action === 'delete' && /^[A-Za-z0-9_-]{10,64}$/.test(b.token || '')) {
    await db.recursiveDelete(db.collection('configs').doc(b.token));
    return res.json({ ok: true });
  }
  res.status(400).json({ error: 'bad_request' });
};
