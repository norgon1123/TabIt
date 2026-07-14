import { useState } from "react";
import { Link } from "react-router-dom";
import AnalysisStatusBadge from "../components/AnalysisStatusBadge";
import UploadDropzone from "../library/UploadDropzone";
import { useRecordings } from "../library/useRecordings";
import { formatUploadedAt } from "../library/formatDate";
import { filterAndSortRecordings, type SortDir } from "../library/filterSort";
import type { RecordingOut } from "../api/types";
import Stack from "../ui/Stack";
import Card from "../ui/Card";
import Button from "../ui/Button";

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
      <Stack gap={2}>
        <strong>{recording.original_filename}</strong>
        <Button
          className="inline-edit__btn"
          onClick={() => {
            setName(recording.original_filename);
            setEditing(true);
          }}
        >
          Rename
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap={2}>
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
      <Button variant="primary" className="inline-edit__btn" onClick={save} disabled={busy}>
        Save
      </Button>
      <Button className="inline-edit__btn" onClick={() => setEditing(false)} disabled={busy}>
        Cancel
      </Button>
    </Stack>
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

      <Stack className="search-row" gap={2} wrap>
        <input
          type="search"
          placeholder="Search recordings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        <Button onClick={() => setSortDir((d) => (d === "newest" ? "oldest" : "newest"))}>
          {sortDir === "newest" ? "Newest first" : "Oldest first"}
        </Button>
      </Stack>

      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && recordings.length === 0 && <p className="muted">No recordings yet. Upload one to start.</p>}
      {!isLoading && recordings.length > 0 && visible.length === 0 && (
        <p className="muted">No recordings match your search.</p>
      )}

      <ul className="recording-list">
        {visible.map((r) => (
          <li key={r.id}>
            <Card>
              <Stack justify="between" gap={3} wrap>
                <div>
                  <RecordingName recording={r} onRename={(name) => rename(r.id, name)} />
                  <div className="muted recording-meta">
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
                <Stack gap={2} wrap>
                  {/* "Open", not "Open chart": the next page asks which way to open it. */}
                  {r.analysis?.status === "done" && <Link to={`/recordings/${r.id}`}>Open</Link>}
                  <Button onClick={() => reanalyze(r.id)}>Re-analyze</Button>
                  <Button variant="danger" onClick={() => remove(r.id)}>Delete</Button>
                </Stack>
              </Stack>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
