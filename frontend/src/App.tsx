import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Header from "./components/Header";
import SkipLink from "./components/SkipLink";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import ChartEditorPage from "./pages/ChartEditorPage";

export default function App() {
  return (
    <>
      <SkipLink />
      <Header />
      {/* One <main> around the router gives all five screens a content landmark — the target
          for the skip link and for a screen reader's landmark navigation. */}
      <main id="main-content">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* Open on purpose: logged out, "/" is the try-Tabit-without-an-account page. */}
          <Route path="/" element={<HomePage />} />
          <Route
            path="/recordings/:recordingId"
            element={<ProtectedRoute><ChartEditorPage /></ProtectedRoute>}
          />
        </Routes>
      </main>
    </>
  );
}
