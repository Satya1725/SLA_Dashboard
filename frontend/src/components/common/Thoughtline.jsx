import { useEffect, useState } from "react";

export default function ThoughtLine({ lines, active, intervalMs = 1400 }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!active || lines.length <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % lines.length);
        setVisible(true);
      }, 250);
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, lines, intervalMs]);

  useEffect(() => {
    if (!active) setIndex(0);
  }, [active]);

  if (!lines || lines.length === 0) return null;

  return (
    <div className="thought-line" aria-live="polite">
      <span className={`thought-line-text ${visible ? "visible" : ""}`}>
        {lines[index]}
      </span>
    </div>
  );
}