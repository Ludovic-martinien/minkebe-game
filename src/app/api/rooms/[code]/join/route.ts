// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { roomMessages, roomPlayers, rooms } from "@/db/schema";
import { STALE_MS, defaultState, normalizeCharacter } from "@/lib/rooms";
import { and, eq, gt } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const MAX_PLAYERS = 8;

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? "Explorateur").trim().slice(0, 24) || "Explorateur";
    const character = normalizeCharacter(body.character);

    const [room] = await db.select().from(rooms).where(eq(rooms.code, code.toUpperCase()));
    if (!room) return Response.json({ error: "Salon introuvable. Vérifie le code." }, { status: 404 });

    const staleBefore = new Date(Date.now() - STALE_MS);
    const active = await db
      .select({ id: roomPlayers.id })
      .from(roomPlayers)
      .where(and(eq(roomPlayers.roomId, room.id), gt(roomPlayers.lastSeen, staleBefore)));
    if (active.length >= MAX_PLAYERS) return Response.json({ error: "Salon complet (8 joueurs max)." }, { status: 409 });

    const playerId = randomUUID();
    await db.insert(roomPlayers).values({ roomId: room.id, playerId, name, character, state: defaultState() });
    await db.insert(roomMessages).values({ roomId: room.id, playerId: "system", name: "Forêt", text: `${name} rejoint l'expédition.` });

    return Response.json({
      code: room.code,
      playerId,
      worldSeed: room.worldSeed,
      huntingEnabled: room.huntingEnabled,
      collectedIds: room.collectedIds,
      isHost: room.hostPlayerId === playerId,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Impossible de rejoindre le salon." }, { status: 500 });
  }
}
