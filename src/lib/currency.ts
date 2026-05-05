/**
 * Look up the exchange rate for converting from one currency to another.
 * If no date is provided, returns the latest available rate.
 * If an exact date match is not found, falls back to the most recent rate before that date.
 * Falls back to the inverse rate (1/r) if no direct rate exists.
 * Falls back to cross-rate via USD for HKD↔CNY conversions.
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

  // Try direct rate lookup
  const directRate = await lookupRate(db, fromCurrency, toCurrency, date);
  if (directRate !== null) return directRate;

  // Try inverse rate: 1 toCurrency = X fromCurrency → fromCurrency = 1/X toCurrency
  const inverseRate = await lookupRate(db, toCurrency, fromCurrency, date);
  if (inverseRate !== null) return 1 / inverseRate;

  // Try cross-rate via USD for HKD↔CNY
  // Only attempt when both rates are stored as X→USD
  if (
    (fromCurrency === "HKD" || fromCurrency === "CNY") &&
    (toCurrency === "HKD" || toCurrency === "CNY")
  ) {
    const fromToUsd = await lookupRate(db, fromCurrency, "USD", date);
    const toToUsd = await lookupRate(db, toCurrency, "USD", date);
    if (fromToUsd !== null && toToUsd !== null) {
      return fromToUsd / toToUsd;
    }
  }

  return null;
}

async function lookupRate(
  db: D1Database,
  fromCurrency: string,
  toCurrency: string,
  date?: string,
): Promise<number | null> {
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
