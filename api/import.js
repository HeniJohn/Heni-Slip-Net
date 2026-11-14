const crypto = require('crypto');
const { db } = require('./_lib');

// Verify Telegram Mini App initData (needs BOT_TOKEN). Returns Telegram user id or null.
function tgUser(initData) {
  if (!initData || !process.env.BOT_TOKEN) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash'); p.delete('hash');
  const str = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => k + '=' + v).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const calc = crypto.createHmac('sha256', secret).update(str).digest('hex');
  if (!hash || hash.length !== calc.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date')) > 86400) return null;
  try { return JSON.parse(p.get('user')).id; } catch { return null; }
}

const KNOWN = ['not_found', 'expired', 'need_telegram', 'already', 'full'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const { token, deviceId, initData } = req.body || {};
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token || '') || !/^[a-f0-9]{64}$/.test(deviceId || ''))
    return res.status(400).json({ error: 'bad_request' });

  const tg = tgUser(initData);
  const ident = tg ? 'tg' + tg : 'd' + deviceId;   // Telegram ID is stronger than fingerprint
  const ref = db.collection('configs').doc(token);
  const impRef = ref.collection('imports').doc(ident);
  try {
    const uri = await db.runTransaction(async (t) => {   // atomic: no race past the slot limit
      const [cs, is] = await Promise.all([t.get(ref), t.get(impRef)]);
      if (!cs.exists) throw new Error('not_found');
      const c = cs.data();
      if (Date.now() >= c.expiresAt) throw new Error('expired');
      if (c.requireTelegram && !tg) throw new Error('need_telegram');
      if (is.exists) throw new Error('already');
      if ((c.used || 0) >= c.maxSlots) throw new Error('full');
      t.set(impRef, { at: Date.now() });
      t.update(ref, { used: (c.used || 0) + 1 });
      return c.uri;
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ uri });
  } catch (e) {
    const known = KNOWN.includes(e.message);
    res.status(known ? 403 : 500).json({ error: known ? e.message : 'server' });
  }
};
