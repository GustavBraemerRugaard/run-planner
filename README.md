# Run Planner

A personal, private web app for planning running training on top of Google Calendar.
It reads, edits and creates events in one calendar ("Løb"), works on desktop and iPhone,
and is hosted for free on GitHub Pages. There is no backend: your calendar is the database.

## What it does

**Planning (Google Calendar)**

- Sign in with Google (token kept in memory only, ~1 hour per sign-in).
- Add, edit, delete runs, all as full days (no time-of-day).
- Every run is built from **steps** (optional warm-up, one or more main steps, optional cool-down). Each main
  step is reps × distance @ target pace, with an optional rest (by distance or time) between reps — so a
  tempo run with a pace ladder, or an interval session, is entered the way you'd actually plan it.
- Total distance and average pace are always **derived from the steps**, never typed in directly.
- The calendar event title is generated as `<total km>k <Type>`, e.g. `9,55k Intervals` (comma decimal, 2 dp).
- The event description is generated as the step-by-step instructions, e.g.
  `1,25k WU / 5x1k @ 4:15 min/km (200m rest) / 2,5k CD` (each on its own line). You can hand-edit it afterward;
  your edit is kept until you change the steps again, at which point "Reset to auto" brings back the generated text.
- Run types: Easy, Tempo, Long Run, Intervals, Race. Older free-text titles are parsed as a fallback.

**Strava: planned vs. actual**

- Connect once (works independently of Google sign-in); the last 6 months of your Strava runs are loaded
  automatically and refreshed on demand. The connection persists across reloads via a stored refresh token;
  **Disconnect** clears it.
