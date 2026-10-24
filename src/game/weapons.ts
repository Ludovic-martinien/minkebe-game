// © ONOKO-CRÉATIONS — Tous droits réservés. Minkébé, jeu de survie.
import * as THREE from "three";

// =========================================================
// ARMES - definitions et modeles 3D
// Repere de la main droite (T-pose) : +X doigts, -Y paume, -Z pouce.
// Une fois le bras leve pour viser : +X -> avant (-Z monde), -Z -> haut.
// =========================================================

export type WeaponId = "couteau" | "machette" | "lance" | "pistolet" | "m16" | "calibre12";
export type AmmoType = "pistol" | "rifle" | "shotgun" | null;

export interface WeaponDef {
  id: WeaponId;
  label: string;
  kind: "melee" | "ranged";
  damage: number;
  range: number;
  cooldown: number; // secondes entre deux attaques
  automatic: boolean;
  ammo: AmmoType;
  description: string;
  slot: number;
  /** Réduction des dégâts reçus en bloquant (0..1). */
  blockReduction: number;
  /** Fenêtre de parade parfaite au début du blocage (secondes). */
  parryWindow: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  couteau: {
    id: "couteau",
    label: "Couteau",
    kind: "melee",
    damage: 18,
    range: 1.9,
    cooldown: 0.45,
    automatic: false,
    ammo: null,
    description: "Lame de survie. Rapide, courte portée. Parade rapide.",
    slot: 1,
    blockReduction: 0.55,
    parryWindow: 0.22,
  },
  machette: {
    id: "machette",
    label: "Machette",
    kind: "melee",
    damage: 30,
    range: 2.3,
    cooldown: 0.6,
    automatic: false,
    ammo: null,
    description: "Lame lourde des coupeurs de piste. Excellent bouclier contre les charges.",
    slot: 2,
    blockReduction: 0.8,
    parryWindow: 0.28,
  },
  lance: {
    id: "lance",
    label: "Lance",
    kind: "melee",
    damage: 36,
    range: 2.8,
    cooldown: 0.7,
    automatic: false,
    ammo: null,
    description: "Lance à pointe de pierre. Effraie les potamochères. Longue parade.",
    slot: 3,
    blockReduction: 0.72,
    parryWindow: 0.32,
  },
  pistolet: {
    id: "pistolet",
    label: "Pistolet",
    kind: "ranged",
    damage: 34,
    range: 30,
    cooldown: 0.32,
    automatic: false,
    ammo: "pistol",
    description: "Pistolet 9 mm de braconnier. Un tir stoppe une charge.",
    slot: 4,
    blockReduction: 0.15,
    parryWindow: 0,
  },
  m16: {
    id: "m16",
    label: "M16",
    kind: "ranged",
    damage: 22,
    range: 70,
    cooldown: 0.1,
    automatic: true,
    ammo: "rifle",
    description: "Fusil d'assaut des éco-gardes. Rafale défensive : stagger les charges.",
    slot: 5,
    blockReduction: 0.2,
    parryWindow: 0,
  },
  calibre12: {
    id: "calibre12",
    label: "Calibre 12",
    kind: "ranged",
    damage: 68,
    range: 26,
    cooldown: 0.78,
    automatic: false,
    ammo: "shotgun",
    description: "Fusil à pompe calibre 12. Gerbe de chevrotines dévastatrice à courte portée.",
    slot: 6,
    blockReduction: 0.25,
    parryWindow: 0,
  },
};

export const WEAPON_ORDER: WeaponId[] = ["couteau", "machette", "lance", "pistolet", "m16", "calibre12"];

