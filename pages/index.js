import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';

// ─────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────
const GRAVITY = 0.55;
const JUMP_FORCE = -13.5;
const INIT_SPEED = 4.5;
const SPEED_INC = 0.0018;
const CUBE_SIZE = 36;
const TRAIL_LEN = 16;
const NEON = '#00f5d4';
const DANGER = '#ff3b5c';
const AMBER = '#f5a623';
const DARK = '#07090f';

// ─────────────────────────────────────────
//  API helpers
// ─────────────────────────────────────────
async function apiPost(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─────────────────────────────────────────
//  GAME ENGINE (pure canvas, no React state)
// ─────────────────────────────────────────
class Game {
  constructor(canvas, onScoreUpdate, onEnd) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onScoreUpdate = onScoreUpdate;
    this.onEnd = onEnd;
    this.running = false;
    this.raf = null;
    this.handleKey = this.handleKey.bind(this);
    this.handleTouch = this.handleTouch.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  start() {
    this.resize();
    const GH = this.canvas.height * 0.72;

    this.score = 0;
    this.speed = INIT_SPEED;
    this.spawnTimer = 0;
    this.spawnInterval = 110;
    this.gameTime = 0;
    this.walls = [];
    this.particles = [];
    this.trail = [];
    this.brokenPieces = null;

    this.player = {
      x: this.canvas.width * 0.18,
      y: GH - CUBE_SIZE / 2,
      vy: 0,
      onGround: true,
      groundY: GH,
      rotation: 0,
      rotSpeed: 0,
      alive: true,
    };

    this.running = true;
    window.addEventListener('keydown', this.handleKey);
    this.canvas.addEventListener('touchstart', this.handleTouch, { passive: false });
    this.canvas.addEventListener('mousedown', this.handleClick);

    cancelAnimationFrame(this.raf);
    this.loop();
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.handleKey);
    this.canvas.removeEventListener('touchstart', this.handleTouch);
    this.canvas.removeEventListener('mousedown', this.handleClick);
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  handleKey(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); this.jump(); }
  }
  handleTouch(e) { e.preventDefault(); this.jump(); }
  handleClick() { this.jump(); }

  jump() {
    if (!this.running || !this.player.alive) return;
    if (this.player.onGround) {
      this.player.vy = JUMP_FORCE;
      this.player.onGround = false;
      this.player.rotSpeed = 0.16;
      this.puff();
    }
  }

  puff() {
    for (let i = 0; i < 8; i++) {
      const a = Math.PI + Math.random() * Math.PI;
      const sp = 1 + Math.random() * 3;
      this.particles.push({ x: this.player.x, y: this.player.groundY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, col: NEON, r: 3 + Math.random() * 3 });
    }
  }

  breakCube() {
    const cx = this.player.x, cy = this.player.y;
    this.brokenPieces = [];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 7;
      const sz = 5 + Math.random() * 11;
      this.brokenPieces.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, rot: Math.random() * Math.PI, rotV: (Math.random() - 0.5) * 0.22, sz, life: 1 });
    }
    for (let i = 0; i < 35; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 9;
      this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, col: i % 2 === 0 ? NEON : DANGER, r: 2 + Math.random() * 5 });
    }
  }

  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(() => this.loop());
    this.update();
    this.draw();
  }

  update() {
    this.gameTime++;
    if (!this.player.alive) {
      this.updateParticles();
      if (this.brokenPieces) this.brokenPieces.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.rot += p.rotV; p.life -= 0.014; });
      if (this.gameTime > 150) { this.running = false; this.onEnd(this.score); }
      return;
    }

    this.score++;
    this.speed += SPEED_INC;
    if (this.score % 400 === 0) this.spawnInterval = Math.max(55, this.spawnInterval - 7);

    // physics
    const p = this.player;
    p.vy += GRAVITY;
    p.y += p.vy;
    if (p.y >= p.groundY - CUBE_SIZE / 2) {
      p.y = p.groundY - CUBE_SIZE / 2;
      p.vy = 0;
      p.onGround = true;
      p.rotSpeed *= 0.75;
      if (Math.abs(p.rotSpeed) < 0.01) p.rotSpeed = 0;
    } else { p.onGround = false; }
    if (!p.onGround) p.rotation += p.rotSpeed;

    // trail
    this.trail.push({ x: p.x, y: p.y, life: 1 });
    if (this.trail.length > TRAIL_LEN) this.trail.shift();
    this.trail.forEach(t => t.life -= 0.065);

    // walls
    this.spawnTimer++;
    if (this.spawnTimer >= this.spawnInterval) { this.spawnTimer = 0; this.spawnWall(); }
    this.walls.forEach(w => w.x -= this.speed);
    this.walls = this.walls.filter(w => w.x + w.w > -30);

    // collision (AABB with small margin)
    const margin = 5;
    for (const w of this.walls) {
      const px = p.x, py = p.y;
      const hs = CUBE_SIZE / 2 - margin;
      if (px + hs > w.x && px - hs < w.x + w.w && py + hs > w.y && py - hs < w.y + w.h) {
        p.alive = false;
        this.gameTime = 0;
        this.breakCube();
        break;
      }
    }

    this.updateParticles();
    this.onScoreUpdate(this.score);
  }

  spawnWall() {
    const GH = this.player.groundY;
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (Math.random() < 0.3 && this.score > 250) {
      // gap wall
      const gap = CUBE_SIZE * 2.6;
      const maxGapY = GH - gap - 30;
      const gapY = 30 + Math.random() * Math.max(0, maxGapY - 30);
      this.walls.push({ x: W + 10, y: 0, w: 26, h: gapY });
      this.walls.push({ x: W + 10, y: gapY + gap, w: 26, h: H - (gapY + gap) });
    } else {
      const onTop = Math.random() < 0.5;
      const minH = 45, maxH = GH * 0.5;
      const h = minH + Math.random() * (maxH - minH);
      if (onTop) {
        this.walls.push({ x: W + 10, y: 0, w: 26, h });
      } else {
        this.walls.push({ x: W + 10, y: GH - h, w: 26, h: h + H * 0.3 });
      }
    }
  }

  updateParticles() {
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.028; });
    this.particles = this.particles.filter(p => p.life > 0);
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const GH = this.player.groundY;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = 'rgba(0,245,212,0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // ground
    ctx.shadowColor = NEON; ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(0,245,212,0.2)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, GH); ctx.lineTo(W, GH); ctx.stroke();
    ctx.shadowBlur = 0;

    // speed bar
    const alpha = Math.min((this.speed - INIT_SPEED) / 5, 0.7);
    const gr = ctx.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, `rgba(255,59,92,${alpha})`); gr.addColorStop(0.5, 'transparent'); gr.addColorStop(1, `rgba(255,59,92,${alpha})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 4);

    // walls
    this.walls.forEach(w => {
      ctx.shadowColor = DANGER; ctx.shadowBlur = 18;
      ctx.fillStyle = DANGER; ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(255,59,92,0.25)';
      ctx.fillRect(w.x - 5, w.y, 5, w.h);
      ctx.fillRect(w.x + w.w, w.y, 5, w.h);
      ctx.shadowBlur = 0;
    });

    // trail
    this.trail.forEach((t, i) => {
      const a = t.life * 0.35 * (i / this.trail.length);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = NEON;
      const s = CUBE_SIZE * (0.25 + 0.6 * (i / this.trail.length));
      ctx.fillRect(t.x - s / 2, t.y - s / 2, s, s);
      ctx.restore();
    });

    // particles
    this.particles.forEach(p => {
      ctx.save(); ctx.globalAlpha = p.life;
      ctx.fillStyle = p.col; ctx.shadowColor = p.col; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // cube or broken
    if (this.player.alive) {
      const p = this.player;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      const hs = CUBE_SIZE / 2;
      ctx.shadowColor = NEON; ctx.shadowBlur = 22;
      ctx.fillStyle = 'rgba(0,245,212,0.18)'; ctx.fillRect(-hs - 5, -hs - 5, CUBE_SIZE + 10, CUBE_SIZE + 10);
      ctx.fillStyle = NEON; ctx.fillRect(-hs, -hs, CUBE_SIZE, CUBE_SIZE);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.strokeRect(-hs, -hs, CUBE_SIZE, CUBE_SIZE);
      ctx.strokeStyle = 'rgba(7,9,15,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-hs, 0); ctx.lineTo(hs, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -hs); ctx.lineTo(0, hs); ctx.stroke();
      ctx.restore();
    } else if (this.brokenPieces) {
      this.brokenPieces.forEach(p => {
        if (p.life <= 0) return;
        ctx.save(); ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = NEON; ctx.shadowColor = NEON; ctx.shadowBlur = 10;
        ctx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz);
        ctx.restore();
      });
    }
  }
}

// ─────────────────────────────────────────
//  REACT COMPONENT
// ─────────────────────────────────────────
export default function Home() {
  const [screen, setScreen] = useState('login'); // login | register | menu | game | gameover | leaderboard
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [best, setBest] = useState(0);
  const [score, setScore] = useState(0);
  const [liveScore, setLiveScore] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const canvasRef = useRef(null);
  const gameRef = useRef(null);

  // Load saved session
  useEffect(() => {
    const saved = localStorage.getItem('cr_session');
    if (saved) {
      try {
        const { token: t, user: u, best: b } = JSON.parse(saved);
        setToken(t); setUser(u); setBest(b || 0);
        setScreen('menu');
      } catch {}
    }
  }, []);

  // Stars
  const stars = useRef([]);
  useEffect(() => {
    stars.current = Array.from({ length: 100 }, () => ({
      x: Math.random() * 100, y: Math.random() * 100,
      s: 0.5 + Math.random() * 1.5, d: 2 + Math.random() * 4, delay: Math.random() * 5
    }));
  }, []);

  const saveSession = (t, u, b) => {
    localStorage.setItem('cr_session', JSON.stringify({ token: t, user: u, best: b }));
  };

  // ── AUTH ──
  const [form, setForm] = useState({ username: '', supername: '', password: '' });

  const handleLogin = async () => {
    setError(''); setLoading(true);
    const data = await apiPost('/api/login', { username: form.username, password: form.password });
    setLoading(false);
    if (data.error) return setError(data.error);
    setUser(data.user); setToken(data.token); setBest(data.best || 0);
    saveSession(data.token, data.user, data.best || 0);
    setScreen('menu');
  };

  const handleRegister = async () => {
    setError(''); setLoading(true);
    const data = await apiPost('/api/register', { username: form.username, supername: form.supername, password: form.password });
    setLoading(false);
    if (data.error) return setError(data.error);
    setUser(data.user); setToken(data.token); setBest(0);
    saveSession(data.token, data.user, 0);
    setScreen('menu');
  };

  const logout = () => {
    localStorage.removeItem('cr_session');
    setUser(null); setToken(null); setBest(0);
    setForm({ username: '', supername: '', password: '' });
    setScreen('login');
  };

  // ── GAME ──
  const startGame = useCallback(() => {
    setScore(0); setLiveScore(0); setIsNewBest(false);
    setScreen('game');
    setShowHint(true);
    setTimeout(() => setShowHint(false), 3000);
  }, []);

  useEffect(() => {
    if (screen !== 'game' || !canvasRef.current) return;

    const onScoreUpdate = (s) => setLiveScore(s);
    const onEnd = async (finalScore) => {
      setScore(finalScore);
      const newBest = finalScore > best;
      if (newBest) { setBest(finalScore); setIsNewBest(true); saveSession(token, user, finalScore); }
      else setIsNewBest(false);

      // save to backend
      if (token) {
        const data = await apiPost('/api/score', { score: finalScore }, token);
        if (data.best && data.best > best) { setBest(data.best); saveSession(token, user, data.best); }
      }
      setScreen('gameover');
    };

    const g = new Game(canvasRef.current, onScoreUpdate, onEnd);
    gameRef.current = g;

    const resize = () => { g.resize(); };
    window.addEventListener('resize', resize);
    g.start();

    return () => { g.destroy(); window.removeEventListener('resize', resize); };
  }, [screen === 'game']);

  // ── LEADERBOARD ──
  const fetchLeaderboard = async () => {
    const data = await fetch('/api/leaderboard').then(r => r.json());
    if (data.leaderboard) setLeaderboard(data.leaderboard);
  };

  const showLeaderboard = () => { fetchLeaderboard(); setScreen('leaderboard'); };

  const inp = (field) => ({ value: form[field], onChange: e => { setForm(f => ({ ...f, [field]: e.target.value })); setError(''); } });
  const onKeyEnter = (fn) => (e) => { if (e.key === 'Enter') fn(); };

  // ─────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────
  return (
    <>
      <Head>
        <title>CUBE RUNNER</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --neon: #00f5d4; --neon2: #f5a623; --danger: #ff3b5c;
          --dark: #07090f; --panel: rgba(255,255,255,0.04); --border: rgba(0,245,212,0.22);
        }
        html, body { width:100%; height:100%; background:var(--dark); color:#fff;
          font-family:'Orbitron',monospace; overflow:hidden; touch-action:none; }
        body::after { content:''; position:fixed; inset:0;
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px);
          pointer-events:none; z-index:9999; }
        input { font-family:'Share Tech Mono',monospace; font-size:1rem;
          width:100%; background:rgba(0,245,212,0.05); border:1px solid var(--border);
          border-radius:6px; padding:.7rem 1rem; color:#fff; outline:none;
          transition:border-color .2s, box-shadow .2s; }
        input:focus { border-color:var(--neon); box-shadow:0 0 0 2px rgba(0,245,212,.15); }
        input::placeholder { color:rgba(255,255,255,.22); }
        button { font-family:'Orbitron',monospace; font-weight:700; font-size:.8rem;
          letter-spacing:.18em; border:none; border-radius:6px; cursor:pointer;
          padding:.8rem 1.5rem; width:100%; transition:transform .1s, box-shadow .2s; }
        button:active { transform:scale(.97); }
        button:disabled { opacity:.5; cursor:not-allowed; }
        .btn-p { background:var(--neon); color:#07090f; box-shadow:0 0 18px rgba(0,245,212,.4); }
        .btn-p:hover:not(:disabled) { box-shadow:0 0 28px rgba(0,245,212,.65); }
        .btn-s { background:transparent; color:var(--neon); border:1px solid var(--border); }
        .btn-s:hover { background:rgba(0,245,212,.05); }
        .btn-danger { background:transparent; color:var(--danger); border:1px solid rgba(255,59,92,.3); }
        .btn-danger:hover { background:rgba(255,59,92,.05); }
        @keyframes flicker { 0%,95%,100%{opacity:1} 96%{opacity:.7} 97%{opacity:1} 98%{opacity:.5} 99%{opacity:1} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes twinkle { 0%,100%{opacity:.1} 50%{opacity:.85} }
        ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
      `}</style>

      {/* STARS */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
        {stars.current.map((s, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
            width: s.s, height: s.s, borderRadius: '50%', background: '#fff',
            animation: `twinkle ${s.d}s ${s.delay}s infinite`,
          }} />
        ))}
      </div>

      {/* CANVAS (always mounted, hidden when not playing) */}
      <canvas ref={canvasRef} style={{
        position: 'fixed', inset: 0, zIndex: 5, display: screen === 'game' ? 'block' : 'none',
        touchAction: 'none',
      }} />

      {/* HUD */}
      {screen === 'game' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, padding: '.7rem 1.2rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          zIndex: 20, background: 'linear-gradient(to bottom,rgba(7,9,15,.85),transparent)',
          pointerEvents: 'none', fontFamily: 'Orbitron,monospace',
        }}>
          <div style={{ fontSize: 'clamp(.95rem,2.5vw,1.4rem)', fontWeight: 700, color: NEON, textShadow: `0 0 10px rgba(0,245,212,.4)` }}>
            SCORE <span>{liveScore}</span>
          </div>
          <div style={{ fontFamily: 'Share Tech Mono,monospace', fontSize: 'clamp(.6rem,1.5vw,.8rem)', color: 'rgba(245,166,35,.75)' }}>
            BEST {best}
          </div>
        </div>
      )}

      {/* JUMP HINT */}
      {screen === 'game' && showHint && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'Share Tech Mono,monospace', fontSize: '.7rem', letterSpacing: '.25em',
          color: 'rgba(255,255,255,.3)', zIndex: 20, pointerEvents: 'none', animation: 'fadeUp .5s',
        }}>
          SPACE · TAP · CLICK — JUMP
        </div>
      )}

      {/* ── LOGIN ── */}
      {screen === 'login' && (
        <div style={overlay}>
          <div style={title}>CUBE RUNNER</div>
          <div style={subtitle}>// ENDLESS SURVIVAL //</div>
          <div style={panel}>
            <Field label="USERNAME" type="text" placeholder="your callsign" {...inp('username')}
              onKeyDown={e => { if (e.key === 'Enter') document.getElementById('lp').focus(); }} />
            <Field label="PASSWORD" type="password" id="lp" placeholder="••••••••" {...inp('password')}
              onKeyDown={onKeyEnter(handleLogin)} />
            {error && <Err>{error}</Err>}
            <button className="btn-p" onClick={handleLogin} disabled={loading}>{loading ? 'CONNECTING...' : 'LOGIN'}</button>
            <Divider>NEW PLAYER</Divider>
            <button className="btn-s" onClick={() => { setError(''); setScreen('register'); }}>CREATE ACCOUNT</button>
          </div>
        </div>
      )}

      {/* ── REGISTER ── */}
      {screen === 'register' && (
        <div style={overlay}>
          <div style={{ ...title, fontSize: 'clamp(1.6rem,5vw,3rem)' }}>CREATE ACCOUNT</div>
          <div style={panel}>
            <Field label="USERNAME (login)" type="text" placeholder="letters, numbers, _ -" {...inp('username')} />
            <Field label="SUPER NAME (shown on leaderboard)" type="text" placeholder="your hero name" {...inp('supername')} />
            <Field label="PASSWORD" type="password" placeholder="min 4 characters" {...inp('password')}
              onKeyDown={onKeyEnter(handleRegister)} />
            <div style={{ fontFamily: 'Share Tech Mono,monospace', fontSize: '.68rem', color: 'rgba(0,245,212,.45)', lineHeight: 1.5 }}>
              Your Super Name appears publicly on the leaderboard. Username is private (login only).
            </div>
            {error && <Err>{error}</Err>}
            <button className="btn-p" onClick={handleRegister} disabled={loading}>{loading ? 'CREATING...' : 'CREATE & PLAY'}</button>
            <button className="btn-s" onClick={() => { setError(''); setScreen('login'); }}>BACK TO LOGIN</button>
          </div>
        </div>
      )}

      {/* ── MENU ── */}
      {screen === 'menu' && (
        <div style={overlay}>
          <div style={{ ...title, fontSize: 'clamp(1.8rem,5.5vw,3.5rem)' }}>CUBE RUNNER</div>
          <div style={{ fontFamily: 'Share Tech Mono,monospace', fontSize: 'clamp(.7rem,2vw,.9rem)', color: 'rgba(0,245,212,.65)', letterSpacing: '.2em', marginBottom: '.5rem' }}>
            WELCOME BACK, {user?.supername?.toUpperCase()}
          </div>
          <div style={panel}>
            <div style={{ background: 'rgba(245,166,35,.07)', border: '1px solid rgba(245,166,35,.2)', borderRadius: 6, padding: '.85rem', textAlign: 'center' }}>
              <div style={{ fontSize: '.58rem', letterSpacing: '.3em', color: 'rgba(245,166,35,.55)' }}>YOUR BEST</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: AMBER, textShadow: `0 0 12px rgba(245,166,35,.4)` }}>{best}</div>
            </div>
            <button className="btn-p" onClick={startGame}>▶ START RUN</button>
            <button className="btn-s" onClick={showLeaderboard}>LEADERBOARD</button>
            <button className="btn-danger" onClick={logout}>LOGOUT</button>
          </div>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {screen === 'gameover' && (
        <div style={overlay}>
          <div style={{ fontSize: 'clamp(2rem,8vw,3.5rem)', fontWeight: 900, color: DANGER, textShadow: `0 0 22px rgba(255,59,92,.65)`, letterSpacing: '.1em', animation: 'shake .4s ease' }}>
            CUBE BROKEN
          </div>
          <div style={{ textAlign: 'center', animation: 'fadeUp .4s .1s both' }}>
            <div style={{ fontSize: '.62rem', letterSpacing: '.3em', color: 'rgba(255,255,255,.4)' }}>FINAL SCORE</div>
            <div style={{ fontSize: 'clamp(2.5rem,10vw,4rem)', fontWeight: 900 }}>{score}</div>
            {isNewBest && <div style={{ fontSize: '.72rem', letterSpacing: '.2em', color: AMBER, animation: 'pulse 1s infinite' }}>✦ NEW PERSONAL BEST ✦</div>}
          </div>
          <div style={{ ...panel, gap: '.8rem', animation: 'fadeUp .4s .2s both' }}>
            <button className="btn-p" onClick={startGame}>RUN AGAIN</button>
            <button className="btn-s" onClick={() => setScreen('menu')}>MAIN MENU</button>
            <button className="btn-s" onClick={showLeaderboard}>LEADERBOARD</button>
          </div>
        </div>
      )}

      {/* ── LEADERBOARD ── */}
      {screen === 'leaderboard' && (
        <div style={overlay}>
          <div style={{ ...title, fontSize: 'clamp(1.4rem,5vw,2.5rem)' }}>LEADERBOARD</div>
          <div style={{ ...panel, maxHeight: '60vh', overflowY: 'auto', gap: 0, padding: '1.2rem' }}>
            <div style={{ fontSize: '.65rem', letterSpacing: '.3em', color: 'rgba(0,245,212,.45)', textAlign: 'center', marginBottom: '1rem' }}>// TOP RUNNERS //</div>
            {leaderboard.length === 0
              ? <div style={{ textAlign: 'center', fontFamily: 'Share Tech Mono,monospace', color: 'rgba(255,255,255,.25)', padding: '2rem', fontSize: '.8rem' }}>NO SCORES YET — BE FIRST!</div>
              : leaderboard.map((row, i) => {
                const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
                const isMine = row.supername === user?.supername;
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2rem 1fr auto', gap: '.5rem', alignItems: 'center', padding: '.55rem .4rem', borderBottom: '1px solid rgba(255,255,255,.05)', fontFamily: 'Share Tech Mono,monospace', fontSize: '.82rem' }}>
                    <span style={{ color: rankColors[i] || 'rgba(255,255,255,.3)', fontSize: '.72rem' }}>#{i + 1}</span>
                    <span style={{ color: isMine ? NEON : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isMine ? 700 : 400 }}>{row.supername}</span>
                    <span style={{ color: AMBER, fontWeight: 700 }}>{row.best_score}</span>
                  </div>
                );
              })}
          </div>
          <button className="btn-s" style={{ width: 'min(90vw,420px)' }} onClick={() => setScreen(user ? 'menu' : 'login')}>BACK</button>
        </div>
      )}
    </>
  );
}

