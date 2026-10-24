// © ONOKO-CRÉATIONS — Tous droits réservés.
import * as THREE from "three";

// =========================================================
// TENUES (style Infinity Nikki) : chaque tenue a une capacite
//  - Explo (depart)       : rien de special, look brousse
//  - Plume d'Ivindo       : planer (saut maintenu)
//  - Nenuphar             : flotter / courir sur l'eau
//  - Murmure des Betes    : apprivoiser les animaux (ils suivent)
//  - Lueur d'Okoume       : halo de lumiere la nuit, attire les lucioles
//  - Purificatrice        : purifie les zones sombres (bonus de style)
//  - Reine du Carnaval    : tenue d'apparat (bonus de style x2)
// =========================================================

export type OutfitId = "explo" | "plume" | "nenuphar" | "murmure" | "lueur" | "purificatrice" | "carnaval";
export type OutfitAbility = "none" | "glide" | "float" | "tame" | "glow" | "purify" | "charm";

export interface OutfitDef {
  id: OutfitId;
  name: string;
  tagline: string;
  ability: OutfitAbility;
  abilityLabel: string;
  primary: number;
  secondary: number;
  accent: number;
  glow: number;
  skirt: boolean;
  cape: boolean;
  wings: boolean;
  crown: boolean;
  /** Fils de Rêve nécessaires pour la tisser */
  threadCost: number;
  /** Pièces de style requises en plus */
  requires: { fleurs?: number; plumes?: number; perles?: number };
  styleScore: number;
}

export const OUTFITS: Record<OutfitId, OutfitDef> = {
  explo: {
    id: "explo",
    name: "Tenue d'Exploration",
    tagline: "Toile kaki, foulard coloré : prête pour la brousse.",
    ability: "none",
    abilityLabel: "Aucune capacité",
    primary: 0xb8a66a,
    secondary: 0x4a5a3a,
    accent: 0xe0603a,
    glow: 0x000000,
    skirt: false,
    cape: false,
    wings: false,
    crown: false,
    threadCost: 0,
    requires: {},
    styleScore: 10,
  },
  plume: {
    id: "plume",
    name: "Plume d'Ivindo",
    tagline: "Voile de plumes de touraco : maintiens le saut pour planer.",
    ability: "glide",
    abilityLabel: "Planer (maintenir Espace en l'air)",
    primary: 0x3fb8c9,
    secondary: 0x1d6f8a,
    accent: 0xffe08a,
    glow: 0x7fe9ff,
    skirt: true,
    cape: true,
    wings: true,
    crown: false,
    threadCost: 6,
    requires: { plumes: 8 },
    styleScore: 40,
  },
  nenuphar: {
    id: "nenuphar",
    name: "Robe Nénuphar",
    tagline: "Pétales blancs et or : marche sur la rivière sans ralentir.",
    ability: "float",
    abilityLabel: "Flotter : marcher sur l'eau à pleine vitesse",
    primary: 0xf4f1e6,
    secondary: 0x8fc27a,
    accent: 0xf2b84b,
    glow: 0xbfffd0,
    skirt: true,
    cape: false,
    wings: false,
    crown: true,
    threadCost: 6,
    requires: { fleurs: 10 },
    styleScore: 45,
  },
  murmure: {
    id: "murmure",
    name: "Murmure des Bêtes",
    tagline: "Peau de raphia et perles : les animaux t'écoutent.",
    ability: "tame",
    abilityLabel: "Apprivoiser (E près d'un animal) : il devient compagnon",
    primary: 0xa0623a,
    secondary: 0x5b3a22,
    accent: 0x58d68d,
    glow: 0xa8ff9a,
    skirt: false,
    cape: true,
    wings: false,
    crown: false,
    threadCost: 8,
    requires: { perles: 6, fleurs: 4 },
    styleScore: 50,
  },
  lueur: {
    id: "lueur",
    name: "Lueur d'Okoumé",
    tagline: "Soie ambrée tissée de lucioles : tu brilles dans la nuit.",
    ability: "glow",
    abilityLabel: "Halo lumineux la nuit, lucioles ×2",
    primary: 0xffc46b,
    secondary: 0x9a4f1e,
    accent: 0xfff3b0,
    glow: 0xffd27a,
    skirt: true,
    cape: false,
    wings: false,
    crown: true,
    threadCost: 8,
    requires: { plumes: 4, perles: 6 },
    styleScore: 55,
  },
  purificatrice: {
    id: "purificatrice",
    name: "Purificatrice",
    tagline: "Blanc nacré et bleu profond : apaise les bêtes en colère.",
    ability: "purify",
    abilityLabel: "Purifier : les prédateurs proches se calment (clic droit)",
    primary: 0xe9f1ff,
    secondary: 0x3b5ccc,
    accent: 0xb6a1ff,
    glow: 0xc8d8ff,
    skirt: true,
    cape: true,
    wings: false,
    crown: true,
    threadCost: 12,
    requires: { fleurs: 8, plumes: 8, perles: 8 },
    styleScore: 70,
  },
  carnaval: {
    id: "carnaval",
    name: "Reine du Carnaval",
    tagline: "Tenue d'apparat du Gabon : or, vert et bleu. Style maximal.",
    ability: "charm",
    abilityLabel: "Charme : score de style ×2, les animaux ne chargent plus",
    primary: 0x1aa05a,
    secondary: 0x1f55c9,
    accent: 0xffd400,
    glow: 0xfff0a0,
    skirt: true,
    cape: true,
    wings: true,
    crown: true,
    threadCost: 16,
    requires: { fleurs: 12, plumes: 12, perles: 12 },
    styleScore: 100,
  },
};

