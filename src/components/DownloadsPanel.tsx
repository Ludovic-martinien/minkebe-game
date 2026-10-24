"use client";

import { useEffect, useRef, useState } from "react";
import { PLATFORMS } from "@/lib/distribution";
import { GAME_VERSION } from "@/lib/version";

type TransferStage = "preparing" | "downloading" | "saving" | "done" | "error" | "cancelled";

type Transfer = {
  id: string;
  stage: TransferStage;
  bytes: number;
  total: number | null;
  message?: string;
};

function formatSize(bytes: number): string {
  if (!bytes) return "0 Mo";
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

function Progress({ transfer, label }: { transfer: Transfer; label: string }) {
  const percent = transfer.stage === "done"
    ? 100
    : transfer.total
      ? Math.min(99, Math.floor((transfer.bytes / transfer.total) * 100))
      : null;
  const ongoing = transfer.stage === "preparing" || transfer.stage === "downloading" || transfer.stage === "saving";
  const message = {
    preparing: "Préparation du fichier…",
    downloading: "Téléchargement en cours",
    saving: "Enregistrement du fichier…",
    done: "Fichier téléchargé. Vérifie tes téléchargements.",
    error: transfer.message || "Une erreur est survenue.",
    cancelled: "Téléchargement annulé.",
  }[transfer.stage];

  return (
    <div className="mt-3" aria-live={ongoing ? "off" : "polite"}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] font-medium">
        <span className={transfer.stage === "error" ? "text-rose-200" : "text-emerald-100/90"}>{message}</span>
        {percent !== null && <span className="font-mono font-bold tabular-nums text-lime-200">{percent} %</span>}
      </div>
      <div
        role="progressbar"
        aria-label={`Téléchargement : ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={percent === null ? `${message}, ${formatSize(transfer.bytes)} reçus` : `${percent} %`}
        className="h-2 overflow-hidden rounded-full bg-black/45"
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r from-lime-400 via-emerald-400 to-sky-400 transition-[width] duration-150 ${percent === null && ongoing ? "animate-pulse" : ""}`}
          style={{ width: `${percent ?? (ongoing ? 24 : 0)}%` }}
        />
      </div>
      {(transfer.bytes > 0 || transfer.total) && (
        <p className="mt-1.5 text-[10px] text-emerald-100/60">
          {formatSize(transfer.bytes)}{transfer.total ? ` / ${formatSize(transfer.total)}` : " reçus"}
        </p>
      )}
    </div>
  );
}

