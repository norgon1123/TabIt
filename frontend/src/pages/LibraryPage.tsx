import { Link } from "react-router-dom";
import AnalysisStatusBadge from "../components/AnalysisStatusBadge";
import UploadButton from "../library/UploadButton";
import { useRecordings } from "../library/useRecordings";

export default function LibraryPage() {
  const { recordings, isLoading, upload, remove, reanalyze, isUploading } = useRecordings();

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Library</h1>
        <UploadButton onUpload={upload} busy={isUploading} />
      </div>

      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && recordings.length === 0 && <p className="muted">No recordings yet. Upload one to start.</p>}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {recordings.map((r) => (
          <li key={r.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{r.original_filename}</strong>
                <div><AnalysisStatusBadge analysis={r.analysis} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {r.analysis?.status === "done" && <Link to={`/recordings/${r.id}`}>Open chart</Link>}
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
