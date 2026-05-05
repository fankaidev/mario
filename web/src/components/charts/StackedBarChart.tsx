import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface StackedSegment {
  label: string;
  value: number;
  color: string;
}

interface StackedBarDataPoint {
  label: string;
  segments: StackedSegment[];
}

interface StackedBarChartProps {
  data: StackedBarDataPoint[];
  height?: number;
  formatValue?: (v: number) => string;
}

const PALETTE = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#65a30d",
];

export function getPortfolioColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? "#6b7280";
}

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
  payload: {
    label: string;
    [key: string]: number | string;
  };
}

function CustomTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  formatValue?: ((v: number) => string) | undefined;
}) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0);

  return (
    <div className="rounded-md border bg-card p-2 shadow-md">
      <p className="mb-1 text-xs font-semibold">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span>
            {entry.dataKey}: {formatValue ? formatValue(entry.value) : entry.value.toLocaleString()}
          </span>
        </div>
      ))}
      <div className="mt-1 border-t pt-1 text-xs font-medium">
        Total: {formatValue ? formatValue(total) : total.toLocaleString()}
      </div>
    </div>
  );
}

export function StackedBarChart({ data, height = 250, formatValue }: StackedBarChartProps) {
  if (data.length === 0) return null;

  const labelFirstSeen = new Map<string, number>();
  data.forEach((point, i) => {
    point.segments.forEach((s) => {
      if (!labelFirstSeen.has(s.label)) {
        labelFirstSeen.set(s.label, i);
      }
    });
  });
  const allLabels = [...labelFirstSeen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);

  const labelColorMap = new Map<string, string>();
  data.forEach((point) => {
    point.segments.forEach((s) => {
      if (!labelColorMap.has(s.label)) {
        labelColorMap.set(s.label, s.color);
      }
    });
  });

  const chartData = data.map((point) => {
    const obj: { label: string; [key: string]: number | string } = { label: point.label };
    for (const seg of point.segments) {
      obj[seg.label] = seg.value;
    }
    return obj;
  });

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            interval="preserveStartEnd"
            minTickGap={40}
            tickFormatter={(v: string) => (v.length > 8 ? v.slice(2) : v)}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (formatValue ? formatValue(v) : v.toLocaleString())}
            width={50}
          />
          <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
          {allLabels.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
              iconType="square"
              iconSize={10}
            />
          )}
          {allLabels.map((label) => (
            <Bar
              key={label}
              dataKey={label}
              stackId="a"
              fill={labelColorMap.get(label) ?? "#6b7280"}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
