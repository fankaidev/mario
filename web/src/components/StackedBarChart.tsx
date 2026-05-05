import { useMemo } from "react";

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

export function StackedBarChart({ data, height = 250, formatValue }: StackedBarChartProps) {
  const { maxVal } = useMemo(() => {
    if (data.length === 0) return { maxVal: 100 };
    let max = 0;
    for (const point of data) {
      const total = point.segments.reduce((sum, s) => sum + s.value, 0);
      if (total > max) max = total;
    }
    return { maxVal: max + max * 0.1 || 1 };
  }, [data]);

  const chartWidth = 600;
  const chartHeight = height;
  const leftPad = 50;
  const rightPad = 10;
  const topPad = 10;
  const bottomPad = 30;
  const plotWidth = chartWidth - leftPad - rightPad;
  const plotHeight = chartHeight - topPad - bottomPad;

  const scaleX = (i: number) => leftPad + (i / Math.max(data.length - 1, 1)) * plotWidth;

  const scaleY = (v: number) => topPad + plotHeight - (v / (maxVal || 1)) * plotHeight;

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = (i / yTicks) * maxVal;
    return Math.round(v * 100) / 100;
  });

  const barWidth = Math.min((plotWidth / Math.max(data.length, 1)) * 0.75, 40);

  const maxLabels = 8;
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));

  const allLabels = [...new Set(data.flatMap((p) => p.segments.map((s) => s.label)))];
  const labelColorMap = new Map<string, string>();
  data.forEach((point) => {
    point.segments.forEach((s) => {
      if (!labelColorMap.has(s.label)) {
        labelColorMap.set(s.label, s.color);
      }
    });
  });

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
          if (i % labelStep !== 0) return null;
          const x = scaleX(i);
          const dateLabel = point.label.length > 8 ? point.label.slice(2) : point.label;
          return (
            <text
              key={`label-${point.label}`}
              x={x}
              y={chartHeight - 4}
              textAnchor="middle"
              fontSize={9}
              fill="#9ca3af"
            >
              {dateLabel}
            </text>
          );
        })}
        {data.map((point, i) => {
          const barCenterX = scaleX(i);
          const barLeftX = barCenterX - barWidth / 2;
          let bottom = scaleY(0);
          return (
            <g key={`bar-${point.label}`}>
              {point.segments.map((segment, j) => {
                const segmentHeight = scaleY(0) - scaleY(segment.value);
                const y = bottom - segmentHeight;
                bottom = y;
                return (
                  <rect
                    key={`${i}-${j}`}
                    x={barLeftX}
                    y={y}
                    width={barWidth}
                    height={segmentHeight}
                    fill={segment.color}
                    rx={1}
                  >
                    <title>
                      {`${point.label} - ${segment.label}: ${formatValue ? formatValue(segment.value) : segment.value.toLocaleString()}`}
                    </title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      {allLabels.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {allLabels.map((label) => {
            const color = labelColorMap.get(label) ?? "#6b7280";
            return (
              <span key={label} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
