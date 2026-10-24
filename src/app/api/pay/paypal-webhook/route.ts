// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { getPayPalOrder, isOrderPaid, paypalBaseUrl, paypalEnabled } from "@/lib/paypal";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Webhook PayPal (CHECKOUT.ORDER.APPROVED / PAYMENT.CAPTURE.COMPLETED).
 * Si PAYPAL_WEBHOOK_ID est défini, la signature est vérifiée auprès de PayPal.
 * Dans tous les cas, l'état est relu depuis l'API (on ne fait pas confiance au corps seul).
 */
export async function POST(request: Request) {
  if (!paypalEnabled()) return Response.json({ error: "PayPal non configuré." }, { status: 400 });
  const raw = await request.text();
  let event: { event_type?: string; resource?: Record<string, unknown> };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return Response.json({ error: "Corps invalide." }, { status: 400 });
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (webhookId) {
    try {
      const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
      const tokenRes = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const { access_token } = (await tokenRes.json()) as { access_token: string };
      const verifyRes = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_algo: request.headers.get("paypal-auth-algo"),
          cert_url: request.headers.get("paypal-cert-url"),
          transmission_id: request.headers.get("paypal-transmission-id"),
          transmission_sig: request.headers.get("paypal-transmission-sig"),
          transmission_time: request.headers.get("paypal-transmission-time"),
          webhook_id: webhookId,
          webhook_event: event,
        }),
      });
      const verify = (await verifyRes.json()) as { verification_status?: string };
      if (verify.verification_status !== "SUCCESS") return Response.json({ error: "Signature invalide." }, { status: 400 });
    } catch {
      return Response.json({ error: "Vérification impossible." }, { status: 400 });
    }
  }

  const resource = event.resource ?? {};
  // Pour une capture, l'id de commande est dans supplementary_data ; pour une commande, c'est resource.id
  const orderId =
    (resource as { supplementary_data?: { related_ids?: { order_id?: string } } }).supplementary_data?.related_ids?.order_id ??
    (typeof resource.id === "string" && event.event_type?.startsWith("CHECKOUT.ORDER") ? (resource.id as string) : null);
  if (!orderId) return Response.json({ received: true });

  try {
    const order = await getPayPalOrder(orderId);
    if (isOrderPaid(order)) {
      await db.update(purchases).set({ status: "paid", paidAt: new Date() }).where(eq(purchases.sessionId, orderId));
    } else if (order.status === "VOIDED") {
      await db.update(purchases).set({ status: "failed" }).where(eq(purchases.sessionId, orderId));
    }
  } catch {
    // commande inconnue : ignorée
  }
  return Response.json({ received: true });
}
