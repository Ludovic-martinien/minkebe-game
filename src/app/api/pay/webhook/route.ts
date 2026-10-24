// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { getStripe } from "@/lib/payments";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

/** Webhook Stripe : marque l'achat payé même si le joueur ferme l'onglet avant le retour. */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe) return Response.json({ error: "Stripe non configuré." }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    if (secret) {
      const signature = request.headers.get("stripe-signature") ?? "";
      event = stripe.webhooks.constructEvent(payload, signature, secret);
    } else {
      event = JSON.parse(payload) as Stripe.Event;
    }
  } catch {
    return Response.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid") {
      await db.update(purchases).set({ status: "paid", paidAt: new Date() }).where(eq(purchases.sessionId, session.id));
    }
  } else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    await db.update(purchases).set({ status: "failed" }).where(eq(purchases.sessionId, session.id));
  }
  return Response.json({ received: true });
}
