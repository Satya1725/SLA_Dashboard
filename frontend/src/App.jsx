import { useState } from "react";

import Upload from "./components/Upload/Upload.jsx";
import StatsPanel from "./components/panel/LogsPanel.jsx";
import LogsPanel from "./components/panel/LogsPanel.jsx";
import FadeContent from "./components/common/Fadecontent.jsx";
import ConfirmModal from "./components/common/DeleteButton.jsx";
import { resetAll } from "./api.js";

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Plain click just opens the confirm modal. Nothing is deleted unless
  // "Yes" is clicked in the modal.
  function handleDeleteClick() {
    setModalOpen(true);
  }

  async function handleConfirmDelete() {
    setModalOpen(false);
    setResetting(true);
    setResetError(null);
    try {
      await resetAll();
      setRefreshKey((k) => k + 1); // forces Stats/Logs to refetch -> now empty
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetting(false);
    }
  }

  function handleCancelDelete() {
    setModalOpen(false); // zero records touched
  }

  return (
    <FadeContent duration={600}>
      <div className="app">
        <header className="app-header">
          <h1>EarthRe — SLA Monitoring Dashboard</h1>
          <button
            className="delete-button"
            onClick={handleDeleteClick}
            disabled={resetting}
            type="button"
          >
            {resetting ? "Clearing…" : "Delete all data"}
          </button>
        </header>

        {resetError && <p className="upload-error">Reset failed: {resetError}</p>}

        <Upload onUploaded={() => setRefreshKey((k) => k + 1)} />
        <StatsPanel refreshKey={refreshKey} />
        <LogsPanel refreshKey={refreshKey} />

        <ConfirmModal
          open={modalOpen}
          title="Clear all data?"
          message="This will permanently delete every uploaded record, log, and stat. This can't be undone. Are you sure you want to continue?"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      </div>
    </FadeContent>
  );
}