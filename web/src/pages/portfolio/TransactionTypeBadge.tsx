import { Badge } from "../../components/ui/badge";

export function TransactionTypeBadge({ type }: { type: string }) {
  const className =
    type === "buy"
      ? "bg-green-100 text-green-700"
      : type === "sell"
        ? "bg-red-100 text-red-700"
        : type === "initial"
          ? "bg-amber-100 text-amber-700"
          : "bg-blue-100 text-blue-700";

  return (
    <Badge variant="secondary" className={`ml-2 border-transparent ${className}`}>
      {type}
    </Badge>
  );
}
