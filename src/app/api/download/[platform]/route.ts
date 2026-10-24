// © ONOKO-CRÉATIONS — Tous droits réservés.
import { ZipArchive } from "archiver";
import path from "path";
import fs from "fs";
import {
  APP_NAME,
  PLATFORMS,
  capacitorConfig,
  capacitorPackageJson,
  electronMain,
  electronPackageJson,
  electronPreload,
  envExample,
  mobileIndexHtml,
  readme,
  type Platform,
} from "@/lib/distribution";
import { appUrl } from "@/lib/payments";
import { GAME_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VERSION = GAME_VERSION;
const ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), ".");

function licenseText(): string {
  try {
    return fs.readFileSync(path.join(/*turbopackIgnore: true*/ ROOT, "LICENSE"), "utf8");
  } catch {
    return `${APP_NAME} © MVE ZOGO LUDOVIC-CRÉATIONS — Tous droits réservés.`;
  }
}

function iconPng(): Buffer | null {
  for (const candidate of ["public/icons/icon-512.png", "public/icon.png"]) {
    const p = path.join(/*turbopackIgnore: true*/ ROOT, candidate);
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const info = PLATFORMS.find((p) => p.id === platform);
  if (!info) return Response.json({ error: "Plateforme inconnue." }, { status: 404 });

  const url = new URL(request.url);
  const gameUrl = (url.searchParams.get("server") || appUrl(request)).replace(/\/$/, "");
  const id = info.id as Platform;
  const folder = `minkebe-${id}`;
  const license = licenseText();
  const icon = iconPng();

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const parts: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => parts.push(chunk));
    archive.once("end", () => resolve(Buffer.concat(parts)));
    archive.once("error", reject);
  });

  archive.append(readme(id, gameUrl, VERSION), { name: `${folder}/LISEZ-MOI.txt` });
  if (id !== "source") archive.append(license, { name: `${folder}/LICENSE` }); // le paquet source inclut déjà LICENSE

  if (id === "windows" || id === "macos" || id === "linux") {
    archive.append(electronPackageJson(id, VERSION), { name: `${folder}/package.json` });
    archive.append(electronMain(), { name: `${folder}/main.js` });
    archive.append(electronPreload(), { name: `${folder}/preload.js` });
    archive.append(JSON.stringify({ gameUrl }, null, 2), { name: `${folder}/config.json` });
    if (icon) archive.append(icon, { name: `${folder}/build/icon.png` });
    archive.append(".gitignore\nnode_modules/\ndist/\n", { name: `${folder}/.gitignore` });
  } else if (id === "android" || id === "ios") {
    archive.append(capacitorPackageJson(id, VERSION), { name: `${folder}/package.json` });
    archive.append(capacitorConfig(gameUrl), { name: `${folder}/capacitor.config.json` });
    archive.append(mobileIndexHtml(gameUrl), { name: `${folder}/www/index.html` });
    if (icon) archive.append(icon, { name: `${folder}/resources/icon.png` });
    archive.append("node_modules/\nandroid/\nios/\n", { name: `${folder}/.gitignore` });
  } else {
    // Code source complet : tout le projet sauf node_modules / .next / secrets
    const skip = new Set(["node_modules", ".next", ".git", ".env", ".turbo", "dist"]);
    archive.glob("**/*", {
      cwd: ROOT,
      dot: true,
      ignore: Array.from(skip).flatMap((s) => [s, `${s}/**`]),
    }, { prefix: folder });
    archive.append(envExample(), { name: `${folder}/.env.example` });
  }

  const [zip] = await Promise.all([completed, archive.finalize()]);
  const bytes = new Uint8Array(zip);

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder}-v${VERSION}.zip"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store, no-transform",
    },
  });
}
