import { initDB, getDb } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await initDB();
    const sql = getDb();
    const result = await sql`
      SELECT supername, MAX(score) as best_score
      FROM scores
      GROUP BY supername
      ORDER BY best_score DESC
      LIMIT 20
    `;
    return res.status(200).json({ leaderboard: result });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
