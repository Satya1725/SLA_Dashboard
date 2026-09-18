/**
 * Parsing + cleaning for the monitoring CSV.
 *
 * Data-quality issues found in the sample files (verified across all five
 * seed files provided, not just one) and how each is handled:
 *
 * 1. Timestamps come in three formats: ISO-8601 UTC ("2025-05-13T12:45:00Z"),
 *    ISO-8601 with a non-UTC offset ("2025-05-13T02:00:00+05:30"), and raw
 *    Unix seconds ("1746938700"). All three are normalized to ISO-8601 UTC
 *    (JS's Date parser handles the offset case natively; it's converted to
 *    absolute UTC, not just stripped).
 * 2. Latency is recorded in two units ("ms" and "s") depending on the row.
 *    Everything is normalized to milliseconds.
 * 3. ~1.2% of rows have a missing latency value. Kept (status/uptime is
 *    still valid), latency_ms stored as null rather than 0 -- 0 would be a
 *    false claim about actual response time and would drag averages down.
 * 4. A handful of rows have a negative latency, which is physically
 *    impossible. Treated as a corrupt measurement: the row is kept for
 *    uptime purposes but latency is nulled out rather than guessed at.
 * 5. status_code sometimes appears as 999. That's not a real HTTP status --
 *    it's the monitoring agent's sentinel for "no response / timeout".
 *    Normalized to -1 internally and always treated as a failure.
 * 6. A small number of exact duplicate rows exist (same service, timestamp,
 *    and agent). These are the same check reported twice, not two real
 *    events, and are de-duplicated at insert time via a UNIQUE constraint.
 * 7. Two agents (agent-1, agent-2) both report from the same region, and
 *    their check windows overlap. This is legitimate -- multiple agents are
 *    intentionally redundant -- so both are kept; they are NOT deduplicated
 *    against each other unless the timestamp is identical to the second.
 */

const REQUIRED_COLUMNS = [
  "service_id",
  "service_name",
  "timestamp",
  "status_code",
  "latency",
  "latency_unit",
  "agent",
  "region",
];

/** Minimal CSV line splitter. The dataset has no quoted/escaped commas, but
 * this still handles a quoted field defensively rather than assuming. */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeTimestamp(raw) {
  if (/^\d+$/.test(raw)) {
    // Unix seconds
    const ms = Number(raw) * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().replace(/\.\d+Z$/, "Z");
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d+Z$/, "Z");
}

function normalizeLatency(rawLatency, unit) {
  if (rawLatency === "" || rawLatency === undefined || rawLatency === null) {
    return null;
  }
  const n = Number(rawLatency);
  if (isNaN(n)) return null;
  if (n < 0) return null; // impossible value, treat as corrupt
  if (unit === "s") return n * 1000;
  return n; // already ms (default assumption if unit is missing/unrecognized)
}

function normalizeStatus(raw) {
  const n = Number(raw);
  if (isNaN(n)) return null;
  if (n === 999) return -1; // agent timeout/no-response sentinel, not a real HTTP code
  return n;
}

/**
 * @param {string} csvText
 * @returns {{ rows: object[], rejected: {raw_row: string, reason: string}[] }}
 */
export function parseAndClean(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error("Empty CSV file");
  }

  const header = parseCsvLine(lines[0]);
  const colIndex = {};
  header.forEach((h, i) => (colIndex[h] = i));

  for (const col of REQUIRED_COLUMNS) {
    if (!(col in colIndex)) {
      throw new Error(`Missing required column: ${col}`);
    }
  }

  const rows = [];
  const rejected = [];
  const seen = new Set(); // in-batch dedupe key: service_id|ts_utc|agent

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = parseCsvLine(raw);
    if (cols.length < header.length) {
      rejected.push({ raw_row: raw, reason: "column count mismatch" });
      continue;
    }

    const service_id = cols[colIndex["service_id"]];
    const service_name = cols[colIndex["service_name"]];
    const agent = cols[colIndex["agent"]];
    const region = cols[colIndex["region"]];

    if (!service_id || !agent || !region) {
      rejected.push({ raw_row: raw, reason: "missing required identifier field" });
      continue;
    }

    const ts_utc = normalizeTimestamp(cols[colIndex["timestamp"]]);
    if (!ts_utc) {
      rejected.push({ raw_row: raw, reason: "unparseable timestamp" });
      continue;
    }

    const status_code = normalizeStatus(cols[colIndex["status_code"]]);
    if (status_code === null) {
      rejected.push({ raw_row: raw, reason: "unparseable status_code" });
      continue;
    }

    const latency_ms = normalizeLatency(
      cols[colIndex["latency"]],
      cols[colIndex["latency_unit"]]
    );

    const dedupeKey = `${service_id}|${ts_utc}|${agent}`;
    if (seen.has(dedupeKey)) {
      rejected.push({ raw_row: raw, reason: "exact duplicate within upload" });
      continue;
    }
    seen.add(dedupeKey);

    rows.push({
      service_id,
      service_name,
      ts_utc,
      status_code,
      is_success: status_code === 200 ? 1 : 0,
      latency_ms,
      agent,
      region,
    });
  }

  return { rows, rejected };
}
