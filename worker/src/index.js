import { parseAndClean } from "./clean.js";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    try {
      if (url.pathname === "/api/upload" && request.method === "POST") {
        return await handleUpload(request, env);
      }
      if (url.pathname === "/api/stats" && request.method === "GET") {
        return await handleStats(url, env);
      }
      if (url.pathname === "/api/logs" && request.method === "GET") {
        return await handleLogs(url, env);
      }
      if (url.pathname === "/api/services" && request.method === "GET") {
        return await handleServices(env);
      }
      if (url.pathname === "/api/reset" && request.method === "DELETE") {
        return await handleReset(env);
      }
      if (url.pathname === "/api/health") {
        return json({ ok: true }, env);
      }
      return json({ error: "not found" }, env, 404);
    } catch (err) {
      return json({ error: err.message || "internal error" }, env, 500);
    }
  },
};

async function handleUpload(request, env) {
  const contentType = request.headers.get("content-type") || "";
  let csvText, filename;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!file) return json({ error: "no file field in form data" }, env, 400);
    csvText = await file.text();
    filename = file.name || "upload.csv";
  } else {
    // Fallback: raw CSV body
    csvText = await request.text();
    filename = request.headers.get("x-filename") || "upload.csv";
  }

  const { rows, rejected } = parseAndClean(csvText);

  const batch_id = crypto.randomUUID();
  const uploaded_at = new Date().toISOString();

  // D1 batch API: chunk inserts to stay well under statement/size limits.
  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const stmts = chunk.map((r) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO checks
         (service_id, service_name, ts_utc, status_code, is_success, latency_ms, agent, region, upload_batch)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        r.service_id,
        r.service_name,
        r.ts_utc,
        r.status_code,
        r.is_success,
        r.latency_ms,
        r.agent,
        r.region,
        batch_id
      )
    );
    const results = await env.DB.batch(stmts);
    inserted += results.filter((r) => r.meta.changes > 0).length;
  }

  for (const rej of rejected.slice(0, 200)) {
    // Cap stored rejects to avoid pathological files ballooning the table;
    // the count in `uploads` is still the true total.
    await env.DB.prepare(
      `INSERT INTO rejected_rows (upload_batch, raw_row, reason) VALUES (?, ?, ?)`
    ).bind(batch_id, rej.raw_row, rej.reason).run();
  }

  await env.DB.prepare(
    `INSERT INTO uploads (batch_id, filename, uploaded_at, row_count, rejected_count)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(batch_id, filename, uploaded_at, rows.length, rejected.length).run();

  return json(
    {
      batch_id,
      filename,
      parsed_rows: rows.length,
      inserted_rows: inserted,
      duplicate_or_rejected: rejected.length,
    },
    env
  );
}

async function handleServices(env) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT service_id, service_name FROM checks ORDER BY service_id`
  ).all();
  return json({ services: results }, env);
}

/**
 * Wipes every row from all three tables. This is a deliberately blunt,
 * whole-dataset reset (matches the "fresh record" ask) -- not a per-upload
 * undo. No auth on it, same as /api/upload; fine for a take-home, called
 * out in the README as something to lock down before this ever handled
 * real data.
 */
async function handleReset(env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM checks"),
    env.DB.prepare("DELETE FROM rejected_rows"),
    env.DB.prepare("DELETE FROM uploads"),
  ]);
  return json({ ok: true, message: "all data cleared" }, env);
}

/**
 * Stats are computed per service:
 * - uptime_pct: % of checks with status 200 (this IS the SLA number)
 * - sla_breach: true if uptime_pct < 99.9 (the threshold from the brief)
 * - avg_latency_ms / p95_latency_ms: only over rows with a real latency value
 * - incident_count: number of distinct failure streaks (consecutive
 *   non-200 checks for that service), not raw failed-row count -- one
 *   20-minute outage should read as "1 incident", not "4 failed checks"
 */
