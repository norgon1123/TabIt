export default function Spinner({ label = "Loading" }: { label?: string }) {
  return <span role="status" aria-label={label} className="spinner" />;
}
