import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { get } from "../../lib/api";
import type { HoldingLots, Transaction } from "../../../../shared/types/api";
import { PriceHistorySection } from "./PriceHistorySection";
import { TransactionTypeBadge } from "./TransactionTypeBadge";

export function HoldingDetailPanel({ id, symbol }: { id: string; symbol: string }) {
  const [activeTab, setActiveTab] = useState<"chart" | "transactions" | "lots">("chart");

  const { data: lotsData } = useQuery({
    queryKey: ["holding-lots", id, symbol],
    queryFn: () => get<{ data: HoldingLots }>(`/portfolios/${id}/holdings/${symbol}/lots`),
  });

  const { data: txData } = useQuery({
    queryKey: ["transactions", id],
    queryFn: () => get<{ data: Transaction[] }>(`/portfolios/${id}/transactions`),
  });

  const symbolTransactions = useMemo(
    () => (txData?.data ?? []).filter((tx) => tx.symbol === symbol),
    [txData?.data, symbol],
  );

  return (
    <div>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="mb-2 h-7">
          <TabsTrigger value="chart" className="px-2 text-xs">
            Chart
          </TabsTrigger>
          <TabsTrigger value="transactions" className="px-2 text-xs">
            Transactions
          </TabsTrigger>
          <TabsTrigger value="lots" className="px-2 text-xs">
            Lots
          </TabsTrigger>
        </TabsList>

        {activeTab === "chart" && <PriceHistorySection id={id} symbol={symbol} isVisible={true} />}

        {activeTab === "transactions" && (
          <div className="space-y-1">
            {symbolTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between border-b py-1 text-xs">
                <div>
                  <span className="font-medium">{tx.date}</span>
                  <TransactionTypeBadge type={tx.type} />
                  <span className="ml-1 text-muted-foreground">
                    {tx.quantity} × {tx.price}
                  </span>
                </div>
                {tx.fee > 0 && <span className="text-muted-foreground">fee {tx.fee}</span>}
              </div>
            ))}
            {symbolTransactions.length === 0 && (
              <p className="text-xs text-muted-foreground">No transactions</p>
            )}
          </div>
        )}

        {activeTab === "lots" && lotsData?.data && (
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="h-8">Date</TableHead>
                <TableHead className="h-8">Buy Price</TableHead>
                <TableHead className="h-8">Qty</TableHead>
                <TableHead className="h-8">Rem</TableHead>
                <TableHead className="h-8">Cost</TableHead>
                <TableHead className="h-8">Value</TableHead>
                <TableHead className="h-8">P&L</TableHead>
                <TableHead className="h-8">P&L%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotsData.data.lots.map((lot) => (
                <TableRow
                  key={lot.id}
                  className={lot.status === "closed" ? "text-muted-foreground" : ""}
                >
                  <TableCell>{lot.date}</TableCell>
                  <TableCell>{lot.buy_price}</TableCell>
                  <TableCell>{lot.quantity}</TableCell>
                  <TableCell>{lot.remaining_quantity}</TableCell>
                  <TableCell>{lot.cost_basis.toLocaleString()}</TableCell>
                  <TableCell>{lot.current_value?.toLocaleString() ?? "-"}</TableCell>
                  <TableCell
                    className={(lot.unrealized_pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
                  >
                    {lot.unrealized_pnl != null
                      ? `${lot.unrealized_pnl >= 0 ? "+" : ""}${lot.unrealized_pnl.toLocaleString()}`
                      : "-"}
                  </TableCell>
                  <TableCell
                    className={
                      (lot.unrealized_pnl_rate ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                    }
                  >
                    {lot.unrealized_pnl_rate != null
                      ? `${lot.unrealized_pnl_rate >= 0 ? "+" : ""}${lot.unrealized_pnl_rate}%`
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Tabs>
    </div>
  );
}