async function handleStats(url, env) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where = [];
  const params = [];
  if (from) {
    where.push("ts_utc >= ?");
    params.push(from);
  }
  if (to) {
    where.push("ts_utc <= ?");
    params.push(to);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { results: services } = await env.DB.prepare(
    `SELECT
       service_id,
       service_name,
       COUNT(*) as total_checks,
       SUM(is_success) as success_checks,
       AVG(latency_ms) as avg_latency_ms
     FROM checks ${whereClause}
     GROUP BY service_id, service_name
     ORDER BY service_id`
  ).bind(...params).all();

  const enriched = [];
  for (const s of services) {
    const uptime_pct = s.total_checks > 0 ? (s.success_checks / s.total_checks) * 100 : null;

    // p95 latency (SQLite has no native percentile function; pull sorted
    // latencies and index in. Fine at this data volume; noted in README
    // as something to move server-side/precomputed at larger scale).
    const { results: latRows } = await env.DB.prepare(
      `SELECT latency_ms FROM checks
       WHERE service_id = ? AND latency_ms IS NOT NULL ${from ? "AND ts_utc >= ?" : ""} ${to ? "AND ts_utc <= ?" : ""}
       ORDER BY latency_ms ASC`
    ).bind(...[s.service_id, ...(from ? [from] : []), ...(to ? [to] : [])]).all();

    let p95 = null;
    if (latRows.length > 0) {
      const idx = Math.min(latRows.length - 1, Math.floor(0.95 * latRows.length));
      p95 = latRows[idx].latency_ms;
    }

    // Incident count: consecutive failing checks in ts order = 1 incident.
    const { results: statusRows } = await env.DB.prepare(
      `SELECT is_success FROM checks WHERE service_id = ? ${from ? "AND ts_utc >= ?" : ""} ${to ? "AND ts_utc <= ?" : ""} ORDER BY ts_utc ASC`
    ).bind(...[s.service_id, ...(from ? [from] : []), ...(to ? [to] : [])]).all();

    let incidents = 0;
    let wasDown = false;
    for (const row of statusRows) {
      if (row.is_success === 0) {
        if (!wasDown) incidents++;
        wasDown = true;
      } else {
        wasDown = false;
      }
    }

    enriched.push({
      service_id: s.service_id,
      service_name: s.service_name,
      total_checks: s.total_checks,
      uptime_pct: uptime_pct !== null ? Number(uptime_pct.toFixed(3)) : null,
      sla_breach: uptime_pct !== null ? uptime_pct < 99.9 : null,
      avg_latency_ms: s.avg_latency_ms !== null ? Number(s.avg_latency_ms.toFixed(1)) : null,
      p95_latency_ms: p95,
      incident_count: incidents,
    });
  }

  const { results: uploadMeta } = await env.DB.prepare(
    `SELECT COUNT(*) as upload_count, SUM(rejected_count) as total_rejected FROM uploads`
  ).all();

  return json(
    {
      services: enriched,
      overall_uptime_pct:
        enriched.length > 0
          ? Number(
              (
                enriched.reduce((a, s) => a + (s.uptime_pct || 0), 0) / enriched.length
              ).toFixed(3)
            )
          : null,
      uploads: uploadMeta[0],
    },
    env
  );
}

async function handleLogs(url, env) {
  const service_id = url.searchParams.get("service_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Number(url.searchParams.get("page_size") || "50"));
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];
  if (service_id) {
    where.push("service_id = ?");
    params.push(service_id);
  }
  if (from) {
    where.push("ts_utc >= ?");
    params.push(from);
  }
  if (to) {
    where.push("ts_utc <= ?");
    params.push(to);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { results: rows } = await env.DB.prepare(
    `SELECT service_id, service_name, ts_utc, status_code, latency_ms, agent, region
     FROM checks ${whereClause}
     ORDER BY ts_utc DESC
     LIMIT ? OFFSET ?`
  ).bind(...params, pageSize, offset).all();

  const { results: countRows } = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM checks ${whereClause}`
  ).bind(...params).all();

  return json(
    {
      rows,
      page,
      page_size: pageSize,
      total: countRows[0].total,
    },
    env
  );
}