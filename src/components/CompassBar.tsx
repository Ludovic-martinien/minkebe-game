"use client";

// © ONOKO-CRÉATIONS — Tous droits réservés.
import { useEffect, useState } from "react";
import type { CompassData, CompassHint } from "@/game/engine";

const ICONS: Record<CompassHint["kind"], string> = {
  river: "💧",
  shelter: "🛖",
  camp: "⛺",
  post: "🏚️",
  machette: "🗡️",
  danger: "⚠️",
  carcass: "🥩",
  ally: "👤",
  food: "🍈",
  objective: "★",
};

const COLORS: Record<CompassHint["kind"], string> = {
  river: "text-sky-300",
  shelter: "text-amber-300",
  camp: "text-red-300",
  post: "text-blue-300",
  machette: "text-orange-300",
  danger: "text-red-400",
  carcass: "text-rose-300",
  ally: "text-cyan-200",
  food: "text-lime-300",
  objective: "text-amber-200",
};

const FOV = Math.PI * 0.9; // largeur angulaire affichée (±81°)

function cardinalMarks(heading: number): { label: string; rel: number }[] {
  const marks = [
    ["N", 0],
    ["NE", Math.PI / 4],
    ["E", Math.PI / 2],
    ["SE", (3 * Math.PI) / 4],
    ["S", Math.PI],
    ["SO", -(3 * Math.PI) / 4],
    ["O", -Math.PI / 2],
    ["NO", -Math.PI / 4],
  ] as const;
  return marks.map(([label, angle]) => {
    let rel = angle - heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    return { label, rel };
  });
}

export default function CompassBar({ data, compact }: { data: CompassData; compact: boolean }) {
  const [width, setWidth] = useState(compact ? 300 : 520);
  useEffect(() => {
    const resize = () => setWidth(compact ? Math.max(140, Math.min(300, window.innerWidth - 24)) : 520);
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, [compact]);
  const toX = (rel: number) => width / 2 + (rel / (FOV / 2)) * (width / 2);
  const visible = (rel: number) => Math.abs(rel) <= FOV / 2;
  const headingDeg = Math.round((((data.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * (180 / Math.PI));

  // Indices hors champ : flèches sur les bords
  const offLeft = data.hints.filter((h) => h.bearing < -FOV / 2);
  const offRight = data.hints.filter((h) => h.bearing > FOV / 2);

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2" style={{ width }}>
      <div className="relative h-12 overflow-hidden rounded-2xl border border-emerald-200/15 bg-[#07130a]/70 backdrop-blur-md">
        {/* graduations */}
        {cardinalMarks(data.heading).map(
          (m) =>
            visible(m.rel) && (
              <div
                key={m.label}
                className={`absolute top-0.5 -translate-x-1/2 text-[10px] font-bold ${m.label === "N" ? "text-red-300" : "text-emerald-100/60"}`}
                style={{ left: toX(m.rel) }}
              >
                {m.label}
              </div>
            )
        )}
        {Array.from({ length: 25 }, (_, i) => {
          const angle = (i - 12) * (Math.PI / 12);
          let rel = angle - (data.heading % (Math.PI / 12));
          while (rel > Math.PI) rel -= Math.PI * 2;
          return visible(rel) ? <div key={i} className="absolute top-4 h-1.5 w-px bg-emerald-100/25" style={{ left: toX(rel) }} /> : null;
        })}

        {/* indices */}
        {data.hints.map((h, i) =>
          visible(h.bearing) ? (
            <div
              key={`${h.kind}-${h.label}-${i}`}
              className={`absolute bottom-0.5 flex -translate-x-1/2 flex-col items-center leading-none ${COLORS[h.kind]} ${h.urgent ? "animate-pulse" : ""}`}
              style={{ left: toX(h.bearing) }}
            >
              <span className={h.urgent ? "text-base" : "text-sm"}>{ICONS[h.kind]}</span>
              <span className="text-[9px] font-semibold tabular-nums">{h.distance < 1000 ? `${Math.round(h.distance)} m` : ""}</span>
            </div>
          ) : null
        )}

        {/* repère central */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/70" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-white/80" />

        {/* flèches hors champ */}
        {offLeft.length > 0 && (
          <div className="absolute bottom-1 left-1 flex items-center gap-0.5 text-xs">
            <span className="text-white/70">◀</span>
            {offLeft.slice(0, 3).map((h, i) => (
              <span key={i} className={h.urgent ? "animate-pulse" : ""}>
                {ICONS[h.kind]}
              </span>
            ))}
          </div>
        )}
        {offRight.length > 0 && (
          <div className="absolute bottom-1 right-1 flex items-center gap-0.5 text-xs">
            {offRight.slice(0, 3).map((h, i) => (
              <span key={i} className={h.urgent ? "animate-pulse" : ""}>
                {ICONS[h.kind]}
              </span>
            ))}
            <span className="text-white/70">▶</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between px-1 text-[11px]">
        <span className="font-mono text-emerald-100/60">{String(headingDeg).padStart(3, "0")}°</span>
        <span className={`max-w-[55vw] truncate rounded-full border border-amber-200/20 bg-black/40 px-2 py-0.5 text-amber-100 ${compact ? "text-[9px]" : ""}`}>
          ★ Objectif : <span className="font-semibold">{data.objective}</span>
        </span>
        <span className="w-8" />
      </div>
    </div>
  );
}
