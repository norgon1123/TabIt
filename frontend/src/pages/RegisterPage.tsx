import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import Card from "../ui/Card";
import Stack from "../ui/Stack";
import Field from "../ui/Field";
import Button from "../ui/Button";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await register({ username, password });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>Register</h1>
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
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </Button>
          </Stack>
        </Card>
      </form>
      <p className="muted">
        Have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
