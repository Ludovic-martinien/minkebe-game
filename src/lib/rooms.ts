// © ONOKO-CRÉATIONS — Tous droits réservés.
import type { NetPlayerState } from "@/db/schema";

export function normalizeCharacter(value: unknown): "ANNIQUE" | "LANDRY" {
  return value === "LANDRY" || value === "EKEKA" ? "LANDRY" : "ANNIQUE";
}

export function defaultState(): NetPlayerState {
  return { x: 0, z: 0, yaw: 0, move: "idle", weapon: "couteau", aiming: false, dead: false, health: 100, shelterX: null, shelterZ: null };
}

export function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function sanitizeState(raw: unknown): NetPlayerState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const move = r.move === "walk" || r.move === "run" ? r.move : "idle";
  return {
    x: num(r.x, 0),
    z: num(r.z, 0),
    yaw: num(r.yaw, 0),
    move,
    weapon: typeof r.weapon === "string" ? r.weapon.slice(0, 16) : "couteau",
    aiming: Boolean(r.aiming),
    dead: Boolean(r.dead),
    health: Math.min(100, Math.max(0, num(r.health, 100))),
    shelterX: r.shelterX === null || r.shelterX === undefined ? null : num(r.shelterX, 0),
    shelterZ: r.shelterZ === null || r.shelterZ === undefined ? null : num(r.shelterZ, 0),
  };
}

/** Un joueur est considéré déconnecté après ce délai sans synchronisation. */
export const STALE_MS = 8000;
