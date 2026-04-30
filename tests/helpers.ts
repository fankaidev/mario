export async function cleanDatabase(db: D1Database) {
  await db.exec("DELETE FROM stock_tags");
  await db.exec("DELETE FROM realized_pnl");
  await db.exec("DELETE FROM lots");
  await db.exec("DELETE FROM transactions");
  await db.exec("DELETE FROM prices");
  await db.exec("DELETE FROM corporate_actions");
  await db.exec("DELETE FROM tags");
  await db.exec("DELETE FROM api_tokens");
  await db.exec("DELETE FROM portfolios");
  await db.exec("DELETE FROM users");
}
