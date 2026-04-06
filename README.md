# CUBE RUNNER — Vercel + Neon Deployment

## Deploy Steps

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "cube runner"
git remote add origin https://github.com/YOUR_USERNAME/cube-runner.git
git push -u origin main
```

### 2. Deploy on Vercel
1. Go to https://vercel.com/new
2. Import your GitHub repo → click Deploy

### 3. Add Neon Database (FREE)
1. Vercel project → Storage tab
2. Click Create next to **Neon** → name it `cube-runner-db` → Create
3. Click **Connect to Project** → it auto-adds DATABASE_URL ✅

### 4. Add JWT Secret
1. Vercel → Settings → Environment Variables
2. Name: `JWT_SECRET` | Value: any random string e.g. `cube-secret-xyz-2024`
3. Save → Deployments → Redeploy

### Done! Your game is live 🎉

## Local Dev
```bash
npm install
# create .env.local with DATABASE_URL from Neon dashboard
npm run dev
```
