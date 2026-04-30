import { Hono } from "hono";
import { auth, type AuthVariables } from "./middleware/auth";
import portfolios from "./routes/portfolios";
import transactions from "./routes/transactions";
import prices from "./routes/prices";

type Bindings = {
  DB: D1Database;
};

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

export default app;
