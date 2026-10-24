// © ONOKO-CRÉATIONS — Tous droits réservés.
import * as THREE from "three";

export type Species = "potamochere" | "cephalophe" | "buffle";

export interface SpeciesDef {
  label: string;
  aggressive: boolean;
  hp: number;
  speed: [number, number];
  chargeSpeed: number;
  fleeSpeed: number;
  damage: number;
  meat: number;
  scale: number;
  color: number;
}

export const SPECIES: Record<Species, SpeciesDef> = {
  potamochere: {
    label: "Potamochère",
    aggressive: true,
    hp: 90,
    speed: [0.5, 1.2],
    chargeSpeed: 2.8,
    fleeSpeed: 3.4,
    damage: 7,
    meat: 2,
    scale: 1.15,
    color: 0xc45a28,
  },
  cephalophe: {
    label: "Céphalophe bleu",
    aggressive: false,
    hp: 35,
    speed: [0.4, 0.9],
    chargeSpeed: 0,
    fleeSpeed: 4.2,
    damage: 0,
    meat: 1,
    scale: 0.82,
    color: 0x4a5c78,
  },
  buffle: {
    label: "Buffle de forêt",
    aggressive: true,
    hp: 200,
    speed: [0.3, 0.7],
    chargeSpeed: 3.2,
    fleeSpeed: 2.2,
    damage: 14,
    meat: 4,
    scale: 1.55,
    color: 0x3a2218,
  },
};

function fur(color: number, roughness = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    flatShading: false,
  });
}

function add(group: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

/** Pattes pivotées à la hanche pour un vrai cycle de marche. */
function makeLeg(mat: THREE.Material, length: number, rTop: number, rBot: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBot, length, 8);
  geo.translate(0, -length / 2, 0);
  const hoof = new THREE.SphereGeometry(rBot * 1.15, 8, 6);
  const leg = new THREE.Mesh(geo, mat);
  const h = new THREE.Mesh(hoof, new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.7 }));
  h.position.y = -length;
  h.scale.set(1.1, 0.55, 1.3);
  leg.add(h);
  leg.castShadow = true;
  return leg;
}

export function buildAnimalMesh(species: Species): { legs: THREE.Mesh[]; materials: THREE.MeshStandardMaterial[] } {
  const group = new THREE.Group();
  // Le groupe passé par l'appelant est le parent : on construit dans un conteneur temporaire
  // puis on déplace les enfants. Ici on retourne les meshes à attacher.
  return buildInto(group, species);
}

function buildInto(group: THREE.Group, species: Species): { legs: THREE.Mesh[]; materials: THREE.MeshStandardMaterial[] } {
  const legs: THREE.Mesh[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const track = (...mats: THREE.MeshStandardMaterial[]) => {
    for (const m of mats) if (!materials.includes(m)) materials.push(m);
    return mats[0];
  };

  if (species === "cephalophe") buildDuiker(group, legs, track);
  else if (species === "buffle") buildBuffalo(group, legs, track);
  else buildHog(group, legs, track);
  return { legs, materials };
}

/** Céphalophe bleu : petite antilope ardoise, ventre crème, grandes oreilles, mini-cornes. */
function buildDuiker(group: THREE.Group, legs: THREE.Mesh[], track: (...m: THREE.MeshStandardMaterial[]) => THREE.MeshStandardMaterial): void {
  const coat = track(fur(0x5a6e88, 0.88));
  const belly = track(fur(0xe8dcc8, 0.9));
  const dark = track(fur(0x1c1814, 0.75));
  const eyeWhite = track(fur(0xf4f0e6, 0.4));
  const iris = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.25, metalness: 0.1, emissive: 0x221100, emissiveIntensity: 0.15 });
  track(iris);

  add(group, new THREE.CapsuleGeometry(0.22, 0.42, 6, 12), coat, 0, 0.78, 0.02, Math.PI / 2, 0, 0, 1.05, 1, 0.95);
  add(group, new THREE.CapsuleGeometry(0.16, 0.32, 4, 10), belly, 0, 0.62, 0.02, Math.PI / 2, 0, 0, 0.9, 0.7, 0.85);
  add(group, new THREE.CylinderGeometry(0.07, 0.11, 0.32, 8), coat, 0, 0.98, -0.38, 0.85, 0, 0);
  add(group, new THREE.SphereGeometry(0.14, 12, 10), coat, 0, 1.14, -0.58, 0, 0, 0, 0.85, 0.85, 1.15);
  add(group, new THREE.SphereGeometry(0.05, 8, 6), dark, 0, 1.1, -0.78);

  for (const side of [-1, 1]) {
    const ear = add(group, new THREE.SphereGeometry(0.07, 8, 6), coat, side * 0.1, 1.28, -0.52, 0.2, 0, side * 0.55, 0.55, 1.15, 0.35);
    ear.rotation.z = side * 0.4;
    add(group, new THREE.ConeGeometry(0.018, 0.12, 6), dark, side * 0.045, 1.32, -0.58, -0.55, 0, 0);
    add(group, new THREE.SphereGeometry(0.028, 8, 6), eyeWhite, side * 0.08, 1.16, -0.68);
    add(group, new THREE.SphereGeometry(0.018, 8, 6), iris, side * 0.082, 1.16, -0.7);
  }
  const tail = add(group, new THREE.ConeGeometry(0.035, 0.22, 6), dark, 0, 0.78, 0.48, Math.PI / 2.2, 0, 0);
  tail.rotation.x = Math.PI / 2 + 0.4;
  add(group, new THREE.SphereGeometry(0.04, 6, 6), coat, 0, 0.72, 0.58);

  const legMat = coat;
  for (const [lx, lz] of [
    [-0.14, -0.22],
    [0.14, -0.22],
    [-0.14, 0.26],
    [0.14, 0.26],
  ]) {
    const leg = makeLeg(legMat, 0.72, 0.04, 0.028);
    leg.position.set(lx, 0.72, lz);
    group.add(leg);
    legs.push(leg);
  }
}

