import bcrypt from 'bcryptjs';
import { initDB, getDb } from '../../lib/db';
import { signToken } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await initDB();
    const sql = getDb();
    const { username, supername, password } = req.body;

    if (!username || !supername || !password)
      return res.status(400).json({ error: 'All fields are required' });
    if (username.length < 2 || username.length > 32)
      return res.status(400).json({ error: 'Username must be 2–32 characters' });
    if (supername.length < 2 || supername.length > 32)
      return res.status(400).json({ error: 'Super Name must be 2–32 characters' });
    if (password.length < 4)
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    if (!/^[a-zA-Z0-9_\-]+$/.test(username))
      return res.status(400).json({ error: 'Username: letters, numbers, _ - only' });

    const hash = await bcrypt.hash(password, 10);
    const result = await sql`
      INSERT INTO users (username, supername, password_hash)
      VALUES (${username.toLowerCase()}, ${supername}, ${hash})
      RETURNING id, username, supername
    `;
    const user = result[0];
    const token = signToken({ id: user.id, username: user.username, supername: user.supername });
    return res.status(201).json({ token, user: { id: user.id, username: user.username, supername: user.supername } });
  } catch (err) {
    if (err.message && (err.message.includes('unique') || err.message.includes('duplicate'))) {
      return res.status(409).json({ error: 'Username or Super Name already taken' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
