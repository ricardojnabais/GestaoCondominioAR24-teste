/**
 * GET /api/vapid-public
 * Retorna a chave pública VAPID (necessária pelo cliente para criar subscriptions).
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method !== 'GET') return res.status(405).end();
  return res.status(200).json({
    publicKey: process.env.VAPID_PUBLIC_KEY || null
  });
}
