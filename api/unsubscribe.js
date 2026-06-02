/**
 * POST /api/unsubscribe
 * Body: { tenantId, endpoint }
 */
import { kv } from '@vercel/kv';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { tenantId, endpoint } = req.body || {};
    if (!tenantId || !endpoint) return res.status(400).json({ error: 'tenantId e endpoint obrigatórios' });
    const subHash = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
    const key = `sub:${tenantId}:${subHash}`;
    await kv.del(key);
    await kv.srem('subscriptions:all', key);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
