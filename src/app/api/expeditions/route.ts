import { db } from "@/db";
import { expeditions } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function normalizeCharacter(value: unknown): "ANNIQUE" | "LANDRY" {
  return value === "LANDRY" || value === "EKEKA" ? "LANDRY" : "ANNIQUE";
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(expeditions)
      .orderBy(desc(expeditions.timeSurvived))
      .limit(10);
    return Response.json({ expeditions: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Impossible de charger le classement." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const playerName = String(body.playerName ?? "Explorateur").trim().slice(0, 40) || "Explorateur";
    const character = normalizeCharacter(body.character);

    const [row] = await db
      .insert(expeditions)
      .values({
        playerName,
        character,
        timeSurvived: Math.max(0, num(body.timeSurvived, 0)),
        resourcesCollected: Math.max(0, Math.floor(num(body.resourcesCollected, 0))),
        builtShelter: Boolean(body.builtShelter),
        craftedSpear: Boolean(body.craftedSpear),
        kills: Math.max(0, Math.floor(num(body.kills, 0))),
        weaponsFound: Array.isArray(body.weaponsFound) ? (body.weaponsFound as unknown[]).filter((w): w is string => typeof w === "string").slice(0, 8) : [],
        causeOfDeath: String(body.causeOfDeath ?? "inconnue").slice(0, 60),
      })
      .returning();

    return Response.json({ expedition: row });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
