"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MinkebeGame as Engine,
  type Character,
  type DeathInfo,
  type GameSnapshot,
  type SaveData,
  type WeaponId,
} from "@/game/engine";
import { WEAPONS, WEAPON_ORDER } from "@/game/weapons";
import GpsMap from "./GpsMap";
import { NetClient, createRoom, joinRoom, type ChatMessage, type NetStatus } from "@/game/net";
import TouchControls from "./TouchControls";
import CompassBar from "./CompassBar";
import LoadingScreen from "./LoadingScreen";
import GameTrailer from "./GameTrailer";
import DownloadsPanel from "./DownloadsPanel";
import Dressing from "./Dressing";
import MusicPlayer from "./MusicPlayer";
import { OUTFITS, type OutfitId } from "@/game/outfits";
import { GAME_VERSION } from "@/lib/version";
import { VoiceDictation, canDictate, canSpeak, speak, type VoiceStatus } from "@/game/voice";
import { QUALITY_PRESETS, detectQualityPreset, type QualityPreset } from "@/game/engine";
import { levelFromXp, levelInfo } from "@/game/levels";

type Phase = "menu" | "playing" | "paused" | "dead";

interface SaveRow extends SaveData {
  id: number;
  slotName: string;
  updatedAt: string;
}

interface ExpeditionRow {
  id: number;
  playerName: string;
  character: string;
  timeSurvived: number;
  resourcesCollected: number;
  builtShelter: boolean;
  craftedSpear: boolean;
  kills: number;
  weaponsFound: string[];
  causeOfDeath: string;
  createdAt: string;
}

type TrailerAction =
  | { kind: "solo" }
  | { kind: "online"; mode: "create" | "join" }
  | { kind: "save"; row: SaveRow }
  | { kind: "preview" };

const COPYRIGHT = `© ${new Date().getFullYear()} ONOKO-CRÉATIONS — Tous droits réservés`;
const STUDIO = "ONOKO-CRÉATIONS";

const WEAPON_ICONS: Record<WeaponId, string> = {
  couteau: "🔪",
  machette: "🗡️",
  lance: "🪃",
  pistolet: "🔫",
  m16: "🎯",
  calibre12: "💥",
};

const CHARACTERS: { id: Character; title: string; origin: string; description: string; accent: string }[] = [
  {
    id: "ANNIQUE",
    title: "Annique",
    origin: "Guide naturaliste · Minvoul",
    description: "Styliste-exploratrice au cœur léger : ses tenues tissées de Fils de Rêve lui donnent des pouvoirs. Agile et discrète.",
    accent: "from-pink-300 to-amber-300",
  },
  {
    id: "LANDRY",
    title: "Landry",
    origin: "Ancien éco-garde · Makokou",
    description: "Ancien éco-garde au grand cœur : il porte lui aussi les tenues magiques, et sait où dort le M16 du poste.",
    accent: "from-sky-300 to-emerald-400",
  },
];

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

function dayLabel(hour: number): string {
  if (hour < 5) return "🌙 Nuit";
  if (hour < 7) return "🌅 Aube";
  if (hour < 11) return "☀️ Matin";
  if (hour < 15) return "☀️ Midi";
  if (hour < 18.5) return "🌤️ Après-midi";
  if (hour < 20.5) return "🌇 Crépuscule";
  return "🌙 Nuit";
}

