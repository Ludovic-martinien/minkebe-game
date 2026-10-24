// © ONOKO-CRÉATIONS — Tous droits réservés.
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Vérifie une clé de licence (pour restaurer le Pass sur un autre appareil). */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const key = String(body.licenseKey ?? "").trim().toUpperCase();
    if (!/^MKB-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(key)) {
      return Response.json({ valid: false, error: "Format de clé invalide (MKB-XXXX-XXXX-XXXX)." }, { status: 400 });
    }
    const [row] = await db.select().from(purchases).where(eq(purchases.licenseKey, key));
    if (!row || row.status !== "paid") return Response.json({ valid: false, error: "Clé inconnue ou paiement non confirmé." }, { status: 404 });
    return Response.json({ valid: true, licenseKey: row.licenseKey, playerName: row.playerName, provider: row.provider, paidAt: row.paidAt });
  } catch (error) {
    console.error(error);
    return Response.json({ valid: false, error: "Vérification impossible." }, { status: 500 });
  }
}
