/**
 * GET /api/subscriptions
 * Lista resumida das subscriptions (para o admin ver quem aderiu).
 * Requer x-api-key.
 */
import { kv } from '@vercel/kv';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  if (ADMIN_API_KEY && req.headers['x-api-key'] !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'x-api-key inválida' });
  }

  try {
    const allKeys = await kv.smembers('subscriptions:all');
    if (!allKeys || allKeys.length === 0) return res.status(200).json({ subscriptions: [] });

    const subs = [];
    for (const k of allKeys) {
      const rec = await kv.get(k);
      if (rec) {
        subs.push({
          tenantId: rec.tenantId,
          tenantName: rec.tenantName,
          deviceLabel: rec.deviceLabel,
          createdAt: rec.createdAt,
          lastSeenAt: rec.lastSeenAt
        });
      }
    }
    return res.status(200).json({ subscriptions: subs });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
