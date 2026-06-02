/**
 * POST /api/notify
 *
 * Body: {
 *   title, body, url?,
 *   destinatarios: 'todos' | 'admin' | string[] (tenantIds)
 * }
 *
 * Requer header: x-api-key (definido em ADMIN_API_KEY env var)
 */
import { kv } from '@vercel/kv';
import webpush from 'web-push';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:condoamira24@gmail.com';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Auth admin
  if (ADMIN_API_KEY && req.headers['x-api-key'] !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'x-api-key inválida' });
  }

  try {
    const { title, body, url, destinatarios } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'title e body obrigatórios' });

    // Carregar todas as subscriptions
    const allKeys = await kv.smembers('subscriptions:all');
    if (!allKeys || allKeys.length === 0) {
      return res.status(200).json({ ok: true, enviados: 0, falhados: 0, msg: 'Sem subscriptions registadas' });
    }

    const allSubs = [];
    for (const k of allKeys) {
      const rec = await kv.get(k);
      if (rec) allSubs.push({ key: k, ...rec });
    }

    // Filtrar por destinatários
    let alvos = allSubs;
    if (destinatarios && destinatarios !== 'todos') {
      const ids = Array.isArray(destinatarios) ? destinatarios : [destinatarios];
      alvos = allSubs.filter(s => ids.includes(s.tenantId));
    }

    if (alvos.length === 0) {
      return res.status(200).json({ ok: true, enviados: 0, msg: 'Sem destinatários' });
    }

    const payload = JSON.stringify({
      title, body,
      url: url || '/',
      timestamp: Date.now()
    });

    const opts = {
      TTL: 60 * 60 * 24,
      urgency: 'normal',
    };

    let enviados = 0, falhados = 0, removidos = 0;
    const erros = [];
    for (const alvo of alvos) {
      try {
        await webpush.sendNotification(alvo.subscription, payload, opts);
        enviados++;
        // Atualizar lastSeenAt
        await kv.set(alvo.key, { ...alvo, lastSeenAt: Date.now() });
      } catch (err) {
        falhados++;
        // 404/410 → subscription expirada · remover
        if (err.statusCode === 404 || err.statusCode === 410) {
          await kv.del(alvo.key);
          await kv.srem('subscriptions:all', alvo.key);
          removidos++;
        } else {
          erros.push({ tenant: alvo.tenantName, status: err.statusCode, msg: err.body });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      enviados, falhados, removidos,
      erros: erros.slice(0, 5)
    });
  } catch (e) {
    console.error('notify error', e);
    return res.status(500).json({ error: e.message });
  }
}
