import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
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

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { markerLabel?: string; markerColor?: string };
}

function CustomDot({ cx, cy, payload }: DotProps) {
  if (!cx || !cy || !payload?.markerLabel) return null;
  const badgeH = 14;
  const badgeW = 16;
  const lineLen = 12;
  const gap = 4;
  const badgeY = cy - lineLen - badgeH - gap;
  const color = payload.markerColor ?? "#000";

  return (
    <g>
      <line
        x1={cx}
        y1={badgeY + badgeH + gap}
        x2={cx}
        y2={cy - 3}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="4 2"
        opacity={0.8}
      />
      <rect x={cx - badgeW / 2} y={badgeY} width={badgeW} height={badgeH} rx={3} fill={color} />
      <text
        x={cx}
        y={badgeY + badgeH - 4}
        textAnchor="middle"
        fontSize={10}
        fill="#fff"
        fontWeight="bold"
      >
        {payload.markerLabel}
      </text>
    </g>
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

  const markerByIndex = new Map<number, ChartMarker>();
  markers?.forEach((m) => markerByIndex.set(m.index, m));

  const chartData = data.map((point, index) => {
    const obj: {
      label: string;
      index: number;
      markerLabel?: string;
      markerColor?: string;
      [key: string]: number | string | undefined;
    } = {
      label: point.label,
      index,
    };
    for (const v of point.values) {
      obj[v.key] = v.value;
    }
    const marker = markerByIndex.get(index);
    if (marker) {
      obj.markerLabel = marker.label;
      obj.markerColor = marker.color;
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

  const hasMarkers = markers && markers.length > 0;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <RechartsLineChart
          data={chartData}
          margin={{ top: hasMarkers ? 45 : 10, right: 10, left: 0, bottom: 5 }}
        >
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
              dot={
                hasMarkers
                  ? (props: DotProps) => <CustomDot key={props.index} {...props} />
                  : data.length <= 30
                    ? { r: 2.5 }
                    : false
              }
              activeDot={{ r: 4 }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
