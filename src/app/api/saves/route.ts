import { db } from "@/db";
import { saves, type Inventory } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function normalizeCharacter(value: unknown): "ANNIQUE" | "LANDRY" {
  return value === "LANDRY" || value === "EKEKA" ? "LANDRY" : "ANNIQUE";
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeInventory(value: unknown): Inventory {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    Fruits: Math.max(0, Math.floor(num(raw.Fruits, 0))),
    Bois: Math.max(0, Math.floor(num(raw.Bois, 0))),
    Pierres: Math.max(0, Math.floor(num(raw.Pierres, 0))),
    Viande: Math.max(0, Math.floor(num(raw.Viande, 0))),
  };
}

const WEAPON_IDS = ["couteau", "machette", "lance", "pistolet", "m16", "calibre12"] as const;
type WeaponId = (typeof WEAPON_IDS)[number];

function sanitizeWeapons(value: unknown): WeaponId[] {
  const list = Array.isArray(value) ? value : [];
  const out = new Set<WeaponId>(["couteau"]);
  for (const v of list) {
    if (typeof v === "string" && (WEAPON_IDS as readonly string[]).includes(v)) out.add(v as WeaponId);
  }
  return WEAPON_IDS.filter((w) => out.has(w));
}

export async function GET() {
  try {
    const rows = await db.select().from(saves).orderBy(desc(saves.updatedAt));
    return Response.json({ saves: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Impossible de lister les sauvegardes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const slotName = String(body.slotName ?? "").trim().slice(0, 40);
    if (!slotName) {
      return Response.json({ error: "Nom de sauvegarde requis." }, { status: 400 });
    }

    const character = normalizeCharacter(body.character);
    const collectedIds = Array.isArray(body.collectedIds)
      ? (body.collectedIds as unknown[])
          .map((v) => Math.floor(num(v, -1)))
          .filter((v) => v >= 0)
      : [];

    const weapons = sanitizeWeapons(body.weapons);
    const values = {
      slotName,
      character,
      health: Math.min(100, Math.max(0, num(body.health, 100))),
      hunger: Math.min(100, Math.max(0, num(body.hunger, 100))),
      thirst: Math.min(100, Math.max(0, num(body.thirst, 100))),
      stamina: Math.min(100, Math.max(0, num(body.stamina, 100))),
      positionX: num(body.positionX, 0),
      positionY: Math.max(1.1, num(body.positionY, 1.1)),
      positionZ: num(body.positionZ, 0),
      inventory: sanitizeInventory(body.inventory),
      weapons,
      currentWeapon: weapons.includes(body.currentWeapon as WeaponId) ? (body.currentWeapon as WeaponId) : "couteau",
      ammoPistol: Math.max(0, Math.floor(num(body.ammoPistol, 0))),
      ammoRifle: Math.max(0, Math.floor(num(body.ammoRifle, 0))),
      ammoShotgun: Math.max(0, Math.floor(num(body.ammoShotgun, 0))),
      kills: Math.max(0, Math.floor(num(body.kills, 0))),
      hasGps: Boolean(body.hasGps),
      hasNightVision: Boolean(body.hasNightVision),
      nvBattery: Math.min(1, Math.max(0, num(body.nvBattery, 1))),
      gameHour: Math.min(24, Math.max(0, num(body.gameHour, 6.5))),
      outfits: Array.isArray(body.outfits) ? (body.outfits as unknown[]).filter((o): o is string => typeof o === "string").slice(0, 12) : ["explo"],
      currentOutfit: typeof body.currentOutfit === "string" ? body.currentOutfit.slice(0, 24) : "explo",
      stylePieces: (() => {
        const r = (body.stylePieces ?? {}) as Record<string, unknown>;
        return { fleurs: Math.max(0, Math.floor(num(r.fleurs, 0))), plumes: Math.max(0, Math.floor(num(r.plumes, 0))), perles: Math.max(0, Math.floor(num(r.perles, 0))), fil: Math.max(0, Math.floor(num(r.fil, 0))) };
      })(),
      collectedWhimsy: Array.isArray(body.collectedWhimsy) ? (body.collectedWhimsy as unknown[]).map((v) => Math.floor(num(v, -1))).filter((v) => v >= 0).slice(0, 500) : [],
      styleScore: Math.max(0, Math.floor(num(body.styleScore, 0))),
      whimstars: Math.max(0, Math.floor(num(body.whimstars, 0))),
      xp: Math.max(0, Math.floor(num(body.xp, 0))),
      hasSpear: Boolean(body.hasSpear),
      hasShelter: Boolean(body.hasShelter),
      shelterX: body.shelterX === null || body.shelterX === undefined ? null : num(body.shelterX, 0),
      shelterZ: body.shelterZ === null || body.shelterZ === undefined ? null : num(body.shelterZ, 0),
      collectedIds,
      worldSeed: Math.floor(num(body.worldSeed, 1)),
      timeSurvived: Math.max(0, num(body.timeSurvived, 0)),
      updatedAt: new Date(),
    };

    const [row] = await db
      .insert(saves)
      .values(values)
      .onConflictDoUpdate({ target: saves.slotName, set: values })
      .returning();

    return Response.json({ save: row });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Erreur pendant la sauvegarde." }, { status: 500 });
  }
}
