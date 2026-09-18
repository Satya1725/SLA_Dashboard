import { useState } from "react";
import { uploadCsv } from "./api.js";

export default function Upload({ onUploaded }) {
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const res = await uploadCsv(file);
      setResult(res);
      setStatus("done");
      onUploaded?.();
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  return (
    <div className="upload-box">
      <label className="upload-label">
        <input type="file" accept=".csv" onChange={handleFile} disabled={status === "uploading"} />
        {status === "uploading" ? "Uploading and processing…" : "Choose a CSV file to upload"}
      </label>

      {status === "done" && result && (
        <p className="upload-result">
          Parsed {result.parsed_rows} rows, inserted {result.inserted_rows} new,
          skipped {result.duplicate_or_rejected} (duplicates/invalid).
        </p>
      )}
      {status === "error" && <p className="upload-error">Upload failed: {error}</p>}
    </div>
  );
}
