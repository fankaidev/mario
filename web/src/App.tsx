import { Routes, Route } from "react-router-dom";
import { PortfolioList } from "./pages/PortfolioList";

export function App() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<PortfolioList />} />
      </Routes>
    </main>
  );
}
