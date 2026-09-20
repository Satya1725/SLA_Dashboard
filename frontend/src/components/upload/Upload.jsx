import { useState } from "react";
import { uploadCsv } from "../../api.js";
import Loader from "../common/Loader.jsx";
import CodeSlots from "../common/CodeSlots.jsx";
import ThoughtLine from "../common/Thoughtline.jsx";

const THOUGHTS = [
  "Reading rows…",
  "Normalizing timestamps to UTC…",
  "Converting latency units…",
  "Flagging duplicates and timeouts…",
  "Writing to the database…",
];

export default function Upload({ onUploaded }) {
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState([]);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setStatus("uploading");
    setTotal(files.length);
    setResults([]);

    const completed = [];
    for (const file of files) {
      try {
        const res = await uploadCsv(file);
        completed.push({ filename: file.name, ...res, ok: true });
      } catch (err) {
        completed.push({ filename: file.name, ok: false, error: err.message });
      }
      setResults([...completed]);
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
        {status === "uploading" ? (
          <Loader label="Uploading and processing…" />
        ) : (
          "Choose one or more CSV files to upload"
        )}
      </label>

      <ThoughtLine lines={THOUGHTS} active={status === "uploading"} />

      <CodeSlots total={total} results={results} />

      {results.length > 0 && status !== "uploading" && (
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
    </div>
  );
}