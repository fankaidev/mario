import { useMemo } from "react";

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

export function LineChart({ data, height = 200, formatValue, minValue, markers }: LineChartProps) {
  const { minVal, maxVal } = useMemo(() => {
    if (data.length === 0) return { minVal: 0, maxVal: 100, padding: 0.1 };
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
    return {
      minVal: minValue !== undefined ? Math.min(minValue, min) : min - pad,
      maxVal: max + pad,
      padding: 0.1,
    };
  }, [data, minValue]);

  const chartWidth = 600;
  const chartHeight = height;
  const leftPad = 50;
  const rightPad = 10;
  const topPad = 10;
  const bottomPad = 20;
  const plotWidth = chartWidth - leftPad - rightPad;
  const plotHeight = chartHeight - topPad - bottomPad;

  const scaleX = (i: number) => leftPad + (i / Math.max(data.length - 1, 1)) * plotWidth;
  const scaleY = (v: number) =>
    topPad + plotHeight - ((v - minVal) / (maxVal - minVal || 1)) * plotHeight;

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = minVal + (i / yTicks) * (maxVal - minVal);
    return Math.round(v * 100) / 100;
  });

  const allKeys = [...new Set(data.flatMap((p) => p.values.map((v) => v.key)))];

  // Show at most ~8 x-axis labels evenly spaced
  const maxLabels = 8;
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));

  // Only show dots when data is sparse
  const showDots = data.length <= 30;

  if (data.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        style={{ minHeight: height }}
      >
        {yTickValues.map((v) => (
          <g key={v}>
            <line
              x1={leftPad}
              y1={scaleY(v)}
              x2={chartWidth - rightPad}
              y2={scaleY(v)}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
            <text x={leftPad - 4} y={scaleY(v) + 4} textAnchor="end" fontSize={10} fill="#9ca3af">
              {formatValue ? formatValue(v) : v.toLocaleString()}
            </text>
          </g>
        ))}
        {data.map((point, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null;
          const x = scaleX(i);
          return (
            <text
              key={`label-${point.label}-${i}`}
              x={x}
              y={chartHeight - 2}
              textAnchor="middle"
              fontSize={9}
              fill="#9ca3af"
            >
              {point.label.length > 10 ? point.label.slice(0, 10) + "…" : point.label}
            </text>
          );
        })}
        {allKeys.map((key) => {
          const points = data.map((point, i) => {
            const v = point.values.find((v2) => v2.key === key);
            return v ? `${scaleX(i)},${scaleY(v.value)}` : null;
          });
          const color = data[0]?.values.find((v) => v.key === key)?.color ?? "#000";
          const polyline = points.filter(Boolean).join(" ");
          if (!polyline) return null;
          return (
            <g key={key}>
              <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} />
              {showDots &&
                data.map((point, i) => {
                  const v = point.values.find((v2) => v2.key === key);
                  if (!v) return null;
                  return (
                    <circle
                      key={`dot-${i}`}
                      cx={scaleX(i)}
                      cy={scaleY(v.value)}
                      r={2.5}
                      fill={color}
                    >
                      <title>
                        {`${point.label}: ${formatValue ? formatValue(v.value) : v.value}`}
                      </title>
                    </circle>
                  );
                })}
            </g>
          );
        })}
        {markers?.map((m, i) => {
          const x = scaleX(m.index);
          if (x < leftPad || x > chartWidth - rightPad) return null;
          const dataPoint = data[m.index];
          const priceValue = dataPoint?.values[0]?.value;
          const priceY = priceValue != null ? scaleY(priceValue) : null;
          const segLen = 14;
          const lineY1 = priceY != null ? Math.max(topPad, priceY - segLen) : topPad;
          const lineY2 =
            priceY != null
              ? Math.min(chartHeight - bottomPad, priceY + segLen)
              : chartHeight - bottomPad;
          return (
            <g key={`marker-${i}`}>
              <line
                x1={x}
                y1={lineY1}
                x2={x}
                y2={lineY2}
                stroke={m.color}
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.6}
              />
              <rect
                x={x - 6}
                y={topPad + 2}
                width={12}
                height={10}
                rx={2}
                fill={m.color}
                opacity={0.85}
              />
              <text
                x={x}
                y={topPad + 9}
                textAnchor="middle"
                fontSize={7}
                fill="#fff"
                fontWeight="bold"
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
