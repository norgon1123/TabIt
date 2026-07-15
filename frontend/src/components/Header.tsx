import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Stack from "../ui/Stack";
import Button from "../ui/Button";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/"); // logged out, "/" is the guest page — no reason to bounce them to a form
  }

  return (
    <header className="app-header">
      <Stack className="container" justify="between" gap={3}>
        <Link to="/" className="wordmark">Tabit</Link>
        <Stack as="nav" aria-label="Main" gap={3}>
          {user ? (
            <>
              <Link to="/">Library</Link>
              <span className="muted">{user.username}</span>
              <Button onClick={onLogout}>Log out</Button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/register">Sign up</Link>
            </>
          )}
          <ThemeToggle />
        </Stack>
      </Stack>
    </header>
  );
}
