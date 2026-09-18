import { useEffect, useState } from "react";
import { getStats } from "./api.js";

export default function StatsPanel({ refreshKey, from, to }) {
  const [open, setOpen] = useState(true);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getStats({ from, to })
      .then((data) => {
        setStats(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [refreshKey, from, to]);

  return (
    <section className="panel">
      <button className="panel-header" onClick={() => setOpen(!open)}>
        <span>Stats {open ? "▾" : "▸"}</span>
        {stats && (
          <span className="overall-uptime">
            Overall uptime: {stats.overall_uptime_pct ?? "—"}%
          </span>
        )}
      </button>

      {open && (
        <div className="panel-body">
          {loading && <p>Loading…</p>}
          {error && <p className="upload-error">{error}</p>}
          {stats && stats.services.length === 0 && <p>No data yet — upload a CSV to get started.</p>}

          {stats && stats.services.length > 0 && (
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Checks</th>
                  <th>Uptime %</th>
                  <th>SLA</th>
                  <th>Avg latency</th>
                  <th>p95 latency</th>
                  <th>Incidents</th>
                </tr>
              </thead>
              <tbody>
                {stats.services.map((s) => (
                  <tr key={s.service_id} className={s.sla_breach ? "row-breach" : ""}>
                    <td>{s.service_name}</td>
                    <td>{s.total_checks}</td>
                    <td>{s.uptime_pct}%</td>
                    <td>{s.sla_breach ? "Breach (<99.9%)" : "OK"}</td>
                    <td>{s.avg_latency_ms != null ? `${s.avg_latency_ms} ms` : "—"}</td>
                    <td>{s.p95_latency_ms != null ? `${s.p95_latency_ms} ms` : "—"}</td>
                    <td>{s.incident_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {stats?.uploads && (
            <p className="upload-meta">
              {stats.uploads.upload_count} upload(s) so far, {stats.uploads.total_rejected || 0} rows
              rejected across all uploads.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
