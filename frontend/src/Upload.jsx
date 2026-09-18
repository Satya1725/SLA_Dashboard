import { useState } from "react";
import { uploadCsv } from "./api.js";

export default function Upload({ onUploaded }) {
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [results, setResults] = useState([]); // one entry per file
  const [error, setError] = useState(null);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setStatus("uploading");
    setError(null);
    setResults([]);

    const completed = [];
    // Uploaded one at a time, not in parallel: each upload does its own
    // batch of D1 writes, and firing several at once risks interleaved
    // writes against the same tables. Sequential is slower but safe.
    for (const file of files) {
      try {
        const res = await uploadCsv(file);
        completed.push({ filename: file.name, ...res, ok: true });
      } catch (err) {
        completed.push({ filename: file.name, ok: false, error: err.message });
      }
      setResults([...completed]); // update progressively as each file finishes
    }

    const anyFailed = completed.some((r) => !r.ok);
    setStatus(anyFailed ? "error" : "done");
    onUploaded?.();
  }

  return (
    <div className="upload-box">
      <label className="upload-label">
        <input
          type="file"
          accept=".csv"
          multiple
          onChange={handleFiles}
          disabled={status === "uploading"}
        />
        {status === "uploading"
          ? `Uploading and processing… (${results.length} done)`
          : "Choose one or more CSV files to upload"}
      </label>

      {results.length > 0 && (
        <ul className="upload-result-list">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "upload-result" : "upload-error"}>
              <strong>{r.filename}:</strong>{" "}
              {r.ok
                ? `parsed ${r.parsed_rows}, inserted ${r.inserted_rows} new, skipped ${r.duplicate_or_rejected} (duplicates/invalid)`
                : `failed — ${r.error}`}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="upload-error">{error}</p>}
    </div>
  );
}