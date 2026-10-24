"use client";

// © ONOKO-CRÉATIONS — Tous droits réservés.
import { useCallback, useEffect, useRef, useState } from "react";

export type MusicTrackId = "le-mougongo-2" | "le-moungongo" | "reveil-dans-la-foret";

export interface MusicTrack {
  id: MusicTrackId;
  title: string;
  subtitle: string;
  sourceHint: string;
  url: string;
  customUploaded: boolean;
}

export const DEFAULT_TRACKS: MusicTrack[] = [
  {
    id: "le-mougongo-2",
    title: "Le Mougongo 2",
    subtitle: "Arc musical gabonais · cadence vive Bwiti",
    sourceHint: "/Users/m12020/Downloads/Le Mougongo 2",
    url: "/audio/le-mougongo-2.wav",
    customUploaded: false,
  },
  {
    id: "le-moungongo",
    title: "Le Moungongo",
    subtitle: "Arc musical traditionnel · transe forestière",
    sourceHint: "/Users/m12020/Downloads/Le Moungongo",
    url: "/audio/le-moungongo.wav",
    customUploaded: false,
  },
  {
    id: "reveil-dans-la-foret",
    title: "Réveil dans la forêt",
    subtitle: "Aube équatoriale · harpe Ngombi, flûte & oiseaux",
    sourceHint: "/Users/m12020/Downloads/Reveil dans la forêt",
    url: "/audio/reveil-dans-la-foret.wav",
    customUploaded: false,
  },
];

let cachedTracks: MusicTrack[] = DEFAULT_TRACKS;
let cachedIndex = 0;
let cachedVolume = 0.65;
let cachedEnabled = true;

interface MusicControllerProps {
  inGame: boolean;
  playing: boolean;
  soundOn: boolean;
  compact?: boolean;
  onNotify?: (message: string) => void;
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function MusicPlayer({ inGame, playing, soundOn, compact = false, onNotify }: MusicControllerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetUploadTrackRef = useRef<MusicTrackId | null>(null);

  const [tracks, setTracks] = useState<MusicTrack[]>(cachedTracks);
  const [currentIndex, setCurrentIndex] = useState(cachedIndex);
  const [musicEnabled, setMusicEnabled] = useState(cachedEnabled);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(cachedVolume);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(32);
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const currentTrack = tracks[currentIndex] ?? tracks[0];

  // Charge la liste des pistes depuis le serveur
  const refreshTracks = useCallback(async () => {
    try {
      const res = await fetch("/api/music", { cache: "no-store" });
      const data = (await res.json()) as { tracks?: MusicTrack[] };
      if (data.tracks && data.tracks.length > 0) {
        cachedTracks = data.tracks;
        setTracks(data.tracks);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void refreshTracks();
  }, [refreshTracks]);

  const selectTrack = useCallback(
    (nextIndex: number, announce = true, autoStart = true) => {
      const idx = ((nextIndex % tracks.length) + tracks.length) % tracks.length;
      cachedIndex = idx;
      setCurrentIndex(idx);
      setCurrentTime(0);
      const t = tracks[idx];
      if (announce && t && onNotify) {
        onNotify(`🎵 Musique : ${t.title}`);
      }
      if (autoStart && musicEnabled && soundOn) {
        window.setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            void audioRef.current.play().catch(() => undefined);
          }
        }, 50);
      }
    },
    [tracks, musicEnabled, soundOn, onNotify]
  );