/** Potamochère : roux vif, masque blanc, crinière blonde, oreilles en pinceau, groin. */
function buildHog(group: THREE.Group, legs: THREE.Mesh[], track: (...m: THREE.MeshStandardMaterial[]) => THREE.MeshStandardMaterial): void {
  const rust = track(fur(0xd45a22, 0.86));
  const mask = track(fur(0xf4efe4, 0.75));
  const dark = track(fur(0x2a1810, 0.8));
  const mane = track(fur(0xf0e0b0, 0.95));
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.35, metalness: 0.08 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x1a0c04, roughness: 0.3, emissive: 0x331800, emissiveIntensity: 0.2 });
  track(ivory, iris);

  add(group, new THREE.CapsuleGeometry(0.38, 0.55, 6, 14), rust, 0, 0.62, 0.05, Math.PI / 2, 0, 0, 1.15, 1, 0.92);
  add(group, new THREE.SphereGeometry(0.28, 12, 10), rust, 0, 0.55, 0.38, 0, 0, 0, 1.1, 0.75, 0.9);
  add(group, new THREE.SphereGeometry(0.22, 12, 10), rust, 0, 0.72, -0.48, 0, 0, 0, 1.05, 0.9, 1.1);
  // masque facial blanc
  add(group, new THREE.SphereGeometry(0.16, 10, 8), mask, 0, 0.7, -0.58, 0, 0, 0, 0.9, 0.7, 0.85);
  const snout = add(group, new THREE.CylinderGeometry(0.09, 0.13, 0.22, 10), dark, 0, 0.6, -0.78, Math.PI / 2, 0, 0);
  snout.rotation.x = Math.PI / 2;
  add(group, new THREE.CircleGeometry(0.09, 12), track(fur(0x4a3028, 0.7)), 0, 0.6, -0.9, 0, 0, 0);
  // narines
  for (const side of [-1, 1]) {
    add(group, new THREE.SphereGeometry(0.018, 6, 6), dark, side * 0.035, 0.6, -0.91);
    add(group, new THREE.SphereGeometry(0.032, 8, 6), mask, side * 0.11, 0.78, -0.62);
    add(group, new THREE.SphereGeometry(0.022, 8, 6), iris, side * 0.115, 0.78, -0.645);
    // oreilles dressées + pinceau
    const ear = add(group, new THREE.ConeGeometry(0.08, 0.22, 7), rust, side * 0.18, 0.98, -0.42, 0.15, 0, side * 0.35);
    ear.rotation.z = side * 0.25;
    add(group, new THREE.ConeGeometry(0.03, 0.12, 5), dark, side * 0.2, 1.12, -0.4, 0.1, 0, side * 0.2);
    // défenses
    const tusk = add(group, new THREE.ConeGeometry(0.028, 0.2, 6), ivory, side * 0.1, 0.54, -0.82, -Math.PI / 2.5, 0, side * 0.25);
    tusk.rotation.z = side * 0.4;
  }
  // crinière dorsale blanche/crème
  for (let i = 0; i < 7; i++) {
    const z = -0.35 + i * 0.12;
    add(group, new THREE.ConeGeometry(0.05, 0.16 + (i % 2) * 0.04, 5), mane, 0, 0.95, z, 0.15, 0, 0);
  }
  add(group, new THREE.CylinderGeometry(0.025, 0.04, 0.35, 6), dark, 0, 0.62, 0.72, 0.5, 0, 0);
  add(group, new THREE.SphereGeometry(0.05, 6, 6), rust, 0, 0.48, 0.88);

  for (const [lx, lz] of [
    [-0.22, -0.28],
    [0.22, -0.28],
    [-0.24, 0.32],
    [0.24, 0.32],
  ]) {
    const leg = makeLeg(rust, 0.52, 0.07, 0.05);
    leg.position.set(lx, 0.52, lz);
    group.add(leg);
    legs.push(leg);
  }
}

