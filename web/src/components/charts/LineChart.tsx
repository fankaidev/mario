import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

interface DataPoint {
  label: string;
  values: { key: string; value: number; color: string }[];
}

interface ChartMarker {
  index: number;
  label: string;
  color: string;
}

interface LineChartProps {
  data: DataPoint[];
  height?: number;
  formatValue?: (v: number) => string;
  minValue?: number | undefined;
  markers?: ChartMarker[];
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
  formatValue,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  formatValue?: ((v: number) => string) | undefined;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-md border bg-card p-2 shadow-md">
      <p className="mb-1 text-xs font-semibold">{point.label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>
            {entry.dataKey}: {formatValue ? formatValue(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function LineChart({ data, height = 200, formatValue, minValue, markers }: LineChartProps) {
  if (data.length === 0) return null;

  const allKeys = [...new Set(data.flatMap((p) => p.values.map((v) => v.key)))];
  const colorMap = new Map<string, string>();
  for (const point of data) {
    for (const v of point.values) {
      if (!colorMap.has(v.key)) {
        colorMap.set(v.key, v.color);
      }
    }
  }

  const chartData = data.map((point, index) => {
    const obj: { label: string; index: number; [key: string]: number | string } = {
      label: point.label,
      index,
    };
    for (const v of point.values) {
      obj[v.key] = v.value;
    }
    return obj;
  });

  let computedMin: number | undefined;
  let computedMax: number | undefined;
  if (data.length > 0) {
    let min = Infinity;
    let max = -Infinity;
    for (const point of data) {
      for (const v of point.values) {
        if (v.value < min) min = v.value;
        if (v.value > max) max = v.value;
      }
    }
    const range = max - min || 1;
    const pad = range * 0.1;
    computedMin = minValue !== undefined ? Math.min(minValue, min) : min - pad;
    computedMax = max + pad;
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <RechartsLineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (formatValue ? formatValue(v) : v.toLocaleString())}
            domain={[computedMin ?? "auto", computedMax ?? "auto"]}
            width={45}
          />
          <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
          {allKeys.map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colorMap.get(key) ?? "#000"}
              strokeWidth={2}
              dot={data.length <= 30 ? { r: 2.5 } : false}
              activeDot={{ r: 4 }}
            />
          ))}
          {markers?.map((m, i) => {
            const point = chartData[m.index];
            if (!point) return null;
            return (
              <ReferenceLine
                key={`marker-${i}`}
                x={point.label}
                stroke={m.color}
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{
                  value: m.label,
                  position: "top",
                  fill: "#fff",
                  fontSize: 9,
                  fontWeight: "bold",
                  style: {
                    backgroundColor: m.color,
                    padding: "2px 4px",
                    borderRadius: "2px",
                  },
                }}
              />
            );
          })}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
