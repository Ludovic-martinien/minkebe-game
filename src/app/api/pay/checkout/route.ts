// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { PASS_PRODUCT, appUrl, getStripe, makeLicenseKey, stripeEnabled } from "@/lib/payments";
import { createPayPalOrder, paypalClientId, paypalEnabled } from "@/lib/paypal";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers: string[] = ["paypal", "airtel", "moov"];
  if (stripeEnabled()) providers.unshift("stripe");
  return Response.json({
    product: PASS_PRODUCT,
    provider: providers[0],
    providers,
    paypalEnabled: paypalEnabled(),
    paypalClientId: paypalEnabled() ? paypalClientId() : null,
    paypalEnv: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
    mobileMoney: {
      amountXaf: PASS_PRODUCT.amountXaf,
      airtel: { number: "077022306", display: "077 02 23 06", ussd: "*150#" },
      moov: { number: "062641120", display: "062 64 11 20", ussd: "*155#" },
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const playerName = String(body.playerName ?? "Explorateur").trim().slice(0, 40) || "Explorateur";
    const base = appUrl(request);
    const licenseKey = makeLicenseKey();

    const wanted = body.provider === "paypal" || body.provider === "stripe" || body.provider === "demo" ? body.provider : null;

    // ---- PayPal : commande Orders v2, approbation sur paypal.com puis capture au retour
    if (paypalEnabled() && (wanted === "paypal" || (!wanted && !stripeEnabled()))) {
      const customId = `mkb_${randomUUID()}`;
      const order = await createPayPalOrder({
        amountCents: PASS_PRODUCT.amountCents,
        currency: PASS_PRODUCT.currency,
        description: PASS_PRODUCT.name,
        customId,
        returnUrl: `${base}/?pay=paypal&token={token}`,
        cancelUrl: `${base}/?pay=cancel`,
      });
      await db.insert(purchases).values({
        playerName,
        product: PASS_PRODUCT.id,
        provider: "paypal",
        sessionId: order.id,
        amountCents: PASS_PRODUCT.amountCents,
        currency: PASS_PRODUCT.currency,
        status: "pending",
        licenseKey,
      });
      const approve = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href ?? null;
      return Response.json({ provider: "paypal", orderId: order.id, url: approve });
    }

    const stripe = getStripe();
    if (stripe && wanted !== "demo" && wanted !== "paypal") {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: PASS_PRODUCT.currency,
              unit_amount: PASS_PRODUCT.amountCents,
              product_data: { name: PASS_PRODUCT.name, description: PASS_PRODUCT.description },
            },
          },
        ],
        metadata: { playerName, licenseKey, product: PASS_PRODUCT.id },
        success_url: `${base}/?pay=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/?pay=cancel`,
      });
      await db.insert(purchases).values({
        playerName,
        product: PASS_PRODUCT.id,
        provider: "stripe",
        sessionId: session.id,
        amountCents: PASS_PRODUCT.amountCents,
        currency: PASS_PRODUCT.currency,
        status: "pending",
        licenseKey,
      });
      return Response.json({ provider: "stripe", url: session.url });
    }

    // Mode démo (aucune clé Stripe configurée) : simulation de caisse locale
    const sessionId = `demo_${randomUUID()}`;
    await db.insert(purchases).values({
      playerName,
      product: PASS_PRODUCT.id,
      provider: "demo",
      sessionId,
      amountCents: PASS_PRODUCT.amountCents,
      currency: PASS_PRODUCT.currency,
      status: "pending",
      licenseKey,
    });
    return Response.json({ provider: "demo", sessionId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Impossible de démarrer le paiement." }, { status: 500 });
  }
}
