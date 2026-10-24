import { db } from "@/db";
import { saves } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return Response.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  try {
    const [row] = await db.select().from(saves).where(eq(saves.id, numericId));
    if (!row) {
      return Response.json({ error: "Aucune sauvegarde trouvee." }, { status: 404 });
    }
    return Response.json({ save: row });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Impossible de lire la sauvegarde." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return Response.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  try {
    await db.delete(saves).where(eq(saves.id, numericId));
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
