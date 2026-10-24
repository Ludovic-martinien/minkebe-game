// © ONOKO-CRÉATIONS — Tous droits réservés.
export const dynamic = "force-static";

import { GAME_TITLE, GAME_VERSION, STUDIO_NAME } from "@/lib/version";

export async function GET() {
  return Response.json({
    name: `${GAME_TITLE} — Survie dans la forêt équatoriale du Gabon`,
    version: GAME_VERSION,
    studio: STUDIO_NAME,
    status: "release",
    copyright: `© ${new Date().getFullYear()} ${STUDIO_NAME} — Tous droits réservés`,
    license: "Propriétaire. Toute reproduction ou distribution sans autorisation écrite MVE ZOGO LUDOVIC-CRÉATIONS est interdite.",
  });
}
