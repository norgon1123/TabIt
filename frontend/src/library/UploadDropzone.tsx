import { useRef, useState, type DragEvent } from "react";
import Button from "../ui/Button";

const ACCEPT = "audio/*,.m4a,.mp3,.wav,.mp4";

function isAudio(file: File): boolean {
  // Voice memos sometimes arrive with an empty MIME type, so fall back to the extension.
  return file.type.startsWith("audio/") || /\.(m4a|mp3|wav|mp4)$/i.test(file.name);
}

/** Drop a song on it, or click to pick one. */
export default function UploadDropzone({
  onUpload,
  busy,
  hint,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!isAudio(file)) {
      setRejected(`${file.name} isn’t an audio file.`);
      return;
    }
    setRejected(null);
    onUpload(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    choose(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <div
        // The drop target is a region, not a control — the button inside it is the
        // keyboard-reachable way in.
        role="region"
        aria-label="Upload a recording"
        className="dropzone"
        data-dragging={over ? "true" : undefined}
        data-busy={busy ? "true" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="dropzone__input"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="dropzone__lead">Drag a song here</p>
        <Button variant="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Uploading…" : "Choose a file"}
        </Button>
        {hint && <p className="muted dropzone__hint">{hint}</p>}
      </div>
      {rejected && (
        <p className="error" role="alert">
          {rejected}
        </p>
      )}
    </div>
  );
}
