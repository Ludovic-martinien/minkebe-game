// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { getStripe } from "@/lib/payments";
import { capturePayPalOrder, isOrderPaid, paypalEnabled } from "@/lib/paypal";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Confirme un paiement au retour de la caisse.
 *  - Stripe : on vérifie le statut de la session côté serveur.
 *  - Démo : on valide directement (aucune transaction réelle).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sessionId = String(body.sessionId ?? "");
    if (!sessionId) return Response.json({ error: "Session manquante." }, { status: 400 });

    const [row] = await db.select().from(purchases).where(eq(purchases.sessionId, sessionId));
    if (!row) return Response.json({ error: "Achat introuvable." }, { status: 404 });

    if (row.status === "paid") {
      return Response.json({ status: "paid", licenseKey: row.licenseKey, playerName: row.playerName, provider: row.provider });
    }

    let paid = false;
    if (row.provider === "paypal") {
      if (!paypalEnabled()) return Response.json({ error: "PayPal non configuré." }, { status: 500 });
      // La capture est faite côté serveur : le montant débité est vérifié, pas seulement l'approbation
      const order = await capturePayPalOrder(sessionId);
      paid = isOrderPaid(order);
      if (!paid && order.status === "APPROVED") paid = false;
    } else if (row.provider === "stripe") {
      const stripe = getStripe();
      if (!stripe) return Response.json({ error: "Stripe non configuré." }, { status: 500 });
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      paid = session.payment_status === "paid";
    } else {
      paid = true;
    }

    if (!paid) return Response.json({ status: "pending" });

    const [updated] = await db
      .update(purchases)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(purchases.sessionId, sessionId))
      .returning();
    return Response.json({ status: "paid", licenseKey: updated.licenseKey, playerName: updated.playerName, provider: updated.provider });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Confirmation impossible." }, { status: 500 });
  }
}
