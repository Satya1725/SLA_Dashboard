# EarthRe — SLA Monitoring Dashboard

## 1. Architecture

```
[Browser: Upload UI + Dashboard]  --(React, static, on Cloudflare Pages)
        |  POST /api/upload (multipart CSV)
        v
[Cloudflare Worker]  --(stateless serverless function, parses/validates/cleans)
        |  INSERT
        v
[Cloudflare D1]  --(serverless SQLite, persisted, queryable after upload)
        ^
        |  GET /api/stats, GET /api/logs
[Browser: Dashboard reads back from the same Worker]
```

- **Upload UI + Dashboard: React (Vite), deployed on Cloudflare Pages.**
  Kept as a single static page — no server-rendering needed, and Pages'
  free tier has no time limits or cold-start behavior to work around.
- **Processing: a Cloudflare Worker** (`worker/src/index.js`). This is the
  required stateless serverless function — it does not hold any state
  between requests; every upload is parsed, cleaned, and written to D1
  in the same request/response cycle. Chose Workers over AWS
  Lambda/GCP Functions because it pairs natively with D1 (no separate
  network hop to a database, no VPC/connection-pooling config needed
  on a free tier) and because Cloudflare's free tier doesn't require a
  credit card, unlike AWS/GCP.
- **Persistence: Cloudflare D1** (SQLite). Data is genuinely queryable
  after the upload finishes — the dashboard's stats and logs views
  are separate GET requests against the same stored rows, not
  anything held in memory or in the browser.
- Frontend and Worker are two separately deployed pieces, talking over
  HTTP with CORS — this is the "upload UI → function → DB → dashboard"
  flow the brief describes, not a single monolith.

## 2. Data findings

Verified across all five sample files provided (9d/12d/14d/21d/30d), not
just one — the same issues show up proportionally in every file, so the
cleaning logic is written to handle the pattern, not the specific rows in
one file:

| Issue | Handling |
|---|---|
| Timestamps mix three formats: ISO-8601 UTC (`2025-05-13T12:45:00Z`), ISO-8601 with a `+05:30` offset, and raw Unix seconds (`1746938700`) | All normalized to ISO-8601 UTC — the offset case is converted to true UTC, not just stripped, so it lands in the right 15-minute bucket |
| Latency mixes units — `ms` and `s` in the same column depending on row | Normalized to milliseconds everywhere |
| ~1.2% of rows have a missing latency value | Kept (status is still valid data); stored as `NULL`, not `0` — `0` would misrepresent an actual fast response |
| A few rows have a negative latency (physically impossible) | Row kept for uptime purposes, latency nulled rather than guessed at |
| `status_code` sometimes reads `999` | Not a real HTTP status — it's the agent's sentinel for "no response/timeout". Normalized to `-1` internally, always counted as a failure |
| A handful of exact duplicate rows (same service, timestamp, agent) | De-duplicated via a `UNIQUE(service_id, ts_utc, agent)` constraint plus an in-batch check, so re-uploading the same file is also safe |
| Two agents (`agent-1`, `agent-2`) report from the same region with overlapping check windows | Kept as-is — this is intentional redundancy, not a data error, and is *not* deduplicated against each other unless the timestamp is identical |
| A small number of malformed rows (wrong column count, unparseable timestamp) | Rejected and logged to a `rejected_rows` table with a reason, rather than silently dropped or crashing the upload |

## 3. Assumptions

- **Uptime definition:** a check counts as "up" only if `status_code == 200`.
  `500`/`502`/`503` and the `999`/timeout sentinel all count as down. The
  brief's SLA language ("99.9% availability") is about successful
  responses, not just "got any response."
- **SLA breach threshold:** used the 99.9% figure from the brief's own
  example, applied per-service.
- **Incident count** is the number of *consecutive failure streaks*, not
  the raw count of failed rows. A 20-minute outage with 5 failed
  15-minute checks in a row should read as "1 incident," which is what
  someone on-call or in billing actually cares about — not "5 failures."
- **Stats chosen:** per-service uptime %, SLA breach flag, total checks,
  avg/p95 latency, and incident count. This is aimed at the two
  audiences the brief names — an on-call engineer (uptime, incidents,
  latency) and billing (the breach flag, since that's what triggers a
  credit).
- **Latency stats exclude nulled/missing values** rather than treating
  them as 0, so a service with lots of missing latency data doesn't look
  artificially fast.
- **Date filter** on the logs view accepts a single day or a range by
  leaving one side of the range empty; both `from` and `to` map to the
  same `ts_utc` column used everywhere else.
- **Out of scope, per the brief:** no auth, no multi-tenant support, no
  CI. The upload endpoint is open — acceptable for a take-home, called
  out here rather than silently assumed.

## 4. Live URL & running locally

- **Live URL:** _fill in after deploying — see steps below_
- **GitHub repo:** _push this folder and add the link here_
- **Last verified live:** _fill in the date you actually check the URL loads and a CSV uploads/renders correctly, right before submitting_

Cloudflare's free tier (Workers + Pages + D1) has no time-based shutdown —
unlike some other free tiers (e.g. Heroku's old free dynos, Render's free
web services), this doesn't sleep or expire on its own, so the URL above
should stay live indefinitely without redeploying. If it's ever down for
any reason, redeploying is a single command once the repo is cloned and
`wrangler login` is done:

```bash
# redeploy the function
cd worker && wrangler deploy

# redeploy the frontend
cd frontend && npm run build && npx wrangler pages deploy dist --project-name earthre-sla-dashboard
```

### Deploy steps (first time, Cloudflare free tier, no credit card required)

```bash
# 1. Install wrangler and log in (opens a browser to authorize)
npm install -g wrangler
wrangler login

# 2. Create the D1 database
cd worker
wrangler d1 create earthre-sla-db
# copy the returned database_id into wrangler.toml

# 3. Create the schema (remote = the live hosted DB)
wrangler d1 execute earthre-sla-db --remote --file=../db/schema.sql

# 4. Install deps and deploy the Worker
npm install
wrangler deploy
# note the printed *.workers.dev URL — this is your API base

# 5. Point the frontend at the deployed Worker
cd ../frontend
cp .env.example .env
# edit .env: VITE_API_BASE=<your workers.dev URL from step 4>
npm install
npm run build

# 6. Deploy the frontend to Cloudflare Pages
npx wrangler pages deploy dist --project-name earthre-sla-dashboard
```

### Running locally

```bash
# Terminal 1 — worker
cd worker && npm install && npm run dev   # http://localhost:8787

# Terminal 2 — frontend
cd frontend && npm install && npm run dev # http://localhost:5173
```

## 5. What I'd do differently with more time

- Move p95 latency calculation into SQL (a window function or a
  precomputed rollup table) instead of pulling sorted rows into the
  Worker — fine at this data volume, would not scale past a few hundred
  thousand rows per service.
- Add basic upload validation feedback in the UI per-rejected-row
  (currently just a count), so a user can see *why* specific rows were
  skipped without querying the DB directly.
- Stream-parse very large CSVs instead of loading the whole file into
  memory in the Worker, since Workers have a memory ceiling.
- Add a simple retry/backoff on the D1 batch inserts for very large
  uploads, and surface partial-failure state if a batch fails midway.