export const OUTFIT_ORDER: OutfitId[] = ["explo", "plume", "nenuphar", "murmure", "lueur", "purificatrice", "carnaval"];

// Pièces de style à collecter dans le monde
export type StylePieceKind = "fleurs" | "plumes" | "perles" | "fil";
export const STYLE_PIECE_LABEL: Record<StylePieceKind, string> = {
  fleurs: "Fleur d'hibiscus",
  plumes: "Plume de touraco",
  perles: "Perle de rivière",
  fil: "Fil de Rêve",
};

// ---------------------------------------------------------
// Couches de tenue procedurales attachees au rig
// (le modele humain reste visible : on ajoute jupe, cape, ailes, couronne, halo)
// ---------------------------------------------------------

/** Tissu réaliste léger : MeshStandardMaterial marqué "keep". */
function toon(color: number, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  m.userData.keep = true;
  return m;
}

export interface OutfitLayer {
  group: THREE.Group;
  wings: THREE.Mesh[];
  cape: THREE.Mesh | null;
  skirt: THREE.Mesh | null;
  halo: THREE.PointLight | null;
  sparkles: THREE.Points | null;
  tintMaterials: THREE.MeshStandardMaterial[];
}

/**
 * Construit les accessoires de la tenue. `height` = taille du personnage.
 * Les éléments sont attachés à la racine du rig (suivent le corps, pas les os).
 */
