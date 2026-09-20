import { useEffect, useState } from "react";

/**
 * Hand-built equivalent of ReactBits' "Thought Line" micro interaction:
 * a single line of text that fades/slides out and is replaced by the next
 * line on a timer, giving the impression of a running thought process.
 * (Built from scratch rather than pulled from reactbits.dev directly --
 * that domain wasn't reachable to fetch the exact source from here. Swap
 * in the real component via `npx jsrepo add https://reactbits.dev/default/
 * Animations/ThoughtLine` later if you want the literal original.)
 */
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