/**
 * POST /api/subscribe
 *
 * Body: { tenantId, tenantName, subscription, deviceLabel? }
 * Grava a push subscription no Vercel KV.
 *
 * KV layout:
 *   key: `sub:${tenantId}:${subHashShort}`
 *   value: { tenantId, tenantName, subscription, deviceLabel, createdAt }
 *
 * Permite múltiplos devices por condómino.
 */
import { kv } from '@vercel/kv';
import crypto from 'crypto';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { tenantId, tenantName, subscription, deviceLabel } = req.body || {};
    if (!tenantId || !subscription?.endpoint) {
      return res.status(400).json({ error: 'tenantId e subscription obrigatórios' });
    }

    // Hash curto da subscription endpoint para chave única
    const subHash = crypto.createHash('sha256')
      .update(subscription.endpoint)
      .digest('hex')
      .slice(0, 16);
    const key = `sub:${tenantId}:${subHash}`;

    const record = {
      tenantId,
      tenantName: tenantName || '',
      subscription,
      deviceLabel: deviceLabel || 'Device sem nome',
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    };

    await kv.set(key, record);
    // Index para listar
    await kv.sadd('subscriptions:all', key);

    return res.status(200).json({ ok: true, key });
  } catch (e) {
    console.error('subscribe error', e);
    return res.status(500).json({ error: e.message });
  }
}
