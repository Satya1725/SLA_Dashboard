/**
 * Simple confirm/cancel modal. Used as a second checkpoint after the
 * hold-button gesture completes, before actually calling /api/reset --
 * the hold prevents accidental triggers, this prevents "I held it but
 * didn't mean it" from being unrecoverable.
 */
export default function ConfirmModal({ open, title, message, onConfirm, onCancel, confirmLabel = "Yes, delete", cancelLabel = "No, cancel" }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="modal-btn modal-btn-cancel" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="modal-btn modal-btn-confirm" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}