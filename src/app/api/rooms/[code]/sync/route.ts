// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { roomMessages, roomPlayers, roomSignals, rooms, type NetAnimalState, type NetHit } from "@/db/schema";
import { STALE_MS, num, sanitizeState } from "@/lib/rooms";
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

function sanitizeHits(raw: unknown): NetHit[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((h) => {
    const r = (h ?? {}) as Record<string, unknown>;
    return { index: Math.floor(num(r.index, -1)), damage: Math.min(500, Math.max(0, num(r.damage, 0))), fromX: num(r.fromX, 0), fromZ: num(r.fromZ, 0) };
  });
}

function sanitizeAnimals(raw: unknown): NetAnimalState[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 32).map((a) => {
    const r = (a ?? {}) as Record<string, unknown>;
    return { x: num(r.x, 0), z: num(r.z, 0), yaw: num(r.yaw, 0), hp: num(r.hp, 0), dead: Boolean(r.dead), butchered: Boolean(r.butchered) };
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const playerId = String(body.playerId ?? "");
    if (!playerId) return Response.json({ error: "playerId requis." }, { status: 400 });

    const [room] = await db.select().from(rooms).where(eq(rooms.code, code.toUpperCase()));
    if (!room) return Response.json({ error: "Salon introuvable." }, { status: 404 });

    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_MS);

    // 1. Mise à jour de mon état
    const state = sanitizeState(body.state);
    await db
      .update(roomPlayers)
      .set({ state, lastSeen: now })
      .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.playerId, playerId)));

    // 2. Chat
    const chat = typeof body.chat === "string" ? body.chat.trim().slice(0, 200) : "";
    if (chat) {
      const [me] = await db
        .select({ name: roomPlayers.name })
        .from(roomPlayers)
        .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.playerId, playerId)));
      await db.insert(roomMessages).values({ roomId: room.id, playerId, name: me?.name ?? "?", text: chat });
    }

    // 3. Joueurs actifs + élection de l'hôte si l'hôte actuel est parti
    const players = await db
      .select()
      .from(roomPlayers)
      .where(and(eq(roomPlayers.roomId, room.id), gt(roomPlayers.lastSeen, staleBefore)))
      .orderBy(asc(roomPlayers.joinedAt));
    let hostPlayerId = room.hostPlayerId;
    const hostActive = players.some((p) => p.playerId === hostPlayerId);
    if (!hostActive && players.length > 0) {
      hostPlayerId = players[0].playerId;
      await db.update(rooms).set({ hostPlayerId }).where(eq(rooms.id, room.id));
      await db.insert(roomMessages).values({ roomId: room.id, playerId: "system", name: "Forêt", text: `${players[0].name} devient hôte de l'expédition.` });
    }
    const isHost = hostPlayerId === playerId;

    // 4. Ressources ramassées (fusion)
    const newCollected = Array.isArray(body.collected) ? (body.collected as unknown[]).map((v) => Math.floor(num(v, -1))).filter((v) => v >= 0) : [];
    let collectedIds = room.collectedIds;
    if (newCollected.length > 0) {
      collectedIds = Array.from(new Set([...room.collectedIds, ...newCollected]));
    }

    // 5. Animaux : l'hôte publie, les autres envoient leurs coups
    const hits = sanitizeHits(body.hits);
    const roomUpdate: Partial<typeof rooms.$inferInsert> = { updatedAt: now };
    if (newCollected.length > 0) roomUpdate.collectedIds = collectedIds;
    let pendingForHost: NetHit[] = [];
    if (isHost) {
      const host = (body.host ?? {}) as Record<string, unknown>;
      if (Array.isArray(host.animals)) roomUpdate.animalState = sanitizeAnimals(host.animals);
      if (host.dayTime !== undefined) roomUpdate.dayTime = num(host.dayTime, room.dayTime);
      pendingForHost = [...room.pendingHits, ...hits];
      roomUpdate.pendingHits = [];
    } else if (hits.length > 0) {
      roomUpdate.pendingHits = [...room.pendingHits, ...hits].slice(-200);
    }
    if (Object.keys(roomUpdate).length > 1) {
      await db.update(rooms).set(roomUpdate).where(eq(rooms.id, room.id));
    }

    // 6b. Signalisation vocale : j'envoie mes signaux, je récupère ceux qui me sont adressés
    const outSignals = Array.isArray(body.signals) ? (body.signals as unknown[]).slice(0, 40) : [];
    const signalRows = outSignals
      .map((sg) => {
        const r = (sg ?? {}) as Record<string, unknown>;
        const kind = r.kind === "offer" || r.kind === "answer" || r.kind === "ice" ? r.kind : null;
        const to = typeof r.to === "string" ? r.to.slice(0, 64) : "";
        const payload = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : null;
        return kind && to && payload ? { roomId: room.id, fromPlayerId: playerId, toPlayerId: to, kind, payload } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (signalRows.length > 0) await db.insert(roomSignals).values(signalRows);

    const inbox = await db
      .select()
      .from(roomSignals)
      .where(and(eq(roomSignals.roomId, room.id), eq(roomSignals.toPlayerId, playerId)))
      .orderBy(asc(roomSignals.id))
      .limit(60);
    if (inbox.length > 0) {
      await db.delete(roomSignals).where(inArray(roomSignals.id, inbox.map((r) => r.id)));
    }
    // Nettoyage des signaux périmés (> 60 s)
    await db.delete(roomSignals).where(and(eq(roomSignals.roomId, room.id), lt(roomSignals.createdAt, new Date(now.getTime() - 60000))));

    const voice = body.voice && typeof body.voice === "object" ? (body.voice as Record<string, unknown>) : null;
    if (voice) {
      await db
        .update(roomPlayers)
        .set({ state: { ...state, voice: { enabled: Boolean(voice.enabled), speaking: Boolean(voice.speaking) } } as typeof state })
        .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.playerId, playerId)));
    }

    // 6. Messages récents
    const since = Math.floor(num(body.sinceMessageId, 0));
    const messages = await db
      .select()
      .from(roomMessages)
      .where(and(eq(roomMessages.roomId, room.id), gt(roomMessages.id, since)))
      .orderBy(asc(roomMessages.id))
      .limit(30);

    return Response.json({
      isHost,
      hostPlayerId,
      players: players
        .filter((p) => p.playerId !== playerId)
        .map((p) => ({ playerId: p.playerId, name: p.name, character: p.character, state: p.state })),
      playerCount: players.length,
      collectedIds,
      animals: isHost ? null : room.animalState,
      dayTime: isHost ? null : room.dayTime,
      pendingHits: isHost ? pendingForHost : [],
      messages: messages.map((m) => ({ id: m.id, playerId: m.playerId, name: m.name, text: m.text, at: m.createdAt })),
      signals: inbox.map((r) => ({ id: r.id, from: r.fromPlayerId, kind: r.kind, payload: r.payload })),
      huntingEnabled: room.huntingEnabled,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Synchronisation impossible." }, { status: 500 });
  }
}
