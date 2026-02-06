# Running on Render & Keep-Alive

## Backend summary

- **Entry:** `Procfile` → `web: npm start` (builds with `npm run build`, runs `node dist/index.js`).
- **Health:** `GET /health` returns `{ "status": "ok" }` — use this for keep-alive and monitoring.
- **Port:** Server uses `process.env.PORT` (Render sets this automatically).
- **Shutdown:** Handles `SIGTERM` and disconnects Prisma before exit.

## Render free tier: what keeps the server “alive”

1. **Inbound traffic**  
   Render spins down free web services after **15 minutes with no inbound requests**. Any HTTP request to your service (e.g. `GET /health`) counts as traffic and resets the idle timer.

2. **Ping before 15 minutes**  
   To avoid spin-down, something must hit your service **at least every 14 minutes** (e.g. every 10–14 min). While the service is awake, spin-up delay is avoided for real users.

3. **No special Render setting to “stay on”**  
   There is no checkbox to “never sleep.” Keeping it alive = sending periodic requests (cron, GitHub Actions, uptime monitor, etc.).

4. **Free instance hours**  
   You get **750 free instance hours per month**. If the service is kept awake 24/7, that’s ~720 hours, so you stay within the free tier as long as you don’t run other free services at the same time.

5. **Optional: Render Cron Job**  
   You can also add a [Render Cron Job](https://render.com/docs/cronjobs) that runs every 10–14 minutes and does `curl -sS https://your-service.onrender.com/health`. That uses pipeline/cron minutes; the GitHub Action approach uses no Render minutes.

## GitHub Action keep-alive

This repo includes a workflow that pings your Render service so it doesn’t spin down:

- **File:** `.github/workflows/keep-alive.yml`
- **Schedule:** Every **14 minutes** (under the 15 min idle limit).
- **Endpoint:** `GET {RENDER_SERVICE_URL}/health`

### One-time setup

1. In GitHub: **Settings → Secrets and variables → Actions** for this repo.
2. Add a **secret**:
   - **Name:** `RENDER_SERVICE_URL`
   - **Value:** Your Render web service URL, e.g. `https://beatinbox-backend.onrender.com` (no trailing slash).
3. Push to the default branch (or trigger the workflow); the workflow will run on the schedule and on `workflow_dispatch`.

If `RENDER_SERVICE_URL` is not set, the job skips the ping and exits successfully (no failing builds).

### Manual run

In GitHub: **Actions → “Keep Render alive” → Run workflow**.

## Render dashboard settings (recommended)

- **Instance type:** Free (or paid if you need no spin-down).
- **Build command:** `npm install && npm run build` (or leave default if it already runs from `expo-backend` and builds there).
- **Start command:** From the directory that has `package.json` and `dist/`, usually `npm start` (same as Procfile).
- **Environment:** Set `DATABASE_URL`, `NODE_ENV`, and any other env vars your app needs (e.g. Cloudinary, Expo push).
- **Health check path (optional):** If Render offers a “health check path,” set it to `/health` so Render can mark the service healthy after deploy.

Once the GitHub Action (or another ping) is hitting `/health` every 14 minutes, the server will stay alive within Render’s free-tier rules.
