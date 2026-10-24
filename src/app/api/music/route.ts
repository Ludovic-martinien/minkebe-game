// © ONOKO-CRÉATIONS — Tous droits réservés.
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type MusicTrackId = "le-mougongo-2" | "le-moungongo" | "reveil-dans-la-foret";

export interface MusicTrackMeta {
  id: MusicTrackId;
  title: string;
  subtitle: string;
  sourceHint: string;
  url: string;
  customUploaded: boolean;
}

const AUDIO_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "audio");

const TRACK_DEFS: { id: MusicTrackId; title: string; subtitle: string; sourceHint: string }[] = [
  {
    id: "le-mougongo-2",
    title: "Le Mougongo 2",
    subtitle: "Arc musical gabonais · cadence vive",
    sourceHint: "/Users/m12020/Downloads/Le Mougongo 2",
  },
  {
    id: "le-moungongo",
    title: "Le Moungongo",
    subtitle: "Arc musical traditionnel · transe forestière",
    sourceHint: "/Users/m12020/Downloads/Le Moungongo",
  },
  {
    id: "reveil-dans-la-foret",
    title: "Réveil dans la forêt",
    subtitle: "Aube équatoriale · harpe & oiseaux",
    sourceHint: "/Users/m12020/Downloads/Reveil dans la forêt",
  },
];

const EXTENSIONS = [".mp3", ".m4a", ".ogg", ".aac", ".flac", ".wav"] as const;

function resolveTrackList(): MusicTrackMeta[] {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
  return TRACK_DEFS.map((def) => {
    // Cherche d'abord un fichier personnalisé importé (.custom.mp3, etc.), sinon le .wav intégré
    for (const ext of EXTENSIONS) {
      const customPath = path.join(AUDIO_DIR, `${def.id}.custom${ext}`);
      if (fs.existsSync(customPath)) {
        const mtime = Math.floor(fs.statSync(customPath).mtimeMs);
        return {
          ...def,
          url: `/audio/${def.id}.custom${ext}?v=${mtime}`,
          customUploaded: true,
        };
      }
    }
    const defaultWav = path.join(AUDIO_DIR, `${def.id}.wav`);
    const mtime = fs.existsSync(defaultWav) ? Math.floor(fs.statSync(defaultWav).mtimeMs) : 1;
    return {
      ...def,
      url: `/audio/${def.id}.wav?v=${mtime}`,
      customUploaded: false,
    };
  });
}

function guessTrackIdFromFilename(filename: string): MusicTrackId | null {
  const norm = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (norm.includes("reveil") || norm.includes("foret")) return "reveil-dans-la-foret";
  if ((norm.includes("mougongo") || norm.includes("moungongo")) && norm.includes("2")) return "le-mougongo-2";
  if (norm.includes("moungongo") || norm.includes("mougongo")) return "le-moungongo";
  return null;
}

export async function GET() {
  return Response.json({
    ok: true,
    downloadsPath: "/Users/m12020/Downloads",
    tracks: resolveTrackList(),
  });
}

export async function POST(request: Request) {
  try {
    if (!fs.existsSync(AUDIO_DIR)) {
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
    }
    const form = await request.formData();
    const action = form.get("action");
    
    // Action de réinitialisation vers les versions studio originales
    if (action === "reset") {
      const targetId = form.get("trackId") as string | null;
      for (const def of TRACK_DEFS) {
        if (!targetId || targetId === def.id || targetId === "all") {
          for (const ext of EXTENSIONS) {
            const oldFile = path.join(AUDIO_DIR, `${def.id}.custom${ext}`);
            if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
          }
        }
      }
      return Response.json({
        ok: true,
        reset: true,
        tracks: resolveTrackList(),
      });
    }

    const explicitTrackId = form.get("trackId");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const singleFile = form.get("file");
    if (singleFile instanceof File && singleFile.size > 0) {
      files.push(singleFile);
    }

    if (files.length === 0) {
      return Response.json({ error: "Aucun fichier audio sélectionné." }, { status: 400 });
    }

    const updated: MusicTrackId[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let targetId: MusicTrackId | null =
        typeof explicitTrackId === "string" &&
        (explicitTrackId === "le-mougongo-2" || explicitTrackId === "le-moungongo" || explicitTrackId === "reveil-dans-la-foret")
          ? explicitTrackId
          : guessTrackIdFromFilename(file.name);

      if (!targetId) {
        targetId = TRACK_DEFS[i % TRACK_DEFS.length].id;
      }

      const rawExt = path.extname(file.name).toLowerCase();
      const ext = (EXTENSIONS as readonly string[]).includes(rawExt) ? rawExt : ".mp3";

      // Supprime les anciens fichiers personnalisés pour cette piste
      for (const oldExt of EXTENSIONS) {
        const oldFile = path.join(AUDIO_DIR, `${targetId}.custom${oldExt}`);
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }

      const dest = path.join(AUDIO_DIR, `${targetId}.custom${ext}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      updated.push(targetId);
    }

    return Response.json({
      ok: true,
      updated,
      tracks: resolveTrackList(),
    });
  } catch (error) {
    console.error("Erreur import musique :", error);
    return Response.json({ error: "Impossible d'enregistrer le fichier audio." }, { status: 500 });
  }
}
