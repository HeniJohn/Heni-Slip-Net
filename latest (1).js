const { db } = require('./_lib');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = await db.collection('configs').orderBy('createdAt', 'desc').limit(20).get();
  const now = Date.now();
  const hit = q.docs.find((d) => { const c = d.data(); return c.expiresAt > now && (c.used || 0) < c.maxSlots; });
  res.json({ token: hit ? hit.id : null });   // only the link token, never the config itself
};
