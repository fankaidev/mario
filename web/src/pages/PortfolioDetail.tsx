import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { get } from "../lib/api";
import type { Portfolio, TabName } from "./portfolio/types";
import { SummaryCard } from "./portfolio/SummaryCard";
import { HoldingsTab } from "./portfolio/HoldingsTab";
import { TransactionsTab } from "./portfolio/TransactionsTab";
import { TransfersTab } from "./portfolio/TransfersTab";
import { SummaryTab } from "./portfolio/SummaryTab";
import { TagsTab } from "./portfolio/TagsTab";

export function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabName>("holdings");
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());

  const { data: portfolioData } = useQuery({
    queryKey: ["portfolio", id],
    queryFn: () => get<{ data: Portfolio }>(`/portfolios/${id}`),
  });

  const portfolio = portfolioData?.data;

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <Button
          asChild
          variant="link"
          className="h-auto p-0 text-muted-foreground hover:text-foreground"
        >
          <Link to="/">← Back to Portfolios</Link>
        </Button>
        <h1 className="mb-6 text-xl font-semibold md:text-2xl">
          {portfolio ? `${portfolio.name} (${portfolio.currency})` : "Loading..."}
        </h1>

        <SummaryCard id={id!} />

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabName)} className="mt-6">
          <TabsList className="mb-4 w-full justify-start overflow-x-auto">
            {(
              [
                ["holdings", "Holdings"],
                ["transactions", "Transactions"],
                ["transfers", "Transfers"],
                ["tags", "Tags"],
                ["summary", "Summary"],
              ] as [TabName, string][]
            ).map(([key, label]) => (
              <TabsTrigger key={key} value={key}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tab === "holdings" && (
            <HoldingsTab
              id={id!}
              onSelectSymbol={(s) => {
                setSelectedSymbols(new Set([s]));
                setTab("transactions");
              }}
            />
          )}
          {tab === "transactions" && (
            <TransactionsTab
              id={id!}
              selectedSymbols={selectedSymbols}
              onSelectedSymbolsChange={setSelectedSymbols}
            />
          )}
          {tab === "transfers" && <TransfersTab id={id!} />}
          {tab === "tags" && <TagsTab id={id!} />}
          {tab === "summary" && <SummaryTab id={id!} />}
        </Tabs>
      </div>
    </div>
  );
}
