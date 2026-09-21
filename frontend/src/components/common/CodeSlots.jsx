function CodeSlots({ total, results }) {
  if (!total) return null;

  const slots = Array.from({ length: total }, (_, i) => results[i] || null);

  return (
    <div className="code-slots" role="list" aria-label="Upload progress">
      {slots.map((r, i) => {
        let stateClass = "slot-pending";
        let content = i + 1;
        if (r) {
          stateClass = r.ok ? "slot-done" : "slot-failed";
          content = r.ok ? "✓" : "!";
        }
        return (
          <span
            key={i}
            role="listitem"
            className={`code-slot ${stateClass}`}
            title={r ? r.filename : `Waiting (${i + 1} of ${total})`}
          >
            {content}
          </span>
        );
      })}
      <span className="code-slots-label">
        {results.length} / {total} files
      </span>
    </div>
  );
}

export default CodeSlots;