export default function DownloadsPanel({ onWatchTrailer }: { onWatchTrailer: () => void }) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const updateTransfer = (next: Transfer) => {
    if (mountedRef.current) setTransfer(next);
  };

  const download = async (id: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    const isTrailer = id === "trailer";
    const filename = isTrailer ? "minkebe-bande-annonce.mp4" : `minkebe-${id}-v${GAME_VERSION}.zip`;
    const path = isTrailer ? "/video/forest-trailer.mp4" : `/api/download/${id}`;
    updateTransfer({ id, stage: "preparing", bytes: 0, total: null });

    try {
      const response = await fetch(path, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`Erreur du serveur (${response.status}).`);
      const headerSize = Number(response.headers.get("Content-Length"));
      const total = Number.isFinite(headerSize) && headerSize > 0 ? headerSize : null;
      const chunks: Blob[] = [];
      let bytes = 0;
      let lastUpdate = 0;

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(new Blob([new Uint8Array(value)]));
          bytes += value.byteLength;
          const now = performance.now();
          if (now - lastUpdate > 80) {
            updateTransfer({ id, stage: "downloading", bytes, total });
            lastUpdate = now;
          }
        }
      } else {
        const fallback = await response.blob();
        chunks.push(fallback);
        bytes = fallback.size;
      }
      if (controller.signal.aborted) return;
      if (total !== null && bytes !== total) throw new Error("Le fichier est incomplet. Réessaie.");
      updateTransfer({ id, stage: "saving", bytes, total: total ?? bytes });

      const objectUrl = URL.createObjectURL(new Blob(chunks, { type: isTrailer ? "video/mp4" : "application/zip" }));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Safari et certains navigateurs mobiles ont besoin que l'URL existe encore au moment de l'enregistrement.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      updateTransfer({ id, stage: "done", bytes, total: total ?? bytes });
    } catch (error) {
      updateTransfer({
        id,
        stage: controller.signal.aborted ? "cancelled" : "error",
        bytes: 0,
        total: null,
        message: error instanceof Error ? error.message : "Le téléchargement a échoué.",
      });
    } finally {
      controllerRef.current = null;
      busyRef.current = false;
    }
  };

  const isBusy = transfer?.stage === "preparing" || transfer?.stage === "downloading" || transfer?.stage === "saving";
  const trailerPath = "/video/forest-trailer.mp4";

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-50">Paquets par plateforme</p>
          <p className="text-[11px] text-emerald-100/65">Le transfert s’affiche ici en temps réel. Les ZIP sont des projets à construire, pas des applications déjà installées.</p>
        </div>
        {isBusy && (
          <button
            type="button"
            onClick={() => controllerRef.current?.abort()}
            className="shrink-0 rounded-full border border-rose-200/40 px-3 py-1.5 text-xs font-bold text-rose-100 transition hover:bg-rose-500/20"
          >
            Annuler
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const current = transfer?.id === platform.id ? transfer : null;
          return (
            <div key={platform.id} className="rounded-2xl border border-sky-200/15 bg-black/25 p-4 transition-colors hover:border-sky-300/40">
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden="true">{platform.icon}</span>
                <div className="min-w-0">
                  <h4 className="font-black text-sky-50">{platform.label}</h4>
                  <p className="text-[11px] text-sky-100/60">{platform.format}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-emerald-100/75">{platform.description}</p>
              <p className="mt-1 text-[10px] text-emerald-100/55">{platform.requirements}</p>
              {current && <Progress transfer={current} label={platform.label} />}
              <button
                type="button"
                onClick={() => void download(platform.id)}
                disabled={isBusy}
                className="mt-3 rounded-full bg-sky-400 px-3 py-1.5 text-xs font-black text-sky-950 transition hover:bg-sky-300 disabled:cursor-wait disabled:opacity-55"
              >
                {current?.stage === "error" || current?.stage === "cancelled" ? "↻ Réessayer" : "⬇ Télécharger le ZIP"}
              </button>
              <a
                href={`/api/download/${platform.id}`}
                download={`minkebe-${platform.id}-v${GAME_VERSION}.zip`}
                className="ml-2 inline-block text-[11px] text-sky-100/65 underline underline-offset-2 hover:text-white"
              >
                Lien direct
              </a>
            </div>
          );
        })}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-lime-200/25 bg-[linear-gradient(110deg,rgba(7,46,24,0.92),rgba(11,53,44,0.72))] sm:flex">
        <div className="h-36 bg-cover bg-center sm:h-auto sm:w-2/5" style={{ backgroundImage: "url('/images/menu-forest.jpg')" }} aria-hidden="true" />
        <div className="flex-1 p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-lime-200">Avant l’aventure</p>
          <h4 className="mt-1 text-xl font-black text-white">Bande-annonce de Minkébé</h4>
          <p className="mt-1 text-xs text-emerald-50/75">Découvre la forêt et retrouve Annique et Landry. Vidéo de 9 secondes.</p>
          {transfer?.id === "trailer" && <Progress transfer={transfer} label="Bande-annonce" />}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onWatchTrailer}
              className="rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-emerald-950 transition hover:bg-lime-200"
            >
              ▶ Regarder
            </button>
            <button
              type="button"
              onClick={() => void download("trailer")}
              disabled={isBusy}
              className="rounded-full border border-white/40 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-55"
            >
              ⬇ Télécharger la vidéo
            </button>
            <a href={trailerPath} download="minkebe-bande-annonce.mp4" className="text-[11px] text-emerald-100/65 underline underline-offset-2 hover:text-white">
              Lien direct
            </a>
          </div>
          <p className="mt-3 text-[10px] text-emerald-100/55">Images : Los Muertos Crew / Pexels. © ONOKO-CRÉATIONS.</p>
        </div>
      </div>
    </div>
  );
}
