// © ONOKO-CRÉATIONS — Tous droits réservés.

// =========================================================
// CONFIGURATION DE LA SCENE 3D
// Parametres de rendu lus par le moteur (src/game/engine.ts).
// Modifie ces valeurs pour ajuster l'ambiance sans toucher au moteur.
// =========================================================

export interface SceneConfig {
  /** Exposition globale (tone mapping ACES). 1.0 = neutre, >1 plus lumineux */
  exposure: number;
  /** Densité de la brume exponentielle (0.005 léger … 0.02 épais) */
  fogDensity: number;
  /** Couleurs de la brume / fond selon le moment (hex) */
  fog: { day: number; dusk: number; night: number };
  /** Ciel en dôme : zénith, horizon (jour / crépuscule / nuit) */
  sky: {
    dayTop: number;
    dayHorizon: number;
    duskTop: number;
    duskHorizon: number;
    nightTop: number;
    nightHorizon: number;
  };
  /** Lumières */
  light: {
    sunColor: number;
    sunDusk: number;
    moon: number;
    sunIntensity: number; // multiplicateur
    hemiSky: number;
    hemiGround: number;
    hemiIntensity: number; // multiplicateur
    envIntensity: number; // reflets d'environnement (personnages / métaux)
  };
  /** Style de rendu de la nature : "toon" (cel-shading façon Nikki) ou "pbr" (réaliste) */
  natureStyle: "toon" | "pbr";
  /** Saturation appliquée aux matériaux toon de la végétation */
  toonSaturation: number;
  /** Lucioles la nuit */
  fireflies: { mobile: number; desktop: number };
  /** Particules de poussière / pollen (multiplicateur du profil qualité) */
  dustMultiplier: number;
}

export const SCENE_CONFIG: SceneConfig = {
  // Palette naturaliste désaturée, avec des ombres profondes pour une ambiance survival horror.
  exposure: 0.98,
  fogDensity: 0.0078,
  fog: { day: 0x59634f, dusk: 0x80553f, night: 0x080d12 },
  sky: {
    dayTop: 0x29404a,
    dayHorizon: 0x89907a,
    duskTop: 0x34333a,
    duskHorizon: 0x9a6043,
    nightTop: 0x070b12,
    nightHorizon: 0x182027,
  },
  light: {
    sunColor: 0xe7dfc8,
    sunDusk: 0xc8794e,
    moon: 0x8392a5,
    sunIntensity: 1.0,
    hemiSky: 0x879486,
    hemiGround: 0x30352b,
    hemiIntensity: 0.84,
    envIntensity: 0.42,
  },
  natureStyle: "pbr",
  toonSaturation: 1.05,
  fireflies: { mobile: 120, desktop: 260 },
  dustMultiplier: 1.0,
};
