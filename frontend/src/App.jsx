import { useState } from "react";
import Upload from "./Upload.jsx";
import StatsPanel from "./StatsPanel.jsx";
import LogsPanel from "./LogsPanel.jsx";

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="app">
      <header>
        <h1>EarthRe — SLA Monitoring Dashboard</h1>
      </header>

      <Upload onUploaded={() => setRefreshKey((k) => k + 1)} />
      <StatsPanel refreshKey={refreshKey} />
      <LogsPanel refreshKey={refreshKey} />
    </div>
  );
}
