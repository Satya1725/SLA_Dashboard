import { useEffect, useRef, useState } from "react";

/**
 * Hand-built equivalent of ReactBits' "FadeContent": fades and slightly
 * lifts its children in on mount. Same reachability note as ThoughtLine --
 * this is a from-scratch recreation of the interaction, not the literal
 * fetched source (`npx jsrepo add https://reactbits.dev/default/
 * Animations/FadeContent` gets you the original if you want it verbatim).
 */
export default function FadeContent({ children, duration = 500, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`fade-content ${visible ? "fade-in" : ""}`}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {children}
    </div>
  );
}