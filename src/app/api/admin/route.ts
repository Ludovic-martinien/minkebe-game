// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { expeditions, purchases, roomPlayers, rooms, saves } from "@/db/schema";
import { makeLicenseKey, PASS_PRODUCT } from "@/lib/payments";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

function checkAdminKey(request: Request): boolean {
  const configured = process.env.ADMIN_ACCESS_KEY;
  if (!configured) return true; // En aperçu/démo sans secret configuré, l'accès est direct
  const header = request.headers.get("x-admin-key") ?? "";
  return header === configured;
}

export async function GET(request: Request) {
  if (!checkAdminKey(request)) {
    return Response.json({ error: "Code administrateur requis." }, { status: 401 });
  }

  try {
    const [allPurchases, allSaves, allExpeditions, allRooms, allRoomPlayers] = await Promise.all([
      db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(100),
      db.select().from(saves).orderBy(desc(saves.updatedAt)).limit(100),
      db.select().from(expeditions).orderBy(desc(expeditions.createdAt)).limit(100),
      db.select().from(rooms).orderBy(desc(rooms.updatedAt)).limit(50),
      db.select().from(roomPlayers).orderBy(desc(roomPlayers.lastSeen)).limit(200),
    ]);

    const paidPurchases = allPurchases.filter((p) => p.status === "paid");
    const revenueEur = paidPurchases
      .filter((p) => p.currency === "eur")
      .reduce((sum, p) => sum + p.amountCents / 100, 0);
    const revenueXaf = paidPurchases.filter((p) => p.currency === "xaf").length * PASS_PRODUCT.amountXaf;

    const roomsWithPlayers = allRooms.map((room) => ({
      ...room,
      players: allRoomPlayers
        .filter((rp) => rp.roomId === room.id)
        .map((rp) => ({
          id: rp.id,
          playerId: rp.playerId,
          name: rp.name,
          character: rp.character,
          lastSeen: rp.lastSeen,
          health: rp.state?.health ?? 100,
          dead: rp.state?.dead ?? false,
        })),
    }));

    return Response.json({
      ok: true,
      protectedByKey: Boolean(process.env.ADMIN_ACCESS_KEY),
      stats: {
        purchasesTotal: allPurchases.length,
        purchasesPaid: paidPurchases.length,
        revenueEur,
        revenueXaf,
        savesTotal: allSaves.length,
        expeditionsTotal: allExpeditions.length,
        activeRooms: allRooms.length,
        onlinePlayers: allRoomPlayers.length,
      },
      purchases: allPurchases,
      saves: allSaves,
      expeditions: allExpeditions,
      rooms: roomsWithPlayers,
    });
  } catch (error) {
    console.error("Erreur API admin :", error);
    return Response.json({ error: "Impossible de charger les données administrateur." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!checkAdminKey(request)) {
    return Response.json({ error: "Code administrateur requis." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "grant_pass") {
      const playerName = String(body.playerName ?? "Explorateur VIP").trim().slice(0, 40) || "Explorateur VIP";
      const provider = String(body.provider ?? "admin").slice(0, 20);
      const payerPhone = body.payerPhone ? String(body.payerPhone).slice(0, 20) : null;
      const txRef = body.txRef ? String(body.txRef).slice(0, 40) : "Généré par l'administrateur";
      const licenseKey = makeLicenseKey();

      const [created] = await db
        .insert(purchases)
        .values({
          playerName,
          product: PASS_PRODUCT.id,
          provider,
          sessionId: `admin_${randomUUID()}`,
          amountCents: PASS_PRODUCT.amountCents,
          currency: provider === "airtel" || provider === "moov" ? "xaf" : "eur",
          status: "paid",
          licenseKey,
          payerPhone,
          txRef,
          paidAt: new Date(),
        })
        .returning();

      return Response.json({ ok: true, purchase: created });
    }

    if (action === "set_purchase_status") {
      const id = Number(body.id);
      const status = body.status === "paid" ? "paid" : body.status === "failed" ? "failed" : "pending";
      if (!Number.isFinite(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });

      await db
        .update(purchases)
        .set({ status, paidAt: status === "paid" ? new Date() : null })
        .where(eq(purchases.id, id));
      return Response.json({ ok: true });
    }

    if (action === "delete_purchase") {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
      await db.delete(purchases).where(eq(purchases.id, id));
      return Response.json({ ok: true });
    }

    if (action === "delete_save") {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
      await db.delete(saves).where(eq(saves.id, id));
      return Response.json({ ok: true });
    }

    if (action === "delete_expedition") {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
      await db.delete(expeditions).where(eq(expeditions.id, id));
      return Response.json({ ok: true });
    }

    if (action === "close_room") {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
      await db.delete(rooms).where(eq(rooms.id, id));
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("Erreur action admin :", error);
    return Response.json({ error: "Action administrateur impossible." }, { status: 500 });
  }
}
