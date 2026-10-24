// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { roomMessages, roomPlayers, rooms } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const playerId = String(body.playerId ?? "");
    const [room] = await db.select().from(rooms).where(eq(rooms.code, code.toUpperCase()));
    if (!room || !playerId) return Response.json({ ok: true });

    const [me] = await db
      .select({ name: roomPlayers.name })
      .from(roomPlayers)
      .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.playerId, playerId)));
    await db.delete(roomPlayers).where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.playerId, playerId)));
    if (me) {
      await db.insert(roomMessages).values({ roomId: room.id, playerId: "system", name: "Forêt", text: `${me.name} quitte l'expédition.` });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
