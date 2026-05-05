export interface CashFlow {
  date: string;
  amount: number;
}

export function calculateXIRR(
  cashFlows: CashFlow[],
  options?: {
    maxIterations?: number;
    tolerance?: number;
  },
): number | null {
  const maxIterations = options?.maxIterations ?? 1000;
  const tolerance = options?.tolerance ?? 1e-7;

  if (cashFlows.length < 2) return null;

  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = new Date(sorted[0]!.date);
  const times = sorted.map(
    (cf) => (new Date(cf.date).getTime() - firstDate.getTime()) / (365 * 24 * 60 * 60 * 1000),
  );

  const amounts = sorted.map((cf) => cf.amount);
  const allPositive = amounts.every((a) => a > 0);
  const allNegative = amounts.every((a) => a < 0);
  if (allPositive || allNegative) return null;

  let rate = 0.1;

  for (let iter = 0; iter < maxIterations; iter++) {
    let npv = 0;
    let dnpv = 0;

    for (let i = 0; i < amounts.length; i++) {
      const factor = Math.pow(1 + rate, times[i]!);
      npv += amounts[i]! / factor;
      dnpv += (-amounts[i]! * times[i]!) / (factor * (1 + rate));
    }

    if (Math.abs(dnpv) < 1e-12) break;

    const delta = npv / dnpv;
    rate -= delta;

    if (Math.abs(delta) < tolerance) return rate;

    if (rate <= -0.999) rate = -0.999;
    if (rate > 100) rate = 100;
  }

  return null;
}
