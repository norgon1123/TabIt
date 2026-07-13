import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/"); // logged out, "/" is the guest page — no reason to bounce them to a form
  }

  return (
    <header style={{ borderBottom: "1px solid #2c313a" }}>
      <div
        className="container"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 12 }}
      >
        <Link to="/" style={{ fontWeight: 700, textDecoration: "none" }}>Tabit</Link>
        {user ? (
          <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link to="/">Library</Link>
            <span className="muted">{user.username}</span>
            <button onClick={onLogout}>Log out</button>
          </nav>
        ) : (
          <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link to="/login">Log in</Link>
            <Link to="/register">Sign up</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