function keep<T extends THREE.Material>(m: T): T {
  m.userData.keep = true; // rendu PBR realiste, exclu du cel-shading
  return m;
}
const matSteel = keep(new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.9, roughness: 0.28 }));
const matGunmetal = keep(new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.85, roughness: 0.42 }));
const matPolymer = keep(new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.1, roughness: 0.75 }));
const matWood = keep(new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.8 }));
const matDarkWood = keep(new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.85 }));
const matLeather = keep(new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.9 }));
const matFlint = keep(new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.55 }));
const matBrass = keep(new THREE.MeshStandardMaterial({ color: 0xb08d3a, metalness: 0.9, roughness: 0.3 }));

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function cyl(rTop: number, rBottom: number, len: number, mat: THREE.Material, axis: "x" | "y" | "z", x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, len, 12), mat);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  if (axis === "z") m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Lame : longueur le long de -Z, largeur le long de +X (tranchant), epaisseur Y
function blade(length: number, width: number, thickness: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.35, 0);
  shape.lineTo(width * 0.65, 0);
  shape.lineTo(width * 0.65, -length * 0.78);
  shape.lineTo(width * 0.1, -length);
  shape.lineTo(-width * 0.35, -length * 0.9);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.4, bevelSize: thickness * 0.4, bevelSegments: 1 });
  // Le shape est dans le plan XY (y = longueur) -> on le tourne pour que la longueur suive Z
  geo.rotateX(Math.PI / 2);
  geo.translate(0, -thickness / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

export function createWeaponModel(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  g.name = `weapon-${id}`;

  switch (id) {
    case "couteau": {
      g.add(cyl(0.013, 0.015, 0.11, matLeather, "z", 0, 0, 0.02));
      g.add(box(0.05, 0.012, 0.012, matSteel, 0.005, 0, -0.04)); // garde
      g.add(blade(0.2, 0.03, 0.004, matSteel).translateZ(-0.045));
      g.add(cyl(0.016, 0.016, 0.01, matSteel, "z", 0, 0, 0.078)); // pommeau
      break;
    }
    case "machette": {
      g.add(box(0.03, 0.025, 0.13, matDarkWood, 0, 0, 0.03));
      for (const dz of [-0.01, 0.03, 0.07]) g.add(cyl(0.004, 0.004, 0.03, matBrass, "y", 0, 0, dz));
      g.add(blade(0.46, 0.065, 0.004, matSteel).translateZ(-0.04));
      break;
    }
    case "lance": {
      g.add(cyl(0.016, 0.02, 2.0, matWood, "z", 0, 0, -0.4));
      g.add(cyl(0.02, 0.02, 0.12, matLeather, "z", 0, 0, -1.33)); // ligature
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24, 6), matFlint);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(0, 0, -1.5);
      tip.scale.set(0.5, 1, 1);
      tip.castShadow = true;
      g.add(tip);
      break;
    }
    case "pistolet": {
      // Poignee a travers le poing (axe Z), culasse au-dessus (-Z), canon vers +X
      const grip = box(0.028, 0.034, 0.1, matPolymer, -0.015, 0, 0.03);
      grip.rotation.y = 0.1;
      g.add(grip);
      g.add(box(0.17, 0.03, 0.03, matGunmetal, 0.035, 0, -0.045)); // culasse
      g.add(box(0.16, 0.022, 0.012, matPolymer, 0.03, 0, -0.027)); // carcasse
      g.add(cyl(0.006, 0.006, 0.04, matSteel, "x", 0.14, 0, -0.045)); // canon
      g.add(box(0.03, 0.006, 0.03, matGunmetal, 0.035, 0, -0.012)); // pontet
      g.add(box(0.005, 0.004, 0.015, matGunmetal, 0.03, 0, -0.012)); // detente
      g.add(box(0.006, 0.006, 0.008, matGunmetal, -0.04, 0, -0.064)); // hausse
      g.add(box(0.004, 0.004, 0.008, matGunmetal, 0.11, 0, -0.064)); // guidon
      break;
    }
    case "m16": {
      // Poignee pistolet a travers le poing, boitier au-dessus, canon +X, crosse -X
      g.add(box(0.03, 0.036, 0.1, matPolymer, -0.02, 0, 0.035).rotateY(0.15));
      g.add(box(0.22, 0.045, 0.06, matGunmetal, 0.07, 0, -0.065)); // boitier (receiver)
      g.add(box(0.21, 0.04, 0.05, matPolymer, 0.3, 0, -0.065)); // garde-main
      g.add(cyl(0.007, 0.007, 0.22, matGunmetal, "x", 0.52, 0, -0.065)); // canon
      g.add(cyl(0.011, 0.011, 0.05, matGunmetal, "x", 0.62, 0, -0.065)); // cache-flamme
      g.add(box(0.03, 0.03, 0.06, matGunmetal, 0.45, 0, -0.09)); // guidon
      g.add(box(0.17, 0.02, 0.03, matGunmetal, 0.01, 0, -0.112)); // poignee de transport
      g.add(box(0.03, 0.02, 0.03, matGunmetal, -0.05, 0, -0.095));
      g.add(box(0.03, 0.02, 0.03, matGunmetal, 0.08, 0, -0.095));
      g.add(box(0.028, 0.024, 0.18, matGunmetal, 0.11, 0, 0.02).rotateX(-0.15)); // chargeur
      g.add(box(0.2, 0.04, 0.05, matPolymer, -0.19, 0, -0.045).rotateY(0)); // crosse
      g.add(box(0.03, 0.05, 0.085, matPolymer, -0.3, 0, -0.03)); // plaque de couche
      g.add(box(0.04, 0.006, 0.04, matGunmetal, 0.03, 0, -0.025)); // pontet
      g.add(box(0.005, 0.004, 0.02, matGunmetal, 0.03, 0, -0.022)); // detente
      break;
    }
    case "calibre12": {
      // Fusil a pompe calibre 12 : crosse bois, boitier acier, canon long + tube magasin + pompe bois
      g.add(box(0.03, 0.036, 0.1, matDarkWood, -0.02, 0, 0.032).rotateY(0.18)); // poignee
      g.add(box(0.22, 0.044, 0.055, matDarkWood, -0.19, 0, -0.04)); // crosse bois
      g.add(box(0.025, 0.048, 0.08, matPolymer, -0.3, 0, -0.032)); // plaque de couche
      g.add(box(0.21, 0.046, 0.058, matGunmetal, 0.06, 0, -0.062)); // boitier culasse
      g.add(cyl(0.011, 0.011, 0.52, matGunmetal, "x", 0.42, 0, -0.072)); // canon calibre 12
      g.add(cyl(0.0095, 0.0095, 0.38, matSteel, "x", 0.35, 0, -0.048)); // tube magasin sous le canon
      g.add(cyl(0.018, 0.018, 0.18, matWood, "x", 0.32, 0, -0.048)); // garde-main a pompe en bois
      g.add(box(0.006, 0.006, 0.01, matBrass, 0.66, 0, -0.086)); // grain d'orge laiton
      g.add(box(0.04, 0.006, 0.038, matGunmetal, 0.02, 0, -0.022)); // pontet
      break;
    }
  }
  return g;
}

