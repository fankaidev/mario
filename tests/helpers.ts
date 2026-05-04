export async function cleanDatabase(db: D1Database) {
  // Get list of existing tables
  const tables = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all<{ name: string }>();
  const tableNames = new Set(tables.results.map((t) => t.name));

  // Helper to delete table if it exists
  const deleteIfExists = async (tableName: string) => {
    if (tableNames.has(tableName)) {
      await db.exec(`DELETE FROM ${tableName}`);
    }
  };

  // Delete in order respecting foreign key constraints
  // Note: lots and realized_pnl tables removed by migration 0014
  await deleteIfExists("stock_tags");
  await deleteIfExists("corporate_actions");
  await deleteIfExists("transactions");
  await deleteIfExists("transfers");
  await deleteIfExists("portfolio_snapshots");
  await deleteIfExists("price_history");
  await deleteIfExists("stocks");
  await deleteIfExists("tags");
  await deleteIfExists("api_tokens");
  await deleteIfExists("portfolios");
  await deleteIfExists("users");
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