- Two calendar views — **List** (a flat, chronological feed) and **Month** (a continuously scrollable grid of
  weeks — scroll past the end of one month straight into the next, no "next month" click; it opens centered on
  today's week). Both show planned runs and completed Strava runs as separate entries on the same day, so a
  planned run stays visible even after you've done it.
- Click any completed run to see its full detail: distance, time, pace, average heart rate, cadence, and a
  per-lap breakdown of the same metrics.
- A **latest run** card with the key numbers from your most recent Strava activity.
- The **active week** card and the **weekly mileage chart** count what Strava actually recorded for days
  before today, and what's still planned for today/future days (marked "still planned") — so the numbers
  are real once you've run, and a forecast until then.
- A scrollable **weekly history** list (actual Strava data, including the current week in progress): runs,
  distance, time, average pace, average heart rate, each with a week-on-week ▲/▼ trend indicator.

## One-time setup

### 1. Google Cloud (free)

1. Go to <https://console.cloud.google.com> and create a project (e.g. `run-planner`).
2. APIs & Services > Library > **Google Calendar API** > Enable.
3. APIs & Services > OAuth consent screen (or "Google Auth Platform"): choose **External**, fill in the app name and
   your email, leave it in **Testing**, and add your own Google address under **Test users**.
4. Credentials > Create credentials > **OAuth client ID** > type **Web application**.
   Authorized JavaScript origins:
   - `http://localhost:5173`
   - `https://gustavbraemerrugaard.github.io`
5. Copy the Client ID.

### 2. Fill in `src/config.ts`

- `GOOGLE_CLIENT_ID`: the Client ID from step 1 (it is public by design, not a secret).
- `CALENDAR_ID`: Google Calendar (on a computer) > Settings > click "Løb" > Integrate calendar > Calendar ID.

### 3. Run locally

```bash
npm install
npm run dev      # http://localhost:5173/run-planner/
```

### 4. Publish on GitHub Pages

```bash
git init -b main
git add .
git commit -m "Initial version"
git remote add origin https://github.com/GustavBraemerRugaard/run-planner.git
git push -u origin main
```

Then on GitHub: repo > Settings > Pages > Source: **GitHub Actions**. Every push to `main` rebuilds and deploys to
<https://gustavbraemerrugaard.github.io/run-planner/>. On the iPhone, open that URL in Safari
(use it in a Safari tab; sign-in popups can be flaky from a Home Screen icon).

### 5. Strava setup (optional — skip if you don't want Strava yet)

Strava's OAuth needs a client secret, which can't safely live in browser code, so this one piece runs on a
tiny free server: a Cloudflare Worker (in `worker/`) that holds the secret and does nothing else.

**a. Create a Strava API application**

1. Go to <https://www.strava.com/settings/api> (log in first) and create an application.
   - Category: anything (e.g. "Training"). Website: your GitHub Pages URL.
   - **Authorization Callback Domain**: `gustavbraemerrugaard.github.io` (domain only, no `https://` and no path —
     for local testing you'll temporarily need `localhost` here too; Strava only allows one at a time, so switch
     it back and forth, or just test the Strava part after it's deployed).
2. Note the **Client ID** and **Client Secret** it gives you.

**b. Create a Cloudflare account and deploy the Worker**

1. Sign up free at <https://dash.cloudflare.com/sign-up> — no card needed for this.
2. In `worker/wrangler.toml`, replace `PASTE_YOUR_STRAVA_CLIENT_ID` with your Strava Client ID, and check
   `ALLOWED_ORIGINS` matches your GitHub Pages URL (and `http://localhost:5173` for local testing).
3. From the `worker/` folder:
   ```bash
   cd worker
   npm install
   npx wrangler login              # opens a browser to authorize
   npx wrangler secret put STRAVA_CLIENT_SECRET   # paste your Strava Client Secret when prompted
   npm run deploy
   ```
4. The deploy prints a URL like `https://run-planner-strava.<your-subdomain>.workers.dev` — that's your Worker URL.

**c. Wire the app to it**

- In `src/config.ts`: set `STRAVA_CLIENT_ID` (same value as the Worker's) and `STRAVA_WORKER_URL` (the deploy URL above).
- In `index.html`: replace `PASTE_YOUR_WORKER_ORIGIN` in the Content-Security-Policy `<meta>` tag with that same
  Worker URL (exact origin, e.g. `https://run-planner-strava.your-subdomain.workers.dev`, no trailing slash).
- Rebuild/redeploy the app (`npm run build`, or just push to `main` if it's already on GitHub Pages).

You should then see a "Connect Strava" button in the app.

## Project layout

```
src/
  config.ts             settings: client ID, calendar ID, week start, Strava client ID/worker URL, defaults
  lib/auth.ts            Google sign-in (token in memory)
  lib/calendar.ts         the ONLY code that talks to Google Calendar
  lib/strava.ts            Strava connection: authorize URL, redirect handling, token refresh, activities, laps
  domain/run.ts          what a "run" is: types, steps, title/description generation, planned+actual merging,
                          weekly summaries (combined and actual-only), trend
  components/           RunForm (add/edit dialog), StepEditor (one step row), RollingCalendar (month view),
                         ListView (list view), ActivityDetail (laps modal), LatestRunCard, ActiveWeekCard,
                         MileageChart, WeeklyHistoryList, StravaPanel (add new fields/views here)
  App.tsx                view wiring, data loading (Google + Strava)
worker/
  src/index.js          Cloudflare Worker: proxies Strava's OAuth token exchange/refresh, holds the client secret
  wrangler.toml         Worker config (client ID + allowed origins — not secret)
```

## Security notes

- Scope requested: `calendar.events` (Google) and `activity:read_all` (Strava, read-only). The app only touches
  the calendar in `CALENDAR_ID`, and only reads your own Strava activities.
- Keep the Google OAuth consent screen in Testing mode with only yourself as a test user.
- The Strava Client Secret lives only as a Cloudflare Worker secret (`wrangler secret put`), never in the repo
  or the browser. The Worker only accepts requests from the origins listed in `ALLOWED_ORIGINS`.
- Strava's refresh token is stored in this browser's `localStorage` (Strava has no silent-refresh flow like
  Google's, so this is what keeps you connected across reloads without reauthorizing constantly). Anyone with
  access to this browser profile could use it; if that's ever a concern, click Disconnect.
- `index.html` contains a Content Security Policy: only this site's scripts and Google's sign-in script can run,
  and the page may only connect to Google, the Strava API, and your own Worker. Do not use `dangerouslySetInnerHTML`;
  keep dependencies few.
- Turn on 2-step verification for your Google, GitHub, Strava and Cloudflare accounts.
- Revoke Google access any time at <https://myaccount.google.com/permissions>; revoke Strava access at
  <https://www.strava.com/settings/apps>.

## Later phases

Comparing planned runs to what Strava actually recorded (distance, pace, whether intervals were hit), and
further analysis (trends, load).