/** Buffle de forêt : corps massif acajou, bosse, larges oreilles, cornes en croissant. */
function buildBuffalo(group: THREE.Group, legs: THREE.Mesh[], track: (...m: THREE.MeshStandardMaterial[]) => THREE.MeshStandardMaterial): void {
  const hide = track(fur(0x4a2a1c, 0.9));
  const dark = track(fur(0x1a100c, 0.78));
  const horn = new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 0.45, metalness: 0.12 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x140c08, roughness: 0.3, emissive: 0x2a1000, emissiveIntensity: 0.12 });
  track(horn, iris);

  add(group, new THREE.CapsuleGeometry(0.48, 0.7, 6, 14), hide, 0, 0.72, 0.05, Math.PI / 2, 0, 0, 1.25, 1.05, 1);
  add(group, new THREE.SphereGeometry(0.42, 12, 10), hide, 0, 1.05, -0.15, 0, 0, 0, 1.05, 0.55, 0.9); // bosse
  add(group, new THREE.SphereGeometry(0.32, 12, 10), hide, 0, 0.78, -0.72, 0, 0, 0, 1.1, 0.95, 1.15);
  add(group, new THREE.CylinderGeometry(0.14, 0.18, 0.28, 10), dark, 0, 0.62, -1.02, Math.PI / 2, 0, 0);
  add(group, new THREE.SphereGeometry(0.12, 8, 6), dark, 0, 0.58, -1.16, 0, 0, 0, 1.2, 0.7, 0.8);
  // fanon
  add(group, new THREE.SphereGeometry(0.16, 8, 6), hide, 0, 0.42, -0.55, 0, 0, 0, 1.3, 0.7, 1);

  for (const side of [-1, 1]) {
    // larges oreilles tombantes
    add(group, new THREE.SphereGeometry(0.14, 8, 6), hide, side * 0.38, 0.88, -0.62, 0.2, 0, side * 1.1, 0.55, 1.1, 0.25);
    add(group, new THREE.SphereGeometry(0.04, 8, 6), track(fur(0xeee8dc, 0.5)), side * 0.16, 0.82, -0.88);
    add(group, new THREE.SphereGeometry(0.025, 8, 6), iris, side * 0.165, 0.82, -0.91);
    // cornes : base au-dessus du crâne, recourbées vers l'extérieur puis le haut
    const base = add(group, new THREE.TorusGeometry(0.22, 0.055, 8, 16, Math.PI * 0.85), horn, side * 0.18, 1.02, -0.68);
    base.rotation.set(0.15, side * 0.55, side * 1.15);
    add(group, new THREE.ConeGeometry(0.04, 0.16, 6), horn, side * 0.42, 1.18, -0.55, -0.4, 0, side * 0.3);
  }
  add(group, new THREE.CylinderGeometry(0.03, 0.05, 0.45, 6), dark, 0, 0.7, 0.85, 0.6, 0, 0);
  add(group, new THREE.SphereGeometry(0.07, 6, 6), dark, 0, 0.5, 1.05);

  for (const [lx, lz] of [
    [-0.32, -0.38],
    [0.32, -0.38],
    [-0.34, 0.4],
    [0.34, 0.4],
  ]) {
    const leg = makeLeg(hide, 0.7, 0.1, 0.07);
    leg.position.set(lx, 0.7, lz);
    group.add(leg);
    legs.push(leg);
  }
}

export function assembleAnimal(species: Species): { group: THREE.Group; legs: THREE.Mesh[]; materials: THREE.MeshStandardMaterial[] } {
  const group = new THREE.Group();
  const { legs } = buildInto(group, species);
  const materials: THREE.MeshStandardMaterial[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m instanceof THREE.MeshStandardMaterial && !materials.includes(m)) materials.push(m);
    }
  });
  return { group, legs, materials };
}
