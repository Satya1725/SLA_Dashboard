import { useEffect, useState } from "react";
import { getLogs } from "../../api.js";

export default function LogsPanel({ refreshKey }) {
  const [serviceId, setServiceId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getLogs({
      service_id: serviceId || undefined,
      from: from ? `${from}T00:00:00Z` : undefined,
      to: to ? `${to}T23:59:59Z` : undefined,
      page,
    })
      .then(setData)
      .finally(() => setLoading(false));
  }, [refreshKey, serviceId, from, to, page]);

  const totalPages = Math.max(1, Math.ceil(data.total / 50));

  return (
    <section className="panel">
      <div className="panel-header logs-header">
        <span>Logs</span>
      </div>
      <div className="panel-body">
        <div className="filters">
          <input
            type="text"
            placeholder="Filter by service_id (e.g. svc-payments)"
            value={serviceId}
            onChange={(e) => {
              setPage(1);
              setServiceId(e.target.value);
            }}
          />
          <label>
            From{" "}
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
          </label>
          {(from || to || serviceId) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
                setServiceId("");
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </div>

        {loading && <p>Loading…</p>}

        <table className="logs-table">
          <thead>
            <tr>
              <th>Timestamp (UTC)</th>
              <th>Service</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Agent</th>
              <th>Region</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i} className={r.status_code !== 200 ? "row-fail" : ""}>
                <td>{r.ts_utc}</td>
                <td>{r.service_name}</td>
                <td>{r.status_code === -1 ? "timeout" : r.status_code}</td>
                <td>{r.latency_ms != null ? `${Math.round(r.latency_ms)} ms` : "—"}</td>
                <td>{r.agent}</td>
                <td>{r.region}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Prev
          </button>
          <span>
            Page {page} of {totalPages} ({data.total} rows)
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
