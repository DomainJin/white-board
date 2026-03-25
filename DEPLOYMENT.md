# Railway Deployment Guide

## Step 1: Deploy Backend

**1.1 Go to Railway.app and login/signup**

- https://railway.app

**1.2 Create a new project**

- Click "New Project"
- Select "Deploy from GitHub"
- Choose your whiteboard repository

**1.3 During setup:**

- Use Root Directory: ✅ (Railway should auto-detect)
- Framework: Dockerfile (auto-detected)
- Service name: `whiteboard-backend`

**1.4 Add PostgreSQL Database**

- In Railway Dashboard, click "+ New"
- Select "Database" → "PostgreSQL"
- Railway will auto-set `DATABASE_URL`

**1.5 Add Redis Cache**

- Click "+ New" again
- Select "Database" → "Redis"
- Railway will auto-set `REDIS_URL`

**1.6 Set Environment Variables**

- In railway dashboard, go to Variables tab
- Add these variables:

```
PORT=3000
CLIENT_URL=https://your-frontend-domain.com
JWT_SECRET=<generate a random 64-char string using: openssl rand -base64 48>
```

Generate JWT_SECRET locally:

```bash
openssl rand -base64 48
```

**1.7 Deploy**

- Railway auto-deploys when you push to GitHub
- Wait for build to complete (5-10 minutes)
- Check "Deployments" tab for status

---

## Step 2: Deploy Frontend

**2.1 Option A: Deploy on Railway (Same as Backend)**

- In Railway, click "+ New Service"
- Select "GitHub"
- Choose repository
- Set Root Directory: `client/`
- Runtime: Node.js (auto-detect)

**2.2 Set Frontend Variables**

```
VITE_SERVER_URL=https://your-backend-domain.railway.app
```

**2.3 Set Build Command:**

```
npm run build
```

**2.4 Set Start Command:**

```
npm run preview
```

---

## Step 3: Get Your URLs

After deployment completes:

- Backend URL: `https://whiteboard-backend-xxx.railway.app` (copy from Railway domain)
- Frontend URL: `https://whiteboard-frontend-xxx.railway.app`

---

## Step 4: Connect Domains (Optional - Custom Domain)

If you have a custom domain:

- Go to Railway project settings
- Add "Custom Domain"
- Point your DNS to Railway

---

## Troubleshooting

**Build failed?**

- Check "Deployments" → "View Logs"
- Ensure .env.example exists in repo

**Backend can't connect to database?**

- Verify `DATABASE_URL` is set in Variables
- Check PostgreSQL service is "Up" status

**Frontend showing "Server Connection Error"?**

- Verify `VITE_SERVER_URL` points to correct backend
- Check CORS settings in backend

---

## To push changes:

```bash
git add .
git commit -m "update: deployment changes"
git push origin main
```

Railway auto-rebuilds and redeploys! 🚀
