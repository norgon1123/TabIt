import { useState } from "react";
import { Link } from "react-router-dom";
import AnalysisStatusBadge from "../components/AnalysisStatusBadge";
import UploadDropzone from "../library/UploadDropzone";
import { useRecordings } from "../library/useRecordings";
import { formatUploadedAt } from "../library/formatDate";
import { filterAndSortRecordings, type SortDir } from "../library/filterSort";
import type { RecordingOut } from "../api/types";

function RecordingName({
  recording,
  onRename,
}: {
  recording: RecordingOut;
  onRename: (name: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(recording.original_filename);
  const [busy, setBusy] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === recording.original_filename) {
      setEditing(false);
      setName(recording.original_filename);
      return;
    }
    setBusy(true);
    try {
      await onRename(trimmed);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <strong>{recording.original_filename}</strong>
        <button
          onClick={() => {
            setName(recording.original_filename);
            setEditing(true);
          }}
          style={{ padding: "2px 8px" }}
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        autoFocus
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button className="primary" onClick={save} disabled={busy} style={{ padding: "2px 8px" }}>
        Save
      </button>
      <button onClick={() => setEditing(false)} disabled={busy} style={{ padding: "2px 8px" }}>
        Cancel
      </button>
    </div>
  );
}

export default function LibraryPage() {
  const { recordings, isLoading, upload, remove, reanalyze, rename, isUploading, uploadError } =
    useRecordings();
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("newest");
  const visible = filterAndSortRecordings(recordings, query, sortDir);

  return (
    <div className="container">
      <h1>Library</h1>
      <UploadDropzone
        onUpload={(file) => {
          // A rejected upload lands in uploadError below; swallow it here so it doesn't
          // surface as an unhandled rejection.
          void upload(file).catch(() => {});
        }}
        busy={isUploading}
      />

      {uploadError && <p className="error" role="alert">{uploadError}</p>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search recordings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <button onClick={() => setSortDir((d) => (d === "newest" ? "oldest" : "newest"))}>
          {sortDir === "newest" ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && recordings.length === 0 && <p className="muted">No recordings yet. Upload one to start.</p>}
      {!isLoading && recordings.length > 0 && visible.length === 0 && (
        <p className="muted">No recordings match your search.</p>
      )}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {visible.map((r) => (
          <li key={r.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <RecordingName recording={r} onRename={(name) => rename(r.id, name)} />
                <div className="muted" style={{ fontSize: "0.85em", marginTop: 4 }}>
                  Uploaded {formatUploadedAt(r.created_at)}
                </div>
                <div>
                  <AnalysisStatusBadge
                    analysis={r.analysis}
                    chart={r.chart}
                    durationSeconds={r.duration_seconds}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {/* "Open", not "Open chart": the next page asks which way to open it. */}
                {r.analysis?.status === "done" && <Link to={`/recordings/${r.id}`}>Open</Link>}
                <button onClick={() => reanalyze(r.id)}>Re-analyze</button>
                <button className="danger" onClick={() => remove(r.id)}>Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
