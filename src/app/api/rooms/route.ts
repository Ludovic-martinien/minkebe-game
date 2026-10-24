// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { roomPlayers, rooms } from "@/db/schema";
import { defaultState, normalizeCharacter } from "@/lib/rooms";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? "Explorateur").trim().slice(0, 24) || "Explorateur";
    const character = normalizeCharacter(body.character);
    const seedRaw = Number(body.worldSeed);
    const worldSeed = Number.isFinite(seedRaw) && seedRaw > 0 ? Math.floor(seedRaw) : Math.floor(Math.random() * 2_000_000_000) + 1;
    const huntingEnabled = body.huntingEnabled !== false;
    const playerId = randomUUID();

    let code = makeCode();
    for (let i = 0; i < 5; i++) {
      const [existing] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
      if (!existing) break;
      code = makeCode();
    }

    const [room] = await db.insert(rooms).values({ code, hostPlayerId: playerId, worldSeed, huntingEnabled }).returning();
    await db.insert(roomPlayers).values({ roomId: room.id, playerId, name, character, state: defaultState() });

    return Response.json({
      code: room.code,
      playerId,
      worldSeed: room.worldSeed,
      huntingEnabled: room.huntingEnabled,
      collectedIds: room.collectedIds,
      isHost: true,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Impossible de créer le salon." }, { status: 500 });
  }
}
