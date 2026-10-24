"use client";

// © ONOKO-CRÉATIONS — Tous droits réservés.
//
// =========================================================
// SCENE — point d'entrée de la scène 3D de Minkébé
// =========================================================
//
// Où modifier quoi :
//  - Ambiance de rendu (exposition, brume, ciel, lumières, style toon/PBR,
//    lucioles, poussière)            -> src/game/sceneConfig.ts  (SCENE_CONFIG)
//  - Monde 3D, gameplay, physique, animaux, cours d'eau, cycle jour/nuit
//                                     -> src/game/engine.ts (classe MinkebeGame)
//  - Personnages réalistes (modèles, matériaux PBR, regard, respiration)
//                                     -> src/game/characters.ts
//  - Tenues et pouvoirs                -> src/game/outfits.ts
//  - Armes                             -> src/game/weapons.ts
//  - Rivière / affluent (shader d'eau) -> src/game/water.ts
//  - Collectibles, ciel, cel-shading   -> src/game/whimsy.ts
//  - GPS / lunettes IR                 -> src/game/gadgets.ts
//  - Multijoueur / voix                -> src/game/net.ts, src/game/voice.ts
//  - Interface (menus, HUD, dressing)  -> src/components/MinkebeGame.tsx
//
// Ce composant monte le jeu (canvas WebGL + interface) et expose la
// configuration de scène pour pouvoir la surcharger à l'exécution.

import { useEffect } from "react";
import MinkebeGame from "./MinkebeGame";
import { SCENE_CONFIG, type SceneConfig } from "@/game/sceneConfig";

export interface SceneProps {
  /** Surcharges ponctuelles de la configuration de scène (fusionnées avant le montage du moteur). */
  config?: Partial<SceneConfig>;
}

export default function Scene({ config }: SceneProps) {
  // Les surcharges sont appliquées de façon synchrone avant le premier rendu du moteur :
  // SCENE_CONFIG est un singleton lu par le moteur à la construction et à chaque image.
  if (config) Object.assign(SCENE_CONFIG, config);

  useEffect(() => {
    // Expose la configuration dans la console pour les réglages en direct :
    //   window.MINKEBE_SCENE.exposure = 1.4
    (window as unknown as { MINKEBE_SCENE?: SceneConfig }).MINKEBE_SCENE = SCENE_CONFIG;
  }, []);

  return <MinkebeGame />;
}

export { SCENE_CONFIG };
export type { SceneConfig };
