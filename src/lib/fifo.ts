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

export interface FIFOResult {
  lots: Lot[];
  realizedPnl: RealizedPnL[];
}

/**
 * Replay FIFO algorithm from transactions event log.
 * This is the single source of truth for lot tracking and realized P&L.
 */
export function replayFIFO(transactions: Transaction[]): FIFOResult {
  // Sort by date first, then by created_at timestamp for intraday ordering
  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.created_at.localeCompare(b.created_at);
  });

  const lots: Lot[] = [];
  const realizedPnl: RealizedPnL[] = [];

  for (const tx of sorted) {
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
  }

  return { lots, realizedPnl };
}
