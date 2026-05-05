/**
 * Look up the exchange rate for converting from one currency to another.
 * If no date is provided, returns the latest available rate.
 * If an exact date match is not found, falls back to the most recent rate before that date.
 * Returns 1 if from and to are the same currency.
 * Returns null if no rate is available.
 */
export async function getExchangeRate(
  db: D1Database,
  fromCurrency: string,
  toCurrency: string,
  date?: string,
): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1;

  if (date) {
    const exact = await db
      .prepare(
        "SELECT rate FROM exchange_rates WHERE from_currency = ? AND to_currency = ? AND date = ?",
      )
      .bind(fromCurrency, toCurrency, date)
      .first<{ rate: number }>();
    if (exact) return exact.rate;

    const nearest = await db
      .prepare(
        "SELECT rate FROM exchange_rates WHERE from_currency = ? AND to_currency = ? AND date <= ? ORDER BY date DESC LIMIT 1",
      )
      .bind(fromCurrency, toCurrency, date)
      .first<{ rate: number }>();
    if (nearest) return nearest.rate;
  } else {
    const latest = await db
      .prepare(
        "SELECT rate FROM exchange_rates WHERE from_currency = ? AND to_currency = ? ORDER BY date DESC LIMIT 1",
      )
      .bind(fromCurrency, toCurrency)
      .first<{ rate: number }>();
    if (latest) return latest.rate;
  }

  return null;
}
