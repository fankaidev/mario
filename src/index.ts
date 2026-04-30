import { Hono } from "hono";
import { auth, type AuthVariables } from "./middleware/auth";
import type { Bindings } from "./types";
import portfolios from "./routes/portfolios";
import transactions from "./routes/transactions";
import prices, { updatePrices } from "./routes/prices";
import tokens from "./routes/tokens";
import tags from "./routes/tags";
import corporateActions from "./routes/corporate-actions";
import type { PriceFetcher } from "./clients/price-fetcher";

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.use("/api/*", auth);

app.get("/api/me", (c) => {
  const user = c.get("user");
  return c.json({ data: { id: user.id, email: user.email } });
});

app.route("/api/portfolios", portfolios);
app.route("/api/portfolios/:portfolioId/transactions", transactions);
app.route("/api/prices", prices);
app.route("/api/tokens", tokens);
app.route("/api/portfolios/:portfolioId/tags", tags);
app.route("/api/portfolios/:portfolioId/corporate-actions", corporateActions);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings) {
    const fetcher: PriceFetcher = {
      async fetchPrice(symbol: string) {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}`, {
          headers: { "X-Finnhub-Token": "sandbox" },
        });
        if (res.ok) {
          const body = (await res.json()) as { c: number };
          if (typeof body.c === "number" && body.c > 0) return body.c;
        }
        return null;
      },
    };

    const updated = await updatePrices(env.DB, fetcher);
    console.log(`Scheduled price update: ${updated} stocks updated`);
  },
};
