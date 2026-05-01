export async function cleanDatabase(db: D1Database) {
  await db.exec("DELETE FROM stock_tags");
  await db.exec("DELETE FROM realized_pnl");
  await db.exec("DELETE FROM lots");
  await db.exec("DELETE FROM transactions");
  await db.exec("DELETE FROM portfolio_snapshots");
  await db.exec("DELETE FROM prices");
  await db.exec("DELETE FROM corporate_actions");
  await db.exec("DELETE FROM tags");
  await db.exec("DELETE FROM api_tokens");
  await db.exec("DELETE FROM portfolios");
  await db.exec("DELETE FROM users");
}

export async function createApiTokenForUser(
  db: D1Database,
  userId: number,
  name = "Test Token",
): Promise<string> {
  const rawToken = crypto.randomUUID();
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await db
    .prepare("INSERT INTO api_tokens (user_id, name, token_hash) VALUES (?, ?, ?)")
    .bind(userId, name, tokenHash)
    .run();

  return rawToken;
}
