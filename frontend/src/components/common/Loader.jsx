export default function Loader({ label }) {
  return (
    <span className="loader-wrap">
      <span className="loader-spin" aria-hidden="true" />
      {label && <span className="loader-label">{label}</span>}
    </span>
  );
}