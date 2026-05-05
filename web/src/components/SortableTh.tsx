import { TableHead } from "./ui/table";

export type SortDirection = "asc" | "desc";

export interface SortState<F extends string> {
  field: F;
  direction: SortDirection;
}

export function SortableTh<F extends string>({
  label,
  field,
  sort,
  onSort,
  align,
}: {
  label: string;
  field: F;
  sort: SortState<F>;
  onSort: (s: SortState<F>) => void;
  align?: "left" | "right";
}) {
  const isActive = sort.field === field;
  const arrow = isActive ? (sort.direction === "asc" ? " ↑" : " ↓") : "";

  return (
    <TableHead
      className={`cursor-pointer select-none ${align === "right" ? "text-right" : ""}`}
      aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      onClick={() =>
        onSort({
          field,
          direction: isActive && sort.direction === "asc" ? "desc" : "asc",
        })
      }
    >
      {label}
      {arrow}
    </TableHead>
  );
}
