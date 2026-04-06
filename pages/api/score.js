import { initDB, getDb } from '../../lib/db';
import { verifyToken, getTokenFromReq } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromReq(req);
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await initDB();
    const sql = getDb();
    const { score } = req.body;
    if (typeof score !== 'number' || score < 0)
      return res.status(400).json({ error: 'Invalid score' });

    await sql`
      INSERT INTO scores (user_id, username, supername, score)
      VALUES (${user.id}, ${user.username}, ${user.supername}, ${Math.floor(score)})
    `;
    const best = await sql`
      SELECT COALESCE(MAX(score), 0) as best FROM scores WHERE user_id = ${user.id}
    `;
    return res.status(200).json({ saved: true, best: Number(best[0].best) || 0 });
  } catch (err) {
    console.error('Score error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
