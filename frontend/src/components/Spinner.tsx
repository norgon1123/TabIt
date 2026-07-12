export default function Spinner({ size = 16, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: "2px solid var(--muted)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "tabit-spin 0.8s linear infinite",
        verticalAlign: "middle",
      }}
    />
  );
}