function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function StatBar({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-emerald-100/80">
        <span>
          {icon} {label}
        </span>
        <span className="tabular-nums">{Math.round(pct)}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/40">
        <div className={`h-full rounded-full transition-[width] duration-200 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MinkebeGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const phaseRef = useRef<Phase>("menu");

  const [phase, setPhase] = useState<Phase>("menu");
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [character, setCharacter] = useState<Character>("ANNIQUE");
  const [playerName, setPlayerName] = useState("Explorateur");
  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [expeditions, setExpeditions] = useState<ExpeditionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [death, setDeath] = useState<DeathInfo | null>(null);
  const [menuTab, setMenuTab] = useState<"new" | "online" | "load" | "ranking" | "pass" | "download">("new");
  const [trailerAction, setTrailerAction] = useState<TrailerAction | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [loadingExiting, setLoadingExiting] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ percent: 0, stage: "Initialisation du jeu…" });
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [huntingOn, setHuntingOn] = useState(true);
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>("auto");
  const [dayMinutes, setDayMinutes] = useState(20);
  const [dressingOpen, setDressingOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null>(null);
  const [installed, setInstalled] = useState(false);
  const [serverUrl, setServerUrl] = useState("");

  const [passKey, setPassKey] = useState<string | null>(null);
  const passKeyRef = useRef<string | null>(null);
  const [payProvider, setPayProvider] = useState<"stripe" | "paypal" | "demo">("demo");
  const [payProviders, setPayProviders] = useState<string[]>(["paypal", "airtel", "moov"]);
  const [mmMethod, setMmMethod] = useState<"airtel" | "moov" | null>(null);
  const [mmPhone, setMmPhone] = useState("");
  const [mmRef, setMmRef] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [demoSession, setDemoSession] = useState<string | null>(null);
  const [restoreKey, setRestoreKey] = useState("");
  const FREE_SAVE_SLOTS = 3;
  const [detectedPreset, setDetectedPreset] = useState<"mobile" | "hd" | "uhd">("hd");
  const [touchMode, setTouchMode] = useState(false);
  const netRef = useRef<NetClient | null>(null);
  const [netStatus, setNetStatus] = useState<NetStatus | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [netBusy, setNetBusy] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const ttsOnRef = useRef(false);
  const [dictating, setDictating] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const dictationRef = useRef<VoiceDictation | null>(null);
  const lastAlertRef = useRef("");
  const [finalCelebration, setFinalCelebration] = useState(false);
  const finalCelebrationRef = useRef(false);
  const hasSurvivalPrize = snapshot?.levelProgress.isMax ?? false;

  // Célébration du Prix de Survie : affichée une fois quand le niveau final est atteint
  useEffect(() => {
    if (hasSurvivalPrize) {
      if (!finalCelebrationRef.current) {
        finalCelebrationRef.current = true;
        setFinalCelebration(true);
        if (canSpeak()) speak("🏆 PRIX DE SURVIE obtenu ! Tu es Maître de la forêt !", { interrupt: true });
        window.setTimeout(() => setFinalCelebration(false), 6000);
      }
    } else {
      finalCelebrationRef.current = false;
      setFinalCelebration(false);
    }
  }, [hasSurvivalPrize]);

  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const changePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((current) => (current === text ? null : current)), 2600);
  }, []);

  const refreshSaves = useCallback(async () => {
    try {
      const res = await fetch("/api/saves", { cache: "no-store" });
      const data = (await res.json()) as { saves?: SaveRow[] };
      setSaves(data.saves ?? []);
    } catch {
      setSaves([]);
    }
  }, []);

  const refreshExpeditions = useCallback(async () => {
    try {
      const res = await fetch("/api/expeditions", { cache: "no-store" });
      const data = (await res.json()) as { expeditions?: ExpeditionRow[] };
      setExpeditions(data.expeditions ?? []);
    } catch {
      setExpeditions([]);
    }
  }, []);

  useEffect(() => {
    void refreshSaves();
    void refreshExpeditions();
  }, [refreshSaves, refreshExpeditions]);

  // PWA : service worker, invite d'installation, manifeste de téléchargement
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => reg.update())
        .catch(() => undefined);
    }
    if ("caches" in window) {
      void caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => undefined);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> });
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) setInstalled(true);
    setServerUrl(window.location.origin);
    void fetch("/api/download")
      .then((r) => r.json())
      .then((d: { server?: string; platforms?: { id: string; label: string; icon: string; description: string; format: string; requirements: string; url: string }[] }) => {
        if (d.server) setServerUrl(d.server);
      })
      .catch(() => undefined);
     return () => {
       window.removeEventListener("beforeinstallprompt", onPrompt);
       window.removeEventListener("appinstalled", onInstalled);
     };
   }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  // Pass Explorateur : licence locale, fournisseur de paiement, retour de caisse
  useEffect(() => {
    const stored = window.localStorage.getItem("minkebe.passKey");
    if (stored) {
      setPassKey(stored);
      passKeyRef.current = stored;
    }
    void fetch("/api/pay/checkout")
      .then((r) => r.json())
      .then((d: { provider?: string; providers?: string[] }) => {
        setPayProvider((d.provider as "stripe" | "paypal" | "demo") ?? "paypal");
        setPayProviders(d.providers && d.providers.length > 0 ? d.providers : ["paypal", "airtel", "moov"]);
      })
      .catch(() => undefined);

    const params = new URLSearchParams(window.location.search);
    const pay = params.get("pay");
    const sessionId = params.get("session_id");
    const paypalToken = params.get("token");
    if (pay === "success" && sessionId) {
      void confirmPayment(sessionId);
      setMenuTab("pass");
    } else if (pay === "paypal" && paypalToken) {
      // Retour de PayPal : le "token" est l'identifiant de commande ; la capture se fait côté serveur
      void confirmPayment(paypalToken);
      setMenuTab("pass");
    } else if (pay === "cancel") {
      setPayMessage("Paiement annulé. Aucun montant n'a été débité.");
      setMenuTab("pass");
    }
    if (pay) window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activatePass = (key: string, name?: string) => {
    setPassKey(key);
    passKeyRef.current = key;
    window.localStorage.setItem("minkebe.passKey", key);
    if (name && !playerName.trim()) setPlayerName(name);
  };

  const confirmPayment = async (sessionId: string) => {
    setPayBusy(true);
    try {
      const res = await fetch("/api/pay/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      const data = (await res.json()) as { status?: string; licenseKey?: string; playerName?: string; error?: string };
      if (data.status === "paid" && data.licenseKey) {
        activatePass(data.licenseKey, data.playerName);
        setPayMessage(`Merci ! Pass Explorateur activé. Ta clé : ${data.licenseKey} (garde-la pour la restaurer sur un autre appareil).`);
      } else {
        setPayMessage(data.error ?? "Paiement en attente de confirmation…");
      }
    } catch {
      setPayMessage("Impossible de confirmer le paiement.");
    } finally {
      setPayBusy(false);
      setDemoSession(null);
    }
  };

  const startCheckout = async (provider?: "stripe" | "paypal" | "demo") => {
    if (payBusy) return;
    setPayBusy(true);
    setPayMessage(null);
    try {
      const res = await fetch("/api/pay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: playerName.trim() || "Explorateur", provider: provider ?? payProvider }),
      });
      const data = (await res.json()) as { provider?: "stripe" | "paypal" | "demo"; url?: string | null; sessionId?: string; orderId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      if ((data.provider === "stripe" || data.provider === "paypal") && data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.provider === "paypal" && !data.url) throw new Error("PayPal n'a pas renvoyé de lien d'approbation.");
      if (data.sessionId) setDemoSession(data.sessionId);
    } catch (error) {
      setPayMessage(error instanceof Error ? error.message : "Erreur de paiement.");
    } finally {
      setPayBusy(false);
    }
  };

  const confirmMobileMoney = async () => {
    if (!mmMethod || payBusy) return;
    setPayBusy(true);
    setPayMessage(null);
    try {
      const res = await fetch("/api/pay/mobile-money", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: mmMethod,
          playerName: playerName.trim() || "Explorateur",
          phone: mmPhone,
          txRef: mmRef,
        }),
      });
      const data = (await res.json()) as { status?: string; licenseKey?: string; playerName?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      if (data.status === "paid" && data.licenseKey) {
        activatePass(data.licenseKey, data.playerName);
        setMmMethod(null);
        setPayMessage(`Merci ! Pass activé via ${mmMethod === "airtel" ? "Airtel Money" : "Moov Money"}. Clé : ${data.licenseKey}`);
      }
    } catch (error) {
      setPayMessage(error instanceof Error ? error.message : "Erreur de paiement mobile.");
    } finally {
      setPayBusy(false);
    }
  };

  const restorePass = async () => {
    if (payBusy) return;
    setPayBusy(true);
    setPayMessage(null);
    try {
      const res = await fetch("/api/pay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ licenseKey: restoreKey }) });
      const data = (await res.json()) as { valid?: boolean; licenseKey?: string; playerName?: string; error?: string };
      if (data.valid && data.licenseKey) {
        activatePass(data.licenseKey, data.playerName);
        setPayMessage("Pass Explorateur restauré sur cet appareil.");
        setRestoreKey("");
      } else {
        setPayMessage(data.error ?? "Clé invalide.");
      }
    } catch {
      setPayMessage("Vérification impossible.");
    } finally {
      setPayBusy(false);
    }
  };

  const saveGame = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || busy) return;
    setBusy(true);
    try {
      const data = engine.getSaveData();
      const slotName = playerNameRef.current.trim() || "Explorateur";
      if (!passKeyRef.current) {
        const existing = await fetch("/api/saves", { cache: "no-store" }).then((r) => r.json()).then((d: { saves?: SaveRow[] }) => d.saves ?? []).catch(() => [] as SaveRow[]);
        if (existing.length >= FREE_SAVE_SLOTS && !existing.some((r) => r.slotName === slotName)) {
          engine.notify(`Version gratuite : ${FREE_SAVE_SLOTS} sauvegardes max. Le Pass Explorateur (2,99 €) les rend illimitées.`, 5);
          showToast("Limite de sauvegardes atteinte (Pass Explorateur : illimité).");
          return;
        }
      }
      const res = await fetch("/api/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, slotName }),
      });
      if (!res.ok) throw new Error("save failed");
      engine.notify(`Partie sauvegardée (${slotName}) !`);
      showToast("Partie sauvegardée dans la base de données.");
      void refreshSaves();
    } catch {
      engine.notify("Erreur pendant la sauvegarde.");
      showToast("Erreur pendant la sauvegarde.");
    } finally {
      setBusy(false);
    }
  }, [busy, refreshSaves, showToast]);

  const loadSave = useCallback(
    (row: SaveRow) => {
      const engine = engineRef.current;
      if (!engine) return;
      setPlayerName(row.slotName);
      const legacy = row.character as string;
      const normalized: Character = legacy === "LANDRY" || legacy === "EKEKA" ? "LANDRY" : "ANNIQUE";
      setCharacter(normalized);
      setDeath(null);
      engine.applySave({ ...row, character: normalized });
      if (!soundOnRef.current) engine.setAmbience(false);
      changePhase("playing");
      engine.setPaused(false);
      engine.requestPointerLock();
      showToast(`Sauvegarde « ${row.slotName} » chargée.`);
    },
    [changePhase, showToast]
  );

  const quickLoad = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || busy) return;
    if (netRef.current) {
      engine.notify("Chargement désactivé en multijoueur : le monde est partagé avec le salon.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/saves", { cache: "no-store" });
      const data = (await res.json()) as { saves?: SaveRow[] };
      const rows = data.saves ?? [];
      const slotName = playerNameRef.current.trim() || "Explorateur";
      const row = rows.find((r) => r.slotName === slotName) ?? rows[0];
      if (!row) {
        engine.notify("Aucune sauvegarde trouvée.");
        return;
      }
      loadSave(row);
    } catch {
      engine.notify("Impossible de lire la sauvegarde.");
    } finally {
      setBusy(false);
    }
  }, [busy, loadSave]);

  const deleteSave = useCallback(
    async (id: number) => {
      await fetch(`/api/saves/${id}`, { method: "DELETE" });
      void refreshSaves();
    },
    [refreshSaves]
  );

  const saveGameRef = useRef(saveGame);
  saveGameRef.current = saveGame;
  const quickLoadRef = useRef(quickLoad);
  quickLoadRef.current = quickLoad;

  // Création du moteur
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let loadingTimer: number | undefined;
    let fadeTimer: number | undefined;
    let safetyTimer: number | undefined;
    let done = false;

    const finishLoading = () => {
      if (cancelled || done) return;
      done = true;
      setLoadingProgress({ percent: 100, stage: "La forêt est prête !" });
      setEngineReady(true);
      loadingTimer = window.setTimeout(() => {
        if (cancelled) return;
        setLoadingExiting(true);
        fadeTimer = window.setTimeout(() => {
          if (!cancelled) setLoadingVisible(false);
        }, 450);
      }, 180);
    };

    setEngineReady(true);
    setLoadingVisible(true);
    setLoadingExiting(false);
    setLoadingError(null);
    setLoadingProgress({ percent: 12, stage: "Initialisation du moteur 3D…" });

    // Garde-fou : quoi qu'il arrive (réseau lent ou onglet en arrière-plan), le menu s'ouvre en ~1,3 s
    safetyTimer = window.setTimeout(finishLoading, 1300);
    const updateTouchMode = () => {
      const compactScreen = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;
      setTouchMode(navigator.maxTouchPoints > 0 || compactScreen || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    };
    updateTouchMode();
    window.addEventListener("resize", updateTouchMode);
    window.addEventListener("orientationchange", updateTouchMode);

    let engine: Engine | null = null;
    try {
      engine = new Engine(canvas, {
        onLoadProgress: (percent, stage) => {
          if (!cancelled && !done) setLoadingProgress({ percent, stage });
        },
        onSnapshot: (snap) => setSnapshot(snap),
        onDeath: async (info) => {
          setDeath(info);
          changePhase("dead");
          if (document.pointerLockElement) document.exitPointerLock();
          try {
            await fetch("/api/expeditions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                playerName: `${playerNameRef.current.trim() || "Explorateur"}${passKeyRef.current ? " ★" : ""}`,
                character: engine?.getSaveData().character ?? "ANNIQUE",
                timeSurvived: info.timeSurvived,
                resourcesCollected: info.resourcesCollected,
                builtShelter: info.hasShelter,
                craftedSpear: info.hasSpear,
                kills: info.kills,
                weaponsFound: engine?.getSaveData().weapons ?? ["couteau"],
                causeOfDeath: info.cause,
              }),
            });
          } catch {
            // Le classement est facultatif.
          }
          void refreshExpeditions();
        },
        onRequestSave: () => void saveGameRef.current(),
        onRequestLoad: () => void quickLoadRef.current(),
        onRequestPause: () => {
          if (phaseRef.current === "playing" && engine) {
            engine.setPaused(true);
            changePhase("paused");
          }
        },
      });
      engineRef.current = engine;
      const detected = detectQualityPreset();
      setDetectedPreset(detected);
      const saved = (typeof window !== "undefined" ? window.localStorage.getItem("minkebe.quality") : null) as QualityPreset | null;
      if (saved && saved !== "auto" && saved in QUALITY_PRESETS) {
        setQualityPreset(saved);
        engine.setQuality(saved);
      }
      const savedDay = Number(window.localStorage.getItem("minkebe.dayMinutes"));
      if ([10, 20, 40, 60].includes(savedDay)) {
        setDayMinutes(savedDay);
        engine.setDayLength(savedDay * 60);
      }
      void engine.ready.then(finishLoading).catch(finishLoading);
    } catch (error) {
      console.error("Initialisation WebGL :", error);
      finishLoading();
    }

    return () => {
      cancelled = true;
      if (loadingTimer !== undefined) window.clearTimeout(loadingTimer);
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
      if (safetyTimer !== undefined) window.clearTimeout(safetyTimer);
      window.removeEventListener("resize", updateTouchMode);
      window.removeEventListener("orientationchange", updateTouchMode);
      engine?.dispose();
      engineRef.current = null;
    };
  }, [changePhase, refreshExpeditions]);

  const startGame = () => {
    const engine = engineRef.current;
    if (!engine) return;
    leaveRoom();
    setDeath(null);
    engine.startNewGame(character);
    engine.setHunting(huntingOn);
    if (passKey) engine.grantStarterKit();
    if (!soundOn) engine.setAmbience(false);
    changePhase("playing");
    if (!touchMode) engine.requestPointerLock();
  };

  const resumeGame = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPaused(false);
    changePhase("playing");
    if (!touchMode) engine.requestPointerLock();
  };

  const pauseGame = () => {
    const engine = engineRef.current;
    if (!engine || phaseRef.current !== "playing") return;
    engine.setPaused(true);
    changePhase("paused");
  };

  const changeQuality = (preset: QualityPreset) => {
    setQualityPreset(preset);
    window.localStorage.setItem("minkebe.quality", preset);
    engineRef.current?.setQuality(preset);
  };

  const openDressing = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || phaseRef.current !== "playing") return;
    setDressingOpen(true);
    engine.setUiCapture(true);
    engine.setPaused(true);
  }, []);

  const closeDressing = useCallback(() => {
    const engine = engineRef.current;
    setDressingOpen(false);
    if (!engine) return;
    engine.setUiCapture(false);
    engine.setPaused(false);
    if (!touchMode) engine.requestPointerLock();
  }, [touchMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyO") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (dressingOpen) closeDressing();
      else if (phaseRef.current === "playing" && e.shiftKey) openDressing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dressingOpen, openDressing, closeDressing]);

  const pressBuild = () => {
    engineRef.current?.pressBuild();
  };

  const pressGadget = (which: "gps" | "nightvision") => {
    engineRef.current?.pressGadget(which);
  };

  const toggleHunting = () => {
    const next = !huntingOn;
    setHuntingOn(next);
    engineRef.current?.setHunting(next);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    engineRef.current?.setAmbience(next);
  };

  const leaveRoom = useCallback(() => {
    netRef.current?.stop();
    netRef.current = null;
    setNetStatus(null);
    setRoomCode(null);
    setChat([]);
    setChatOpen(false);
    setVoiceStatus(null);
    dictationRef.current?.stop();
    setDictating(false);
    engineRef.current?.setUiCapture(false);
  }, []);

  useEffect(() => () => netRef.current?.stop(), []);

  const startOnline = async (mode: "create" | "join") => {
    const engine = engineRef.current;
    if (!engine || netBusy) return;
    setNetBusy(true);
    setNetError(null);
    try {
      const name = playerName.trim() || "Explorateur";
      const session = mode === "create" ? await createRoom(name, character, huntingOn) : await joinRoom(joinCode, name, character);
      leaveRoom();
      setDeath(null);
      engine.startNewGame(character, session.worldSeed);
      engine.setHunting(session.huntingEnabled);
      if (passKey) engine.grantStarterKit();
      setHuntingOn(session.huntingEnabled);
      if (!soundOn) engine.setAmbience(false);
      const client = new NetClient(
        session,
        engine,
        (status) => setNetStatus(status),
        (messages) => {
          setChat((prev) => [...prev, ...messages].slice(-60));
          if (ttsOnRef.current) {
            for (const m of messages) {
              if (m.playerId === session.playerId) continue;
              speak(m.playerId === "system" ? m.text : `${m.name} dit : ${m.text}`);
            }
          }
        },
        (status) => setVoiceStatus(status)
      );
      netRef.current = client;
      client.start();
      setRoomCode(session.code);
      changePhase("playing");
      engine.requestPointerLock();
      engine.notify(
        mode === "create"
          ? `Salon ${session.code} créé. Partage ce code à tes coéquipiers ! T pour discuter.`
          : `Tu as rejoint le salon ${session.code}. T pour discuter.`,
        6
      );
    } catch (error) {
      setNetError(error instanceof Error ? error.message : "Erreur réseau");
    } finally {
      setNetBusy(false);
    }
  };

  const openChat = useCallback(() => {
    if (!netRef.current || phaseRef.current !== "playing") return;
    setChatOpen(true);
    engineRef.current?.setUiCapture(true);
    window.setTimeout(() => chatInputRef.current?.focus(), 30);
  }, []);

  const closeChat = useCallback(
    (send: boolean) => {
      if (send && chatDraft.trim()) netRef.current?.sendChat(chatDraft);
      setChatDraft("");
      setChatOpen(false);
      engineRef.current?.setUiCapture(false);
      engineRef.current?.requestPointerLock();
    },
    [chatDraft]
  );

  const toggleMic = async () => {
    const client = netRef.current;
    if (!client || voiceBusy) return;
    setVoiceBusy(true);
    try {
      if (voiceStatus?.enabled) client.voice.disable();
      else {
        const ok = await client.voice.enable();
        if (ok) engineRef.current?.notify("Micro activé : parle à ton équipe. V maintenu = parler (si push-to-talk).", 4);
      }
    } finally {
      setVoiceBusy(false);
    }
  };

  const togglePushToTalk = () => {
    const client = netRef.current;
    if (!client) return;
    client.voice.setPushToTalk(!voiceStatus?.pushToTalk);
  };

  const toggleTts = () => {
    const next = !ttsOn;
    setTtsOn(next);
    ttsOnRef.current = next;
    if (next) speak("Lecture vocale activée. Les messages et les alertes seront lus à voix haute.", { interrupt: true });
    else window.speechSynthesis?.cancel();
  };

  const startDictation = () => {
    if (!netRef.current) return;
    if (!dictationRef.current) dictationRef.current = new VoiceDictation();
    setDictationError(null);
    const ok = dictationRef.current.start(
      (text, final) => {
        setChatDraft(text);
        if (final && text.trim()) {
          netRef.current?.sendChat(text);
          setChatDraft("");
        }
      },
      (error) => {
        setDictating(false);
        if (error) setDictationError(error);
      }
    );
    if (ok) {
      setDictating(true);
      if (!chatOpen) {
        setChatOpen(true);
        engineRef.current?.setUiCapture(true);
      }
    } else {
      setDictationError("Dictée non prise en charge par ce navigateur.");
    }
  };

  // Push-to-talk : touche V maintenue
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "KeyV" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      netRef.current?.voice.setTalking(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyV") netRef.current?.voice.setTalking(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Lecture vocale des alertes de jeu (danger, soif, faim, esquive…)
  useEffect(() => {
    if (!ttsOn || !snapshot || phase !== "playing") return;
    const msg = snapshot.message;
    const important = /Danger|Attention|Esquive|abattu|succombé|Lance fabriquée|Abri construit|trouvé|récupér/i.test(msg);
    if (important && msg !== lastAlertRef.current) {
      lastAlertRef.current = msg;
      speak(msg.replace(/\(.*?\)/g, ""), { rate: 1.1 });
    }
  }, [snapshot, ttsOn, phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyT" && !chatOpen && netRef.current && phaseRef.current === "playing") {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        e.preventDefault();
        openChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen, openChat]);

  const backToMenu = () => {
    leaveRoom();
    const engine = engineRef.current;
    if (engine) {
      engine.setPaused(true);
      engine.setAmbience(false);
    }
    if (document.pointerLockElement) document.exitPointerLock();
    changePhase("menu");
    void refreshSaves();
    void refreshExpeditions();
  };

  const enterAfterTrailer = () => {
    const action = trailerAction;
    setTrailerAction(null);
    if (!action) return;
    if (action.kind === "solo" || action.kind === "preview") startGame();
    else if (action.kind === "online") void startOnline(action.mode);
    else loadSave(action.row);
  };

  const handleCanvasClick = () => {
    if (phaseRef.current === "playing" && !touchMode) engineRef.current?.requestPointerLock();
  };

  const inGame = phase === "playing" || phase === "paused" || phase === "dead";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#061008] text-emerald-50 select-none">
      <canvas ref={canvasRef} onClick={handleCanvasClick} className="block h-full w-full" />

      {loadingVisible && (
        <LoadingScreen
          progress={loadingProgress.percent}
          stage={loadingProgress.stage}
          error={loadingError}
          exiting={loadingExiting}
          onDismiss={() => {
            setEngineReady(true);
            setLoadingExiting(true);
            window.setTimeout(() => setLoadingVisible(false), 350);
          }}
        />
      )}

      {/* ============ HUD ============ */}
      {inGame && snapshot?.whimsy?.photoMode && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/40 px-3 py-1 text-[11px] text-white/70">📸 Mode photo · P pour quitter · © ONOKO-CRÉATIONS</div>
      )}
      {inGame && snapshot?.whimsy && snapshot.compass && !snapshot.whimsy.photoMode && (
        <>
          {/* Radar de direction et d'indices (permanent) */}
          <CompassBar data={snapshot.compass} compact={touchMode} />

          <div className={`pointer-events-none absolute rounded-2xl border border-emerald-200/15 bg-[#07130a]/80 shadow-2xl backdrop-blur-md ${touchMode ? "left-2 top-16 max-h-[34dvh] w-[min(210px,46vw)] overflow-hidden p-2 text-[10px]" : "left-4 top-4 w-[290px] p-4"}`}>
            <div className="flex items-baseline justify-between">
              <h2 className={`font-bold tracking-wide ${touchMode ? "text-xs" : "text-lg"}`}>
                SURVIE · {snapshot.character}
                {passKey && <span className="ml-1 text-amber-300" title="Pass Explorateur">★</span>}
              </h2>
              {!touchMode && <span className="text-[11px] text-emerald-200/70">{playerName}</span>}
            </div>
            <div className={`space-y-1.5 ${touchMode ? "mt-1.5" : "mt-3 space-y-2.5"}`}>
              <StatBar label="Santé" value={snapshot.health} color="bg-gradient-to-r from-rose-500 to-red-400" icon="❤" />
              <StatBar label="Faim" value={snapshot.hunger} color="bg-gradient-to-r from-orange-500 to-amber-300" icon="🍈" />
              <StatBar label="Soif" value={snapshot.thirst} color="bg-gradient-to-r from-cyan-500 to-sky-300" icon="💧" />
              <StatBar label="Endurance" value={snapshot.stamina} color="bg-gradient-to-r from-lime-500 to-green-300" icon="⚡" />
            </div>
            {/* Progression d'évolution vers le Prix de Survie */}
            <div className={touchMode ? "hidden" : "mt-3"}>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-amber-100/90">
                <span>
                  🏅 Niveau {snapshot.levelProgress.level} · {snapshot.levelProgress.levelName}
                </span>
                {snapshot.levelProgress.isMax ? (
                  <span className="font-bold text-amber-300">🏆 PRIX DE SURVIE</span>
                ) : (
                  <span className="tabular-nums tabular-nums">
                    {snapshot.levelProgress.xp}/{snapshot.levelProgress.next} XP
                  </span>
                )}
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/40">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    snapshot.levelProgress.isMax
                      ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400"
                      : "bg-gradient-to-r from-amber-500 to-yellow-400"
                  }`}
                  style={{ width: `${Math.round(snapshot.levelProgress.progress * 100)}%` }}
                />
              </div>
              {snapshot.levelProgress.isMax ? (
                <p className="mt-1.5 text-center text-[10px] font-bold text-amber-300">🏆 PRIX DE SURVIE obtenu !</p>
              ) : (
                <p className="mt-1.5 text-center text-[10px] text-amber-100/70">
                  {snapshot.levelProgress.next - snapshot.levelProgress.xp} XP avant le niveau {snapshot.levelProgress.level + 1}
                </p>
              )}
            </div>
            <p
              className={`${touchMode ? "hidden" : "mt-3 min-h-[2.5rem] text-sm leading-snug"} ${
                snapshot.threatNearby && !snapshot.hasSpear ? "font-semibold text-red-300" : "text-emerald-50/90"
              }`}
            >
              {snapshot.message}
            </p>
          </div>

          <div className={`mobile-time-card pointer-events-none absolute rounded-2xl border border-emerald-200/15 bg-[#07130a]/80 text-right shadow-2xl backdrop-blur-md ${touchMode ? "right-2 top-[12.25rem] max-w-[min(170px,42vw)] px-2 py-1.5" : "right-4 top-4 px-4 py-3"}`}>
            <div className={`${touchMode ? "text-[9px]" : "text-[11px]"} uppercase tracking-wider text-emerald-200/70`}>Temps de survie</div>
            <div className={`${touchMode ? "text-sm" : "text-xl"} font-bold tabular-nums`}>{formatTime(snapshot.timeSurvived)}</div>
            <div className={`text-emerald-100/80 ${touchMode ? "text-[9px]" : "mt-1 text-xs"}`}>
              {dayLabel(snapshot.gameHour)} <span className="font-mono font-bold text-emerald-50">{formatHour(snapshot.gameHour)}</span> · {snapshot.resourcesCollected} ressources
            </div>
            <div className={`${touchMode ? "hidden" : "mt-1 h-1 w-full overflow-hidden rounded-full bg-black/40"}`} title="Progression de la journée (jour 05h30 → 19h30)">
              <div className="relative h-full w-full bg-gradient-to-r from-indigo-900 via-sky-300 to-indigo-900">
                <span className="absolute top-0 h-full w-0.5 bg-white" style={{ left: `${(snapshot.gameHour / 24) * 100}%` }} />
              </div>
            </div>
            <div className={`${touchMode ? "hidden" : "mt-1 flex items-center justify-end gap-2 text-xs"}`}>
              <span className="rounded-full bg-pink-500/25 px-2 py-0.5 font-semibold text-pink-100">✨ Style {snapshot.whimsy.styleScore}</span>
              <span className="rounded-full bg-amber-500/25 px-2 py-0.5 font-semibold text-amber-100">⭐ {snapshot.whimsy.whimstars}/{snapshot.whimsy.whimstarsTotal}</span>
              <span className="rounded-full bg-sky-500/25 px-2 py-0.5 font-semibold text-sky-100" title="Esprits Nsisim rencontrés">🐾 {snapshot.whimsy.nsisim}/{snapshot.whimsy.nsisimTotal}</span>
            </div>
            <div className={`${touchMode ? "hidden" : "mt-1 flex flex-wrap justify-end gap-1 text-xs"}`}>
              {snapshot.swimming && (
                <span className="animate-pulse rounded bg-sky-500/40 px-1.5 py-0.5 font-bold text-sky-100">
                  🏊 Nage
                </span>
              )}
              {snapshot.sleeping && (
                <span className="animate-pulse rounded bg-amber-500/40 px-1.5 py-0.5 font-bold text-amber-100">
                  🛏️🔥 Repos au lit
                </span>
              )}
              <span className={`rounded px-1.5 py-0.5 ${snapshot.hasSpear ? "bg-amber-500/30 text-amber-100" : "bg-black/30 text-emerald-100/40"}`}>
                🗡 Lance
              </span>
              <span className={`rounded px-1.5 py-0.5 ${snapshot.hasShelter ? "bg-lime-500/30 text-lime-100" : "bg-black/30 text-emerald-100/40"}`}>
                🛖 Abri
              </span>
            </div>
          </div>

          {/* Lecteur musical en jeu : Le Mougongo 2 / Le Moungongo / Réveil dans la forêt */}
          <MusicPlayer
            inGame
            playing={phase === "playing"}
            soundOn={soundOn}
            compact={touchMode}
            onNotify={(msg) => engineRef.current?.notify(msg, 2.5)}
          />

          {snapshot.inventoryOpen && (
            <div className={`pointer-events-none absolute left-4 w-[290px] rounded-2xl border border-amber-200/20 bg-[#1a1208]/85 p-4 shadow-2xl backdrop-blur-md ${roomCode ? "top-[470px]" : "top-[300px]"}`}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-100">Inventaire</h3>
              <ul className="mt-2 space-y-1 text-sm">
                <li className="flex justify-between">
                  <span>🍈 Fruits</span>
                  <span className="tabular-nums">{snapshot.inventory.Fruits}</span>
                </li>
                <li className="flex justify-between">
                  <span>🪵 Bois</span>
                  <span className="tabular-nums">{snapshot.inventory.Bois}</span>
                </li>
                <li className="flex justify-between">
                  <span>🪨 Pierres</span>
                  <span className="tabular-nums">{snapshot.inventory.Pierres}</span>
                </li>
                <li className="flex justify-between">
                  <span>🥩 Viande</span>
                  <span className="tabular-nums">{snapshot.inventory.Viande}</span>
                </li>
                <li className="flex justify-between border-t border-amber-100/10 pt-1">
                  <span>Munitions 9 mm</span>
                  <span className="tabular-nums">{snapshot.ammoPistol}</span>
                </li>
                <li className="flex justify-between">
                  <span>Cartouches 5,56</span>
                  <span className="tabular-nums">{snapshot.ammoRifle}</span>
                </li>
                <li className="flex justify-between">
                  <span>Cartouches Cal. 12</span>
                  <span className="tabular-nums">{snapshot.ammoShotgun}</span>
                </li>
                <li className="flex justify-between">
                  <span>Armes</span>
                  <span>{snapshot.weapons.map((w) => WEAPONS[w].label).join(", ")}</span>
                </li>
                <li className="flex justify-between">
                  <span>Équipement</span>
                  <span>
                    {[snapshot.hasGps ? "GPS" : null, snapshot.hasNightVision ? "Lunettes IR" : null].filter(Boolean).join(", ") || "—"}
                  </span>
                </li>
                <li className="flex justify-between border-t border-amber-100/10 pt-1">
                  <span>Lance</span>
                  <span>{snapshot.hasSpear ? "oui" : "non (2 bois + 1 pierre)"}</span>
                </li>
                <li className="flex justify-between">
                  <span>Abri</span>
                  <span>{snapshot.hasShelter ? "oui" : "non (5 bois)"}</span>
                </li>
              </ul>
            </div>
          )}

          {/* Réticule */}
          {phase === "playing" && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {WEAPONS[snapshot.currentWeapon].kind === "ranged" ? (
                <div className={`relative h-8 w-8 transition-transform ${snapshot.aiming ? "scale-75" : "scale-100"}`}>
                  <span className={`absolute left-1/2 top-0 h-2.5 w-0.5 -translate-x-1/2 ${snapshot.hitMarker ? "bg-red-400" : "bg-white/90"}`} />
                  <span className={`absolute bottom-0 left-1/2 h-2.5 w-0.5 -translate-x-1/2 ${snapshot.hitMarker ? "bg-red-400" : "bg-white/90"}`} />
                  <span className={`absolute left-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 ${snapshot.hitMarker ? "bg-red-400" : "bg-white/90"}`} />
                  <span className={`absolute right-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 ${snapshot.hitMarker ? "bg-red-400" : "bg-white/90"}`} />
                </div>
              ) : (
                <div className={`h-1.5 w-1.5 rounded-full ${snapshot.hitMarker ? "bg-red-400" : "bg-white/70"}`} />
              )}
            </div>
          )}

          {/* Vie de la cible */}
          {snapshot.target && phase === "playing" && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 w-44 -translate-x-1/2 translate-y-10 rounded-lg border border-red-200/20 bg-black/55 px-3 py-1.5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-[11px] text-red-100/90">
                <span className="font-semibold">{snapshot.target.label}</span>
                <span className="tabular-nums">{Math.ceil(snapshot.target.hp)} / {snapshot.target.maxHp}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/50">
                <div className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-400 transition-[width] duration-150" style={{ width: `${(snapshot.target.hp / snapshot.target.maxHp) * 100}%` }} />
              </div>
            </div>
          )}

          {snapshot.nearCarcass && phase === "playing" && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-24 rounded-lg bg-red-950/70 px-3 py-1.5 text-sm">
              <kbd className="rounded bg-red-300 px-1.5 py-0.5 font-bold text-red-950">E</kbd> Dépecer la carcasse
            </div>
          )}

          {/* Commandes tactiles (téléphone / tablette) */}
          {touchMode && phase === "playing" && (
            <TouchControls
              engine={engineRef.current}
              ranged={WEAPONS[snapshot.currentWeapon].kind === "ranged"}
              aiming={snapshot.aiming}
              canInteract={Boolean(snapshot.nearResource) || snapshot.nearCarcass || snapshot.nearRiver}
              gpsOn={snapshot.gpsOn}
              nightVisionOn={snapshot.nightVisionOn}
              onPause={pauseGame}
            />
          )}

          {/* Indicateur de saut / esquive */}
          {finalCelebration && (
            <div className="pointer-events-none absolute left-1/2 top-[20%] -translate-x-1/2 animate-bounce rounded-2xl border-2 border-amber-300 bg-amber-950/90 px-6 py-4 text-center shadow-[0_0_50px_rgba(251,191,36,0.6)] backdrop-blur-md">
              <p className="text-2xl font-black text-amber-300">🏆 PRIX DE SURVIE OBTENU !</p>
              <p className="mt-1 text-sm font-bold text-amber-100">Niveau 7 — Maître de la forêt de Minkébé</p>
              <p className="text-xs text-amber-200/80">Tu as conquis tous les défis de survie de la forêt équatoriale !</p>
            </div>
          )}

          {snapshot.blocking && phase === "playing" && (
            <div className="pointer-events-none absolute left-1/2 top-[26%] -translate-x-1/2 rounded-full border border-amber-300/50 bg-amber-900/70 px-4 py-1.5 text-sm font-black text-amber-100">
              {snapshot.parrying ? "✨ PARADE !" : "🛡️ GARDE"} · {WEAPONS[snapshot.currentWeapon].label}
            </div>
          )}

          {snapshot.threatNearby && !snapshot.dead && phase === "playing" && (
            <div className="pointer-events-none absolute left-1/2 top-[18%] -translate-x-1/2 animate-pulse rounded-xl border border-red-300/40 bg-red-950/70 px-4 py-2 text-center text-sm font-bold text-red-100 shadow-xl backdrop-blur-sm">
              ⚠ CHARGE ! {touchMode ? "🛡️ parade ou ⤴️ saut" : <><kbd className="rounded bg-amber-300 px-1.5 py-0.5 text-amber-950">CLIC DROIT</kbd> parer · <kbd className="rounded bg-sky-300 px-1.5 py-0.5 text-sky-950">ESPACE</kbd> sauter</>}
              {snapshot.dodges > 0 && <span className="ml-2 text-xs font-normal text-red-200/80">· {snapshot.dodges} esquive{snapshot.dodges > 1 ? "s" : ""}</span>}
            </div>
          )}

          {/* Performances */}
          <div className="pointer-events-none absolute bottom-1 left-3 font-mono text-[10px] text-emerald-100/35">
            {snapshot.perf.fps} fps · {snapshot.perf.renderWidth}×{snapshot.perf.renderHeight} · {snapshot.perf.preset === "uhd" ? "4K" : snapshot.perf.preset === "hd" ? "HD" : "Mobile 1080p"}
            {snapshot.perf.renderScale < 1 ? ` · échelle ${Math.round(snapshot.perf.renderScale * 100)} %` : ""}
          </div>

          {/* Session multijoueur */}
          {roomCode && (
            <div className="pointer-events-none absolute left-4 top-[300px] w-[290px] rounded-2xl border border-sky-200/20 bg-[#07101a]/80 p-3 text-xs shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-sky-100">
                  🌐 Salon <span className="font-mono text-sky-300">{roomCode}</span>
                </span>
                <span className={`text-[10px] ${netStatus?.connected ? "text-emerald-300" : "text-red-300"}`}>
                  {netStatus?.connected ? `● ${netStatus.latencyMs} ms` : "○ reconnexion…"}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-sky-100/70">
                {netStatus?.isHost ? "Tu es l'hôte (animaux et météo)" : "Hôte distant"} · {(netStatus?.playerCount ?? 1)} / 8 joueurs · T : chat
              </div>
              <ul className="mt-1.5 space-y-0.5">
                <li className="flex justify-between text-emerald-100">
                  <span>
                    {voiceStatus?.enabled ? (voiceStatus.speaking ? "🔊" : "🎙️") : "👤"} {playerName || "Explorateur"} (toi)
                  </span>
                  <span className="tabular-nums">❤ {Math.round(snapshot.health)}</span>
                </li>
                {netStatus?.players.map((p) => {
                  const peer = voiceStatus?.peers.find((v) => v.playerId === p.playerId);
                  const speaking = peer?.speaking || p.voiceSpeaking;
                  return (
                    <li key={p.playerId} className={`flex items-center justify-between ${p.dead ? "text-red-300/70 line-through" : "text-sky-50"}`}>
                      <span className={speaking ? "font-bold text-lime-300" : ""}>
                        {speaking ? "🔊" : p.voiceEnabled ? "🎙️" : "👤"} {p.name}{" "}
                        <span className="text-sky-100/50">· {p.character === "LANDRY" ? "Landry" : "Annique"}</span>
                        {peer && (
                          <span className={`ml-1 text-[9px] ${peer.connected ? "text-emerald-300" : "text-amber-300"}`}>{peer.connected ? "●" : "○"}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        ❤ {Math.round(p.health)}
                        {peer && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => netRef.current?.voice.setMuted(p.playerId, !peer.muted)}
                            className="pointer-events-auto rounded px-1 text-[10px] hover:bg-white/10"
                            title={peer.muted ? "Réactiver" : "Couper ce joueur"}
                          >
                            {peer.muted ? "🔇" : "🔈"}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {netStatus?.error && <div className="mt-1 text-[10px] text-red-300">{netStatus.error}</div>}

              {/* Discussion vocale */}
              <div className="pointer-events-auto mt-2 border-t border-sky-200/10 pt-2">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => void toggleMic()}
                    disabled={voiceBusy}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                      voiceStatus?.enabled ? "border-lime-300/60 bg-lime-600/30 text-lime-100" : "border-sky-200/20 bg-black/30 text-sky-100/80 hover:bg-sky-900/40"
                    }`}
                  >
                    {voiceStatus?.enabled ? "🎙️ Micro ON" : "🎙️ Activer le micro"}
                  </button>
                  {voiceStatus?.enabled && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={togglePushToTalk}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                        voiceStatus.pushToTalk ? "border-amber-300/60 bg-amber-700/30 text-amber-100" : "border-sky-200/20 bg-black/30 text-sky-100/80"
                      }`}
                    >
                      {voiceStatus.pushToTalk ? (voiceStatus.talking ? "🔴 V : tu parles" : "V : appuyer pour parler") : "Voix libre"}
                    </button>
                  )}
                  {canSpeak() && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={toggleTts}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                        ttsOn ? "border-violet-300/60 bg-violet-700/30 text-violet-100" : "border-sky-200/20 bg-black/30 text-sky-100/80"
                      }`}
                      title="Lire à voix haute les messages et les alertes"
                    >
                      {ttsOn ? "🗣️ Lecture ON" : "🗣️ Lecture vocale"}
                    </button>
                  )}
                  {canDictate() && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={startDictation}
                      disabled={dictating}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                        dictating ? "animate-pulse border-red-300/60 bg-red-700/30 text-red-100" : "border-sky-200/20 bg-black/30 text-sky-100/80"
                      }`}
                      title="Dicter un message à l'équipe"
                    >
                      {dictating ? "🎤 J'écoute…" : "🎤 Dicter"}
                    </button>
                  )}
                </div>
                {voiceStatus?.micError && <div className="mt-1 text-[10px] text-red-300">{voiceStatus.micError}</div>}
                {dictationError && <div className="mt-1 text-[10px] text-amber-300">{dictationError}</div>}
                {!voiceStatus?.enabled && !voiceStatus?.micError && (
                  <div className="mt-1 text-[10px] text-sky-100/50">Chat vocal pair-à-pair : le volume des coéquipiers baisse avec la distance.</div>
                )}
              </div>
            </div>
          )}

          {roomCode && (chat.length > 0 || chatOpen) && (
            <div className="absolute bottom-40 left-4 w-[340px]">
              <div className="pointer-events-none max-h-40 space-y-0.5 overflow-hidden text-xs">
                {chat.slice(-8).map((m) => (
                  <div key={m.id} className="rounded-md bg-black/45 px-2 py-1 backdrop-blur-sm">
                    <span className={m.playerId === "system" ? "italic text-emerald-300/80" : "font-bold text-sky-200"}>{m.playerId === "system" ? "" : `${m.name} : `}</span>
                    <span className={m.playerId === "system" ? "italic text-emerald-100/70" : "text-emerald-50"}>{m.text}</span>
                  </div>
                ))}
              </div>
              {chatOpen && (
                <form
                  className="mt-1 flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    closeChat(true);
                  }}
                >
                  <input
                    ref={chatInputRef}
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value.slice(0, 200))}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        closeChat(false);
                      }
                      e.stopPropagation();
                    }}
                    placeholder="Message à l'équipe… (Entrée pour envoyer, Échap pour fermer)"
                    className="flex-1 rounded-lg border border-sky-200/30 bg-black/70 px-3 py-1.5 text-sm text-emerald-50 outline-none focus:border-sky-400"
                  />
                  <button type="submit" className="rounded-lg bg-sky-500 px-3 text-sm font-bold text-sky-950">
                    ➤
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Lunettes infrarouges : cadre + batterie */}
          {snapshot.nightVisionOn && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 rounded-[40%] shadow-[inset_0_0_120px_60px_rgba(0,0,0,0.9)]" />
              <div className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full border border-orange-300/40 bg-black/60 px-4 py-1 font-mono text-xs tracking-[0.3em] text-orange-200">
                ● IR THERMIQUE · {Math.round(snapshot.nvBattery * 100)} %
              </div>
            </div>
          )}

          {/* GPS */}
          {snapshot.gps && (
            <div className="pointer-events-none absolute right-4 top-36 rounded-full border border-emerald-200/15 bg-[#07130a]/60 p-1 shadow-2xl backdrop-blur-md">
              <GpsMap data={snapshot.gps} thermal={snapshot.nightVisionOn} />
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-emerald-200/70">
                GPS · X {snapshot.gps.x.toFixed(0)} · Z {snapshot.gps.z.toFixed(0)}
              </div>
            </div>
          )}

          {/* Gadgets : boutons M / N */}
          {(snapshot.hasGps || snapshot.hasNightVision) && (
            <div className="absolute bottom-[216px] right-4 flex flex-col gap-1.5">
              {snapshot.hasGps && (
                <button
                  type="button"
                  onClick={() => pressGadget("gps")}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold backdrop-blur-md transition ${
                    snapshot.gpsOn ? "border-emerald-300/50 bg-emerald-600/30" : "border-emerald-200/15 bg-[#07130a]/75 text-emerald-100/60"
                  }`}
                >
                  <kbd className="rounded bg-emerald-400 px-1.5 py-0.5 font-black text-emerald-950">M</kbd> 🛰️ GPS {snapshot.gpsOn ? "actif" : "masqué"}
                </button>
              )}
              {snapshot.hasNightVision && (
                <button
                  type="button"
                  onClick={() => pressGadget("nightvision")}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold backdrop-blur-md transition ${
                    snapshot.nightVisionOn ? "border-orange-300/60 bg-orange-700/40" : "border-emerald-200/15 bg-[#07130a]/75"
                  }`}
                >
                  <kbd className="rounded bg-emerald-400 px-1.5 py-0.5 font-black text-emerald-950">N</kbd> 🥽 Infrarouge
                  <span className="ml-1 h-1.5 w-12 overflow-hidden rounded-full bg-black/50">
                    <span
                      className={`block h-full rounded-full ${snapshot.nvBattery < 0.15 ? "bg-red-500" : "bg-gradient-to-r from-lime-500 to-lime-300"}`}
                      style={{ width: `${snapshot.nvBattery * 100}%` }}
                    />
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Tenue actuelle + dressing */}
          <button
            type="button"
            onClick={openDressing}
            onMouseDown={(e) => e.stopPropagation()}
            className={`absolute left-4 w-[290px] rounded-2xl border border-pink-200/30 bg-gradient-to-r from-[#2a1d4a]/85 to-[#07130a]/80 p-3 text-left backdrop-blur-md transition hover:border-pink-200/60 ${touchMode ? "bottom-[216px]" : "bottom-[150px]"}`}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 rounded-full border-2 border-white/30" style={{ background: `linear-gradient(135deg, #${OUTFITS[snapshot.whimsy.currentOutfit].primary.toString(16).padStart(6, "0")}, #${OUTFITS[snapshot.whimsy.currentOutfit].accent.toString(16).padStart(6, "0")})` }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-pink-50">👗 {OUTFITS[snapshot.whimsy.currentOutfit].name}</div>
                <div className="truncate text-[11px] text-pink-100/70">✦ {OUTFITS[snapshot.whimsy.currentOutfit].abilityLabel}</div>
              </div>
              <div className="text-right text-[10px] text-pink-100/60">
                <div><kbd className="rounded bg-pink-300 px-1 font-black text-pink-950">O</kbd> changer</div>
                <div><kbd className="rounded bg-pink-300 px-1 font-black text-pink-950">⇧O</kbd> dressing</div>
              </div>
            </div>
            {snapshot.whimsy.gliding && <div className="mt-1 text-center text-[11px] font-bold text-sky-200 animate-pulse">🪶 Tu planes…</div>}
            {snapshot.whimsy.companions > 0 && <div className="mt-1 text-[11px] text-lime-200">🐾 {snapshot.whimsy.companions} compagnon{snapshot.whimsy.companions > 1 ? "s" : ""} te suivent</div>}
          </button>

          {/* Option B : abri / repos */}
          <button
            type="button"
            onClick={pressBuild}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={phase !== "playing"}
            className={`absolute bottom-16 left-4 w-[290px] rounded-2xl border p-3 text-left backdrop-blur-md transition ${touchMode ? "hidden" : ""} ${
              snapshot.canBuild
                ? "border-lime-300/60 bg-lime-600/30 shadow-[0_0_24px_rgba(132,204,22,0.35)] hover:bg-lime-500/40"
                : snapshot.hasShelter && snapshot.nearShelter
                  ? "border-amber-300/50 bg-amber-700/30 hover:bg-amber-600/40"
                  : "border-emerald-200/15 bg-[#07130a]/75 hover:bg-emerald-900/60"
            }`}
          >
            <div className="flex items-center gap-3">
              <kbd className="rounded-lg bg-emerald-400 px-2 py-1 text-base font-black text-emerald-950">B</kbd>
              <div className="min-w-0 flex-1">
                {!snapshot.hasShelter ? (
                  <>
                    <div className="text-sm font-bold">🛖 Construire un abri</div>
                    <div className="text-xs text-emerald-100/75">
                      Bois : {Math.min(snapshot.inventory.Bois, 5)} / 5
                      {snapshot.canBuild ? " — prêt, construis ici !" : snapshot.inventory.Bois >= 5 ? " — éloigne-toi de l'eau / du danger" : " — ramasse des branches"}
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                      <div className="h-full rounded-full bg-gradient-to-r from-lime-500 to-lime-300" style={{ width: `${Math.min(100, (snapshot.inventory.Bois / 5) * 100)}%` }} />
                    </div>
                  </>
                ) : snapshot.nearShelter ? (
                  <>
                    <div className="text-sm font-bold">🛏️🔥 S&apos;allonger sur le lit (repos)</div>
                    <div className="text-xs text-emerald-100/75">Couche-toi près du feu jusqu&apos;à l&apos;aube · G : griller la viande</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold">🛖 Ton abri</div>
                    <div className="text-xs text-emerald-100/75">
                      à {Math.round(snapshot.shelterDistance ?? 0)} m vers {snapshot.shelterHeading || "ici"} · reviens t&apos;y reposer
                    </div>
                  </>
                )}
              </div>
            </div>
          </button>

          {/* Barre d'armes */}
          <div className={`pointer-events-none absolute right-4 flex flex-col items-end gap-2 ${touchMode ? "bottom-[300px] scale-75 origin-bottom-right" : "bottom-16"}`}>
            <div className="rounded-2xl border border-emerald-200/15 bg-[#07130a]/75 px-4 py-2 text-right backdrop-blur-md">
              <div className="text-[11px] uppercase tracking-wider text-emerald-200/70">{WEAPONS[snapshot.currentWeapon].label}</div>
              <div className="text-xl font-black tabular-nums">
                {WEAPONS[snapshot.currentWeapon].ammo === "pistol"
                  ? `${snapshot.ammoPistol} × 9 mm`
                  : WEAPONS[snapshot.currentWeapon].ammo === "rifle"
                    ? `${snapshot.ammoRifle} × 5,56`
                    : WEAPONS[snapshot.currentWeapon].ammo === "shotgun"
                      ? `${snapshot.ammoShotgun} × Cal. 12`
                      : `${WEAPONS[snapshot.currentWeapon].damage} dégâts`}
              </div>
              <div className="text-[11px] text-emerald-100/60">
                {WEAPONS[snapshot.currentWeapon].kind === "ranged" ? "Clic droit : viser · Clic gauche : tirer" : "Clic gauche : frapper"} · {snapshot.kills} proies
              </div>
            </div>
            <div className="flex gap-1.5">
              {WEAPON_ORDER.map((id) => {
                const owned = snapshot.weapons.includes(id);
                const active = snapshot.currentWeapon === id;
                return (
                  <div
                    key={id}
                    className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl border text-xl backdrop-blur-md ${
                      active
                        ? "border-amber-300 bg-amber-500/25"
                        : owned
                          ? "border-emerald-200/20 bg-[#07130a]/75"
                          : "border-emerald-200/5 bg-black/30 opacity-35 grayscale"
                    }`}
                  >
                    <span>{WEAPON_ICONS[id]}</span>
                    <span className="text-[10px] font-bold text-emerald-100/80">{WEAPONS[id].slot}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-emerald-200/10 bg-[#07130a]/70 px-5 py-2 text-xs text-emerald-100/80 backdrop-blur-md ${touchMode ? "hidden" : "hidden lg:block"}`}>
            <span className="font-semibold text-emerald-50">ZQSD/WASD</span> bouger · <span className="font-semibold text-emerald-50">MAJ</span> courir · <span className="font-semibold text-emerald-50">ESPACE</span> sauter (double) · <span className="font-semibold text-emerald-50">Ctrl / clic droit</span> parer ·{" "}
            <span className="font-semibold text-emerald-50">E</span> ramasser/boire · <span className="font-semibold text-emerald-50">F</span> fruit ·{" "}
            <span className="font-semibold text-emerald-50">G</span> viande · <span className="font-semibold text-emerald-50">1-5</span> armes ·{" "}
            <span className="font-semibold text-emerald-50">I</span> inventaire · <span className="font-semibold text-emerald-50">C</span> lance ·{" "}
            <span className="font-semibold text-emerald-50">B</span> abri / dormir · <span className="font-semibold text-emerald-50">M</span> GPS ·{" "}
            <span className="font-semibold text-emerald-50">N</span> infrarouge · <span className="font-semibold text-emerald-50">O</span> tenue · <span className="font-semibold text-emerald-50">P</span> photo ·{roomCode ? <> <span className="font-semibold text-emerald-50">T</span> chat · <span className="font-semibold text-emerald-50">V</span> parler ·</> : null} <span className="font-semibold text-emerald-50">F5</span>/<span className="font-semibold text-emerald-50">F9</span> sauver/charger ·{" "}
            <span className="font-semibold text-emerald-50">Échap</span> pause
          </div>
          <div className="pointer-events-none absolute bottom-1 right-3 text-[10px] tracking-[0.2em] text-emerald-100/35">© {STUDIO}</div>

          {snapshot.nearResource && !snapshot.nearCarcass && phase === "playing" && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-6 rounded-lg bg-black/60 px-3 py-1.5 text-sm">
              <kbd className="rounded bg-emerald-400 px-1.5 py-0.5 font-bold text-emerald-950">E</kbd> Ramasser {snapshot.nearResource}
            </div>
          )}
        </>
      )}

      {dressingOpen && snapshot && (
        <Dressing
          whimsy={snapshot.whimsy}
          onWear={(id: OutfitId) => engineRef.current?.wearOutfit(id)}
          onWeave={(id: OutfitId) => engineRef.current?.weaveOutfit(id)}
          onClose={closeDressing}
        />
      )}

      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-28 -translate-x-1/2 rounded-xl border border-emerald-300/30 bg-emerald-900/85 px-4 py-2 text-sm shadow-xl backdrop-blur-md">
          {toast}
        </div>
      )}

      {/* ============ PAUSE ============ */}
      {phase === "paused" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="w-[360px] rounded-3xl border border-emerald-200/15 bg-[#07130a]/95 p-6 shadow-2xl">
            <h2 className="text-center text-2xl font-black tracking-widest">PAUSE</h2>
            <p className="mt-1 text-center text-xs text-emerald-200/60">
              {roomCode ? (
                <>
                  Salon <span className="font-mono font-bold text-sky-300">{roomCode}</span> · le jeu continue pour les autres
                </>
              ) : (
                "La forêt attend ton retour."
              )}
            </p>
            <div className="mt-5 grid gap-2">
              <button onClick={resumeGame} className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-emerald-950 transition hover:bg-emerald-400">
                Reprendre
              </button>
              <button
                onClick={() => void saveGame()}
                disabled={busy}
                className="rounded-xl border border-emerald-300/30 px-4 py-3 font-semibold transition hover:bg-emerald-500/10 disabled:opacity-50"
              >
                Sauvegarder (F5) — slot « {playerName || "Explorateur"} »
              </button>
              <button
                onClick={() => void quickLoad()}
                disabled={busy}
                className="rounded-xl border border-emerald-300/30 px-4 py-3 font-semibold transition hover:bg-emerald-500/10 disabled:opacity-50"
              >
                Charger la dernière sauvegarde (F9)
              </button>
              <button
                onClick={toggleSound}
                className="rounded-xl border border-emerald-300/30 px-4 py-3 font-semibold transition hover:bg-emerald-500/10"
              >
                {soundOn ? "🔊 Ambiance sonore : activée" : "🔇 Ambiance sonore : coupée"}
              </button>
              <button
                onClick={() => {
                  pressBuild();
                  resumeGame();
                }}
                className="rounded-xl border border-lime-300/40 bg-lime-600/15 px-4 py-3 font-semibold transition hover:bg-lime-500/25"
              >
                {snapshot?.hasShelter ? "🛖 Option B : rejoindre / dormir à l'abri" : "🛖 Option B : construire un abri (5 bois)"}
              </button>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/30 p-1 text-xs font-semibold">
                {(
                  [
                    ["auto", "Auto"],
                    ["mobile", "📱 1080p"],
                    ["hd", "🖥️ HD"],
                    ["uhd", "📺 4K"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => changeQuality(key)}
                    className={`rounded-lg px-2 py-1.5 transition ${qualityPreset === key ? "bg-emerald-500 text-emerald-950" : "text-emerald-100/70 hover:text-emerald-50"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="rounded-xl bg-black/30 p-1 text-xs font-semibold">
                <div className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-wider text-emerald-200/60">⏳ Durée d&apos;une journée (jour 14 h / nuit 10 h)</div>
                <div className="grid grid-cols-4 gap-1">
                  {[10, 20, 40, 60].map((min) => (
                    <button
                      key={min}
                      onClick={() => {
                        engineRef.current?.setDayLength(min * 60);
                        setDayMinutes(min);
                        window.localStorage.setItem("minkebe.dayMinutes", String(min));
                      }}
                      className={`rounded-lg px-2 py-1.5 transition ${dayMinutes === min ? "bg-emerald-500 text-emerald-950" : "text-emerald-100/70 hover:text-emerald-50"}`}
                    >
                      {min} min
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={toggleHunting}
                className="rounded-xl border border-emerald-300/30 px-4 py-3 font-semibold transition hover:bg-emerald-500/10"
              >
                {huntingOn ? "🏹 Chasse : autorisée (tuer les animaux)" : "🕊️ Chasse : interdite (mode pacifique)"}
              </button>
              <button onClick={backToMenu} className="rounded-xl px-4 py-3 text-sm text-emerald-200/70 transition hover:text-emerald-50">
                {roomCode ? "Quitter le salon et retourner au menu" : "Retour au menu principal"}
              </button>
            </div>
            <p className="mt-4 text-center text-[10px] tracking-[0.2em] text-emerald-100/40">{COPYRIGHT}</p>
          </div>
        </div>
      )}

      {/* ============ MORT ============ */}
      {phase === "dead" && death && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/60 backdrop-blur-sm">
          <div className="w-[420px] rounded-3xl border border-red-200/15 bg-[#140707]/95 p-6 shadow-2xl">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.4em] text-red-200/60">Fin de l&apos;expédition</p>
            <h2 className="mt-1 text-center text-2xl font-black tracking-widest text-red-200">TU AS SUCCOMBÉ</h2>
            <p className="mt-2 text-center text-sm text-red-100/80">
              Cause : <span className="font-semibold">{death.cause}</span>
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-red-100/60">Niveau atteint</dt>
              <dd className="text-right font-semibold text-amber-300">
                {snapshot ? `Niv. ${snapshot.levelProgress.level} · ${snapshot.levelProgress.levelName}` : "—"}
              </dd>
              <dt className="text-red-100/60">Temps survécu</dt>
              <dd className="text-right font-semibold tabular-nums">{formatTime(death.timeSurvived)}</dd>
              <dt className="text-red-100/60">Ressources ramassées</dt>
              <dd className="text-right font-semibold tabular-nums">{death.resourcesCollected}</dd>
              <dt className="text-red-100/60">Proies abattues</dt>
              <dd className="text-right font-semibold tabular-nums">{death.kills}</dd>
              <dt className="text-red-100/60">Lance fabriquée</dt>
              <dd className="text-right font-semibold">{death.hasSpear ? "oui" : "non"}</dd>
              <dt className="text-red-100/60">Abri construit</dt>
              <dd className="text-right font-semibold">{death.hasShelter ? "oui" : "non"}</dd>
            </dl>
            <p className="mt-3 text-center text-xs text-red-100/50">Expédition enregistrée au classement.</p>
            <p className="mt-1 text-center text-[10px] tracking-[0.2em] text-red-100/35">{COPYRIGHT}</p>
            <div className="mt-5 grid gap-2">
              <button onClick={startGame} className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-emerald-950 transition hover:bg-emerald-400">
                Nouvelle expédition
              </button>
              <button onClick={backToMenu} className="rounded-xl border border-red-200/20 px-4 py-3 font-semibold transition hover:bg-red-500/10">
                Retour au menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ CAISSE DÉMO ============ */}
      {demoSession && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[380px] rounded-3xl border border-amber-200/20 bg-[#0d0b07] p-6 shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/70">Caisse de démonstration</div>
            <h3 className="mt-1 text-xl font-black">Pass Explorateur — 2,99 €</h3>
            <p className="mt-2 text-sm text-emerald-100/70">
              Aucune clé Stripe n&apos;est configurée : ce paiement est <span className="font-bold">simulé</span>, rien ne sera débité. En production, cet écran est remplacé par la page
              sécurisée Stripe.
            </p>
            <div className="mt-4 space-y-2 rounded-xl bg-black/40 p-3 font-mono text-xs text-emerald-100/60">
              <div>Carte : 4242 4242 4242 4242</div>
              <div>Expiration : 12/34 · CVC : 123</div>
            </div>
            <div className="mt-4 grid gap-2">
              <button onClick={() => void confirmPayment(demoSession)} disabled={payBusy} className="rounded-xl bg-amber-400 px-4 py-3 font-black text-amber-950 transition hover:brightness-110 disabled:opacity-50">
                {payBusy ? "…" : "Valider le paiement (démo)"}
              </button>
              <button
                onClick={() => {
                  setDemoSession(null);
                  setPayMessage("Paiement annulé.");
                }}
                className="rounded-xl border border-emerald-200/20 px-4 py-2 text-sm text-emerald-100/70"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MENU PRINCIPAL ============ */}
      {phase === "menu" && (
        <div className="absolute inset-0 overflow-y-auto">
          {/* Photo forestière immersive fixe */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/menu-forest.jpg" alt="" className="fixed inset-0 h-full w-full object-cover" />
          <div className="fixed inset-0 bg-gradient-to-b from-emerald-950/35 via-black/40 to-[#030b06]/90" />
          {/* Feuillage latéral */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/menu-palms.jpg"
            alt=""
            className="pointer-events-none fixed -left-8 top-0 hidden h-[70%] w-[32%] object-cover opacity-90 sm:block"
            style={{ WebkitMaskImage: "linear-gradient(to right, black 35%, transparent 95%)", maskImage: "linear-gradient(to right, black 35%, transparent 95%)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/menu-palms.jpg"
            alt=""
            className="pointer-events-none fixed -right-10 bottom-0 hidden h-[55%] w-[36%] scale-x-[-1] object-cover opacity-80 sm:block"
            style={{ WebkitMaskImage: "linear-gradient(to left, black 30%, transparent 90%)", maskImage: "linear-gradient(to left, black 30%, transparent 90%)" }}
          />
          <div className="pointer-events-none fixed inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent" />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#020804]/95 via-[#020804]/65 to-transparent" />

          <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center px-6 py-10 pb-14">
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.6em] text-lime-100/90 drop-shadow">{STUDIO} présente</p>
              <h1 className="mt-2 text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)] sm:text-7xl">
                MINKÉBÉ
              </h1>
              <p className="mt-2 text-sm font-semibold uppercase tracking-[0.3em] text-emerald-50/95 drop-shadow">Aventure, style et survie au cœur de la forêt</p>
              <p className="mx-auto mt-3 max-w-md text-sm text-emerald-50/85 drop-shadow">
                Incarne Annique ou Landry dans la forêt équatoriale. Tisse des tenues, suis la rivière, construis un abri, et survis.
              </p>
              <button
                type="button"
                onClick={() => setTrailerAction({ kind: "preview" })}
                disabled={!engineReady}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/50 bg-black/35 px-5 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition hover:border-lime-200 hover:bg-white/20 disabled:opacity-50"
              >
                <span aria-hidden="true">▶</span> Voir la bande-annonce <span className="text-white/65">· 9 s</span>
              </button>
            </div>

            <div className="mt-8 w-full max-w-3xl rounded-3xl border border-white/35 bg-[#03120a]/90 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.88)] backdrop-blur-2xl">
              <div className="flex flex-wrap gap-1 rounded-xl bg-black/60 p-1.5 text-sm font-bold">
                {(
                  [
                    ["new", "Solo"],
                    ["online", "🌐 En ligne"],
                    ["load", `Sauvegardes (${saves.length})`],
                    ["ranking", "Classement"],
                    ["pass", passKey ? "★ Pass" : "★ Pass 2,99 €"],
                    ["download", "⬇️ Télécharger"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMenuTab(key)}
                    className={`flex-1 rounded-lg px-3 py-2 transition ${menuTab === key ? "bg-emerald-400 text-emerald-950 shadow" : "text-emerald-50/90 hover:bg-white/10 hover:text-white"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {menuTab === "new" && (
                <div className="mt-5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-lime-200">Nom de l&apos;explorateur (slot de sauvegarde)</label>
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value.slice(0, 40))}
                    className="mt-1.5 w-full rounded-xl border border-emerald-300/40 bg-black/65 px-4 py-2.5 font-semibold text-white placeholder-emerald-100/50 outline-none focus:border-lime-300"
                    placeholder="Explorateur"
                  />

                  <p className="mt-5 text-xs font-bold uppercase tracking-wider text-lime-200">Choisis ton personnage</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {CHARACTERS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCharacter(c.id)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          character === c.id
                            ? "border-lime-300 bg-emerald-900/85 shadow-[0_0_25px_rgba(132,204,22,0.22)]"
                            : "border-white/25 bg-[#04180e]/90 hover:border-emerald-300/60 hover:bg-[#062114]/95"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-12 w-12 shrink-0 rounded-full bg-gradient-to-br ${c.accent} shadow-lg`} />
                          <div>
                            <div className="text-lg font-black tracking-wide text-white">{c.title.toUpperCase()}</div>
                            <div className="text-xs font-semibold text-lime-200">{c.origin}</div>
                          </div>
                        </div>
                        <p className="mt-3 text-sm font-medium leading-relaxed text-white">{c.description}</p>
                      </button>
                    ))}
                  </div>

                  {/* Blocs sous les profils : fond sombre opaque et texte très net */}
                  <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-emerald-300/35 bg-[#021209]/95 px-4 py-3.5 shadow-lg">
                    <div>
                      <div className="text-base font-black text-white">🏹 Chasse : tuer les animaux</div>
                      <div className="mt-1 text-sm font-medium leading-relaxed text-white/95">
                        Potamochères, céphalophes bleus et buffles de forêt ont des points de vie. Abats-les, dépèce la carcasse (<kbd className="rounded bg-emerald-800 px-1.5 py-0.5 font-mono text-xs font-bold text-lime-200">E</kbd>) et grille la viande au feu de ton abri.
                        <span className="mt-1 block text-xs font-bold text-lime-300">Décoché : mode pacifique, les animaux sont invulnérables.</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={huntingOn}
                      onChange={toggleHunting}
                      className="h-6 w-6 shrink-0 accent-lime-400"
                    />
                  </label>

                  <div className="mt-4 rounded-2xl border border-emerald-300/35 bg-[#021209]/95 px-4 py-3.5 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-black text-white">🖥️ Qualité graphique</div>
                        <div className="mt-1 text-sm font-medium text-white/95">
                          Détecté : <span className="font-bold text-lime-300">{detectedPreset === "uhd" ? "écran 4K (HDMI)" : detectedPreset === "mobile" ? "téléphone / tablette (1080p)" : "écran HD"}</span> · résolution adaptative selon les performances
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl bg-black/75 p-1.5 text-xs font-bold">
                      {(
                        [
                          ["auto", "Auto"],
                          ["mobile", "📱 1080p"],
                          ["hd", "🖥️ HD"],
                          ["uhd", "📺 4K"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => changeQuality(key)}
                          className={`rounded-lg px-2 py-2 transition ${qualityPreset === key ? "bg-lime-400 text-emerald-950 shadow" : "text-white hover:bg-white/15"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bande-son & import depuis /Users/m12020/Downloads */}
                  <MusicPlayer
                    inGame={false}
                    playing={false}
                    soundOn={soundOn}
                    onNotify={showToast}
                  />

                  <button
                    onClick={startGame}
                    disabled={!engineReady}
                    className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-lime-400 px-4 py-4 text-lg font-black tracking-wider text-emerald-950 shadow-xl transition hover:brightness-110 disabled:opacity-50"
                  >
                    {engineReady ? "COMMENCER L'AVENTURE" : "CHARGEMENT DE LA FORÊT ET DES PERSONNAGES…"}
                  </button>

                  <div className="mt-3.5 rounded-2xl border border-emerald-300/35 bg-[#020f08]/95 px-4 py-3 text-center text-xs font-semibold leading-relaxed text-white shadow-lg">
                    <span className="font-black uppercase tracking-wider text-lime-300">Commandes : </span>
                    <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-lime-200">ZQSD / WASD</kbd> bouger ·{" "}
                    <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-lime-200">MAJ</kbd> courir ·{" "}
                    <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-lime-200">ESPACE</kbd> sauter haut (×2) / esquiver ·{" "}
                    <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-lime-200">Souris</kbd> regarder ·{" "}
                    <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-lime-200">Clic G</kbd> attaquer ·{" "}
                    <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-lime-200">Clic D / Ctrl</kbd> parer ou viser ·{" "}
                    <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-lime-200">1-6</kbd> armes ·{" "}
                    <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-lime-200">K</kbd> musique
                    {touchMode ? " · Sur téléphone : joystick + boutons tactiles" : ""}
                  </div>
                </div>
              )}

              {menuTab === "online" && (
                <div className="mt-5">
                  <p className="rounded-2xl border border-emerald-300/30 bg-[#021209]/95 p-4 text-sm font-medium leading-relaxed text-white shadow-md">
                    Joue en groupe (jusqu&apos;à <span className="font-bold text-lime-300">8</span> explorateurs) dans la même forêt : même graine de monde, ressources partagées, animaux et
                    cycle jour/nuit synchronisés par l&apos;hôte, abris visibles par tous, chat d&apos;équipe (<kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-xs text-lime-200">T</kbd>) et <span className="font-bold text-lime-300">discussion vocale</span> (micro, push-to-talk <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-xs text-lime-200">V</kbd>, volume selon la distance,
                    lecture vocale des messages et dictée). Les coéquipiers apparaissent sur le GPS.
                  </p>
                  <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-lime-200">Ton pseudo</label>
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
                    className="mt-1.5 w-full rounded-xl border border-emerald-300/40 bg-black/65 px-4 py-2.5 font-semibold text-white outline-none focus:border-lime-300"
                    placeholder="Explorateur"
                  />
                  <p className="mt-4 text-xs font-bold uppercase tracking-wider text-lime-200">Personnage</p>
                  <div className="mt-2 flex gap-2">
                    {CHARACTERS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCharacter(c.id)}
                        className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
                          character === c.id
                            ? "border-lime-300 bg-emerald-900/85 shadow"
                            : "border-white/25 bg-[#04180e]/90 hover:border-emerald-300/60"
                        }`}
                      >
                        <div className={`h-9 w-9 shrink-0 rounded-full bg-gradient-to-br ${c.accent}`} />
                        <div>
                          <div className="text-sm font-black text-white">{c.title}</div>
                          <div className="text-xs font-semibold text-lime-200">{c.origin}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-emerald-300/35 bg-[#021209]/95 p-4 shadow-lg">
                      <div className="text-base font-black text-white">Créer un salon</div>
                      <p className="mt-1 text-sm font-medium text-white/95">Tu deviens l&apos;hôte : un code à 5 lettres est généré à partager avec ton groupe.</p>
                      <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-lime-200">
                        <input type="checkbox" checked={huntingOn} onChange={toggleHunting} className="h-4 w-4 accent-lime-400" /> Chasse autorisée dans ce salon
                      </label>
                      <button
                        onClick={() => void startOnline("create")}
                        disabled={!engineReady || netBusy}
                        className="mt-3 w-full rounded-xl bg-gradient-to-r from-sky-400 to-emerald-400 px-4 py-3 font-black tracking-wider text-emerald-950 transition hover:brightness-110 disabled:opacity-50"
                      >
                        {netBusy ? "…" : "CRÉER ET JOUER"}
                      </button>
                    </div>
                    <div className="rounded-2xl border border-emerald-300/35 bg-[#021209]/95 p-4 shadow-lg">
                      <div className="text-base font-black text-white">Rejoindre un salon</div>
                      <p className="mt-1 text-sm font-medium text-white/95">Entre le code reçu de l&apos;hôte.</p>
                      <input
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                        placeholder="CODE"
                        className="mt-3 w-full rounded-xl border border-emerald-300/40 bg-black/70 px-4 py-2.5 text-center font-mono text-2xl font-bold tracking-[0.4em] text-white outline-none focus:border-lime-300"
                      />
                      <button
                        onClick={() => void startOnline("join")}
                        disabled={!engineReady || netBusy || joinCode.length < 5}
                        className="mt-3 w-full rounded-xl bg-emerald-400 px-4 py-3 font-black tracking-wider text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
                      >
                        {netBusy ? "…" : "REJOINDRE"}
                      </button>
                    </div>
                  </div>
                  {netError && <p className="mt-3 rounded-xl border border-red-300/30 bg-red-900/30 px-3 py-2 text-sm text-red-200">{netError}</p>}
                  <p className="mt-3 rounded-xl border border-emerald-200/15 bg-black/50 px-3 py-2 text-center text-xs font-medium text-emerald-50/90">
                    Chaque joueur doit ouvrir le jeu dans son propre navigateur et entrer le même code. Les salons inactifs se ferment automatiquement.
                  </p>
                </div>
              )}

              {menuTab === "load" && (
                <div className="mt-5">
                  {saves.length === 0 ? (
                    <p className="py-8 text-center text-sm text-emerald-100/60">Aucune sauvegarde. Lance une partie puis appuie sur F5.</p>
                  ) : (
                    <ul className="space-y-2">
                      {saves.map((row) => (
                        <li key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/10 bg-black/20 p-4">
                          <div className="min-w-0">
                            <div className="truncate font-bold">
                              {row.slotName} <span className="text-xs font-normal text-emerald-100/60">· {row.character}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-emerald-100/60">
                              <span className="font-semibold text-amber-300">
                                🏅 Niv. {levelFromXp(row.xp ?? 0)} · {levelInfo(levelFromXp(row.xp ?? 0)).name}
                              </span>
                              {" · "}
                              ❤ {Math.round(row.health)} · 🍈 {Math.round(row.hunger)} · 💧 {Math.round(row.thirst)} · {formatTime(row.timeSurvived)} survécues ·{" "}
                              {row.inventory.Fruits + row.inventory.Bois + row.inventory.Pierres} objets
                              {row.hasSpear ? " · 🗡" : ""}
                              {row.hasShelter ? " · 🛖" : ""}
                              {row.hasGps ? " · 🛰️" : ""}
                              {row.hasNightVision ? " · 🥽" : ""}
                            </div>
                            <div className="text-[11px] text-emerald-100/40">{new Date(row.updatedAt).toLocaleString("fr-FR")}</div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              onClick={() => loadSave(row)}
                              disabled={!engineReady || row.health <= 0}
                              className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
                            >
                              Continuer
                            </button>
                            <button
                              onClick={() => void deleteSave(row.id)}
                              className="rounded-xl border border-red-300/20 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/10"
                            >
                              ✕
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {menuTab === "pass" && (
                <div className="mt-5">
                  <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-500/15 to-emerald-900/20 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80">Soutenir ONOKO-CRÉATIONS</div>
                        <h3 className="mt-1 text-2xl font-black text-amber-100">★ Pass Explorateur</h3>
                        <p className="mt-1 text-sm text-emerald-100/80">Un petit achat unique, sans abonnement. Le jeu reste entièrement jouable gratuitement.</p>
                      </div>
                      <div className="shrink-0 rounded-2xl bg-amber-400 px-4 py-2 text-center text-amber-950">
                        <div className="text-2xl font-black leading-none">2,99 €</div>
                        <div className="text-[10px] font-semibold uppercase">une fois</div>
                      </div>
                    </div>
                    <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                      <li className="rounded-xl bg-black/25 px-3 py-2">💾 <span className="font-semibold">Sauvegardes illimitées</span><div className="text-xs text-emerald-100/60">au lieu de {FREE_SAVE_SLOTS}</div></li>
                      <li className="rounded-xl bg-black/25 px-3 py-2">🏅 <span className="font-semibold">Badge ★ doré</span><div className="text-xs text-emerald-100/60">dans le classement</div></li>
                      <li className="rounded-xl bg-black/25 px-3 py-2">🗡️ <span className="font-semibold">Machette au départ</span><div className="text-xs text-emerald-100/60">pour bien commencer</div></li>
                    </ul>

                    {passKey ? (
                      <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-900/30 px-4 py-3 text-sm">
                        <div className="font-bold text-emerald-100">✅ Pass actif sur cet appareil</div>
                        <div className="mt-1 font-mono text-xs text-emerald-200/80">Clé : {passKey}</div>
                        <div className="mt-1 text-xs text-emerald-100/60">Note cette clé pour restaurer le Pass sur un autre appareil. Merci pour ton soutien !</div>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {payProviders.includes("stripe") && (
                          <button
                            type="button"
                            onClick={() => void startCheckout("stripe")}
                            disabled={payBusy}
                            className="rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 px-4 py-3.5 text-left text-amber-950 shadow-lg transition hover:brightness-110 disabled:opacity-50"
                          >
                            <div className="text-base font-black">Carte bancaire</div>
                            <div className="font-mono text-lg tracking-wide">2,99 €</div>
                            <div className="text-[10px] opacity-80">Stripe · Apple Pay · Google Pay</div>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void startCheckout("paypal")}
                          disabled={payBusy}
                          className="rounded-2xl bg-[#ffc439] px-4 py-3.5 text-left text-[#003087] shadow-lg transition hover:brightness-105 disabled:opacity-50"
                        >
                          <div className="text-base font-black">
                            <span className="italic">Pay</span>
                            <span className="italic text-[#0070ba]">Pal</span>
                          </div>
                          <div className="font-mono text-lg tracking-wide">2,99 €</div>
                          <div className="text-[10px] opacity-80">Compte PayPal ou carte via PayPal</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMmMethod("airtel")}
                          className="rounded-2xl bg-[#ed1c24] px-4 py-3.5 text-left text-white shadow-lg transition hover:brightness-110"
                        >
                          <div className="text-base font-black">Airtel Money Gabon</div>
                          <div className="font-mono text-lg tracking-wide">077 29 70 69</div>
                          <div className="text-[10px] opacity-80">2 000 F CFA · code USSD *150#</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMmMethod("moov")}
                          className="rounded-2xl bg-[#0066b3] px-4 py-3.5 text-left text-white shadow-lg transition hover:brightness-110"
                        >
                          <div className="text-base font-black">Moov Money Gabon</div>
                          <div className="font-mono text-lg tracking-wide">062 47 77 89</div>
                          <div className="text-[10px] opacity-80">2 000 F CFA · code USSD *155#</div>
                        </button>
                      </div>
                    )}
                    {mmMethod && !passKey && (
                      <div className="mt-4 rounded-2xl border border-amber-200/30 bg-black/40 p-4">
                        <div className="text-sm font-bold text-amber-100">
                          {mmMethod === "airtel" ? "Airtel Money Gabon — 077 29 70 69" : "Moov Money Gabon — 062 47 77 89"}
                        </div>
                        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-emerald-100/80">
                          <li>
                            Envoie <span className="font-black text-amber-200">2 000 F CFA</span> (Pass 2,99 €) au numéro{" "}
                            <span className="font-mono font-bold text-white">{mmMethod === "airtel" ? "077297069" : "062477789"}</span>
                            {mmMethod === "airtel" ? " (compose *150#)" : " (compose *155#)"}
                          </li>
                          <li>Référence / motif : <span className="font-mono">MINKEBE</span></li>
                          <li>Indique le numéro qui a envoyé l&apos;argent, puis confirme.</li>
                        </ol>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold"
                            onClick={() => void navigator.clipboard.writeText(mmMethod === "airtel" ? "077297069" : "062477789")}
                          >
                            Copier le numéro
                          </button>
                        </div>
                        <input
                          value={mmPhone}
                          onChange={(e) => setMmPhone(e.target.value.replace(/\D/g, "").slice(0, 12))}
                          placeholder="Ton numéro (ex. 077xxxxxx)"
                          className="mt-3 w-full rounded-xl border border-emerald-200/20 bg-black/30 px-4 py-2 font-mono text-emerald-50 outline-none focus:border-emerald-400"
                        />
                        <input
                          value={mmRef}
                          onChange={(e) => setMmRef(e.target.value.slice(0, 40))}
                          placeholder="ID de transaction SMS (facultatif)"
                          className="mt-2 w-full rounded-xl border border-emerald-200/20 bg-black/30 px-4 py-2 text-emerald-50 outline-none focus:border-emerald-400"
                        />
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void confirmMobileMoney()}
                            disabled={payBusy || mmPhone.length < 8}
                            className="flex-1 rounded-xl bg-amber-400 px-4 py-2.5 font-black text-amber-950 disabled:opacity-40"
                          >
                            {payBusy ? "…" : "J'ai envoyé le paiement"}
                          </button>
                          <button type="button" onClick={() => setMmMethod(null)} className="rounded-xl border border-white/20 px-4 py-2 text-sm">
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                    <p className="mt-3 rounded-xl border border-amber-200/20 bg-black/55 px-3 py-2 text-center text-xs font-medium text-amber-50/95">
                      PayPal, Airtel Money Gabon (<span className="font-mono font-bold text-white">077 29 70 69</span>) ou Moov Money Gabon (<span className="font-mono font-bold text-white">062 47 77 89</span>) · Montant : <span className="font-bold text-amber-300">2,99 € / 2 000 F CFA</span>.
                    </p>
                    {payMessage && <p className="mt-3 rounded-xl border border-amber-300/30 bg-black/30 px-3 py-2 text-sm text-amber-100">{payMessage}</p>}
                  </div>

                  {!passKey && (
                    <div className="mt-4 rounded-2xl border border-emerald-200/10 bg-black/20 p-4">
                      <div className="text-sm font-bold">Déjà acheté ? Restaurer avec ta clé</div>
                      <div className="mt-2 flex gap-2">
                        <input
                          value={restoreKey}
                          onChange={(e) => setRestoreKey(e.target.value.toUpperCase().slice(0, 18))}
                          placeholder="MKB-XXXX-XXXX-XXXX"
                          className="flex-1 rounded-xl border border-emerald-200/20 bg-black/30 px-4 py-2 font-mono text-emerald-50 outline-none focus:border-emerald-400"
                        />
                        <button onClick={() => void restorePass()} disabled={payBusy || restoreKey.length < 18} className="rounded-xl bg-emerald-500 px-4 font-bold text-emerald-950 disabled:opacity-40">
                          Restaurer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

               <div className={menuTab === "download" ? "mt-5" : "hidden"} aria-hidden={menuTab !== "download"}>
                   <div className="rounded-2xl border border-sky-200/25 bg-gradient-to-br from-sky-500/15 to-emerald-900/20 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200/80">Jouer partout</div>
                        <h3 className="mt-1 text-2xl font-black text-sky-50">⬇️ Télécharger Minkébé</h3>
                        <p className="mt-1 text-sm text-emerald-100/80">
                          Installe le jeu sur ton appareil en un clic (PWA), ou récupère le paquet de ta plateforme pour en faire une application native. Tous les paquets se
                          connectent à ce serveur : <span className="font-mono text-sky-200">{serverUrl || "…"}</span>
                        </p>
                      </div>
                      <div className="shrink-0 rounded-2xl border border-white/10 bg-black/30 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icons/icon-192.png" alt="Icône Minkébé" width={72} height={72} className="rounded-xl" />
                      </div>
                    </div>

                    {/* Installation directe (PWA) */}
                    <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-900/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-emerald-50">📲 Installer maintenant (sans téléchargement)</div>
                          <div className="text-xs text-emerald-100/70">
                            Application plein écran avec icône, lancement rapide et cache des textures — Windows, macOS, Linux (Chrome / Edge), Android (Chrome), iPhone / iPad (Safari).
                          </div>
                        </div>
                        {installed ? (
                          <span className="rounded-xl bg-emerald-500/30 px-4 py-2 text-sm font-bold text-emerald-100">✅ Déjà installé</span>
                        ) : installPrompt ? (
                          <button onClick={() => void installApp()} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-emerald-950 hover:bg-emerald-400">
                            Installer l&apos;application
                          </button>
                        ) : (
                          <div className="max-w-xs text-right text-[11px] text-emerald-100/70">
                            Android / Chrome : menu ⋮ → « Installer l&apos;application »<br />
                            iPhone / iPad : Partager ⬆︎ → « Sur l&apos;écran d&apos;accueil »<br />
                            Ordinateur : icône ⊕ dans la barre d&apos;adresse
                          </div>
                        )}
                      </div>
                    </div>

                     <DownloadsPanel onWatchTrailer={() => setTrailerAction({ kind: "preview" })} />
                     <p className="mt-3 rounded-xl border border-sky-200/20 bg-black/55 px-3 py-2 text-center text-xs font-medium text-sky-50/95">
                       Chaque ZIP contient un LISEZ-MOI et les sources nécessaires pour construire le paquet natif correspondant. Le paquet « Serveur » contient le code source à héberger avec PostgreSQL.
                     </p>
                   </div>
                 </div>
 
               {menuTab === "ranking" && (
                <div className="mt-5">
                  {expeditions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-emerald-100/60">Aucune expédition terminée pour le moment.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-left text-[11px] uppercase tracking-wider text-emerald-200/60">
                        <tr>
                          <th className="pb-2">#</th>
                          <th className="pb-2">Explorateur</th>
                          <th className="pb-2">Temps</th>
                          <th className="pb-2">Ressources</th>
                          <th className="pb-2">Proies</th>
                          <th className="pb-2">Fin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expeditions.map((e, i) => (
                          <tr key={e.id} className="border-t border-emerald-200/10">
                            <td className="py-2 font-bold text-emerald-300">{i + 1}</td>
                            <td className="py-2">
                              {e.playerName.endsWith(" ★") ? (
                                <>
                                  <span className="text-amber-200">{e.playerName.slice(0, -2)}</span> <span className="text-amber-300" title="Pass Explorateur">★</span>
                                </>
                              ) : (
                                e.playerName
                              )}{" "}
                              <span className="text-xs text-emerald-100/50">· {e.character}</span>
                              {e.craftedSpear ? " 🗡" : ""}
                              {e.builtShelter ? " 🛖" : ""}
                            </td>
                            <td className="py-2 tabular-nums">{formatTime(e.timeSurvived)}</td>
                            <td className="py-2 tabular-nums">{e.resourcesCollected}</td>
                            <td className="py-2 tabular-nums">
                              {e.kills ?? 0}
                              {(e.weaponsFound ?? []).includes("m16") ? " 🎯" : (e.weaponsFound ?? []).includes("pistolet") ? " 🔫" : ""}
                            </td>
                            <td className="py-2 text-xs text-emerald-100/60">{e.causeOfDeath}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            <footer className="mt-6 w-full max-w-3xl rounded-2xl border border-white/25 bg-[#031008]/85 px-5 py-3.5 text-center shadow-[0_12px_36px_rgba(0,0,0,0.75)] backdrop-blur-md">
              <p className="text-sm font-black tracking-[0.22em] text-white">{COPYRIGHT}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs font-medium text-emerald-50/95">
                <span>Version {GAME_VERSION}</span>
                <span className="text-emerald-300/60">•</span>
                <span>Création originale {STUDIO}</span>
                <span className="text-emerald-300/60">•</span>
                <a
                  href="/admin"
                  className="inline-flex items-center gap-1.5 rounded-full border border-lime-300/50 bg-lime-400/20 px-3 py-1 font-bold text-lime-200 transition hover:bg-lime-300 hover:text-emerald-950"
                >
                  ⚙️ Espace administrateur
                </a>
              </div>
            </footer>
           </div>
         </div>
       )}

       {trailerAction && (
         <GameTrailer
           previewOnly={trailerAction.kind === "preview"}
           onEnter={enterAfterTrailer}
           onClose={() => setTrailerAction(null)}
         />
       )}
     </div>
   );
}
