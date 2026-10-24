"use client";

// © ONOKO-CRÉATIONS — Tous droits réservés.
import { OUTFITS, OUTFIT_ORDER, type OutfitId, type StylePieceKind } from "@/game/outfits";
import type { WhimsySnapshot } from "@/game/engine";

const PIECE_ICON: Record<StylePieceKind, string> = { fleurs: "🌺", plumes: "🪶", perles: "🫧", fil: "🧵" };
const PIECE_LABEL: Record<StylePieceKind, string> = { fleurs: "Fleurs d'hibiscus", plumes: "Plumes de touraco", perles: "Perles de rivière", fil: "Fils de Rêve" };

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, "0")}`;
}

interface Props {
  whimsy: WhimsySnapshot;
  onWear: (id: OutfitId) => void;
  onWeave: (id: OutfitId) => void;
  onClose: () => void;
}

export default function Dressing({ whimsy, onWear, onWeave, onClose }: Props) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(255,214,240,0.35),rgba(20,16,40,0.92)_65%)] backdrop-blur-sm">
      <div className="w-[min(960px,94vw)] max-h-[92vh] overflow-y-auto rounded-[28px] border border-pink-200/30 bg-gradient-to-b from-[#2a1d4a]/95 to-[#121026]/95 p-6 shadow-[0_30px_80px_rgba(255,170,220,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.5em] text-pink-200/70">Atelier de couture</div>
            <h2 className="mt-1 text-3xl font-black text-pink-50">✨ Dressing</h2>
            <p className="mt-1 text-sm text-pink-100/70">Tisse des tenues avec les pièces de style trouvées dans la forêt. Chaque tenue offre une capacité unique.</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-pink-200/30 px-4 py-2 text-sm font-semibold text-pink-100 hover:bg-pink-500/20">
            Fermer (O)
          </button>
        </div>

        {/* Inventaire de style */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(PIECE_ICON) as StylePieceKind[]).map((k) => (
            <div key={k} className="rounded-2xl border border-pink-200/15 bg-black/25 px-3 py-2">
              <div className="text-lg">
                {PIECE_ICON[k]} <span className="font-black tabular-nums text-pink-50">{whimsy.stylePieces[k]}</span>
              </div>
              <div className="text-[11px] text-pink-100/60">{PIECE_LABEL[k]}</div>
            </div>
          ))}
          <div className="rounded-2xl border border-amber-200/25 bg-amber-500/10 px-3 py-2">
            <div className="text-lg">
              ⭐ <span className="font-black tabular-nums text-amber-100">{whimsy.whimstars}</span>
              <span className="text-xs text-amber-100/60"> / {whimsy.whimstarsTotal}</span>
            </div>
            <div className="text-[11px] text-amber-100/60">Étoiles de Rêve · Style {whimsy.styleScore}</div>
          </div>
        </div>

        {/* Tenues */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OUTFIT_ORDER.map((id) => {
            const def = OUTFITS[id];
            const owned = whimsy.outfits.includes(id);
            const worn = whimsy.currentOutfit === id;
            const needs: string[] = [];
            if (def.threadCost > whimsy.stylePieces.fil) needs.push(`🧵 ${whimsy.stylePieces.fil}/${def.threadCost}`);
            for (const [k, v] of Object.entries(def.requires) as [StylePieceKind, number][]) {
              if (whimsy.stylePieces[k] < v) needs.push(`${PIECE_ICON[k]} ${whimsy.stylePieces[k]}/${v}`);
            }
            const canWeave = !owned && needs.length === 0;
            return (
              <div
                key={id}
                className={`relative overflow-hidden rounded-3xl border p-4 transition ${
                  worn ? "border-amber-300 bg-amber-400/10 shadow-[0_0_30px_rgba(251,191,36,0.25)]" : owned ? "border-pink-200/30 bg-black/25" : "border-pink-200/10 bg-black/30"
                }`}
              >
                {/* Aperçu couleur : silhouette stylisée */}
                <div className="flex items-center gap-3">
                  <div className="relative h-20 w-14 shrink-0">
                    <div className="absolute left-1/2 top-0 h-6 w-6 -translate-x-1/2 rounded-full" style={{ background: "#c48a5a" }} />
                    {def.crown && <div className="absolute left-1/2 top-0 h-2 w-7 -translate-x-1/2 -translate-y-1 rounded-full" style={{ background: hex(def.accent) }} />}
                    <div className="absolute left-1/2 top-6 h-8 w-8 -translate-x-1/2 rounded-t-xl" style={{ background: hex(def.primary) }} />
                    <div className="absolute left-1/2 top-9 h-1.5 w-9 -translate-x-1/2 rounded-full" style={{ background: hex(def.accent) }} />
                    {def.skirt ? (
                      <div className="absolute left-1/2 top-12 h-8 w-12 -translate-x-1/2 rounded-b-[40%]" style={{ background: `linear-gradient(${hex(def.primary)}, ${hex(def.secondary)})` }} />
                    ) : (
                      <div className="absolute left-1/2 top-12 h-8 w-7 -translate-x-1/2 rounded-b-md" style={{ background: hex(def.secondary) }} />
                    )}
                    {def.cape && <div className="absolute left-0 top-7 h-11 w-3 rounded-l-xl opacity-80" style={{ background: hex(def.secondary) }} />}
                    {def.wings && <div className="absolute -right-1 top-6 h-6 w-5 rounded-full opacity-70 blur-[1px]" style={{ background: hex(def.glow || def.primary) }} />}
                    {def.glow !== 0 && <div className="absolute inset-0 -z-10 rounded-full blur-xl opacity-40" style={{ background: hex(def.glow) }} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-black text-pink-50">{def.name}</div>
                    <div className="text-[11px] text-pink-100/60">{def.tagline}</div>
                    <div className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-amber-100">✦ {def.abilityLabel}</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-pink-100/60">
                    Style +{def.styleScore}
                    {!owned && def.threadCost > 0 && (
                      <span className="ml-2">
                        Coût : 🧵 {def.threadCost}
                        {Object.entries(def.requires).map(([k, v]) => (
                          <span key={k} className="ml-1">
                            {PIECE_ICON[k as StylePieceKind]} {v}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {worn ? (
                    <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-amber-950">Portée</span>
                  ) : owned ? (
                    <button onClick={() => onWear(id)} className="rounded-full bg-pink-400 px-3 py-1 text-xs font-black text-pink-950 hover:bg-pink-300">
                      Porter
                    </button>
                  ) : (
                    <button
                      onClick={() => onWeave(id)}
                      disabled={!canWeave}
                      className={`rounded-full px-3 py-1 text-xs font-black ${canWeave ? "bg-gradient-to-r from-pink-400 to-amber-300 text-pink-950 hover:brightness-110" : "bg-white/10 text-pink-100/50"}`}
                      title={needs.length ? `Il manque : ${needs.join(" · ")}` : "Tisser"}
                    >
                      {canWeave ? "✨ Tisser" : `Manque ${needs.join(" ")}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