// ── STYLE OBJECTS ──
const overlay = {
  position: 'fixed', inset: 0, zIndex: 10,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: '1.2rem', padding: '1rem',
};

const title = {
  fontSize: 'clamp(2.2rem,8vw,5rem)', fontWeight: 900, letterSpacing: '.15em',
  color: '#00f5d4', textShadow: '0 0 20px rgba(0,245,212,.6), 0 0 60px rgba(0,245,212,.18)',
  animation: 'flicker 4s infinite', textAlign: 'center',
};

const subtitle = {
  fontFamily: 'Share Tech Mono,monospace', fontSize: 'clamp(.6rem,2vw,.82rem)',
  color: 'rgba(0,245,212,.45)', letterSpacing: '.4em', marginTop: '-.9rem',
};

const panel = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,245,212,0.22)',
  borderRadius: 12, padding: '1.8rem 2rem', width: 'min(92vw,380px)',
  display: 'flex', flexDirection: 'column', gap: '1.1rem',
  backdropFilter: 'blur(12px)',
};

// ── SMALL COMPONENTS ──
function Field({ label, ...props }) {
  return (
    <div>
      <div style={{ fontSize: '.6rem', letterSpacing: '.28em', color: 'rgba(0,245,212,.5)', marginBottom: '.28rem' }}>{label}</div>
      <input {...props} />
    </div>
  );
}

function Err({ children }) {
  return <div style={{ fontFamily: 'Share Tech Mono,monospace', fontSize: '.72rem', color: '#ff3b5c', textAlign: 'center', minHeight: '1rem' }}>{children}</div>;
}

function Divider({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', color: 'rgba(255,255,255,.15)', fontSize: '.65rem', letterSpacing: '.2em' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
      {children}
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
    </div>
  );
}
