import { Routes, Route, Link } from "react-router-dom";
import { PortfolioList } from "./pages/PortfolioList";
import { PortfolioDetail } from "./pages/PortfolioDetail";
import { Settings } from "./pages/Settings";

export function App() {
  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex gap-4">
        <Link to="/" className="text-blue-600 hover:underline font-medium">
          Portfolios
        </Link>
        <Link to="/settings" className="text-blue-600 hover:underline font-medium">
          Settings
        </Link>
      </nav>
      <Routes>
        <Route path="/" element={<PortfolioList />} />
        <Route path="/portfolios/:id" element={<PortfolioDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </main>
  );
}
