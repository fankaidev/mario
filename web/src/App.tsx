import { Routes, Route, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./components/ui/button";
import { PortfolioList } from "./pages/PortfolioList";
import { PortfolioDetail } from "./pages/PortfolioDetail";
import { Settings } from "./pages/Settings";
import { get } from "./lib/api";
import type { MeResponse } from "../../shared/types/api";

export function App() {
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => get<MeResponse>("/me"),
  });

  return (
    <main className="min-h-screen bg-muted/40 text-foreground">
      <nav className="border-b bg-background/95 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Portfolios</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings">Settings</Link>
          </Button>
          {me?.data.email && (
            <span className="ml-auto text-xs text-muted-foreground">{me.data.email}</span>
          )}
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<PortfolioList />} />
        <Route path="/portfolios/:id" element={<PortfolioDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </main>
  );
}