/** Position du bout du canon dans le repere du socket (pour l'eclair de bouche). */
export function muzzleOffset(id: WeaponId): THREE.Vector3 {
  if (id === "pistolet") return new THREE.Vector3(0.17, 0, -0.045);
  if (id === "m16") return new THREE.Vector3(0.65, 0, -0.065);
  if (id === "calibre12") return new THREE.Vector3(0.68, 0, -0.072);
  return new THREE.Vector3(0, 0, -0.3);
}

/** Objet a ramasser au sol (version posee, orientee a plat). */
export function createWeaponPickup(id: WeaponId): THREE.Group {
  const model = createWeaponModel(id);
  const wrap = new THREE.Group();
  // Pose a plat : l'axe "haut" (-Z) de l'arme vers +Y
  model.rotation.x = -Math.PI / 2;
  model.position.y = 0.05;
  wrap.add(model);
  return wrap;
}

const matShellRed = keep(new THREE.MeshStandardMaterial({ color: 0xb82222, roughness: 0.55, metalness: 0.1 }));

export function createAmmoBox(type: "pistol" | "rifle" | "shotgun"): THREE.Group {
  const g = new THREE.Group();
  const w = type === "rifle" ? 0.3 : type === "shotgun" ? 0.24 : 0.18;
  const boxColor = type === "rifle" ? 0x3b4a2a : type === "shotgun" ? 0x7a1f1f : 0x4a4a3b;
  const body = box(w, 0.12, 0.14, new THREE.MeshStandardMaterial({ color: boxColor, roughness: 0.8, metalness: 0.3 }));
  body.position.y = 0.06;
  g.add(body);
  const lid = box(w + 0.01, 0.02, 0.15, matGunmetal, 0, 0.13, 0);
  g.add(lid);
  for (let i = 0; i < 4; i++) {
    if (type === "shotgun") {
      // Cartouches calibre 12 rouges à culot laiton
      const hull = cyl(0.009, 0.009, 0.048, matShellRed, "y", -0.055 + i * 0.036, 0.165, 0.03);
      const base = cyl(0.0095, 0.0095, 0.014, matBrass, "y", -0.055 + i * 0.036, 0.145, 0.03);
      g.add(hull, base);
    } else {
      const round = cyl(0.006, 0.006, 0.04, matBrass, "y", -0.05 + i * 0.03, 0.16, 0.03);
      g.add(round);
    }
  }
  return g;
}
