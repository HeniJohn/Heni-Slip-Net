const { db } = require('./_lib');
module.exports = async (req, res) => {
  const token = String(req.query.token || '');
  res.setHeader('Cache-Control', 'no-store');
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return res.status(404).json({ error: 'not_found' });
  const s = await db.collection('configs').doc(token).get();
  if (!s.exists) return res.status(404).json({ error: 'not_found' });
  const c = s.data();
  // config URI is NEVER returned here
  res.json({ name: c.name, expiresAt: c.expiresAt, maxSlots: c.maxSlots, used: c.used || 0,
             requireTelegram: !!c.requireTelegram, now: Date.now() });
};
