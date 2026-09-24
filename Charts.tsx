import { cn } from "@/utils/cn";

/**
 * Hand-rolled flat charts. Deliberately SVG + solid fills: no chart library,
 * no gradients, no shadows — and ~0 kB added to the bundle.
 */

const PALETTE = ["#3B82F6", "#10B981", "#F59E0B", "#111827", "#8B5CF6", "#EF4444"];

export function BarChart({
  data,
  height = 200,
  tone = "#3B82F6",
  valueLabel = "views",
}: {
  data: { label: string; value: number }[];
  height?: number;
  tone?: string;
  valueLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="w-full">
      <div className="flex items-end gap-1" style={{ height }} role="img" aria-label={`${valueLabel} by day`}>
        {data.map((d) => (
          <div key={d.label} className="group flex h-full flex-1 flex-col justify-end">
            <div
              className={cn("w-full rounded-t-sm transition-all duration-200 group-hover:opacity-80")}
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: tone }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-3 flex justify-between text-xs font-medium text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </figcaption>
    </figure>
  );
}

export function LineChart({
  series,
  height = 220,
}: {
  series: { label: string; values: number[] }[];
  height?: number;
}) {
  const count = series[0]?.values.length ?? 0;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const w = 1000;
  const h = 300;

  const toPoints = (values: number[]) =>
    values
      .map((v, i) => `${(i / Math.max(1, count - 1)) * w},${h - (v / max) * h}`)
      .join(" ");

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ height }}
        className="w-full"
        role="img"
        aria-label="Trend chart"
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={w} y1={h * g} y2={h * g} stroke="#E5E7EB" strokeWidth={2} />
        ))}
        {series.map((s, i) => (
          <polyline
            key={s.label}
            points={toPoints(s.values)}
            fill="none"
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          {series.map((s, i) => (
            <span key={s.label} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
              {s.label}
            </span>
          ))}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          last {count} days
        </span>
      </div>
    </figure>
  );
}

export function RankedList({
  items,
  tone = "bg-primary",
  unit = "views",
}: {
  items: { label: string; value: number }[];
  tone?: string;
  unit?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="group">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
              {item.value} {unit}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full rounded-sm bg-muted">
            <div
              className={cn("h-full rounded-sm transition-all duration-300 group-hover:opacity-80", tone)}
              style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Cohort retention as a flat heat grid (no gradients, just opacity steps). */
export function RetentionGrid({ rows }: { rows: { cohort: string; size: number; retained: number }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cohort
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Users
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Returned later
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = r.size ? r.retained / r.size : 0;
            return (
              <tr key={r.cohort}>
                <td className="px-3 py-2 font-medium">{r.cohort}</td>
                <td className="px-3 py-2 tabular-nums">{r.size}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex min-w-16 justify-center rounded-sm px-2 py-1 text-xs font-bold tabular-nums text-white"
                    style={{ backgroundColor: `rgba(59,130,246,${0.35 + pct * 0.65})` }}
                  >
                    {Math.round(pct * 100)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
