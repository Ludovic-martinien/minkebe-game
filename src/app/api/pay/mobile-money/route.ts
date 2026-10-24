// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { MOBILE_MONEY, PASS_PRODUCT, makeLicenseKey } from "@/lib/payments";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("241") && digits.length >= 11) return digits.slice(-9);
  return digits.slice(-9);
}

export async function GET() {
  return Response.json({
    amountXaf: PASS_PRODUCT.amountXaf,
    amountEur: PASS_PRODUCT.amountCents / 100,
    methods: Object.values(MOBILE_MONEY),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const method = body.method === "moov" ? "moov" : body.method === "airtel" ? "airtel" : null;
    if (!method) return Response.json({ error: "Choisis Airtel Money ou Moov Money." }, { status: 400 });

    const playerName = String(body.playerName ?? "Explorateur").trim().slice(0, 40) || "Explorateur";
    const phone = normalizePhone(String(body.phone ?? ""));
    if (phone.length !== 9) return Response.json({ error: "Indique ton numéro Gabon à 9 chiffres (ex. 077xxxxxx)." }, { status: 400 });
    const txRef = String(body.txRef ?? "").trim().slice(0, 40);

    const dest = MOBILE_MONEY[method];
    const licenseKey = makeLicenseKey();
    const sessionId = `${method}_${phone}_${randomUUID()}`;

    const [row] = await db
      .insert(purchases)
      .values({
        playerName,
        product: PASS_PRODUCT.id,
        provider: method,
        sessionId,
        amountCents: PASS_PRODUCT.amountCents,
        currency: "xaf",
        status: "paid",
        licenseKey,
        paidAt: new Date(),
        payerPhone: phone,
        txRef: txRef || `envoi vers ${dest.number}`,
      })
      .returning();

    return Response.json({
      status: "paid",
      licenseKey: row.licenseKey,
      playerName: row.playerName,
      provider: method,
      destination: dest.display,
      amountXaf: PASS_PRODUCT.amountXaf,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Enregistrement du paiement mobile impossible." }, { status: 500 });
  }
}
