const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

async function req(path, opts) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

export function uploadCsv(file) {
  const form = new FormData();
  form.append("file", file);
  return req("/api/upload", { method: "POST", body: form });
}

export function getStats({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return req(`/api/stats?${params.toString()}`);
}

export function getLogs({ service_id, from, to, page = 1, page_size = 50 } = {}) {
  const params = new URLSearchParams();
  if (service_id) params.set("service_id", service_id);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("page", page);
  params.set("page_size", page_size);
  return req(`/api/logs?${params.toString()}`);
}
