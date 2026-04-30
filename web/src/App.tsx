import type { HealthResponse } from "../../shared/types/api";
import { useEffect, useState } from "react";

type HealthState = "loading" | "ok" | "error";

export function App() {
  const [health, setHealth] = useState<HealthState>("loading");

  useEffect(() => {
    let canceled = false;

    async function loadHealth() {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const data = (await response.json()) as HealthResponse;
        if (!canceled) {
          setHealth(data.status === "ok" ? "ok" : "error");
        }
      } catch {
        if (!canceled) {
          setHealth("error");
        }
      }
    }

    void loadHealth();

    return () => {
      canceled = true;
    };
  }, []);

  return (
    <main className="shell">
      <section className="panel" aria-labelledby="app-title">
        <p className="eyebrow">Portfolio Tracker</p>
        <h1 id="app-title">Mario</h1>
        <p className="summary">Track US, HK, and China A-share portfolios in one place.</p>
        <dl className="status-list">
          <div>
            <dt>API</dt>
            <dd data-state={health}>{health}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
