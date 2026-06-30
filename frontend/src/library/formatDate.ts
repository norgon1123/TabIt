// Round 2 #6: render the upload time as MM/DD/YY HH:mm:ss in the viewer's local zone.
export function formatUploadedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${p(d.getMonth() + 1)}/${p(d.getDate())}/${p(d.getFullYear() % 100)} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}
