import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import Card from "../ui/Card";
import Stack from "../ui/Stack";
import Field from "../ui/Field";
import Button from "../ui/Button";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ username, password });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>Log in</h1>
      <form onSubmit={onSubmit}>
        <Card>
          <Stack direction="column" gap={3} align="stretch">
            <Field label="Username">
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="Password" error={error ?? undefined}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Logging in…" : "Log in"}
            </Button>
          </Stack>
        </Card>
      </form>
      <p className="muted">
        No account? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
