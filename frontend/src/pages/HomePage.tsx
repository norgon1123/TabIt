import { useAuth } from "../auth/AuthContext";
import GuestHomePage from "./GuestHomePage";
import LibraryPage from "./LibraryPage";

/** The front door. Signed in, it's your library; signed out, it's a song you can try. */
export default function HomePage() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p className="muted container">Loading…</p>;
  return user ? <LibraryPage /> : <GuestHomePage />;
}
