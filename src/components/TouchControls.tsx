"use client";

// © ONOKO-CRÉATIONS — Tous droits réservés.
import { useEffect, useRef, useState } from "react";
import type { MinkebeGame } from "@/game/engine";

interface Props {
  engine: MinkebeGame | null;
  ranged: boolean;
  aiming: boolean;
  canInteract: boolean;
  gpsOn: boolean;
  nightVisionOn: boolean;
  onPause: () => void;
}

export default function TouchControls({ engine, ranged, aiming, canInteract, gpsOn, nightVisionOn, onPause }: Props) {
  const stickRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const stickId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerId === stickId.current && stickRef.current) {
        const rect = stickRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const r = rect.width / 2;
        let dx = (e.clientX - cx) / r;
        let dy = (e.clientY - cy) / r;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          dx /= len;
          dy /= len;
        }
        setKnob({ x: dx, y: dy, active: true });
        engine?.setTouchMove(dx, dy);
      } else if (e.pointerId === lookId.current) {
        const dx = e.clientX - lookLast.current.x;
        const dy = e.clientY - lookLast.current.y;
        lookLast.current = { x: e.clientX, y: e.clientY };
        engine?.applyTouchLook(dx, dy);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === stickId.current) {
        stickId.current = null;
        setKnob({ x: 0, y: 0, active: false });
        engine?.setTouchMove(0, 0);
      }
      if (e.pointerId === lookId.current) lookId.current = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      engine?.setTouchMove(0, 0);
      engine?.touchAction("attackEnd");
      engine?.touchAction("blockEnd");
      engine?.touchAction("runEnd");
    };
  }, [engine]);

  const button =
    "touch-action-button pointer-events-auto flex h-[clamp(2.35rem,8vh,3.25rem)] w-[clamp(2.35rem,8vh,3.25rem)] touch-none select-none flex-col items-center justify-center rounded-full border border-white/25 bg-black/65 text-xl leading-none text-white shadow-lg backdrop-blur-md active:scale-95 active:bg-emerald-600/70";
  const label = "mt-0.5 max-w-full truncate text-[8px] font-bold leading-none tracking-wide text-white/90";
  const press = (action: Parameters<MinkebeGame["touchAction"]>[0]) => () => engine?.touchAction(action);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none touch-none" aria-label="Commandes tactiles du jeu">
      <div
        className="pointer-events-auto absolute bottom-0 right-0 top-0 w-[48%] touch-none"
        aria-label="Glisser pour regarder autour de soi"
        onPointerDown={(e) => {
          if (lookId.current !== null) return;
          lookId.current = e.pointerId;
          lookLast.current = { x: e.clientX, y: e.clientY };
        }}
      />

      <div
        ref={stickRef}
        className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] h-[clamp(6rem,25vw,8.5rem)] w-[clamp(6rem,25vw,8.5rem)] touch-none rounded-full border border-white/25 bg-black/40 shadow-xl backdrop-blur-sm"
        onPointerDown={(e) => {
          if (stickId.current !== null) return;
          e.preventDefault();
          stickId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect();
          const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
          const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
          const len = Math.max(1, Math.hypot(dx, dy));
          const x = dx / len;
          const y = dy / len;
          setKnob({ x, y, active: true });
          engine?.setTouchMove(x, y);
        }}
      >
        <div
          className={`absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35 shadow-md ${knob.active ? "bg-emerald-400/75" : "bg-white/35"}`}
          style={{ transform: `translate(calc(-50% + ${knob.x * 28}px), calc(-50% + ${knob.y * 28}px))` }}
        />
        <span className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-white/75">pousser = courir</span>
      </div>

      <div
        className="mobile-controls-panel pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] grid grid-cols-3 gap-1.5 sm:gap-2"
        aria-label="Actions du jeu"
      >
        <button className={button} onPointerDown={press("weapon")} aria-label="Changer d'arme">
          🔁<span className={label}>ARME</span>
        </button>
        {ranged ? (
          <button className={`${button} ${aiming ? "border-amber-300 bg-amber-600/70" : ""}`} onPointerDown={press("aimToggle")} aria-label={aiming ? "Arrêter de viser" : "Viser"}>
            🎯<span className={label}>{aiming ? "VISÉE" : "VISER"}</span>
          </button>
        ) : (
          <button className={`${button} ${canInteract ? "border-emerald-300" : ""}`} onPointerDown={press("interact")} aria-label="Ramasser ou interagir">
            ✋<span className={label}>PRENDRE</span>
          </button>
        )}
        <button
          className={`${button} touch-fire-button !h-[clamp(2.8rem,9vh,3.7rem)] !w-[clamp(2.8rem,9vh,3.7rem)] border-red-300/60 bg-red-800/80 text-2xl`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            engine?.touchAction("attackStart");
          }}
          onPointerUp={press("attackEnd")}
          onPointerCancel={press("attackEnd")}
          aria-label={ranged ? "Tirer avec l'arme sélectionnée" : "Frapper avec l'arme sélectionnée"}
        >
          {ranged ? "🔫" : "🗡️"}
          <span className={`${label} text-[9px]`}>{ranged ? "TIRER" : "FRAPPER"}</span>
        </button>

        <button className={`${button} ${canInteract ? "animate-pulse border-emerald-300 bg-emerald-700/60" : ""}`} onPointerDown={press("interact")} aria-label="Ramasser ou interagir">
          ✋<span className={label}>ACTION</span>
        </button>
        <button
          className={`${button} border-amber-300/40 bg-amber-900/60`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            engine?.touchAction("blockStart");
          }}
          onPointerUp={press("blockEnd")}
          onPointerCancel={press("blockEnd")}
          aria-label="Maintenir pour parer"
        >
          🛡️<span className={label}>PARER</span>
        </button>
        <button className={`${button} border-sky-300/50 bg-sky-800/70`} onPointerDown={press("jump")} aria-label="Sauter">
          ⤴️<span className={label}>SAUT</span>
        </button>

        <button className={button} onPointerDown={press("eatFruit")} aria-label="Manger un fruit">
          🍈<span className={label}>FRUIT</span>
        </button>
        <button className={button} onPointerDown={press("eatMeat")} aria-label="Manger de la viande">
          🍖<span className={label}>VIANDE</span>
        </button>
        <button className={button} onPointerDown={press("build")} aria-label="Construire un abri ou se reposer">
          🛖<span className={label}>ABRI</span>
        </button>

        <button className={button} onPointerDown={press("spear")} aria-label="Fabriquer une lance">
          🪃<span className={label}>LANCE</span>
        </button>
        <button className={`${button} ${gpsOn ? "border-sky-300/60 bg-sky-900/60" : ""}`} onPointerDown={press("gps")} aria-label="Activer ou désactiver le GPS">
          🧭<span className={label}>GPS</span>
        </button>
        <button className={`${button} ${nightVisionOn ? "border-lime-300/60 bg-lime-900/60" : ""}`} onPointerDown={press("nightVision")} aria-label="Activer ou désactiver la vision nocturne">
          🌙<span className={label}>VISION</span>
        </button>

        <button className={button} onPointerDown={press("inventory")} aria-label="Ouvrir ou fermer l'inventaire">
          🎒<span className={label}>SAC</span>
        </button>
        <button className={button} onPointerDown={press("outfit")} aria-label="Changer de tenue">
          👕<span className={label}>TENUE</span>
        </button>
        <button
          className={button}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            engine?.touchAction("runStart");
          }}
          onPointerUp={press("runEnd")}
          onPointerCancel={press("runEnd")}
          aria-label="Maintenir pour courir"
        >
          🏃<span className={label}>COURIR</span>
        </button>
      </div>

      <button
        className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/65 text-lg text-white shadow-lg backdrop-blur-md"
        onPointerDown={onPause}
        aria-label="Mettre en pause"
      >
        ⏸
      </button>
    </div>
  );
}