export function buildOutfitLayer(def: OutfitDef, height: number): OutfitLayer {
  const group = new THREE.Group();
  group.name = `outfit-${def.id}`;
  const h = height;
  const wings: THREE.Mesh[] = [];
  let cape: THREE.Mesh | null = null;
  let skirt: THREE.Mesh | null = null;
  let halo: THREE.PointLight | null = null;
  let sparkles: THREE.Points | null = null;

  if (def.skirt) {
    const geo = new THREE.ConeGeometry(0.62, h * 0.38, 24, 1, true);
    skirt = new THREE.Mesh(geo, toon(def.primary));
    skirt.position.y = h * 0.55 - (h * 0.38) / 2;
    group.add(skirt);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 32), toon(def.secondary));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = h * 0.55 - h * 0.38 + 0.02;
    group.add(trim);
  }

  if (def.cape) {
    const geo = new THREE.PlaneGeometry(0.7, h * 0.6, 4, 8);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const x = pos.getX(i);
      pos.setZ(i, 0.1 + Math.abs(x) * 0.25 - (y + h * 0.3) * 0.12);
    }
    geo.computeVertexNormals();
    cape = new THREE.Mesh(geo, toon(def.secondary));
    cape.position.set(0, h * 0.78 - (h * 0.6) / 2, 0.16);
    cape.rotation.y = Math.PI;
    group.add(cape);
  }

  if (def.wings) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.45, 0.35, 0.9, 0.15);
    shape.quadraticCurveTo(0.6, 0.05, 0.75, -0.25);
    shape.quadraticCurveTo(0.35, -0.15, 0, -0.05);
    const geo = new THREE.ShapeGeometry(shape, 12);
    const mat = new THREE.MeshPhysicalMaterial({
      color: def.glow || def.primary,
      emissive: def.glow,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.8,
      roughness: 0.3,
      transmission: 0.25,
      thickness: 0.05,
      side: THREE.DoubleSide,
    });
    mat.userData.keep = true;
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(geo, mat);
      wing.position.set(side * 0.12, h * 0.8, 0.18);
      wing.rotation.y = side * (Math.PI / 2 - 0.35);
      wing.scale.x = side;
      group.add(wing);
      wings.push(wing);
    }
  }

  if (def.crown) {
    const crownMat = new THREE.MeshPhysicalMaterial({ color: def.accent, metalness: 0.9, roughness: 0.25, emissive: def.accent, emissiveIntensity: 0.08 });
    crownMat.userData.keep = true;
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), crownMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = h * 0.99;
    group.add(crown);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const gemMat = new THREE.MeshPhysicalMaterial({ color: def.glow || def.accent, emissive: def.glow, emissiveIntensity: 0.5, roughness: 0.05, metalness: 0, transmission: 0.6, thickness: 0.1, ior: 1.8 });
      gemMat.userData.keep = true;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), gemMat);
      gem.position.set(Math.cos(a) * 0.17, h * 1.02, Math.sin(a) * 0.17);
      group.add(gem);
    }
  }

  if (def.glow) {
    halo = new THREE.PointLight(def.glow, 0, 6, 2);
    halo.position.y = h * 0.6;
    group.add(halo);
    const count = 24;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 0.4;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * h;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    sparkles = new THREE.Points(geo, new THREE.PointsMaterial({ color: def.glow, size: 0.05, transparent: true, opacity: 0.8, depthWrite: false }));
    group.add(sparkles);
  }

  return { group, wings, cape, skirt, halo, sparkles, tintMaterials: [] };
}

export function animateOutfit(layer: OutfitLayer, elapsed: number, moving: boolean, gliding: boolean, night: number): void {
  const flap = gliding ? Math.sin(elapsed * 3) * 0.25 : moving ? Math.sin(elapsed * 6) * 0.08 : Math.sin(elapsed * 1.5) * 0.04;
  layer.wings.forEach((w, i) => {
    const side = i === 0 ? -1 : 1;
    w.rotation.y = side * (Math.PI / 2 - 0.35 - (gliding ? 0.9 : 0)) + side * flap;
    w.rotation.z = gliding ? side * 0.2 : 0;
  });
  if (layer.cape) {
    layer.cape.rotation.x = (moving ? -0.45 : -0.08) + Math.sin(elapsed * 4) * (moving ? 0.08 : 0.02) + (gliding ? -0.6 : 0);
  }
  if (layer.skirt) {
    layer.skirt.scale.x = 1 + Math.sin(elapsed * 5) * (moving ? 0.04 : 0.01);
    layer.skirt.scale.z = 1 + Math.cos(elapsed * 5) * (moving ? 0.04 : 0.01);
  }
  if (layer.halo) layer.halo.intensity = 0.4 + night * 2.2 + Math.sin(elapsed * 2) * 0.2;
  if (layer.sparkles) {
    layer.sparkles.rotation.y = elapsed * 0.6;
    const pos = layer.sparkles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 3) pos.setY(i, (pos.getY(i) + 0.004) % 1.8);
    pos.needsUpdate = true;
    (layer.sparkles.material as THREE.PointsMaterial).opacity = 0.35 + night * 0.5;
  }
}
