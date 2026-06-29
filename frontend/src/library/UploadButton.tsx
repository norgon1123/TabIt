import { useRef } from "react";

export default function UploadButton({
  onUpload,
  busy,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.mp4"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : "Upload recording"}
      </button>
    </>
  );
}
