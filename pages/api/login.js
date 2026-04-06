import bcrypt from 'bcryptjs';
import { initDB, getDb } from '../../lib/db';
import { signToken } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await initDB();
    const sql = getDb();
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const result = await sql`
      SELECT id, username, supername, password_hash
      FROM users WHERE username = ${username.toLowerCase()}
    `;
    if (result.length === 0)
      return res.status(401).json({ error: 'User not found' });

    const user = result[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Wrong password' });

    const best = await sql`
      SELECT COALESCE(MAX(score), 0) as best FROM scores WHERE user_id = ${user.id}
    `;
    const token = signToken({ id: user.id, username: user.username, supername: user.supername });
    return res.status(200).json({
      token,
      user: { id: user.id, username: user.username, supername: user.supername },
      best: Number(best[0].best) || 0
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
