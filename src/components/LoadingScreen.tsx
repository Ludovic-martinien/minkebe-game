"use client";

import { GAME_VERSION, STUDIO_NAME } from "@/lib/version";

interface LoadingScreenProps {
  progress: number;
  stage: string;
  error?: string | null;
  exiting?: boolean;
  onDismiss?: () => void;
}

export default function LoadingScreen({ progress, stage, error, exiting = false, onDismiss }: LoadingScreenProps) {
  const percent = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div
      aria-hidden={exiting}
      className={`absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#06150d] px-5 text-center text-white transition-opacity duration-[900ms] ease-in-out motion-reduce:duration-0 ${exiting ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center opacity-45"
        style={{ backgroundImage: "url('/images/menu-forest.jpg')" }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#031008]/80 via-[#071b10]/55 to-[#031008]/95" aria-hidden="true" />

      <div className="relative w-full max-w-md">
        <p className="text-[11px] font-bold uppercase tracking-[0.4em] text-lime-200/85">{STUDIO_NAME} présente</p>
        <h1 className="mt-3 text-5xl font-black tracking-tight drop-shadow-lg sm:text-6xl">MINKÉBÉ</h1>
        <p className="mt-2 text-sm text-emerald-50/80">Une aventure au cœur de la forêt</p>

        <div className="mt-12 rounded-2xl border border-white/15 bg-[#07170e]/70 p-5 text-left shadow-2xl backdrop-blur-md sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-emerald-50" aria-live="polite">{error ?? stage}</span>
            {!error && <span className="font-mono font-bold tabular-nums text-lime-300">{percent} %</span>}
          </div>
          <div
            role="progressbar"
            aria-label="Chargement du jeu Minkébé"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-3 w-full overflow-hidden rounded-full border border-white/10 bg-black/50"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-lime-300 via-emerald-400 to-teal-400 shadow-[0_0_18px_rgba(74,222,128,0.65)] transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          {error ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-emerald-400 px-5 py-2 font-semibold text-emerald-950 transition hover:bg-emerald-300"
              >
                Réessayer
              </button>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-xl border border-white/30 px-4 py-2 text-xs font-bold text-white hover:bg-white/10"
                >
                  Ouvrir le menu →
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-xs text-emerald-100/75">Préparation des textures, des personnages et de la forêt…</p>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="shrink-0 rounded-lg border border-lime-300/40 bg-lime-400/20 px-3 py-1 text-xs font-bold text-lime-200 transition hover:bg-lime-300 hover:text-emerald-950"
                >
                  Entrer →
                </button>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-[11px] text-emerald-50/60">© {STUDIO_NAME} · Version {GAME_VERSION}</p>
      </div>
    </div>
  );
}
