"use client";

import { useEffect, useRef, useState } from "react";
import { STUDIO_NAME } from "@/lib/version";

const CHAPTERS = [
  {
    eyebrow: "01 — LE MONDE",
    title: "Une forêt vivante.",
    description: "Sous la canopée, chaque sentier mène à une nouvelle découverte.",
  },
  {
    eyebrow: "02 — LES EXPLORATEURS",
    title: "Annique & Landry.",
    description: "Deux personnages. Une même aventure à écrire.",
  },
  {
    eyebrow: "03 — L’AVENTURE",
    title: "Minkébé vous attend.",
    description: "Explorez. Survivez. Protégez ce qui compte.",
  },
] as const;

interface GameTrailerProps {
  previewOnly: boolean;
  onEnter: () => void;
  onClose: () => void;
}

export default function GameTrailer({ previewOnly, onEnter, onClose }: GameTrailerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCloseRef = useRef(onClose);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(9);
  const [reducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [ended, setEnded] = useState(reducedMotion);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    if (reducedMotion) return () => window.removeEventListener("keydown", onKeyDown);
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const sec = (performance.now() - startedAt) / 1000;
      setElapsed((prev) => Math.max(prev, Math.min(duration, sec)));
      if (sec >= duration) {
        setEnded(true);
        window.clearInterval(timer);
      }
    }, 200);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [duration, reducedMotion]);

  const playVideo = () => {
    void videoRef.current?.play().then(() => setNeedsPlay(false)).catch(() => setNeedsPlay(true));
  };

  const progress = ended ? 1 : Math.min(1, elapsed / Math.max(duration, 1));
  const chapter = ended ? CHAPTERS.length - 1 : Math.min(CHAPTERS.length - 1, Math.floor(progress * CHAPTERS.length));
  const cue = CHAPTERS[chapter];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="trailer-title" className="absolute inset-0 z-[60] isolate overflow-hidden bg-[#06130b] text-white">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/menu-forest.jpg')" }} aria-hidden="true" />
      {!reducedMotion && !videoError && (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src="/video/forest-trailer.mp4"
          poster="/images/menu-forest.jpg"
          autoPlay
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration;
            if (Number.isFinite(seconds) && seconds > 0) setDuration(seconds);
          }}
          onCanPlay={playVideo}
          onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
          onEnded={() => setEnded(true)}
          onError={() => {
            setVideoError(true);
            setEnded(true);
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#03110b]/95 via-[#03110b]/45 to-[#03110b]/55" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#03110b]/55 via-transparent to-[#03110b]/20" />

      <div className="relative flex h-full flex-col justify-between px-5 pb-7 pt-6 sm:px-10 sm:pb-10 sm:pt-9 lg:px-16">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-lime-200/85 sm:text-xs">{STUDIO_NAME} présente</p>
            <p className="mt-2 text-lg font-black tracking-[0.14em] drop-shadow-lg sm:text-2xl">MINKÉBÉ</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/40 bg-black/35 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm transition hover:border-lime-200 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 sm:px-5 sm:text-sm">
            Fermer ✕
          </button>
        </div>

        <div className="mx-auto mb-8 w-full max-w-5xl sm:mb-12">
          <div key={chapter} className="trailer-reveal max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.38em] text-lime-200 sm:text-xs">{cue.eyebrow}</p>
            <h2 id="trailer-title" className="mt-3 text-4xl font-black leading-[1.05] tracking-tight drop-shadow-[0_6px_22px_rgba(0,0,0,0.6)] sm:text-6xl lg:text-7xl">
              {cue.title}
            </h2>
            <p className="mt-4 max-w-xl text-base font-medium text-white/90 drop-shadow-lg sm:text-lg">{cue.description}</p>
          </div>
          <div className="mt-9 flex flex-wrap items-end justify-between gap-5 sm:mt-11">
            <div className="min-w-[180px] flex-1 sm:max-w-[440px]">
              <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75">
                <span>Bande-annonce</span>
                <span className="tabular-nums">{ended ? "Prêt à partir" : `${Math.max(0, Math.ceil(duration - elapsed))} s`}</span>
              </div>
              <div role="progressbar" aria-label="Progression de la bande-annonce" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-1.5 overflow-hidden rounded-full bg-white/30">
                <div className="h-full rounded-full bg-lime-300 transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="mt-2 flex gap-1.5" aria-hidden="true">
                {CHAPTERS.map((part, index) => (
                  <span key={part.eyebrow} className={`h-0.5 flex-1 rounded-full ${index <= chapter ? "bg-lime-300/90" : "bg-white/30"}`} />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {needsPlay && !ended && (
                <button type="button" onClick={playVideo} className="rounded-xl border border-white/40 bg-black/45 px-4 py-3 text-xs font-bold text-white transition hover:bg-white/15">
                  ▶ Lire la bande-annonce
                </button>
              )}
              <button type="button" onClick={previewOnly ? onClose : onEnter} className="rounded-xl bg-lime-300 px-6 py-3 text-sm font-black uppercase tracking-[0.08em] text-emerald-950 shadow-[0_10px_40px_rgba(163,230,53,0.3)] transition hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-8 sm:py-4">
                {previewOnly ? "Retour au menu" : "Entrer dans la forêt →"}
              </button>
            </div>
          </div>
        </div>
        <div className="absolute bottom-3 left-5 text-[10px] text-white/65 sm:bottom-5 sm:left-10 lg:left-16">Vidéo : Los Muertos Crew / Pexels · © {STUDIO_NAME}</div>
      </div>
    </div>
  );
}
