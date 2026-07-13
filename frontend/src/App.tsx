import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Header from "./components/Header";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import ChartEditorPage from "./pages/ChartEditorPage";

export default function App() {
  return (
    <>
      <Header />
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
    </>
  );
}