  // Raccourci clavier K en jeu pour passer au morceau suivant
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyK" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (!inGame) return;
      e.preventDefault();
      selectTrack(currentIndex + 1, true, true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inGame, currentIndex, selectTrack]);

  // Synchronise le volume
  useEffect(() => {
    cachedVolume = volume;
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  useEffect(() => {
    cachedEnabled = musicEnabled;
  }, [musicEnabled]);

  // Démarre / met en pause automatiquement la musique pendant la partie
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const shouldPlay = playing && soundOn && musicEnabled;
    if (shouldPlay) {
      audio.volume = Math.max(0, Math.min(1, volume));
      void audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [playing, soundOn, musicEnabled, currentTrack, volume]);

  const handleTrackEnded = () => {
    selectTrack(currentIndex + 1, false, true);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadNote(null);

    try {
      const form = new FormData();
      if (targetUploadTrackRef.current) {
        form.append("trackId", targetUploadTrackRef.current);
      }
      for (const file of Array.from(fileList)) {
        form.append("files", file);
      }
      const res = await fetch("/api/music", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { ok?: boolean; tracks?: MusicTrack[]; error?: string };
      if (!res.ok || !data.ok || !data.tracks) {
        throw new Error(data.error ?? "Import audio impossible.");
      }
      cachedTracks = data.tracks;
      setTracks(data.tracks);
      setUploadNote(`✅ Fichier(s) audio importé(s) avec succès depuis /Users/m12020/Downloads !`);
      onNotify?.(`🎵 Musique mise à jour depuis Downloads !`);
    } catch (err) {
      setUploadNote(err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setUploading(false);
      targetUploadTrackRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleResetTracks = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("action", "reset");
      const res = await fetch("/api/music", { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; tracks?: MusicTrack[] };
      if (data.tracks) {
        cachedTracks = data.tracks;
        setTracks(data.tracks);
        setUploadNote("Pistes réinitialisées aux enregistrements studio originaux.");
        onNotify?.("🎵 Musique studio originale restaurée.");
      }
    } catch {
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        preload="auto"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onEnded={handleTrackEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac"
        multiple
        className="hidden"
        onChange={(e) => void handleUploadFiles(e.target.files)}
      />

      {inGame ? (
        /* WIDGET FLOTTANT EN JEU (HAUT DROITE) */
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={`pointer-events-auto absolute right-4 z-20 rounded-2xl border border-emerald-300/30 bg-[#04140b]/90 px-3.5 py-2.5 text-xs text-emerald-50 shadow-2xl backdrop-blur-xl ${
            compact ? "top-16 max-w-[245px]" : "top-[162px] w-[300px]"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {/* Visualiseur de barres animées */}
                <div className="flex h-3.5 items-end gap-0.5" aria-hidden="true">
                  <span className={`w-0.5 rounded-full bg-lime-300 ${isPlaying ? "animate-pulse h-3.5" : "h-1.5"}`} />
                  <span className={`w-0.5 rounded-full bg-emerald-400 ${isPlaying ? "animate-pulse h-2.5" : "h-1"}`} />
                  <span className={`w-0.5 rounded-full bg-lime-400 ${isPlaying ? "animate-pulse h-3" : "h-2"}`} />
                  <span className={`w-0.5 rounded-full bg-amber-300 ${isPlaying ? "animate-pulse h-2" : "h-1.5"}`} />
                </div>
                <span className="truncate font-black text-white">{currentTrack?.title}</span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[10px]">
                <span className="truncate text-lime-200/90">{currentTrack?.subtitle}</span>
                <span className="font-mono tabular-nums text-white/70">
                  {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Piste précédente"
                onClick={() => selectTrack(currentIndex - 1, true, true)}
                className="rounded-lg bg-white/10 px-1.5 py-1 text-[11px] font-bold text-white transition hover:bg-white/20"
              >
                ⏮
              </button>
              <button
                type="button"
                title={musicEnabled && soundOn && isPlaying ? "Pause (K)" : "Lecture (K)"}
                onClick={() => {
                  if (!musicEnabled) setMusicEnabled(true);
                  if (audioRef.current) {
                    if (isPlaying) audioRef.current.pause();
                    else void audioRef.current.play().catch(() => undefined);
                  }
                }}
                className={`rounded-lg px-2 py-1 text-[11px] font-black transition ${
                  isPlaying ? "bg-lime-400 text-emerald-950 shadow" : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button
                type="button"
                title="Piste suivante (touche K)"
                onClick={() => selectTrack(currentIndex + 1, true, true)}
                className="rounded-lg bg-white/10 px-1.5 py-1 text-[11px] font-bold text-white transition hover:bg-white/20"
              >
                ⏭
              </button>
              <button
                type="button"
                title="Détails de la playlist / Importer depuis Downloads"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-lg bg-white/10 px-1.5 py-1 text-[10px] text-white/80 transition hover:bg-white/20"
              >
                {expanded ? "▲" : "▼"}
              </button>
            </div>
          </div>

          {/* Scrubber de progression de lecture */}
          <div className="mt-1.5">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="h-1 w-full cursor-pointer accent-lime-400"
              aria-label="Position dans le morceau"
            />
          </div>

          {expanded && (
            <div className="mt-2.5 space-y-2 border-t border-white/15 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-lime-300">Playlist gabonaise</p>
              <div className="space-y-1">
                {tracks.map((t, idx) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTrack(idx, true, true)}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition ${
                      idx === currentIndex
                        ? "border border-lime-300/40 bg-emerald-900/80 font-bold text-white shadow"
                        : "bg-black/40 text-white/85 hover:bg-white/10"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-white">
                        {idx === currentIndex && isPlaying ? "🔊 " : "▶ "}
                        {t.title}
                      </div>
                      <div className="truncate text-[10px] text-emerald-100/70">{t.subtitle}</div>
                    </div>
                    <span className="ml-2 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-lime-200">
                      {t.customUploaded ? "Downloads ✓" : "Stéréo"}
                    </span>
                  </button>
                ))}
              </div>

              {/* Réglage du volume */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] font-semibold text-emerald-100/80">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-lime-400"
                  aria-label="Volume de la musique"
                />
                <span className="w-8 text-right font-mono text-[10px] font-bold text-white">{Math.round(volume * 100)}%</span>
              </div>

              {/* Bouton d'import direct depuis /Users/m12020/Downloads */}
              <button
                type="button"
                onClick={() => {
                  targetUploadTrackRef.current = null;
                  fileInputRef.current?.click();
                }}
                disabled={uploading}
                className="w-full rounded-xl border border-lime-300/50 bg-lime-400/20 px-3 py-1.5 text-center text-xs font-bold text-lime-200 transition hover:bg-lime-300 hover:text-emerald-950 disabled:opacity-50"
              >
                {uploading ? "Import en cours…" : "📂 Charger depuis /Users/m12020/Downloads"}
              </button>

              <div className="flex items-center justify-between text-[10px] text-emerald-100/60">
                <span>Raccourci : touche K</span>
                <button type="button" onClick={() => void handleResetTracks()} className="underline hover:text-white">
                  Réinitialiser
                </button>
              </div>

              {uploadNote && <p className="text-[10px] font-semibold text-lime-200">{uploadNote}</p>}
            </div>
          )}
        </div>
      ) : (
        /* BLOC MUSIQUE DU MENU PRINCIPAL */
        <div className="mt-4 rounded-2xl border border-emerald-300/35 bg-[#021209]/95 p-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🎵</span>
                <span className="text-base font-black text-white">Bande-son réelle du jeu (Mougongo & Forêt)</span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-emerald-50/90">
                Musique traditionnelle équatoriale à l&apos;arc musical Moungongo, harpe sacrée Ngombi et ambiance d&apos;aube en forêt.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  targetUploadTrackRef.current = null;
                  fileInputRef.current?.click();
                }}
                disabled={uploading}
                className="rounded-xl border border-lime-300/50 bg-lime-400/20 px-3.5 py-2 text-xs font-black text-lime-200 transition hover:bg-lime-300 hover:text-emerald-950 disabled:opacity-50"
              >
                {uploading ? "Import…" : "📂 Importer depuis /Users/m12020/Downloads"}
              </button>
            </div>
          </div>

          {/* Grille des 3 pistes avec écoute directe */}
          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-3">
            {tracks.map((t, idx) => {
              const isThisPlaying = idx === currentIndex && isPlaying;
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border p-3 transition ${
                    idx === currentIndex
                      ? "border-lime-300 bg-emerald-900/85 shadow-lg"
                      : "border-white/15 bg-black/60 hover:border-emerald-300/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-white">{t.title}</div>
                      <div className="mt-0.5 text-xs text-lime-200/90">{t.subtitle}</div>
                    </div>
                    <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-lime-200">
                      {t.customUploaded ? "Downloads ✓" : "Stéréo 44.1k"}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === currentIndex) {
                          if (audioRef.current) {
                            if (isPlaying) audioRef.current.pause();
                            else void audioRef.current.play().catch(() => undefined);
                          }
                        } else {
                          selectTrack(idx, false, true);
                        }
                      }}
                      className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
                        isThisPlaying ? "bg-lime-400 text-emerald-950" : "bg-white/15 text-white hover:bg-white/25"
                      }`}
                    >
                      {isThisPlaying ? "⏸ Pause" : "▶ Écouter"}
                    </button>

                    <button
                      type="button"
                      title={`Remplacer ${t.title} par un fichier de Downloads`}
                      onClick={() => {
                        targetUploadTrackRef.current = t.id;
                        fileInputRef.current?.click();
                      }}
                      className="rounded-lg bg-black/40 px-2 py-1 text-[11px] font-semibold text-emerald-200/80 hover:text-white"
                    >
                      Remplacer 📂
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-100/70">
            <span className="text-[11px]">
              Dossier source : <span className="font-mono text-lime-200">/Users/m12020/Downloads/</span>
            </span>
            <button
              type="button"
              onClick={() => void handleResetTracks()}
              className="text-[11px] text-emerald-200/80 underline hover:text-white"
            >
              Restaurer les pistes originales
            </button>
          </div>

          {uploadNote && <p className="mt-2 text-xs font-bold text-lime-300">{uploadNote}</p>}
        </div>
      )}
    </>
  );
}
