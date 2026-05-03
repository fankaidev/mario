import { useMemo, useState, useRef, useCallback } from "react";

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

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const vb = svg.viewBox.baseVal;
      const mx = ((e.clientX - rect.left) / rect.width) * vb.width;

      let nearest = 0;
      let minDist = Infinity;
      for (let i = 0; i < data.length; i++) {
        const dist = Math.abs(scaleX(i) - mx);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      }
      setHoverIndex(nearest);
    },
    [data.length, leftPad, plotWidth],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  if (data.length === 0) return null;

  let tooltipGroup = null;
  if (hoverIndex !== null) {
    const point = data[hoverIndex];
    if (point) {
      const x = scaleX(hoverIndex);
      const tw = 140;
      const padding = 6;
      const lineH = 14;
      const headerH = 16;
      const th = headerH + point.values.length * lineH + padding * 2;

      const gap = 8;
      let tx = x + gap;
      if (tx + tw > chartWidth - rightPad) {
        tx = x - tw - gap;
      }
      const ty = topPad + 4;

      tooltipGroup = (
        <g>
          <line
            x1={x}
            y1={topPad}
            x2={x}
            y2={chartHeight - bottomPad}
            stroke="#9ca3af"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
          <rect
            x={tx}
            y={ty}
            width={tw}
            height={th}
            rx={4}
            fill="#fff"
            stroke="#d1d5db"
            strokeWidth={1}
          />
          <text
            x={tx + padding}
            y={ty + padding + 11}
            fontSize={10}
            fontWeight="bold"
            fill="#374151"
          >
            {point.label}
          </text>
          {point.values.map((v, vi) => (
            <g key={v.key}>
              <circle
                cx={tx + padding + 4}
                cy={ty + headerH + padding + vi * lineH + 7}
                r={3}
                fill={v.color}
              />
              <text
                x={tx + padding + 12}
                y={ty + headerH + padding + vi * lineH + 11}
                fontSize={10}
                fill="#374151"
              >
                {v.key}: {formatValue ? formatValue(v.value) : v.value}
              </text>
            </g>
          ))}
        </g>
      );
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        style={{ minHeight: height, cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
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
            <text x={leftPad - 4} y={scaleY(v) + 4} textAnchor="end" fontSize={8} fill="#9ca3af">
              {formatValue ? formatValue(v) : Math.round(v).toLocaleString()}
            </text>
          </g>
        ))}
        {data.map((point, i) => {
          if (i % labelStep !== 0) return null;
          const x = scaleX(i);
          return (
            <text
              key={`label-${point.label}-${i}`}
              x={x}
              y={chartHeight - 2}
              textAnchor="middle"
              fontSize={7}
              fill="#9ca3af"
            >
              {point.label.length > 10 ? point.label.slice(0, 10) + "\u2026" : point.label}
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
          if (priceY == null) return null;
          const badgeH = 10;
          const gap = 2;
          const lineLen = 18;
          const startY = Math.max(topPad, priceY - badgeH - gap - lineLen);
          const badgeY = startY;
          const lineTop = Math.min(startY + badgeH + gap, priceY - 2);
          return (
            <g key={`marker-${i}`}>
              <line
                x1={x}
                y1={lineTop}
                x2={x}
                y2={priceY}
                stroke={m.color}
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.6}
              />
              <rect
                x={x - 6}
                y={badgeY}
                width={12}
                height={badgeH}
                rx={2}
                fill={m.color}
                opacity={0.85}
              />
              <text
                x={x}
                y={badgeY + 7}
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
        {tooltipGroup}
      </svg>
    </div>
  );
}
