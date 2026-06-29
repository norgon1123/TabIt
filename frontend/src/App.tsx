import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Header from "./components/Header";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import LibraryPage from "./pages/LibraryPage";
import ChartEditorPage from "./pages/ChartEditorPage";

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
        <Route
          path="/recordings/:recordingId"
          element={<ProtectedRoute><ChartEditorPage /></ProtectedRoute>}
        />
      </Routes>
    </>
  );
}
