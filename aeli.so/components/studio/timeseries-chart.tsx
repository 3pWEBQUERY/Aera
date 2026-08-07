"use client";

import { useId, useMemo, useState } from "react";
import { CHART } from "@/lib/chart-palette";
import type { DayPoint } from "@/lib/analytics";

/**
 * Aufrufe und Klicks über die Zeit.
 *
 * Eine Achse, zwei Serien — beide zählen Ereignisse, also gehören sie in
 * dasselbe Koordinatensystem. Eine zweite y-Achse wäre der schnellste Weg, aus
 * „mehr Klicks als sonst“ und „weniger Aufrufe als sonst“ dasselbe Bild zu
 * machen.
 *
 * Linien statt Balken: bei 30 Tagen und zwei Serien wären das 60 Balken auf
 * 700 Pixeln. Die Form der Kurve ist die Information, nicht der einzelne Tag —
 * den holt man sich über den Fadenkreuz-Zeiger.
 *
 * Unter der Grafik steht dieselbe Reihe als Tabelle. Nicht als Zugeständnis,
 * sondern weil „welcher Tag war der 14.?“ eine Frage ist, die eine Kurve nie
 * gut beantwortet.
 */

const W = 720;
const H = 190;
const PAD = { top: 12, right: 12, bottom: 22, left: 34 };

export function TimeseriesChart({ series }: { series: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const { max, points } = useMemo(() => {
    const peak = Math.max(1, ...series.map((point) => Math.max(point.views, point.clicks)));
    // Auf eine glatte Zahl aufrunden — eine Achse, die bei 37 endet, liest
    // sich schlechter als eine, die bei 40 endet.
    const step = 10 ** Math.floor(Math.log10(peak));
    const rounded = Math.ceil(peak / step) * step;
    return {
      max: rounded,
      points: series.map((point, index) => ({
        ...point,
        x:
          PAD.left +
          (index / Math.max(1, series.length - 1)) * (W - PAD.left - PAD.right),
        yViews: yOf(point.views, rounded),
        yClicks: yOf(point.clicks, rounded),
      })),
    };
  }, [series]);

  if (series.length === 0) return null;

  const active = hover !== null ? points[hover] : null;
  const last = points[points.length - 1]!;

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        <Legend color={CHART.views} label="Aufrufe" value={last.views} />
        <Legend color={CHART.clicks} label="Klicks" value={last.clicks} />
        <span className="text-xs text-ash">heute</span>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Aufrufe und Klicks der letzten ${series.length} Tage`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - box.left) / box.width;
            const x = ratio * W;
            // Nächstgelegener Tag statt „der Tag, über dem der Cursor genau
            // steht“: bei 30 Punkten auf 700 Pixeln träfe man sonst nichts.
            let nearest = 0;
            let best = Infinity;
            points.forEach((point, index) => {
              const distance = Math.abs(point.x - x);
              if (distance < best) {
                best = distance;
                nearest = index;
              }
            });
            setHover(nearest);
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.views} stopOpacity="0.22" />
              <stop offset="100%" stopColor={CHART.views} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((fraction) => {
            const y = PAD.top + fraction * (H - PAD.top - PAD.bottom);
            return (
              <g key={fraction}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke={CHART.grid} strokeWidth="1" />
                <text
                  x={PAD.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill={CHART.axis}
                >
                  {Math.round(max * (1 - fraction))}
                </text>
              </g>
            );
          })}

          <path d={areaPath(points)} fill={`url(#${gradientId})`} />
          <path
            d={linePath(points, "yViews")}
            fill="none"
            stroke={CHART.views}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={linePath(points, "yClicks")}
            fill="none"
            stroke={CHART.clicks}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {active && (
            <g>
              <line
                x1={active.x}
                x2={active.x}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke={CHART.axis}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {/* Ein Ring in der Flächenfarbe hält die Punkte lesbar, auch wenn
                  beide Serien sich am selben Tag kreuzen. */}
              <circle cx={active.x} cy={active.yViews} r="4.5" fill={CHART.views} stroke="#101015" strokeWidth="2" />
              <circle cx={active.x} cy={active.yClicks} r="4.5" fill={CHART.clicks} stroke="#101015" strokeWidth="2" />
            </g>
          )}

          <text x={PAD.left} y={H - 6} fontSize="10" fill={CHART.axis}>
            {formatDay(series[0]!.day)}
          </text>
          <text x={W - PAD.right} y={H - 6} fontSize="10" fill={CHART.axis} textAnchor="end">
            {formatDay(series[series.length - 1]!.day)}
          </text>
        </svg>

        {active && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-ink px-3 py-2 text-xs whitespace-nowrap shadow-lg"
            style={{ left: `${(active.x / W) * 100}%` }}
          >
            <p className="font-medium text-chalk">{formatDay(active.day, true)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-ash">
              <Dot color={CHART.views} /> {active.views} Aufrufe
            </p>
            <p className="flex items-center gap-1.5 text-ash">
              <Dot color={CHART.clicks} /> {active.clicks} Klicks
            </p>
          </div>
        )}
      </div>

      <details className="mt-4 text-xs text-ash">
        <summary className="cursor-pointer rounded px-1 py-1 hover:text-chalk">
          Als Tabelle anzeigen
        </summary>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-ink-2 text-ash">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">Tag</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Aufrufe</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Klicks</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.day} className="border-t border-line">
                  <td className="px-3 py-1.5">{formatDay(point.day, true)}</td>
                  <td className="px-3 py-1.5 text-right text-chalk">{point.views}</td>
                  <td className="px-3 py-1.5 text-right text-chalk">{point.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function yOf(value: number, max: number): number {
  return PAD.top + (1 - value / max) * (H - PAD.top - PAD.bottom);
}

function linePath(points: { x: number; yViews: number; yClicks: number }[], key: "yViews" | "yClicks"): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point[key]}`).join(" ");
}

function areaPath(points: { x: number; yViews: number }[]): string {
  if (points.length === 0) return "";
  const top = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.yViews}`).join(" ");
  const base = H - PAD.bottom;
  return `${top} L${points[points.length - 1]!.x} ${base} L${points[0]!.x} ${base} Z`;
}

function formatDay(iso: string, long = false): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: long ? "long" : "2-digit",
    timeZone: "UTC",
  });
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color }} />;
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-2 text-sm">
      <Dot color={color} />
      <span className="text-ash">{label}</span>
      <span className="font-semibold text-chalk">{value}</span>
    </span>
  );
}
