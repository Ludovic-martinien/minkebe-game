import { db } from "@/db";
import { sql } from "drizzle-orm";
import { GAME_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, version: GAME_VERSION, app: "minkebe" });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
