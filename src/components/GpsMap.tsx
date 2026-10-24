"use client";

import { useEffect, useRef } from "react";
import type { GpsData } from "@/game/engine";

const SIZE = 220;
const RANGE = 80; // metres affichés du centre au bord

const BLIP_COLORS: Record<string, string> = {
  shelter: "#fbbf24",
  camp: "#f87171",
  post: "#60a5fa",
  animal: "#a3e635",
  predator: "#ef4444",
  carcass: "#9f1239",
  weapon: "#f59e0b",
  ammo: "#fde68a",
  ally: "#38bdf8",
};

export default function GpsMap({ data, thermal }: { data: GpsData; thermal: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const c = SIZE / 2;
    const scale = c / RANGE;
    // Carte orientée selon le cap : le haut de l'écran = direction regardée
    const rot = data.heading;
    const toScreen = (x: number, z: number): [number, number] => {
      const dx = x - data.x;
      const dz = z - data.z;
      // En monde, "devant" = -Z tourné par heading. On tourne pour que devant pointe vers le haut.
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      return [c + rx * scale, c + rz * scale];
    };

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.clip();

    // Fond
    const grad = ctx.createRadialGradient(c, c, 10, c, c, c);
    grad.addColorStop(0, thermal ? "#1a0a1e" : "#0b1f12");
    grad.addColorStop(1, thermal ? "#05010a" : "#03110a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grille
    ctx.strokeStyle = "rgba(120, 200, 140, 0.12)";
    ctx.lineWidth = 1;
    for (let r = 20; r <= RANGE; r += 20) {
      ctx.beginPath();
      ctx.arc(c, c, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Limites du monde
    const half = data.worldSize / 2;
    ctx.strokeStyle = "rgba(255, 220, 120, 0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const corners: [number, number][] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ];
    corners.forEach(([x, z], i) => {
      const [sx, sz] = toScreen(x, z);
      if (i === 0) ctx.moveTo(sx, sz);
      else ctx.lineTo(sx, sz);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Cours d'eau
    const drawPath = (pts: { x: number; z: number }[], width: number) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [sx, sz] = toScreen(p.x, p.z);
        if (i === 0) ctx.moveTo(sx, sz);
        else ctx.lineTo(sx, sz);
      });
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(56, 160, 210, 0.9)";
      ctx.lineWidth = width;
      ctx.stroke();
    };
    drawPath(data.river, 5);
    drawPath(data.stream, 2.5);

    // Balayage radar
    const sweep = (performance.now() / 1800) % 1;
    const sweepAngle = sweep * Math.PI * 2 - Math.PI / 2;
    const sweepGrad = ctx.createConicGradient(sweepAngle, c, c);
    sweepGrad.addColorStop(0, "rgba(120, 255, 160, 0.0)");
    sweepGrad.addColorStop(0.85, "rgba(120, 255, 160, 0.0)");
    sweepGrad.addColorStop(1, "rgba(120, 255, 160, 0.25)");
    ctx.fillStyle = sweepGrad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Blips
    for (const b of data.blips) {
      const [sx, sz] = toScreen(b.x, b.z);
      const inside = Math.hypot(sx - c, sz - c) < c - 8;
      const px = inside ? sx : c + ((sx - c) / Math.hypot(sx - c, sz - c)) * (c - 8);
      const pz = inside ? sz : c + ((sz - c) / Math.hypot(sx - c, sz - c)) * (c - 8);
      ctx.fillStyle = BLIP_COLORS[b.kind] ?? "#fff";
      ctx.beginPath();
      if (b.kind === "ally") {
        ctx.arc(px, pz, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (b.label) {
          ctx.fillStyle = "#e0f2fe";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(b.label.slice(0, 10), px, pz - 8);
        }
        continue;
      } else if (b.kind === "shelter" || b.kind === "camp" || b.kind === "post") {
        ctx.rect(px - 4, pz - 4, 8, 8);
      } else if (b.kind === "predator") {
        ctx.moveTo(px, pz - 5);
        ctx.lineTo(px + 5, pz + 4);
        ctx.lineTo(px - 5, pz + 4);
        ctx.closePath();
      } else {
        ctx.arc(px, pz, b.kind === "ammo" ? 2.5 : 3.5, 0, Math.PI * 2);
      }
      ctx.fill();
      if (!inside) {
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (thermal && (b.kind === "animal" || b.kind === "predator")) {
        ctx.strokeStyle = "rgba(255, 120, 60, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, pz, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Joueur : flèche vers le haut
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(c, c - 8);
    ctx.lineTo(c + 5, c + 6);
    ctx.lineTo(c, c + 3);
    ctx.lineTo(c - 5, c + 6);
    ctx.closePath();
    ctx.fill();

    // Cône de vision
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, c, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Cadre + rose des vents (N tourne avec la carte)
    ctx.strokeStyle = thermal ? "rgba(255,140,80,0.7)" : "rgba(120, 255, 160, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.stroke();
    const [nx, nz] = toScreen(data.x, data.z - 1);
    const ang = Math.atan2(nz - c, nx - c);
    const nr = c - 12;
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", c + Math.cos(ang) * nr, c + Math.sin(ang) * nr);
  }, [data, thermal]);

  return <canvas ref={canvasRef} style={{ width: SIZE, height: SIZE }} className="block" />;
}
