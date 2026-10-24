// © ONOKO-CRÉATIONS — Tous droits réservés.
import { PLATFORMS } from "@/lib/distribution";
import { appUrl } from "@/lib/payments";
import { GAME_VERSION, STUDIO_NAME } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = appUrl(request);
  return Response.json({
    app: "Minkébé",
    studio: STUDIO_NAME,
    version: GAME_VERSION,
    server: base,
    pwa: `${base}/`,
    platforms: PLATFORMS.map((p) => ({ ...p, url: `${base}/api/download/${p.id}` })),
  });
}
