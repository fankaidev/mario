import type { Transaction } from "../../shared/types/api";

export interface Lot {
  transaction_id: number;
  symbol: string;
  quantity: number;
  remaining_quantity: number;
  cost_basis: number;
  date: string;
  created_at: string;
}

export interface RealizedPnL {
  sell_transaction_id: number;
  lot_id: number;
  symbol: string;
  quantity: number;
  cost_basis: number;
  proceeds: number;
  pnl: number;
  sell_price: number;
  cost_per_share: number;
  sell_date: string;
  buy_date: string;
}

export interface CorporateAction {
  id: number;
  symbol: string;
  type: "split" | "merge";
  ratio: number;
  effective_date: string;
}

export interface FIFOResult {
  lots: Lot[];
  realizedPnl: RealizedPnL[];
}

type Event =
  | { kind: "transaction"; data: Transaction }
  | { kind: "corporate_action"; data: CorporateAction };

/**
 * Replay FIFO algorithm from transactions event log.
 * This is the single source of truth for lot tracking and realized P&L.
 *
 * Corporate actions (splits/merges) are applied after all transactions on the same day.
 */
export function replayFIFO(
  transactions: Transaction[],
  corporateActions: CorporateAction[] = [],
): FIFOResult {
  // Build unified event stream
  const events: Event[] = [
    ...transactions.map((tx) => ({ kind: "transaction" as const, data: tx })),
    ...corporateActions.map((ca) => ({ kind: "corporate_action" as const, data: ca })),
  ];

  // Sort by date first, then corporate actions come LAST on the same day
  // For transactions on the same day, sort by created_at
  events.sort((a, b) => {
    const dateA = a.kind === "transaction" ? a.data.date : a.data.effective_date;
    const dateB = b.kind === "transaction" ? b.data.date : b.data.effective_date;

    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    // Same day: transactions come before corporate actions
    if (a.kind !== b.kind) {
      return a.kind === "transaction" ? -1 : 1;
    }

    // Both transactions: sort by created_at
    if (a.kind === "transaction" && b.kind === "transaction") {
      return a.data.created_at.localeCompare(b.data.created_at);
    }

    // Both corporate actions: maintain order (by id)
    if (a.kind === "corporate_action" && b.kind === "corporate_action") {
      return a.data.id - b.data.id;
    }

    return 0;
  });

  const lots: Lot[] = [];
  const realizedPnl: RealizedPnL[] = [];

  for (const event of events) {
    if (event.kind === "transaction") {
      const tx = event.data;

      if (tx.type === "buy" || tx.type === "initial") {
        // Create a new lot
        const costBasis = tx.quantity * tx.price + tx.fee;
        lots.push({
          transaction_id: tx.id,
          symbol: tx.symbol,
          quantity: tx.quantity,
          remaining_quantity: tx.quantity,
          cost_basis: costBasis,
          date: tx.date,
          created_at: tx.created_at,
        });
      } else if (tx.type === "sell") {
        // Consume lots in FIFO order
        let remainingToSell = tx.quantity;

        for (const lot of lots) {
          if (remainingToSell <= 0) break;
          if (lot.remaining_quantity <= 0) continue;
          if (lot.symbol !== tx.symbol) continue;

          const consumed = Math.min(lot.remaining_quantity, remainingToSell);
          lot.remaining_quantity -= consumed;

          const costBasisPerShare = lot.cost_basis / lot.quantity;
          const costForThisSale = consumed * costBasisPerShare;
          const proceedsForThisSale = consumed * tx.price - (tx.fee * consumed) / tx.quantity;
          const pnl = proceedsForThisSale - costForThisSale;

          realizedPnl.push({
            sell_transaction_id: tx.id,
            lot_id: lot.transaction_id,
            symbol: tx.symbol,
            quantity: consumed,
            cost_basis: costForThisSale,
            proceeds: proceedsForThisSale,
            pnl: pnl,
            sell_price: tx.price,
            cost_per_share: costBasisPerShare,
            sell_date: tx.date,
            buy_date: lot.date,
          });

          remainingToSell -= consumed;
        }
      }
      // Dividend transactions don't affect lots
    } else {
      // Corporate action
      const ca = event.data;

      for (const lot of lots) {
        if (lot.symbol !== ca.symbol) continue;
        if (lot.remaining_quantity <= 0) continue;

        if (ca.type === "split") {
          // Stock split: multiply quantities by ratio, cost basis unchanged
          lot.quantity *= ca.ratio;
          lot.remaining_quantity *= ca.ratio;
        } else if (ca.type === "merge") {
          // Reverse split: divide quantities by ratio, cost basis unchanged
          lot.quantity /= ca.ratio;
          lot.remaining_quantity /= ca.ratio;
        }
      }
    }
  }

  return { lots, realizedPnl };
}
