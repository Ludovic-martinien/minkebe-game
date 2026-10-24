// © ONOKO-CRÉATIONS — Tous droits réservés. Minkébé, jeu de survie.
import * as THREE from "three";
import { CharacterRig, loadCharacterAssets, type CharacterAsset, type CharacterId } from "./characters";
import { WEAPONS, WEAPON_ORDER, createAmmoBox, createWeaponModel, createWeaponPickup, muzzleOffset, type WeaponId } from "./weapons";
import { ThermalPass, createGpsModel, createNightVisionModel } from "./gadgets";
import {
  MAX_LEVEL,
  MAX_XP,
  XP,
  FINAL_LEVEL_NAME,
  levelFromXp,
  levelInfo,
  xpProgress,
  type LevelDef,
} from "./levels";
import { SCENE_CONFIG } from "./sceneConfig";
import { SPECIES, assembleAnimal, type Species } from "./fauna";
import { CharacterLightKit, applyPbrMaps, createRealismComposer, type RealismComposer } from "./realism";
import { OUTFITS, OUTFIT_ORDER, animateOutfit, buildOutfitLayer, type OutfitId, type OutfitLayer, type StylePieceKind } from "./outfits";
import { createCollectibleMesh, createFireflies, createSkyDome, getToonGradient, toToon, type Collectible, type CollectibleKind } from "./whimsy";
import {
  WATER_LEVEL,
  buildRiverGeometry,
  buildStreamGeometry,
  createWaterMaterial,
  distanceToWaterEdge,
  isInWater,
  isNearWater,
  riverCenterX,
  riverHalfWidth,
  streamCenterZ,
  waterInfo,
  type WaterMaterialUniforms,
} from "./water";

// =========================================================
// MINKEBE - SURVIE DANS LA FORET EQUATORIALE DU GABON
// Moteur de jeu Three.js - nature réaliste (textures, terrain,
// feuillages découpés, rivière animée, ambiance sonore)
// =========================================================

export const WORLD_SIZE = 200;
const TREE_COUNT = 380;
const FERN_COUNT = 900;
const BIGLEAF_COUNT = 520;
const ROCK_COUNT = 120;
const RESOURCE_COUNT = 100;
const PALM_COUNT = 65;
const ANIMAL_COUNT = 7;
const WALK_SPEED = 5.0;
const RUN_SPEED = 8.0;
const MOUSE_SENSITIVITY = 0.0025;
// Cycle jour/nuit : durée réelle d'une journée complète (modifiable en jeu)
const DAY_LENGTH_DEFAULT = 1200; // 20 minutes
export const DAY_LENGTH_OPTIONS = [600, 1200, 2400, 3600] as const;
// Heure solaire de départ (06h30 : aube) ; la nuit ne couvre qu'environ 30 % du cycle
const START_HOUR = 9.5;

/**
 * Convertit la phase (0..1 = 24 h, 0 = minuit) en élévation solaire (-1..1).
 * Jour allongé : le soleil est au-dessus de l'horizon de ~05h30 à ~19h30,
 * avec des transitions (aube/crépuscule) longues et progressives.
 */
function sunElevation(phase: number): number {
  const hour = phase * 24;
  const sunrise = 5.5;
  const sunset = 19.5;
  if (hour >= sunrise && hour <= sunset) {
    const t = (hour - sunrise) / (sunset - sunrise);
    return Math.sin(t * Math.PI); // 0 -> 1 -> 0
  }
  const nightLen = 24 - (sunset - sunrise);
  const h = hour > sunset ? hour - sunset : hour + 24 - sunset;
  return -Math.sin((h / nightLen) * Math.PI) * 0.8;
}

export type CameraMode = "third" | "shoulder" | "first" | "cinematic" | "selfie";
export const CAMERA_MODES: { id: CameraMode; label: string; hint: string; key: string }[] = [
  { id: "third", label: "3e personne", hint: "Vue d'exploration", key: "F1" },
  { id: "shoulder", label: "Épaule", hint: "Action / visée", key: "F2" },
  { id: "first", label: "1re personne", hint: "Yeux du personnage", key: "F3" },
  { id: "cinematic", label: "Cinématique", hint: "Plan large, forêt", key: "F4" },
  { id: "selfie", label: "Selfie", hint: "Face au personnage", key: "F6" },
];

export type QualityPreset = "mobile" | "hd" | "uhd" | "auto";

export interface QualitySettings {
  preset: Exclude<QualityPreset, "auto">;
  /** Résolution de rendu cible (hauteur en pixels) : 1080 téléphone, 1440 HD, 2160 4K */
  targetHeight: number;
  pixelRatioMax: number;
  shadowMap: number;
  shadows: boolean;
  antialias: boolean;
  vegetation: number; // 0..1 densité
  dust: number;
  anisotropy: number;
  dynamicResolution: boolean;
}

export const QUALITY_PRESETS: Record<Exclude<QualityPreset, "auto">, QualitySettings> = {
  mobile: { preset: "mobile", targetHeight: 900, pixelRatioMax: 1.0, shadowMap: 1024, shadows: true, antialias: false, vegetation: 0.45, dust: 90, anisotropy: 2, dynamicResolution: true },
  hd: { preset: "hd", targetHeight: 1080, pixelRatioMax: 1.25, shadowMap: 1536, shadows: true, antialias: true, vegetation: 0.75, dust: 180, anisotropy: 4, dynamicResolution: true },
  uhd: { preset: "uhd", targetHeight: 1600, pixelRatioMax: 1.5, shadowMap: 2048, shadows: true, antialias: true, vegetation: 1.0, dust: 280, anisotropy: 8, dynamicResolution: true },
};

export interface PerfInfo {
  fps: number;
  renderScale: number;
  renderWidth: number;
  renderHeight: number;
  preset: QualitySettings["preset"];
  isTouch: boolean;
}

/** Détection du profil : téléphone/tablette -> mobile, grand écran (TV/moniteur 4K HDMI) -> uhd. */
export function detectQualityPreset(): Exclude<QualityPreset, "auto"> {
  if (typeof window === "undefined") return "hd";
  const touch = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const physicalW = window.screen.width * (window.devicePixelRatio || 1);
  const physicalH = window.screen.height * (window.devicePixelRatio || 1);
  const maxDim = Math.max(physicalW, physicalH);
  const minDim = Math.min(physicalW, physicalH);
  if (touch && minDim < 1700) return "mobile";
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  if (maxDim >= 3000 && cores >= 6 && memory >= 8) return "uhd";
  return "hd";
}

export type Character = CharacterId;
export type InventoryKind = "Fruits" | "Bois" | "Pierres" | "Viande";
export type PickupKind = "Machette" | "Pistolet" | "M16" | "Calibre12" | "MunitionsPistolet" | "MunitionsM16" | "MunitionsCalibre12" | "GPS" | "LunettesIR";
export type ResourceKind = InventoryKind | PickupKind;
export type Inventory = Record<InventoryKind, number>;
export type { WeaponId };

export interface SaveData {
  character: Character;
  health: number;
  hunger: number;
  thirst: number;
  stamina: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  inventory: Inventory;
  hasSpear: boolean;
  hasShelter: boolean;
  shelterX: number | null;
  shelterZ: number | null;
  collectedIds: number[];
  worldSeed: number;
  timeSurvived: number;
  weapons: WeaponId[];
  currentWeapon: WeaponId;
  ammoPistol: number;
  ammoRifle: number;
  ammoShotgun?: number;
  kills: number;
  hasGps: boolean;
  hasNightVision: boolean;
  nvBattery: number;
  gameHour?: number;
  outfits?: OutfitId[];
  currentOutfit?: OutfitId;
  stylePieces?: Record<StylePieceKind, number>;
  whimstars?: number;
  collectedWhimsy?: number[];
  styleScore?: number;
  xp?: number;
}

export interface WhimsySnapshot {
  outfits: OutfitId[];
  currentOutfit: OutfitId;
  stylePieces: Record<StylePieceKind, number>;
  whimstars: number;
  whimstarsTotal: number;
  nsisim: number;
  nsisimTotal: number;
  styleScore: number;
  gliding: boolean;
  companions: number;
  photoMode: boolean;
  nearTameable: string | null;
}

export interface GameSnapshot {
  character: Character;
  health: number;
  hunger: number;
  thirst: number;
  stamina: number;
  inventory: Inventory;
  hasSpear: boolean;
  hasShelter: boolean;
  inventoryOpen: boolean;
  timeSurvived: number;
  dayPhase: number;
  gameHour: number;
  dayLength: number;
  message: string;
  nearResource: ResourceKind | null;
  nearRiver: boolean;
  nearShelter: boolean;
  threatNearby: boolean;
  resourcesCollected: number;
  dead: boolean;
  weapons: WeaponId[];
  currentWeapon: WeaponId;
  ammoPistol: number;
  ammoRifle: number;
  ammoShotgun: number;
  swimming: boolean;
  sleeping: boolean;
  aiming: boolean;
  kills: number;
  hitMarker: boolean;
  nearCarcass: boolean;
  target: { label: string; hp: number; maxHp: number } | null;
  huntingEnabled: boolean;
  shelterDistance: number | null;
  shelterHeading: string;
  canBuild: boolean;
  hasGps: boolean;
  gpsOn: boolean;
  gps: GpsData | null;
  compass: CompassData;
  hasNightVision: boolean;
  nightVisionOn: boolean;
  nvBattery: number;
  jumping: boolean;
  dodges: number;
  blocking: boolean;
  parrying: boolean;
  cameraMode: CameraMode;
  perf: PerfInfo;
  whimsy: WhimsySnapshot;
  level: LevelDef;
  levelProgress: { level: number; levelName: string; xp: number; next: number; progress: number; isMax: boolean };
  xpTotal: number;
}

export interface DeathInfo {
  cause: string;
  timeSurvived: number;
  resourcesCollected: number;
  hasSpear: boolean;
  hasShelter: boolean;
  kills: number;
}

const PICKUP_LABELS: Record<ResourceKind, string> = {
  Fruits: "Fruits",
  Bois: "Bois",
  Pierres: "Pierres",
  Viande: "Viande",
  Machette: "Machette",
  Pistolet: "Pistolet",
  M16: "Fusil M16",
  Calibre12: "Fusil Calibre 12",
  MunitionsPistolet: "Munitions 9 mm",
  MunitionsM16: "Chargeur M16",
  MunitionsCalibre12: "Cartouches Calibre 12",
  GPS: "GPS de terrain",
  LunettesIR: "Lunettes infrarouges",
};

export interface GpsBlip {
  x: number;
  z: number;
  kind: "shelter" | "camp" | "post" | "animal" | "predator" | "carcass" | "weapon" | "ammo" | "ally";
  label?: string;
}

// ---- Multijoueur
export type NetRole = "solo" | "host" | "client";

export interface NetPlayerState {
  x: number;
  z: number;
  yaw: number;
  move: "idle" | "walk" | "run";
  weapon: string;
  aiming: boolean;
  dead: boolean;
  health: number;
  shelterX: number | null;
  shelterZ: number | null;
  voice?: { enabled: boolean; speaking: boolean };
}

export interface RemotePlayerInfo {
  playerId: string;
  name: string;
  character: string;
  state: NetPlayerState;
}

export interface NetAnimalState {
  x: number;
  z: number;
  yaw: number;
  hp: number;
  dead: boolean;
  butchered: boolean;
}

export interface NetHit {
  index: number;
  damage: number;
  fromX: number;
  fromZ: number;
}

interface RemotePlayer {
  info: RemotePlayerInfo;
  root: THREE.Group;
  rig: CharacterRig | null;
  weapon: THREE.Group | null;
  weaponId: string;
  tag: THREE.Sprite;
  voiceIcon: THREE.Sprite;
  targetPos: THREE.Vector3;
  targetYaw: number;
  shelter: THREE.Group | null;
  shelterKey: string;
  lastUpdate: number;
}

export interface CompassHint {
  kind: "river" | "shelter" | "camp" | "post" | "machette" | "danger" | "carcass" | "ally" | "food" | "objective";
  label: string;
  bearing: number; // radians relatifs à la caméra (0 = devant, + = à droite)
  distance: number;
  urgent?: boolean;
}

export interface CompassData {
  heading: number; // cap caméra en radians (0 = nord)
  hints: CompassHint[];
  objective: string;
}

export interface GpsData {
  x: number;
  z: number;
  heading: number; // radians, direction regardée (camYaw)
  river: { x: number; z: number }[];
  stream: { x: number; z: number }[];
  blips: GpsBlip[];
  worldSize: number;
}

export function resourceLabel(kind: ResourceKind): string {
  return PICKUP_LABELS[kind];
}

export interface EngineCallbacks {
  onSnapshot: (snapshot: GameSnapshot) => void;
  onDeath: (info: DeathInfo) => void;
  onRequestSave: () => void;
  onRequestLoad: () => void;
  onRequestPause: () => void;
  onLoadProgress?: (percent: number, stage: string) => void;
}

interface TreeData {
  x: number;
  z: number;
  r: number;
}

interface ResourceData {
  id: number;
  kind: ResourceKind;
  group: THREE.Group;
  collected: boolean;
  baseY: number;
}

interface AnimalData {
  species: Species;
  group: THREE.Group;
  direction: THREE.Vector3;
  speed: number;
  aggressive: boolean;
  legs: THREE.Mesh[];
  hp: number;
  maxHp: number;
  fleeUntil: number;
  dead: boolean;
  /** 0..1 : progression de la chute */
  fall: number;
  fallSide: number;
  butchered: boolean;
  respawnAt: number;
  hitFlash: number;
  knock: THREE.Vector3;
  materials: THREE.MeshStandardMaterial[];
  decal: THREE.Mesh | null;
}

interface BloodParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

interface Textures {
  ground: THREE.Texture | null;
  bark: THREE.Texture | null;
  rock: THREE.Texture | null;
  waterNormal: THREE.Texture | null;
  foliage: THREE.Texture | null;
  fern: THREE.Texture | null;
  bigleaf: THREE.Texture | null;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Relief doux du sol forestier, avec la rivière sinueuse et son affluent creusés dans le terrain
export function terrainHeight(x: number, z: number): number {
  const base =
    0.45 * Math.sin(x * 0.11) * Math.cos(z * 0.09) +
    0.25 * Math.sin(x * 0.23 + 1.3) * Math.sin(z * 0.19) +
    0.12 * Math.sin((x + z) * 0.41);
  // Court-circuit rapide : hors du couloir de la rivière (x ∈ [-32, 4]) et de l'affluent (z ∈ [14, 38])
  if ((x < -32 || x > 4) && (z < 14 || z > 38)) {
    return base;
  }
  const w = waterInfo(x, z);
  if (w.d >= w.half + 4.5) return base;
  const bankFactor = smoothstep(w.half * 0.4, w.half + 4.5, w.d);
  const bed = 1 - smoothstep(w.half * 0.3, w.half + 1.5, w.d);
  const dip = w.depth * bed;
  return base * bankFactor - dip;
}

function makeMaterial(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 });
}

// ---------------------------------------------------------
// Chargement des textures
// ---------------------------------------------------------

function loadImage(url: string, timeoutMs = 4500): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => reject(new Error(`Délai dépassé : ${url}`)), timeoutMs);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`Image introuvable : ${url}`));
    };
    img.src = url;
  });
}

async function loadTiledTexture(url: string, repeat: number, srgb: boolean): Promise<THREE.Texture | null> {
  try {
    const img = await loadImage(url);
    const tex = new THREE.Texture(img);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null;
  }
}

// Charge une texture PNG pré-découpée (alpha déjà intégré dans le fichier)
async function loadKeyedTexture(url: string): Promise<THREE.Texture | null> {
  try {
    const img = await loadImage(url);
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null;
  }
}

type FallbackTextureKind = "ground" | "bark" | "rock" | "foliage" | "fern" | "bigleaf";

function createFallbackTexture(kind: FallbackTextureKind): THREE.Texture | null {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (kind === "foliage" || kind === "fern" || kind === "bigleaf") {
    const leaf = (x: number, y: number, width: number, height: number, angle: number, hue: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      const gradient = ctx.createLinearGradient(-width * 0.5, 0, width * 0.5, 0);
      gradient.addColorStop(0, `hsl(${hue}, 42%, 22%)`);
      gradient.addColorStop(0.5, `hsl(${hue}, 48%, 38%)`);
      gradient.addColorStop(1, `hsl(${hue}, 46%, 24%)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, -height * 0.5);
      ctx.bezierCurveTo(width * 0.5, -height * 0.28, width * 0.48, height * 0.28, 0, height * 0.5);
      ctx.bezierCurveTo(-width * 0.48, height * 0.28, -width * 0.5, -height * 0.28, 0, -height * 0.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(190, 198, 135, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -height * 0.43);
      ctx.lineTo(0, height * 0.43);
      for (let i = 1; i <= 5; i++) {
        const py = -height * 0.34 + i * height * 0.12;
        const px = width * (0.12 + 0.035 * (i % 2));
        ctx.moveTo(0, py);
        ctx.lineTo(px, py + height * 0.08);
        ctx.moveTo(0, py);
        ctx.lineTo(-px, py + height * 0.08);
      }
      ctx.stroke();
      ctx.restore();
    };

    if (kind === "foliage") {
      for (let i = 0; i < 5; i++) leaf(128, 128, 68, 190, (i * Math.PI) / 5, 105 + i * 3);
    } else if (kind === "fern") {
      ctx.strokeStyle = "rgba(116, 145, 72, 0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(128, 242);
      ctx.quadraticCurveTo(114, 128, 128, 12);
      ctx.stroke();
      for (let i = 0; i < 9; i++) {
        const y = 224 - i * 24;
        const length = 42 + Math.sin(i * 0.8) * 10;
        leaf(128 - length * 0.35, y, 35, 76, -0.72, 105 + (i % 3) * 5);
        leaf(128 + length * 0.35, y, 35, 76, 0.72, 107 + (i % 3) * 5);
      }
    } else {
      leaf(128, 128, 190, 236, -0.08, 111);
    }
  } else {
    const base = kind === "ground" ? [65, 70, 49] : kind === "bark" ? [71, 48, 31] : [78, 79, 68];
    const random = mulberry32(kind === "ground" ? 4703 : kind === "bark" ? 5821 : 9167);
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (random() - 0.5) * (kind === "ground" ? 48 : 36);
      image.data[i] = Math.max(0, Math.min(255, base[0] + n));
      image.data[i + 1] = Math.max(0, Math.min(255, base[1] + n));
      image.data[i + 2] = Math.max(0, Math.min(255, base[2] + n));
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const flecks = kind === "ground" ? 700 : kind === "bark" ? 180 : 260;
    for (let i = 0; i < flecks; i++) {
      const x = random() * size;
      const y = random() * size;
      const r = kind === "bark" ? random() * 2 + 0.6 : random() * 4 + 0.5;
      const light = random() > 0.55;
      ctx.fillStyle = light ? "rgba(151, 145, 112, 0.16)" : "rgba(13, 20, 12, 0.18)";
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (kind === "bark" ? 3.2 : 0.8), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    if (kind === "bark") {
      ctx.strokeStyle = "rgba(19, 23, 15, 0.22)";
      ctx.lineWidth = 3;
      for (let x = 18; x < size; x += 38) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x - 12, 80, x + 10, 170, x - 3, size);
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (kind === "ground" || kind === "bark" || kind === "rock") {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------
// Ambiance sonore synthétisée (rivière, insectes, oiseaux)
// ---------------------------------------------------------

class ForestAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private birdTimer = 0;
  private running = false;

  /** 0 = loin de l'eau, 1 = les pieds dans la rivière */
  setWaterProximity(v: number): void {
    if (!this.ctx || !this.waterGain) return;
    const target = 0.02 + 0.3 * Math.max(0, Math.min(1, v));
    this.waterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  start(): void {
    if (this.running) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);
    this.master.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 3);

    // Bruit brun : souffle de la forêt et murmure de la rivière
    const noise = this.makeNoise(ctx, "brown");
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.16;
    noise.connect(lp).connect(noiseGain).connect(this.master);
    noise.start();

    // Rivière : bruit blanc filtré, bouillonnement modulé
    const water = this.makeNoise(ctx, "white");
    const wbp = ctx.createBiquadFilter();
    wbp.type = "bandpass";
    wbp.frequency.value = 1400;
    wbp.Q.value = 0.7;
    const whp = ctx.createBiquadFilter();
    whp.type = "highpass";
    whp.frequency.value = 500;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0.02;
    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.35;
    const wlfoGain = ctx.createGain();
    wlfoGain.gain.value = 0.01;
    wlfo.connect(wlfoGain).connect(this.waterGain.gain);
    water.connect(wbp).connect(whp).connect(this.waterGain).connect(this.master);
    water.start();
    wlfo.start();

    // Insectes : bruit blanc filtré en bande, modulé lentement
    const insects = this.makeNoise(ctx, "white");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 14;
    const insectGain = ctx.createGain();
    insectGain.gain.value = 0.018;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(insectGain.gain);
    insects.connect(bp).connect(insectGain).connect(this.master);
    insects.start();
    lfo.start();

    this.running = true;
    this.scheduleBird();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.clearTimeout(this.birdTimer);
    const ctx = this.ctx;
    if (ctx && this.master) {
      this.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      window.setTimeout(() => void ctx.close().catch(() => undefined), 1000);
    }
    this.ctx = null;
    this.master = null;
    this.waterGain = null;
  }

  private makeNoise(ctx: AudioContext, kind: "brown" | "white"): AudioBufferSourceNode {
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  private scheduleBird(): void {
    if (!this.running) return;
    this.birdTimer = window.setTimeout(() => {
      this.chirp();
      this.scheduleBird();
    }, 1200 + Math.random() * 4500);
  }

  private chirp(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const notes = 1 + Math.floor(Math.random() * 4);
    const baseFreq = 1800 + Math.random() * 1800;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    pan.connect(this.master);
    let t = ctx.currentTime;
    for (let i = 0; i < notes; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const dur = 0.08 + Math.random() * 0.14;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * (1.2 + Math.random() * 0.5), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      osc.connect(g).connect(pan);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur + 0.05 + Math.random() * 0.1;
    }
  }
}

// ---------------------------------------------------------
// Effets sonores synthetises (tirs, lames, impacts)
// ---------------------------------------------------------

class SoundFx {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private noise(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    return src;
  }

  gunshot(kind: "pistol" | "rifle" | "shotgun"): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = kind === "shotgun" ? 0.78 : kind === "rifle" ? 0.5 : 0.6;
    out.connect(ctx.destination);

    const crack = this.noise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = kind === "shotgun" ? 280 : kind === "rifle" ? 900 : 500;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(1, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + (kind === "shotgun" ? 0.26 : kind === "rifle" ? 0.12 : 0.18));
    crack.connect(hp).connect(g1).connect(out);
    crack.start(t);
    crack.stop(t + 0.3);

    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(kind === "shotgun" ? 95 : kind === "rifle" ? 160 : 120, t);
    thump.frequency.exponentialRampToValueAtTime(32, t + (kind === "shotgun" ? 0.38 : 0.25));
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(kind === "shotgun" ? 1.15 : 0.9, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + (kind === "shotgun" ? 0.42 : 0.3));
    thump.connect(g2).connect(out);
    thump.start(t);
    thump.stop(t + 0.45);

    if (kind === "shotgun") {
      // Bruit métallique de la pompe du calibre 12 après le tir
      const pump = this.noise(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      bp.Q.value = 3;
      const gp = ctx.createGain();
      gp.gain.setValueAtTime(0.0001, t + 0.34);
      gp.gain.linearRampToValueAtTime(0.28, t + 0.38);
      gp.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
      pump.connect(bp).connect(gp).connect(out);
      pump.start(t + 0.34);
      pump.stop(t + 0.55);
    }

    // Echo lointain dans la foret
    const echo = this.noise(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.0001, t);
    g3.gain.linearRampToValueAtTime(0.18, t + 0.15);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    echo.connect(lp).connect(g3).connect(out);
    echo.start(t);
    echo.stop(t + 1.2);
  }

  swing(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.3);
  }

  hit(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  click(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  pickup(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [i, f] of [660, 990].entries()) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.07);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.07 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.15);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.2);
    }
  }
}

// =========================================================
// MOTEUR
// =========================================================

export class MinkebeGame {
  readonly ready: Promise<void>;

  private canvas: HTMLCanvasElement;
  private callbacks: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private rafId = 0;
  private disposed = false;
  private ambience = new ForestAmbience();

  private textures: Textures = {
    ground: null,
    bark: null,
    rock: null,
    waterNormal: null,
    foliage: null,
    fern: null,
    bigleaf: null,
  };

  private rng: () => number = Math.random;
  private worldSeed = 1;
  private worldGroup = new THREE.Group();
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fog!: THREE.FogExp2;
  private waterMesh: THREE.Mesh | null = null;
  private waterMaterial: THREE.ShaderMaterial | null = null;
  private waterUniforms: WaterMaterialUniforms | null = null;
  private streamUniforms: WaterMaterialUniforms | null = null;
  private dust: THREE.Points | null = null;

  private trees: TreeData[] = [];
  private treeGrid = new Map<string, { x: number; z: number; r: number }[]>();

  /** Arbres proches d'un point (cellules de 2 m, rayon 1 cellule). */
  private nearbyTrees(x: number, z: number): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    const cx = Math.floor(x / 2);
    const cz = Math.floor(z / 2);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const b = this.treeGrid.get(`${cx + i}:${cz + j}`);
        if (b) for (const t of b) out.push(t);
      }
    }
    return out;
  }
  private resources: ResourceData[] = [];
  private animals: AnimalData[] = [];
  private shelterGroup: THREE.Group | null = null;
  private shelterPos: { x: number; z: number } | null = null;

  private player = new THREE.Group();
  private playerBodyMat = makeMaterial(0xad7a47);
  private playerClothMat = makeMaterial(0xc9a227);
  private playerPantsMat = makeMaterial(0x38382f);
  private playerGearMat = makeMaterial(0x292f28);
  private playerHairMat = makeMaterial(0x211b18);
  private playerBootMat = makeMaterial(0x241f1a);
  private mannequin = new THREE.Group();
  private fallbackLimbs: { leftArm: THREE.Group; rightArm: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group } | null = null;
  private fallbackCycle = 0;
  private characterAssets: Record<CharacterId, CharacterAsset> | null = null;
  private rig: CharacterRig | null = null;
  private heldWeapon: THREE.Group | null = null;
  private fallbackSocket = new THREE.Object3D();
  private muzzleLight = new THREE.PointLight(0xffc070, 0, 6, 2);
  private muzzleFlash: THREE.Mesh;
  private muzzleTimer = 0;
  private playerYaw = 0;
  private sfx = new SoundFx();

  // Armes et combat
  private weapons: WeaponId[] = ["couteau"];
  private currentWeapon: WeaponId = "couteau";
  private ammoPistol = 0;
  private ammoRifle = 0;
  private ammoShotgun = 0;
  private kills = 0;
  private swimming = false;
  private swimRipple: THREE.Mesh | null = null;
  private sleepingTimer = 0;
  private sleepAdvanceRate = 0;

  // Niveaux d'évolution (Novice → Prix de Survie)
  private xp = 0;
  private xpTotalGained = 0;
  private lastSurvivalXpHour = -1;
  private reachedFinalLevel = false;
  private shelterFireLight: THREE.PointLight | null = null;
  private shelterFlames: THREE.Mesh[] = [];
  private shelterSparks: THREE.Points | null = null;
  private attackCooldown = 0;
  private pendingMeleeHit = false;
  private mouseLeft = false;
  private mouseRight = false;
  private hitMarkerUntil = 0;
  private huntingEnabled = true;
  private netRole: NetRole = "solo";
  private remotePlayers = new Map<string, RemotePlayer>();
  private newCollected: number[] = [];
  private outgoingHits: NetHit[] = [];
  private lastMoveState: "idle" | "walk" | "run" = "idle";
  private netAnimalTargets: NetAnimalState[] | null = null;
  private hasGps = false;
  private gpsOn = true;
  private hasNightVision = false;
  private nightVisionOn = false;
  private nvBattery = 1;
  private nvBlend = 0;
  private thermal: ThermalPass | null = null;
  private campPos: { x: number; z: number } | null = null;
  private postPos: { x: number; z: number } | null = null;
  private riverPath: { x: number; z: number }[] = [];
  private streamPath: { x: number; z: number }[] = [];
  private bloodPoints: THREE.Points | null = null;
  private blood: BloodParticle[] = [];

  private camYaw = 0;
  private camPitch = 0.3;
  private camDistance = 4.6;
  private cameraMode: CameraMode = "third";
  private camDistTarget = 4.6;
  private aimBlend = 0;

  private keys = new Set<string>();
  private pointerLocked = false;

  private gameStarted = false;
  private paused = false;
  private dead = false;
  private character: Character = "ANNIQUE";
  private health = 100;
  private hunger = 100;
  private thirst = 100;
  private stamina = 100;
  private inventory: Inventory = { Fruits: 0, Bois: 0, Pierres: 0, Viande: 0 };
  private hasSpear = false;
  private hasShelter = false;
  private inventoryOpen = false;
  private timeSurvived = 0;
  private dayLength = DAY_LENGTH_DEFAULT;
  private dayTime = (START_HOUR / 24) * DAY_LENGTH_DEFAULT;
  private resourcesCollected = 0;
  private lastDamageSource: "animal" | "hunger" | "thirst" | null = null;
  private threatNearby = false;

  private transientMessage = "";
  private transientUntil = 0;
  private snapshotAccumulator = 0;

  // Qualité / performances
  private quality: QualitySettings = QUALITY_PRESETS.hd;
  private renderScale = 1;
  private fpsSamples: number[] = [];
  private fpsSmoothed = 60;
  private lastQualityAdjust = 0;
  private isTouch = false;
  private touchMove = { x: 0, z: 0 };
  private touchLook = { x: 0, y: 0 };
  private touchRun = false;
  private touchJumpHeld = false;
  private touchBlock = false;

  // Style "Nikki" : tenues, collectibles, esprits
  private outfits: OutfitId[] = ["explo"];
  private currentOutfit: OutfitId = "explo";
  private outfitLayer: OutfitLayer | null = null;
  private stylePieces: Record<StylePieceKind, number> = { fleurs: 0, plumes: 0, perles: 0, fil: 0 };
  private collectibles: Collectible[] = [];
  private whimstarsTotal = 0;
  private nsisimTotal = 0;
  private styleScore = 0;
  private gliding = false;
  private companions = new Set<number>();
  private photoMode = false;
  private fireflies: THREE.Points | null = null;
  private skyUniforms: ReturnType<typeof createSkyDome>["uniforms"] | null = null;
  private nightAmount = 0;
  private purifyCooldown = 0;

  // Saut / esquive
  private jumpVelocity = 0;
  private jumpHeight = 0;
  private jumping = false;
  private dodgeUntil = 0;
  private lastDodgeFeedback = 0;
  private dodges = 0;
  private blocking = false;
  private blockStartedAt = -10;
  private parryLockUntil = 0;

  private mat = {
    ground: new THREE.MeshStandardMaterial({ color: 0x8c8c7a, roughness: 1.0, vertexColors: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0xb8a995, roughness: 0.95 }),
    rock: new THREE.MeshStandardMaterial({ color: 0xa8aaa0, roughness: 0.9 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.5 }),
    fern: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide, alphaTest: 0.5 }),
    bigleaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, alphaTest: 0.5 }),
    water: new THREE.MeshStandardMaterial({
      color: 0x2a4a3a,
      roughness: 0.12,
      metalness: 0.35,
      transparent: true,
      opacity: 0.86,
    }),
    riverbed: new THREE.MeshStandardMaterial({ color: 0x3a3220, roughness: 1.0 }),
    fruit: makeMaterial(0xc8360c, 0.45),
    wood: makeMaterial(0x6b3b1a),
    stone: makeMaterial(0x61665e),
    animal: makeMaterial(0x4a2e1a),
    animalAggressive: makeMaterial(0x2a1a10),
    shelter: makeMaterial(0x4d3017),
    leafRoof: makeMaterial(0x3b5a1f),
  };

  private tmpVec = new THREE.Vector3();
  private tmpVec2 = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.isTouch = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    this.quality = QUALITY_PRESETS[detectQualityPreset()];
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: "high-performance" });
    } catch {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    }
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = SCENE_CONFIG.exposure;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_CONFIG.fog.day);
    this.fog = new THREE.FogExp2(SCENE_CONFIG.fog.day, SCENE_CONFIG.fogDensity);
    this.scene.fog = this.fog;
    const sky = createSkyDome(400);
    this.skyUniforms = sky.uniforms;
    this.scene.add(sky.mesh);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, this.quality.preset === "mobile" ? 160 : 220);
    this.scene.add(this.worldGroup);

    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9 })
    );
    this.muzzleFlash.visible = false;
    this.scene.add(this.muzzleFlash);
    this.scene.add(this.muzzleLight);

    this.createEnvironment();
    this.createPlayer();
    this.resize();

    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("wheel", this.onWheel, { passive: false });
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);

    this.charLights = new CharacterLightKit(this.scene);
    try {
      this.realism = createRealismComposer(this.renderer, this.scene, this.camera, this.quality.preset === "mobile");
    } catch (err) {
      console.warn("Post-traitement indisponible", err);
      this.realism = null;
    }
    this.callbacks.onLoadProgress?.(8, "Initialisation du moteur 3D…");
    this.ready = this.loadAssets();
    this.clock.start();
    this.loop();
  }

  private async loadAssets(): Promise<void> {
    let loaded = 0;
    const track = <T,>(promise: Promise<T>, stage: string): Promise<T> =>
      promise.then((result) => {
        loaded += 1;
        if (!this.disposed) this.callbacks.onLoadProgress?.(Math.round(15 + (loaded / 7) * 78), stage);
        return result;
      });

    // Lance le chargement des modèles 3D en parallèle sans jamais bloquer l'ouverture du menu
    void loadCharacterAssets()
      .then((characters) => {
        if (this.disposed || !characters) return;
        this.characterAssets = characters;
        this.buildRig();
      })
      .catch(() => undefined);

    const [ground, bark, rock, waterNormal, foliage, fern, bigleaf] = await Promise.all([
      track(loadTiledTexture("/textures/ground.jpg", 1, true), "Sol de la forêt…"),
      track(loadTiledTexture("/textures/bark.jpg", 1, true), "Écorces et arbres…"),
      track(loadTiledTexture("/textures/rock.jpg", 1, true), "Rochers et reliefs…"),
      track(loadTiledTexture("/textures/water_normal.jpg", 1, false), "Rivière et reflets…"),
      track(loadKeyedTexture("/textures/foliage.png"), "Canopée et feuillage…"),
      track(loadKeyedTexture("/textures/fern.png"), "Fougères du sous-bois…"),
      track(loadKeyedTexture("/textures/bigleaf.png"), "Plantes tropicales…"),
    ]);
    if (this.disposed) return;
    const groundTexture = ground ?? createFallbackTexture("ground");
    const barkTexture = bark ?? createFallbackTexture("bark");
    const rockTexture = rock ?? createFallbackTexture("rock");
    const foliageTexture = foliage ?? createFallbackTexture("foliage");
    const fernTexture = fern ?? createFallbackTexture("fern");
    const bigleafTexture = bigleaf ?? createFallbackTexture("bigleaf");
    this.textures = {
      ground: groundTexture,
      bark: barkTexture,
      rock: rockTexture,
      waterNormal,
      foliage: foliageTexture,
      fern: fernTexture,
      bigleaf: bigleafTexture,
    };
    this.buildRig();

    if (groundTexture) {
      groundTexture.repeat.set(22, 22);
      this.mat.ground.map = groundTexture;
      this.mat.ground.color.setHex(0xffffff);
    }
    if (barkTexture) {
      barkTexture.repeat.set(1.6, 4.0);
      this.mat.trunk.map = barkTexture;
      this.mat.trunk.color.setHex(0xffffff);
    }
    if (rockTexture) {
      rockTexture.repeat.set(1.5, 1.5);
      this.mat.rock.map = rockTexture;
      this.mat.rock.color.setHex(0xffffff);
    }
    const applyCutout = (material: THREE.MeshStandardMaterial, tex: THREE.Texture | null, fallback: number) => {
      if (tex) {
        material.map = tex;
        material.alphaTest = 0.38;
        material.depthWrite = true;
        material.roughness = 0.82;
      } else {
        material.color.setHex(fallback);
        material.alphaTest = 0;
      }
      material.needsUpdate = true;
    };
    applyCutout(this.mat.foliage, foliageTexture, 0x1a4a1c);
    applyCutout(this.mat.fern, fernTexture, 0x2e6a24);
    applyCutout(this.mat.bigleaf, bigleafTexture, 0x2d6a2a);
    if (groundTexture) applyPbrMaps(this.mat.ground, groundTexture, 1.8);
    if (barkTexture) applyPbrMaps(this.mat.trunk, barkTexture, 2.2);
    if (rockTexture) applyPbrMaps(this.mat.rock, rockTexture, 1.7);
    this.mat.ground.color.setHex(0xffffff);
    this.mat.trunk.color.setHex(0xffffff);
    this.mat.rock.color.setHex(0xffffff);
    for (const m of [this.mat.foliage, this.mat.fern, this.mat.bigleaf]) {
      m.roughness = 0.68;
      m.metalness = 0;
      m.color.setHex(0xf2f6ee);
      m.emissive = new THREE.Color(0x000000);
      m.emissiveIntensity = 0;
      if (m.map) m.map.anisotropy = 4;
    }
    this.mat.fruit.color.setHex(0xff2a00);
    for (const m of Object.values(this.mat)) m.needsUpdate = true;
    this.applyToonLook();
    this.callbacks.onLoadProgress?.(100, "La forêt est prête !");
  }

  private worldPrebuilt = false;

  /** Direction artistique "Nikki" : cel-shading doux et couleurs saturées sur toute la nature. */
  private toonMats: Partial<Record<keyof MinkebeGame["mat"], THREE.MeshToonMaterial>> = {};

  private applyToonLook(): void {
    if (SCENE_CONFIG.natureStyle !== "toon") return;
    const keys: (keyof MinkebeGame["mat"])[] = ["ground", "trunk", "rock", "foliage", "fern", "bigleaf", "fruit", "wood", "stone", "animal", "animalAggressive", "shelter", "leafRoof"];
    for (const k of keys) {
      const base = this.mat[k];
      if (!(base instanceof THREE.MeshStandardMaterial)) continue;
      const toon = toToon(base, k === "foliage" || k === "fern" || k === "bigleaf" ? SCENE_CONFIG.toonSaturation + 0.13 : SCENE_CONFIG.toonSaturation);
      if (k === "ground") toon.color.setHex(0xe8e2c8);
      this.toonMats[k] = toon;
    }
  }

  /** Remplace les matériaux standard par leur version toon dans un objet. */
  private toonify(root: THREE.Object3D): void {
    if (SCENE_CONFIG.natureStyle !== "toon") return;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material;
      const swap = (m: THREE.Material): THREE.Material => {
        for (const k of Object.keys(this.toonMats) as (keyof MinkebeGame["mat"])[]) {
          if (this.mat[k] === m) return this.toonMats[k] as THREE.Material;
        }
        if (m instanceof THREE.MeshStandardMaterial && !(m as THREE.MeshStandardMaterial & { userData: { keep?: boolean } }).userData.keep) {
          const t = toToon(m, 1.1);
          t.gradientMap = getToonGradient();
          return t;
        }
        return m;
      };
      mesh.material = Array.isArray(mat) ? mat.map(swap) : swap(mat);
    });
  }

  // =========================================================
  // CYCLE DE VIE
  // =========================================================

  dispose(): void {
    this.disposed = true;
    this.ambience.stop();
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.rig?.dispose();
    this.thermal?.dispose();
    this.realism?.dispose();
    this.clearWorld();
    this.renderer.dispose();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.clock.getDelta();
  }

  setHunting(enabled: boolean): void {
    this.huntingEnabled = enabled;
  }

  // =========================================================
  // MULTIJOUEUR (API publique utilisée par le client réseau)
  // =========================================================

  setNetRole(role: NetRole): void {
    if (this.netRole === role) return;
    this.netRole = role;
    if (role === "solo") {
      for (const id of Array.from(this.remotePlayers.keys())) this.removeRemotePlayer(id);
      this.netAnimalTargets = null;
      this.newCollected = [];
      this.outgoingHits = [];
    }
    if (role === "host") this.netAnimalTargets = null;
  }

  get isOnline(): boolean {
    return this.netRole !== "solo";
  }

  getNetState(): NetPlayerState {
    return {
      x: this.player.position.x,
      z: this.player.position.z,
      yaw: this.playerYaw,
      move: this.dead ? "idle" : this.lastMoveState,
      weapon: this.currentWeapon,
      aiming: this.aimBlend > 0.5,
      dead: this.dead,
      health: this.health,
      shelterX: this.shelterPos?.x ?? null,
      shelterZ: this.shelterPos?.z ?? null,
    };
  }

  drainCollected(): number[] {
    const out = this.newCollected;
    this.newCollected = [];
    return out;
  }

  drainHits(): NetHit[] {
    const out = this.outgoingHits;
    this.outgoingHits = [];
    return out;
  }

  applySharedCollected(ids: number[]): void {
    const set = new Set(ids);
    for (const res of this.resources) {
      if (!res.collected && set.has(res.id)) {
        res.collected = true;
        res.group.visible = false;
      }
    }
  }

  getHostAnimalState(): { animals: NetAnimalState[]; dayTime: number } {
    return {
      animals: this.animals.map((a) => ({
        x: Math.round(a.group.position.x * 100) / 100,
        z: Math.round(a.group.position.z * 100) / 100,
        yaw: Math.round(a.group.rotation.y * 100) / 100,
        hp: Math.round(a.hp),
        dead: a.dead,
        butchered: a.butchered,
      })),
      dayTime: this.dayTime,
    };
  }

  applyNetAnimals(animals: NetAnimalState[] | null, dayTime: number | null): void {
    if (animals && animals.length > 0) this.netAnimalTargets = animals;
    if (dayTime !== null && Math.abs(dayTime - this.dayTime) > 2) this.dayTime = dayTime;
  }

  applyPendingHits(hits: NetHit[]): void {
    for (const h of hits) {
      const animal = this.animals[h.index];
      if (!animal) continue;
      if (h.damage < 0) {
        // Dépeçage par un autre joueur
        if (animal.dead && !animal.butchered) {
          animal.butchered = true;
          animal.group.visible = false;
          animal.respawnAt = this.clock.elapsedTime + 150;
        }
        continue;
      }
      this.damageAnimal(animal, h.damage, this.clock.elapsedTime, new THREE.Vector3(h.fromX, 0, h.fromZ));
    }
  }

  applyRemotePlayers(players: RemotePlayerInfo[]): void {
    const seen = new Set<string>();
    for (const info of players) {
      seen.add(info.playerId);
      let rp = this.remotePlayers.get(info.playerId);
      if (!rp) rp = this.createRemotePlayer(info);
      rp.info = info;
      rp.targetPos.set(info.state.x, 0, info.state.z);
      rp.targetYaw = info.state.yaw;
      rp.lastUpdate = performance.now();
      if (rp.weaponId !== info.state.weapon) {
        if (rp.weapon) rp.weapon.parent?.remove(rp.weapon);
        const id = (WEAPON_ORDER as string[]).includes(info.state.weapon) ? (info.state.weapon as WeaponId) : "couteau";
        rp.weapon = createWeaponModel(id);
        rp.weaponId = info.state.weapon;
        (rp.rig ? rp.rig.socket : rp.root).add(rp.weapon);
      }
      const key = info.state.shelterX === null ? "" : `${Math.round(info.state.shelterX)}:${Math.round(info.state.shelterZ ?? 0)}`;
      if (key !== rp.shelterKey) {
        if (rp.shelter) this.worldGroup.remove(rp.shelter);
        rp.shelter = null;
        rp.shelterKey = key;
        if (key && info.state.shelterX !== null && info.state.shelterZ !== null) {
          rp.shelter = this.buildShelterGroup(info.state.shelterX, info.state.shelterZ);
          this.toonify(rp.shelter);
          this.worldGroup.add(rp.shelter);
        }
      }
    }
    for (const id of Array.from(this.remotePlayers.keys())) {
      if (!seen.has(id)) this.removeRemotePlayer(id);
    }
  }

  private createRemotePlayer(info: RemotePlayerInfo): RemotePlayer {
    const root = new THREE.Group();
    root.position.set(info.state.x, terrainHeight(info.state.x, info.state.z), info.state.z);
    let rig: CharacterRig | null = null;
    if (this.characterAssets) {
      const id: CharacterId = info.character === "LANDRY" ? "LANDRY" : "ANNIQUE";
      rig = new CharacterRig(this.characterAssets[id]);
      rig.root.traverse((o) => o.layers.enable(7));
      root.add(rig.root);
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.04, 6, 12), makeMaterial(0x8a6a4a));
      body.position.y = 0.9;
      body.castShadow = true;
      root.add(body);
    }
    const tag = this.makeNameTag(info.name);
    tag.position.y = (rig?.height ?? 1.8) + 0.35;
    root.add(tag);
    const voiceIcon = this.makeVoiceIcon();
    voiceIcon.position.y = (rig?.height ?? 1.8) + 0.75;
    voiceIcon.visible = false;
    root.add(voiceIcon);
    this.scene.add(root);
    const rp: RemotePlayer = {
      info,
      root,
      rig,
      weapon: null,
      weaponId: "",
      tag,
      voiceIcon,
      targetPos: new THREE.Vector3(info.state.x, 0, info.state.z),
      targetYaw: info.state.yaw,
      shelter: null,
      shelterKey: "",
      lastUpdate: performance.now(),
    };
    this.remotePlayers.set(info.playerId, rp);
    return rp;
  }

  private removeRemotePlayer(id: string): void {
    const rp = this.remotePlayers.get(id);
    if (!rp) return;
    this.scene.remove(rp.root);
    rp.rig?.dispose();
    if (rp.shelter) this.worldGroup.remove(rp.shelter);
    (rp.tag.material as THREE.SpriteMaterial).map?.dispose();
    this.remotePlayers.delete(id);
  }

  private makeNameTag(name: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(5, 20, 10, 0.75)";
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 48, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 255, 160, 0.6)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#e8ffe8";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 16), 128, 33);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private makeVoiceIcon(): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(132, 204, 22, 0.9)";
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#06220a";
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔊", 32, 35);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(0.45, 0.45, 1);
    sprite.renderOrder = 11;
    return sprite;
  }

  private updateRemotePlayers(delta: number): void {
    for (const rp of this.remotePlayers.values()) {
      const st = rp.info.state;
      rp.voiceIcon.visible = Boolean(st.voice?.speaking);
      if (rp.voiceIcon.visible) {
        const pulse = 0.42 + Math.sin(performance.now() / 120) * 0.05;
        rp.voiceIcon.scale.set(pulse, pulse, 1);
      }
      const k = Math.min(1, delta * 10);
      const dx = rp.targetPos.x - rp.root.position.x;
      const dz = rp.targetPos.z - rp.root.position.z;
      if (Math.hypot(dx, dz) > 15) {
        rp.root.position.x = rp.targetPos.x;
        rp.root.position.z = rp.targetPos.z;
      } else {
        rp.root.position.x += dx * k;
        rp.root.position.z += dz * k;
      }
      const rpGroundY = terrainHeight(rp.root.position.x, rp.root.position.z);
      const rpWaterDepth = WATER_LEVEL - rpGroundY;
      const rpSwimming = rpWaterDepth > 0.25 && !st.dead;
      rp.root.position.y = rpSwimming ? WATER_LEVEL - 0.52 + Math.sin(this.clock.elapsedTime * 3.2) * 0.03 : rpGroundY;
      let dy = rp.targetYaw - rp.root.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      rp.root.rotation.y += dy * k;
      if (rp.rig) {
        const stale = performance.now() - rp.lastUpdate > 1500;
        const moving = Math.hypot(dx, dz) > 0.08 && !stale;
        rp.rig.setMoveState(st.dead ? "idle" : moving ? st.move === "run" ? "run" : "walk" : "idle", 1);
        rp.rig.setAiming(st.aiming && !st.dead && !rpSwimming, delta);
        rp.rig.setFallen(st.dead, delta);
        rp.rig.setSwimming(rpSwimming, moving, delta);
        rp.rig.setLookTarget(0, -0.05);
        rp.rig.setBodyDynamics(0, 0);
        rp.rig.update(delta, rp.root.quaternion, 0);
      }
    }
  }

  /** Public : bascule des gadgets depuis l'interface. */
  pressGadget(which: "gps" | "nightvision"): void {
    if (!this.gameStarted || this.dead) return;
    if (which === "gps") this.toggleGps();
    else this.toggleNightVision();
    this.emitSnapshot();
  }

  private toggleGps(): void {
    if (!this.hasGps) {
      this.say("Tu n'as pas de GPS. Cherche le poste des éco-gardes.", 3);
      return;
    }
    this.gpsOn = !this.gpsOn;
    this.sfx.click();
    this.say(this.gpsOn ? "GPS activé." : "GPS masqué.", 1.5);
  }

  private toggleNightVision(): void {
    if (!this.hasNightVision) {
      this.say("Tu n'as pas de lunettes infrarouges. Fouille le camp des braconniers.", 3);
      return;
    }
    if (!this.nightVisionOn && this.nvBattery <= 0.02) {
      this.sfx.click();
      this.say("Batterie des lunettes vide : recharge-la près du feu de ton abri.", 3);
      return;
    }
    this.nightVisionOn = !this.nightVisionOn;
    this.sfx.click();
    this.say(this.nightVisionOn ? "Vision thermique activée : la chaleur des animaux est visible à travers la végétation." : "Vision thermique coupée.", 2.5);
  }

  private updateGadgets(delta: number): void {
    if (this.nightVisionOn) {
      this.nvBattery = Math.max(0, this.nvBattery - delta / 150);
      if (this.nvBattery <= 0) {
        this.nightVisionOn = false;
        this.say("Batterie des lunettes épuisée.", 3);
      }
    } else if (this.hasNightVision && this.isNearShelter()) {
      this.nvBattery = Math.min(1, this.nvBattery + delta / 40);
    }
  }

  /** Radar permanent : cap et indices de direction (toujours disponible, sans GPS). */
  private buildCompassData(): CompassData {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const hints: CompassHint[] = [];
    const add = (kind: CompassHint["kind"], label: string, x: number, z: number, urgent = false) => {
      const dx = x - px;
      const dz = z - pz;
      const dist = Math.hypot(dx, dz);
      // Cap monde : atan2(dx, -dz) -> 0 = nord (-Z)
      const worldBearing = Math.atan2(dx, -dz);
      const camBearing = this.camYaw; // camYaw = 0 regarde vers -Z
      let rel = worldBearing + camBearing;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      hints.push({ kind, label, bearing: rel, distance: dist, urgent });
    };

    // Point d'eau le plus proche (échantillonnage de la rivière et de l'affluent)
    let bestW = Infinity;
    let wx = riverCenterX(pz);
    let wz = pz;
    for (let z = pz - 60; z <= pz + 60; z += 6) {
      const x = riverCenterX(z);
      const d = Math.hypot(x - px, z - pz);
      if (d < bestW) {
        bestW = d;
        wx = x;
        wz = z;
      }
    }
    if (px > riverCenterX(streamCenterZ(px)) - 2) {
      for (let x = px - 60; x <= px + 60; x += 6) {
        const z = streamCenterZ(x);
        const d = Math.hypot(x - px, z - pz);
        if (d < bestW) {
          bestW = d;
          wx = x;
          wz = z;
        }
      }
    }
    add("river", "Eau", wx, wz, this.thirst < 25);

    if (this.shelterPos) add("shelter", "Abri", this.shelterPos.x, this.shelterPos.z, this.health < 35);
    if (this.campPos) add("camp", "Camp braconniers", this.campPos.x, this.campPos.z);
    if (this.postPos) add("post", "Poste éco-gardes", this.postPos.x, this.postPos.z);

    const machette = this.resources.find((r) => r.kind === "Machette" && !r.collected);
    if (machette) add("machette", "Machette", machette.group.position.x, machette.group.position.z);

    // Nourriture la plus proche si on a faim
    if (this.hunger < 40) {
      let best: ResourceData | null = null;
      let bd = 70;
      for (const r of this.resources) {
        if (r.collected || r.kind !== "Fruits") continue;
        const d = Math.hypot(r.group.position.x - px, r.group.position.z - pz);
        if (d < bd) {
          bd = d;
          best = r;
        }
      }
      if (best) add("food", "Fruits", best.group.position.x, best.group.position.z, this.hunger < 20);
    }

    // Dangers proches et carcasses
    for (const a of this.animals) {
      const d = Math.hypot(a.group.position.x - px, a.group.position.z - pz);
      if (a.dead && !a.butchered && d < 40) add("carcass", "Carcasse", a.group.position.x, a.group.position.z);
      else if (!a.dead && a.aggressive && d < 30) add("danger", SPECIES[a.species].label, a.group.position.x, a.group.position.z, d < 12);
    }
    for (const rp of this.remotePlayers.values()) add("ally", rp.info.name, rp.root.position.x, rp.root.position.z);

    // Objectif suggéré
    let objective = "Explore la forêt";
    if (this.thirst < 30) objective = "Trouve de l'eau (E pour boire)";
    else if (this.hunger < 30) objective = this.inventory.Fruits > 0 ? "Mange un fruit (F)" : "Cherche des fruits rouges";
    else if (!this.weapons.includes("machette") && machette) objective = "Récupère la machette plantée dans la souche";
    else if (!this.hasShelter) objective = this.inventory.Bois >= 5 ? "Construis ton abri (B)" : `Ramasse du bois pour l'abri (${this.inventory.Bois}/5)`;
    else if (!this.weapons.includes("pistolet")) objective = "Fouille le camp des braconniers";
    else if (!this.weapons.includes("m16")) objective = "Rejoins le poste des éco-gardes (M16, GPS)";
    else if (this.inventory.Viande === 0) objective = "Chasse du gibier et grille la viande au feu";
    else objective = "Survis le plus longtemps possible";

    return { heading: -this.camYaw, hints, objective };
  }

  private buildGpsData(): GpsData {
    if (this.riverPath.length === 0) {
      for (let z = -WORLD_SIZE / 2; z <= WORLD_SIZE / 2; z += 4) this.riverPath.push({ x: riverCenterX(z), z });
      const zJoin = streamCenterZ(riverCenterX(26));
      for (let x = riverCenterX(zJoin); x <= WORLD_SIZE / 2; x += 3) this.streamPath.push({ x, z: streamCenterZ(x) });
    }
    const blips: GpsBlip[] = [];
    if (this.shelterPos) blips.push({ x: this.shelterPos.x, z: this.shelterPos.z, kind: "shelter" });
    if (this.campPos) blips.push({ x: this.campPos.x, z: this.campPos.z, kind: "camp" });
    if (this.postPos) blips.push({ x: this.postPos.x, z: this.postPos.z, kind: "post" });
    for (const a of this.animals) {
      if (a.dead && a.butchered) continue;
      const d = Math.hypot(a.group.position.x - this.player.position.x, a.group.position.z - this.player.position.z);
      // Portée du radar : 45 m, étendue à toute la carte avec la vision thermique active
      if (d > 45 && !this.nightVisionOn) continue;
      blips.push({ x: a.group.position.x, z: a.group.position.z, kind: a.dead ? "carcass" : a.aggressive ? "predator" : "animal" });
    }
    for (const rp of this.remotePlayers.values()) {
      blips.push({ x: rp.root.position.x, z: rp.root.position.z, kind: "ally", label: rp.info.name });
    }
    for (const r of this.resources) {
      if (r.collected) continue;
      if (r.kind === "Machette" || r.kind === "Pistolet" || r.kind === "M16" || r.kind === "Calibre12" || r.kind === "GPS" || r.kind === "LunettesIR") {
        blips.push({ x: r.group.position.x, z: r.group.position.z, kind: "weapon" });
      } else if (r.kind === "MunitionsPistolet" || r.kind === "MunitionsM16" || r.kind === "MunitionsCalibre12") {
        blips.push({ x: r.group.position.x, z: r.group.position.z, kind: "ammo" });
      }
    }
    return {
      x: this.player.position.x,
      z: this.player.position.z,
      heading: this.camYaw,
      river: this.riverPath,
      stream: this.streamPath,
      blips,
      worldSize: WORLD_SIZE,
    };
  }

  setAmbience(enabled: boolean): void {
    if (enabled) this.ambience.start();
    else this.ambience.stop();
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    const dist: Record<CameraMode, number> = { third: 4.8, shoulder: 2.35, first: 0.12, cinematic: 11, selfie: 2.4 };
    this.camDistTarget = dist[mode];
    if (mode === "first") this.camPitch = clamp(this.camPitch, -0.5, 0.7);
    if (mode === "selfie") this.camPitch = clamp(this.camPitch, -0.15, 0.35);
    const labels: Record<CameraMode, string> = {
      third: "Caméra : 3e personne",
      shoulder: "Caméra : épaule (action)",
      first: "Caméra : 1re personne",
      cinematic: "Caméra : cinématique",
      selfie: "Caméra : selfie",
    };
    this.say(labels[mode], 1.6);
    this.emitSnapshot();
  }

  cycleCamera(): void {
    const order: CameraMode[] = ["third", "shoulder", "first", "cinematic", "selfie"];
    const i = order.indexOf(this.cameraMode);
    this.setCameraMode(order[(i + 1) % order.length]);
  }

  requestPointerLock(): void {
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => undefined);
      }
    } catch {
      // ignoré
    }
  }

  // =========================================================
  // DEMARRAGE / SAUVEGARDE
  // =========================================================

  /** Bonus du Pass Explorateur : machette dès le départ. */
  grantStarterKit(): void {
    if (!this.gameStarted) return;
    if (!this.weapons.includes("machette")) this.weapons.push("machette");
    this.weapons.sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot);
    this.say("Pass Explorateur : une machette t'accompagne dès le départ (touche 2).", 4);
    this.emitSnapshot();
  }

  startNewGame(character: Character, seed?: number): void {
    if (seed === undefined && this.worldPrebuilt && this.trees.length > 0) {
      // Réutilise instantanément le monde pré-généré pendant l'écran de chargement
      this.worldPrebuilt = false;
    } else {
      this.worldPrebuilt = false;
      this.buildWorld(seed ?? Math.floor(Math.random() * 2_000_000_000) + 1);
    }
    this.character = character;
    this.applyCharacterLook();
    this.health = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.stamina = 100;
    this.inventory = { Fruits: 0, Bois: 0, Pierres: 0, Viande: 0 };
    this.hasSpear = false;
    this.hasShelter = false;
    this.inventoryOpen = false;
    this.timeSurvived = 0;
    this.resourcesCollected = 0;
    this.dayTime = (START_HOUR / 24) * this.dayLength;
    this.dead = false;
    this.lastDamageSource = null;
    this.weapons = ["couteau"];
    this.currentWeapon = "couteau";
    this.ammoPistol = 0;
    this.ammoRifle = 0;
    this.ammoShotgun = 0;
    this.kills = 0;
    this.swimming = false;
    this.sleepingTimer = 0;
    this.sleepAdvanceRate = 0;
    this.xp = 0;
    this.xpTotalGained = 0;
    this.lastSurvivalXpHour = -1;
    this.reachedFinalLevel = false;
    this.attackCooldown = 0;
    this.mouseLeft = false;
    this.mouseRight = false;
    this.hasGps = false;
    this.gpsOn = true;
    this.hasNightVision = false;
    this.nightVisionOn = false;
    this.nvBattery = 1;
    this.jumping = false;
    this.jumpHeight = 0;
    this.dodges = 0;
    this.outfits = ["explo"];
    this.currentOutfit = "explo";
    this.stylePieces = { fleurs: 0, plumes: 0, perles: 0, fil: 0 };
    this.styleScore = 0;
    this.companions.clear();
    this.photoMode = false;
    this.applyOutfit();
    this.removeShelter();
    this.updateHeldWeapon();
    this.player.position.set(0, terrainHeight(0, 0), 0);
    this.playerYaw = 0;
    this.camYaw = 0;
    this.camPitch = 0.3;
    this.cameraMode = "third";
    this.camDistance = 4.6;
    this.camDistTarget = 4.6;
    this.gameStarted = true;
    this.paused = false;
    this.ambience.start();
    this.say("Explore la forêt de Minkébé. La rivière coule à l'ouest.", 5);
    this.emitSnapshot();
  }

  applySave(data: SaveData): void {
    if (!this.gameStarted || data.worldSeed !== this.worldSeed) {
      this.buildWorld(data.worldSeed);
    }
    this.character = data.character;
    this.applyCharacterLook();
    this.health = clamp(data.health, 0, 100);
    this.hunger = clamp(data.hunger, 0, 100);
    this.thirst = clamp(data.thirst, 0, 100);
    this.stamina = clamp(data.stamina, 0, 100);
    this.inventory = {
      Fruits: Math.max(0, Math.floor(data.inventory?.Fruits ?? 0)),
      Bois: Math.max(0, Math.floor(data.inventory?.Bois ?? 0)),
      Pierres: Math.max(0, Math.floor(data.inventory?.Pierres ?? 0)),
      Viande: Math.max(0, Math.floor(data.inventory?.Viande ?? 0)),
    };
    this.hasSpear = Boolean(data.hasSpear);
    this.hasShelter = Boolean(data.hasShelter);
    this.timeSurvived = Math.max(0, data.timeSurvived ?? 0);
    this.resourcesCollected = data.collectedIds?.length ?? 0;
    this.dead = this.health <= 0;
    this.lastDamageSource = null;

    const validWeapons = (data.weapons ?? []).filter((w): w is WeaponId => WEAPON_ORDER.includes(w));
    this.weapons = validWeapons.length > 0 ? Array.from(new Set(["couteau" as WeaponId, ...validWeapons])) : ["couteau"];
    if (this.hasSpear && !this.weapons.includes("lance")) this.weapons.push("lance");
    this.currentWeapon = this.weapons.includes(data.currentWeapon) ? data.currentWeapon : "couteau";
    this.ammoPistol = Math.max(0, Math.floor(data.ammoPistol ?? 0));
    this.ammoRifle = Math.max(0, Math.floor(data.ammoRifle ?? 0));
    this.ammoShotgun = Math.max(0, Math.floor(data.ammoShotgun ?? 0));
    this.kills = Math.max(0, Math.floor(data.kills ?? 0));
    this.swimming = false;
    this.sleepingTimer = 0;
    this.attackCooldown = 0;
    this.mouseLeft = false;
    this.mouseRight = false;
    this.hasGps = Boolean(data.hasGps);
    this.hasNightVision = Boolean(data.hasNightVision);
    this.nvBattery = clamp(data.nvBattery ?? 1, 0, 1);
    if (typeof data.gameHour === "number" && Number.isFinite(data.gameHour)) {
      this.dayTime = (clamp(data.gameHour, 0, 24) / 24) * this.dayLength;
    }
    const validOutfits = (data.outfits ?? []).filter((o): o is OutfitId => OUTFIT_ORDER.includes(o));
    this.outfits = Array.from(new Set<OutfitId>(["explo", ...validOutfits]));
    this.currentOutfit = data.currentOutfit && this.outfits.includes(data.currentOutfit) ? data.currentOutfit : "explo";
    this.stylePieces = {
      fleurs: Math.max(0, Math.floor(data.stylePieces?.fleurs ?? 0)),
      plumes: Math.max(0, Math.floor(data.stylePieces?.plumes ?? 0)),
      perles: Math.max(0, Math.floor(data.stylePieces?.perles ?? 0)),
      fil: Math.max(0, Math.floor(data.stylePieces?.fil ?? 0)),
    };
    this.styleScore = Math.max(0, Math.floor(data.styleScore ?? 0));
    this.xp = Math.max(0, Math.floor(data.xp ?? 0));
    this.xpTotalGained = this.xp;
    this.reachedFinalLevel = levelFromXp(this.xp) >= MAX_LEVEL;
    const takenSet = new Set(data.collectedWhimsy ?? []);
    for (const c of this.collectibles) {
      c.taken = takenSet.has(c.id);
      c.group.visible = !c.taken;
    }
    this.companions.clear();
    this.applyOutfit();
    this.nightVisionOn = false;
    this.gpsOn = true;

    const collected = new Set(data.collectedIds ?? []);
    for (const res of this.resources) {
      res.collected = collected.has(res.id);
      res.group.visible = !res.collected;
    }

    this.removeShelter();
    if (this.hasShelter && data.shelterX !== null && data.shelterZ !== null) {
      this.spawnShelter(data.shelterX, data.shelterZ);
    } else if (this.hasShelter) {
      this.spawnShelter(data.positionX + 2, data.positionZ);
    }
    this.updateHeldWeapon();

    const half = WORLD_SIZE / 2 - 1;
    const px = clamp(data.positionX, -half, half);
    const pz = clamp(data.positionZ, -half, half);
    this.player.position.set(px, terrainHeight(px, pz), pz);
    this.gameStarted = true;
    this.paused = false;
    this.ambience.start();
    this.say("Partie chargée !", 3);
    this.emitSnapshot();
  }

  getSaveData(): SaveData {
    return {
      character: this.character,
      health: this.health,
      hunger: this.hunger,
      thirst: this.thirst,
      stamina: this.stamina,
      positionX: this.player.position.x,
      positionY: 1.1,
      positionZ: this.player.position.z,
      inventory: { ...this.inventory },
      hasSpear: this.hasSpear,
      hasShelter: this.hasShelter,
      shelterX: this.shelterPos?.x ?? null,
      shelterZ: this.shelterPos?.z ?? null,
      collectedIds: this.resources.filter((r) => r.collected).map((r) => r.id),
      worldSeed: this.worldSeed,
      timeSurvived: this.timeSurvived,
      weapons: [...this.weapons],
      currentWeapon: this.currentWeapon,
      ammoPistol: this.ammoPistol,
      ammoRifle: this.ammoRifle,
      ammoShotgun: this.ammoShotgun,
      kills: this.kills,
      hasGps: this.hasGps,
      hasNightVision: this.hasNightVision,
      nvBattery: this.nvBattery,
      gameHour: this.gameHour,
      outfits: [...this.outfits],
      currentOutfit: this.currentOutfit,
      stylePieces: { ...this.stylePieces },
      whimstars: this.whimstarsCollected(),
      collectedWhimsy: this.collectibles.filter((c) => c.taken).map((c) => c.id),
      styleScore: this.styleScore,
      xp: this.xp,
    };
  }

  notify(text: string, seconds = 3): void {
    this.say(text, seconds);
    this.emitSnapshot();
  }

  // =========================================================
  // ENVIRONNEMENT
  // =========================================================

  private prevPlayerYaw = 0;
  private yawRate = 0;
  private contactShadow: THREE.Mesh | null = null;
  private charLights: CharacterLightKit | null = null;
  private realism: RealismComposer | null = null;

  private createEnvironment(): void {
    // Ombre de contact douce sous le personnage
    const shadowTex = (() => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext("2d")!;
      const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
      g.addColorStop(0, "rgba(0,0,0,0.55)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      return t;
    })();
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.renderOrder = 1;
    this.scene.add(this.contactShadow);

    // Sillage d'eau autour du personnage lorsqu'il traverse la rivière à la nage
    const rippleGeo = new THREE.RingGeometry(0.32, 0.72, 24);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0xdff8ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.swimRipple = new THREE.Mesh(rippleGeo, rippleMat);
    this.swimRipple.rotation.x = -Math.PI / 2;
    this.swimRipple.renderOrder = 3;
    this.swimRipple.visible = false;
    this.scene.add(this.swimRipple);
    this.hemi = new THREE.HemisphereLight(SCENE_CONFIG.light.hemiSky, SCENE_CONFIG.light.hemiGround, 0.85);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0c2, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 140;
    const shadowExtent = this.quality.preset === "mobile" ? 22 : 30;
    this.sun.shadow.camera.left = -shadowExtent;
    this.sun.shadow.camera.right = shadowExtent;
    this.sun.shadow.camera.top = shadowExtent;
    this.sun.shadow.camera.bottom = -shadowExtent;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  private clearWorld(): void {
    this.worldGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !mesh.geometry.userData?.shared) mesh.geometry.dispose();
    });
    this.worldGroup.clear();
    this.trees = [];
    this.treeGrid = new Map();
    this.resources = [];
    this.animals = [];
    this.shelterGroup = null;
    this.shelterPos = null;
    this.bloodPoints = null;
    this.blood = [];
    this.collectibles = [];
    this.fireflies = null;
    this.companions.clear();
    this.campPos = null;
    this.postPos = null;
    this.riverPath = [];
    this.streamPath = [];
    this.waterMesh = null;
    this.waterMaterial = null;
    this.waterUniforms = null;
    this.streamUniforms = null;
    this.dust = null;
  }

  private buildWorld(seed: number): void {
    this.clearWorld();
    this.worldSeed = seed;
    this.rng = mulberry32(seed);
    this.createGround();
    this.createTrees();
    this.createUndergrowth();
    this.createRocks();
    this.createRiver();
    this.createPalms();
    this.createRiverCanopy();
    this.createDust();
    this.createResources();
    this.createAnimals();
    this.createWhimsy();
    this.toonify(this.worldGroup);
    this.fireflies = createFireflies(this.quality.preset === "mobile" ? SCENE_CONFIG.fireflies.mobile : SCENE_CONFIG.fireflies.desktop);
    this.worldGroup.add(this.fireflies);
  }

  // =========================================================
  // MONDE : étoiles de rêve, pièces de style, Nsisim
  // =========================================================

  private createWhimsy(): void {
    this.collectibles = [];
    let id = 0;
    const place = (kind: CollectibleKind, x: number, z: number, lift: number) => {
      const group = createCollectibleMesh(kind);
      const y = terrainHeight(x, z) + lift;
      group.position.set(x, y, z);
      this.worldGroup.add(group);
      this.collectibles.push({ id: id++, kind, group, baseY: y, taken: false, wander: kind === "nsisim" ? new THREE.Vector3(this.randRange(-1, 1), 0, this.randRange(-1, 1)).normalize() : undefined });
    };
    const half = WORLD_SIZE / 2 - 6;

    // Étoiles de rêve : certaines au sol, d'autres en hauteur (double saut / plané), d'autres au-dessus de l'eau (tenue Nénuphar)
    const stars = this.quality.preset === "mobile" ? 36 : 48;
    for (let i = 0; i < stars; i++) {
      let x = this.randRange(-half, half);
      let z = this.randRange(-half, half);
      const mode = i % 4;
      let lift = 0.2;
      if (mode === 1) lift = 2.6; // double saut
      if (mode === 2) {
        lift = 4.2; // il faut planer depuis un rocher / une pente, ou double saut au sommet d'une butte
      }
      if (mode === 3) {
        // au-dessus de la rivière
        z = this.randRange(-half, half);
        x = riverCenterX(z) + this.randRange(-1.5, 1.5);
        lift = 1.0 - (terrainHeight(x, z) - WATER_LEVEL);
      }
      if (Math.hypot(x, z) < 5) x += 8;
      place("whimstar", x, z, lift);
    }
    this.whimstarsTotal = stars;

    // Pièces de style
    for (let i = 0; i < 40; i++) {
      const x = this.randRange(-half, half);
      const z = this.randRange(-half, half);
      if (distanceToWaterEdge(x, z) < 0.5) continue;
      place("fleurs", x, z, 0);
    }
    for (let i = 0; i < 34; i++) {
      // Plumes : près des arbres
      const t = this.trees[Math.floor(this.rng() * this.trees.length)];
      if (!t) break;
      const a = this.randRange(0, Math.PI * 2);
      place("plumes", t.x + Math.cos(a) * 1.6, t.z + Math.sin(a) * 1.6, 0.1);
    }
    for (let i = 0; i < 34; i++) {
      // Perles : sur les berges
      const z = this.randRange(-half, half);
      const side = i % 2 === 0 ? -1 : 1;
      const x = riverCenterX(z) + side * (riverHalfWidth(z) + this.randRange(0.2, 1.2));
      place("perles", x, z, 0.05);
    }
    for (let i = 0; i < 26; i++) {
      // Fils de Rêve : cachés plus loin
      const a = this.randRange(0, Math.PI * 2);
      const r = this.randRange(25, half);
      place("fil", Math.cos(a) * r, Math.sin(a) * r, 0.1);
    }

    // Nsisim : petits esprits lumineux de la forêt errants
    const nsisim = 10;
    for (let i = 0; i < nsisim; i++) {
      const a = this.randRange(0, Math.PI * 2);
      const r = this.randRange(15, half);
      place("nsisim", Math.cos(a) * r, Math.sin(a) * r, 0);
    }
    this.nsisimTotal = nsisim;
  }

  private updateWhimsy(delta: number, elapsed: number): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const py = this.player.position.y;
    const glowMul = OUTFITS[this.currentOutfit].ability === "glow" ? 2 : 1;
    for (const c of this.collectibles) {
      if (c.taken) continue;
      const g = c.group;
      if (c.kind === "whimstar") {
        g.rotation.y = elapsed * 1.5;
        g.position.y = c.baseY + Math.sin(elapsed * 2 + c.id) * 0.12;
      } else if (c.kind === "nsisim" && c.wander) {
        // Erre doucement, s'approche du joueur quand il est proche
        const dx = px - g.position.x;
        const dz = pz - g.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 10 && d > 1.2) {
          c.wander.set(dx / d, 0, dz / d);
        } else if (Math.random() < 0.5 * delta) {
          c.wander.set(this.randRange(-1, 1), 0, this.randRange(-1, 1)).normalize();
        }
        g.position.x += c.wander.x * 1.4 * delta;
        g.position.z += c.wander.z * 1.4 * delta;
        g.position.x = clamp(g.position.x, -WORLD_SIZE / 2, WORLD_SIZE / 2);
        g.position.z = clamp(g.position.z, -WORLD_SIZE / 2, WORLD_SIZE / 2);
        g.position.y = terrainHeight(g.position.x, g.position.z) + Math.sin(elapsed * 3 + c.id) * 0.15;
        g.rotation.y = Math.atan2(-c.wander.x, -c.wander.z);
      } else {
        g.position.y = c.baseY + Math.sin(elapsed * 2.5 + c.id) * 0.03;
        g.rotation.y = elapsed * 0.6;
      }
      // Ramassage automatique au contact (ou au saut pour les étoiles en hauteur)
      const dx = px - g.position.x;
      const dz = pz - g.position.z;
      const dy = py + 1.0 - (g.position.y + 0.5);
      if (dx * dx + dz * dz < 1.1 && Math.abs(dy) < 1.4) this.takeCollectible(c, glowMul);
    }
  }

  private takeCollectible(c: Collectible, glowMul: number): void {
    c.taken = true;
    c.group.visible = false;
    this.sfx.pickup();
    switch (c.kind) {
      case "whimstar":
        this.styleScore += 25;
        this.say(`✨ Étoile de Rêve ! (${this.whimstarsCollected()} / ${this.whimstarsTotal})`, 2.5);
        break;
      case "nsisim":
        this.styleScore += 40;
        this.stylePieces.fil += 2 * glowMul;
        this.addXp(XP.nsisim);
        this.say(`Un Nsisim t'offre ${2 * glowMul} Fils de Rêve en bénédiction ! (+${XP.nsisim} XP)`, 3);
        break;
      default:
        this.stylePieces[c.kind] += glowMul;
        this.styleScore += 5;
        this.addXp(Math.round(XP.resource / 2));
        this.say(`+${glowMul} ${this.pieceLabel(c.kind)} (+${Math.round(XP.resource / 2)} XP)`, 1.6);
    }
  }

  private pieceLabel(kind: StylePieceKind): string {
    return { fleurs: "Fleur d'hibiscus", plumes: "Plume de touraco", perles: "Perle de rivière", fil: "Fil de Rêve" }[kind];
  }

  private whimstarsCollected(): number {
    return this.collectibles.filter((c) => c.kind === "whimstar" && c.taken).length;
  }

  private nsisimMet(): number {
    return this.collectibles.filter((c) => c.kind === "nsisim" && c.taken).length;
  }

  // =========================================================
  // TENUES ET CAPACITÉS
  // =========================================================

  get outfit() {
    return OUTFITS[this.currentOutfit];
  }

  private applyOutfit(): void {
    if (this.outfitLayer) {
      this.outfitLayer.group.parent?.remove(this.outfitLayer.group);
      this.outfitLayer = null;
    }
    const height = this.rig?.height ?? 1.8;
    const layer = buildOutfitLayer(OUTFITS[this.currentOutfit], height);
    layer.group.traverse((o) => o.layers.enable(7));
    this.player.add(layer.group);
    this.outfitLayer = layer;
  }

  canWeave(id: OutfitId): { ok: boolean; missing: string[] } {
    const def = OUTFITS[id];
    const missing: string[] = [];
    if (this.stylePieces.fil < def.threadCost) missing.push(`${def.threadCost - this.stylePieces.fil} Fil de Rêve`);
    for (const [k, v] of Object.entries(def.requires) as [StylePieceKind, number][]) {
      if ((this.stylePieces[k] ?? 0) < v) missing.push(`${v - this.stylePieces[k]} ${this.pieceLabel(k)}`);
    }
    return { ok: missing.length === 0, missing };
  }

  /** Public : tisser une tenue (depuis le dressing). */
  weaveOutfit(id: OutfitId): boolean {
    if (this.outfits.includes(id)) {
      this.wearOutfit(id);
      return true;
    }
    const check = this.canWeave(id);
    if (!check.ok) {
      this.say(`Il manque : ${check.missing.join(", ")}.`, 3.5);
      this.emitSnapshot();
      return false;
    }
    const def = OUTFITS[id];
    this.stylePieces.fil -= def.threadCost;
    for (const [k, v] of Object.entries(def.requires) as [StylePieceKind, number][]) this.stylePieces[k] -= v;
    this.outfits.push(id);
    this.outfits.sort((a, b) => OUTFIT_ORDER.indexOf(a) - OUTFIT_ORDER.indexOf(b));
    this.styleScore += def.styleScore;
    this.wearOutfit(id);
    this.say(`✨ Tenue tissée : ${def.name} — ${def.abilityLabel}.`, 5);
    return true;
  }

  /** Public : porter une tenue possédée. */
  wearOutfit(id: OutfitId): void {
    if (!this.outfits.includes(id)) return;
    this.currentOutfit = id;
    this.applyOutfit();
    this.sfx.pickup();
    this.emitSnapshot();
  }

  cycleOutfit(): void {
    if (this.outfits.length < 2) {
      this.say("Tu n'as qu'une tenue. Collecte des Fils de Rêve et des pièces de style pour en tisser.", 3);
      return;
    }
    const idx = this.outfits.indexOf(this.currentOutfit);
    this.wearOutfit(this.outfits[(idx + 1) % this.outfits.length]);
    this.say(`${this.outfit.name} — ${this.outfit.abilityLabel}`, 2.5);
  }

  togglePhotoMode(): void {
    if (!this.gameStarted) return;
    this.photoMode = !this.photoMode;
    this.say(this.photoMode ? "📸 Mode photo : interface masquée, Échap ou P pour quitter." : "Mode photo terminé.", 2.5);
    this.emitSnapshot();
  }

  get isPhotoMode(): boolean {
    return this.photoMode;
  }

  /** Apprivoisement (tenue Murmure des Bêtes) : l'animal le plus proche devient compagnon. */
  private tryTame(): boolean {
    if (this.outfit.ability !== "tame") return false;
    let best = -1;
    let bd = 4;
    this.animals.forEach((a, i) => {
      if (a.dead || this.companions.has(i)) return;
      const d = Math.hypot(a.group.position.x - this.player.position.x, a.group.position.z - this.player.position.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) return false;
    const a = this.animals[best];
    this.companions.add(best);
    a.aggressive = false;
    a.fleeUntil = 0;
    this.styleScore += 30;
    this.sfx.pickup();
    this.say(`🐾 ${SPECIES[a.species].label} apprivoisé ! Il te suit désormais.`, 4);
    return true;
  }

  private nearTameableLabel(): string | null {
    if (this.outfit.ability !== "tame") return null;
    for (const [i, a] of this.animals.entries()) {
      if (a.dead || this.companions.has(i)) continue;
      if (Math.hypot(a.group.position.x - this.player.position.x, a.group.position.z - this.player.position.z) < 4) return SPECIES[a.species].label;
    }
    return null;
  }

  /** Purification (tenue Purificatrice) : calme les prédateurs dans un rayon de 15 m. */
  private purify(): void {
    if (this.purifyCooldown > 0) return;
    this.purifyCooldown = 12;
    let count = 0;
    for (const a of this.animals) {
      if (a.dead || !a.aggressive) continue;
      const d = Math.hypot(a.group.position.x - this.player.position.x, a.group.position.z - this.player.position.z);
      if (d < 15) {
        a.fleeUntil = this.clock.elapsedTime + 20;
        count += 1;
      }
    }
    this.styleScore += count * 10;
    this.sfx.pickup();
    this.say(count > 0 ? `✨ Onde de pureté : ${count} animal(aux) apaisé(s).` : "✨ Onde de pureté… la forêt est déjà paisible.", 3);
  }

  private updateCompanions(delta: number): void {
    for (const i of this.companions) {
      const a = this.animals[i];
      if (!a || a.dead) continue;
      const dx = this.player.position.x - a.group.position.x;
      const dz = this.player.position.z - a.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 3.5) {
        a.direction.set(dx / d, 0, dz / d);
        const sp = Math.min(6, d * 0.9);
        a.group.position.x += a.direction.x * sp * delta;
        a.group.position.z += a.direction.z * sp * delta;
        a.group.rotation.y = Math.atan2(-a.direction.x, -a.direction.z);
      }
    }
  }

  private randRange(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  private createGround(): void {
    const size = WORLD_SIZE + 60;
    const segments = this.quality.preset === "mobile" ? 96 : 140;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i); // = -z monde après rotation
      const h = terrainHeight(x, -y);
      pos.setZ(i, h);
      // Variation de teinte : plus sombre et humide près de la rivière, mousse ailleurs
      const edge = distanceToWaterEdge(x, -y);
      const wet = 1 - smoothstep(-1, 6, edge);
      const n = 0.5 + 0.5 * Math.sin(x * 0.37 + 2) * Math.cos(-y * 0.29 + 1);
      const shade = 0.92 + 0.22 * n;
      colors[i * 3] = shade * (1 - wet * 0.35);
      colors[i * 3 + 1] = shade * (1 - wet * 0.25);
      colors[i * 3 + 2] = shade * (1 - wet * 0.4);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, this.mat.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.worldGroup.add(ground);
  }

  private createTrees(): void {
    type T = { x: number; z: number; h: number; r: number; lean: number; leanDir: number };
    const list: T[] = [];
    const cell = 2.0;
    const grid = new Map<string, T[]>();
    const key = (x: number, z: number) => `${Math.floor(x / cell)}:${Math.floor(z / cell)}`;
    const tooClose = (x: number, z: number, minD: number) => {
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const bucket = grid.get(`${cx + i}:${cz + j}`);
          if (!bucket) continue;
          for (const t of bucket) if (Math.hypot(t.x - x, t.z - z) < minD) return true;
        }
      }
      return false;
    };
    const groves: { x: number; z: number; r: number }[] = [];
    for (let g = 0; g < 16; g++) {
      groves.push({
        x: this.randRange(-WORLD_SIZE / 2 + 10, WORLD_SIZE / 2 - 10),
        z: this.randRange(-WORLD_SIZE / 2 + 10, WORLD_SIZE / 2 - 10),
        r: this.randRange(8, 18),
      });
    }
    const clearings: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: 9 }];
    for (let c = 0; c < 5; c++) {
      clearings.push({ x: this.randRange(-50, 50), z: this.randRange(-50, 50), r: this.randRange(6, 11) });
    }

    const target = Math.round(TREE_COUNT * (this.quality.preset === "mobile" ? 0.7 : 1));
    for (let i = 0; i < target * 5 && list.length < target; i++) {
      let x: number;
      let z: number;
      if (this.rng() < 0.7) {
        const gv = groves[Math.floor(this.rng() * groves.length)];
        const ang = this.randRange(0, Math.PI * 2);
        const rad = gv.r * Math.sqrt(this.rng());
        x = gv.x + Math.cos(ang) * rad;
        z = gv.z + Math.sin(ang) * rad;
      } else {
        x = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
        z = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
      }
      if (clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
      const roll = this.rng();
      const h = roll < 0.18 ? this.randRange(4.2, 7.5) : roll < 0.88 ? this.randRange(8, 14) : this.randRange(15, 22);
      const r = this.randRange(0.22, 0.22 + h * 0.035);
      const lean = this.randRange(0, 0.12);
      const leanDir = this.randRange(0, Math.PI * 2);
      if (Math.hypot(x, z) < 6) continue;
      if (distanceToWaterEdge(x, z) < 2.2) continue;
      if (tooClose(x, z, 1.35 + r)) continue;
      const t = { x, z, h, r, lean, leanDir };
      list.push(t);
      const k = key(x, z);
      const bucket = grid.get(k);
      if (bucket) bucket.push(t);
      else grid.set(k, [t]);
    }
    this.treeGrid = grid;
    const n = list.length;
    const dummy = new THREE.Object3D();

    // Troncs (légèrement coniques) + contreforts racinaires
    const trunkGeo = new THREE.CylinderGeometry(0.62, 1, 1, 12, 1, true);
    const trunks = new THREE.InstancedMesh(trunkGeo, this.mat.trunk, n);
    const rootGeo = new THREE.CylinderGeometry(0.05, 0.3, 1, 6);
    const roots = new THREE.InstancedMesh(rootGeo, this.mat.trunk, n * 4);
    const branchGeo = new THREE.CylinderGeometry(0.06, 0.16, 1, 6);
    const branches = new THREE.InstancedMesh(branchGeo, this.mat.trunk, n * 3);

    // Feuillage : quads croisés autour de la couronne
    const FOL_PER_TREE = 6;
    const quadGeo = new THREE.PlaneGeometry(1, 1);
    const foliage = new THREE.InstancedMesh(quadGeo, this.mat.foliage, n * FOL_PER_TREE * 2);

    let fIdx = 0;
    list.forEach((t, i) => {
      const gy = terrainHeight(t.x, t.z);
      this.trees.push({ x: t.x, z: t.z, r: t.r });

      dummy.position.set(t.x, gy + t.h / 2 - 0.3, t.z);
      dummy.rotation.set(Math.cos(t.leanDir) * t.lean, this.randRange(0, Math.PI * 2), Math.sin(t.leanDir) * t.lean);
      dummy.scale.set(t.r, t.h, t.r);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      for (let k = 0; k < 4; k++) {
        const angle = (k * Math.PI) / 2 + this.randRange(-0.4, 0.4);
        const len = this.randRange(1.4, 2.6);
        dummy.position.set(t.x + Math.cos(angle) * (t.r + 0.5), gy + 0.35, t.z + Math.sin(angle) * (t.r + 0.5));
        dummy.rotation.set(0, -angle, -0.95);
        dummy.scale.set(t.r * 1.6, len, t.r * 1.2);
        dummy.updateMatrix();
        roots.setMatrixAt(i * 4 + k, dummy.matrix);
      }

      for (let k = 0; k < 3; k++) {
        const angle = (k * Math.PI * 2) / 3 + this.randRange(-0.5, 0.5);
        const len = this.randRange(2.2, 3.8);
        const by = gy + t.h * this.randRange(0.68, 0.9);
        dummy.position.set(t.x + Math.cos(angle) * len * 0.42, by + len * 0.25, t.z + Math.sin(angle) * len * 0.42);
        dummy.rotation.set(0, -angle, -1.05);
        dummy.scale.set(t.r * 1.4, len, t.r * 1.4);
        dummy.updateMatrix();
        branches.setMatrixAt(i * 3 + k, dummy.matrix);
      }

      const crownR = t.h * this.randRange(0.28, 0.42);
      const crownY = gy + t.h * 0.92;
      for (let k = 0; k < FOL_PER_TREE; k++) {
        const theta = this.randRange(0, Math.PI * 2);
        const spread = k === 0 ? this.randRange(0, 0.3) : this.randRange(0.25, 1.05) * crownR;
        const cx = t.x + Math.cos(theta) * spread + Math.cos(t.leanDir) * t.lean * t.h * 0.4;
        const cz = t.z + Math.sin(theta) * spread + Math.sin(t.leanDir) * t.lean * t.h * 0.4;
        const cy = crownY + this.randRange(-crownR * 0.55, crownR * 0.4);
        const sc = this.randRange(2.4, 4.6) * (0.7 + t.h / 22);
        const rotY = this.randRange(0, Math.PI * 2);
        dummy.position.set(cx, cy, cz);
        dummy.rotation.set(this.randRange(-0.9, 0.35), rotY, this.randRange(-0.5, 0.5));
        dummy.scale.set(sc * this.randRange(0.9, 1.35), sc, 1);
        dummy.updateMatrix();
        foliage.setMatrixAt(fIdx++, dummy.matrix);
        dummy.rotation.set(this.randRange(-0.4, 0.4), rotY + Math.PI / 2 + this.randRange(-0.4, 0.4), this.randRange(-0.3, 0.3));
        dummy.updateMatrix();
        foliage.setMatrixAt(fIdx++, dummy.matrix);
      }
    });
    foliage.count = fIdx;

    for (const m of [trunks, roots, branches]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(m);
    }
    foliage.castShadow = false;
    foliage.receiveShadow = true;
    foliage.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(foliage);
  }

  private makeCutoutDepth(tex: THREE.Texture | null): THREE.MeshDepthMaterial {
    return new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: tex ?? undefined,
      alphaTest: tex ? 0.38 : 0,
      side: THREE.DoubleSide,
    });
  }

  // Plantes en 3 plans croisés (fougères et grandes feuilles)
  private createUndergrowth(): void {
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0); // base au sol

    const place = (count: number, material: THREE.MeshStandardMaterial, _tex: THREE.Texture | null, minS: number, maxS: number, nearTrees: boolean) => {
      const mesh = new THREE.InstancedMesh(quad, material, count * 2);
      const dummy = new THREE.Object3D();
      let idx = 0;
      for (let i = 0; i < count; i++) {
        let x = this.randRange(-WORLD_SIZE / 2 - 10, WORLD_SIZE / 2 + 10);
        let z = this.randRange(-WORLD_SIZE / 2 - 10, WORLD_SIZE / 2 + 10);
        if (this.trees.length > 0 && this.rng() < (nearTrees ? 0.88 : 0.55)) {
          const t = this.trees[Math.floor(this.rng() * this.trees.length)];
          const a = this.randRange(0, Math.PI * 2);
          const d = this.randRange(0.8, nearTrees ? 3.8 : 6.5);
          x = t.x + Math.cos(a) * d;
          z = t.z + Math.sin(a) * d;
        }
        if (Math.hypot(x, z) < 3) continue;
        if (distanceToWaterEdge(x, z) < 0.4) continue;
        const y = terrainHeight(x, z) - 0.05;
        const s = this.randRange(minS, maxS);
        const rot = this.randRange(0, Math.PI);
        for (let k = 0; k < 2; k++) {
          dummy.position.set(x + this.randRange(-0.1, 0.1), y, z + this.randRange(-0.1, 0.1));
          dummy.rotation.set(this.randRange(-0.08, 0.12), rot + (k * Math.PI) / 2 + this.randRange(-0.2, 0.2), 0);
          dummy.scale.set(s * this.randRange(0.9, 1.2), s * this.randRange(0.85, 1.15), 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
      mesh.count = idx;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(mesh);
    };

    place(Math.round(FERN_COUNT * this.quality.vegetation), this.mat.fern, this.textures.fern, 0.9, 1.9, true);
    place(Math.round(BIGLEAF_COUNT * this.quality.vegetation), this.mat.bigleaf, this.textures.bigleaf, 1.4, 2.8, false);
  }

  private createRocks(): void {
    const geo = new THREE.DodecahedronGeometry(1, 1);
    // Déforme légèrement pour casser la régularité
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) * (0.85 + Math.random() * 0.3), p.getY(i) * (0.6 + Math.random() * 0.3), p.getZ(i) * (0.85 + Math.random() * 0.3));
    }
    geo.computeVertexNormals();

    const total = ROCK_COUNT + 40;
    const rocks = new THREE.InstancedMesh(geo, this.mat.rock, total);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < total; i++) {
      let x: number;
      let z: number;
      let s: number;
      if (i < ROCK_COUNT * 0.5) {
        // Berges de la rivière
        z = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
        const side = i % 2 === 0 ? -1 : 1;
        x = riverCenterX(z) + side * (riverHalfWidth(z) + this.randRange(-0.3, 1.4));
        s = this.randRange(0.25, 0.75);
      } else if (i < ROCK_COUNT) {
        // Forêt
        x = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
        z = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
        if (Math.hypot(x, z) < 5) x += 6;
        s = this.randRange(0.3, 1.1);
      } else if (i < ROCK_COUNT + 25) {
        // Galets émergents dans le lit : rapides
        z = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
        x = riverCenterX(z) + this.randRange(-0.8, 0.8) * riverHalfWidth(z);
        s = this.randRange(0.35, 0.8);
      } else {
        // Pierres de l'affluent
        x = this.randRange(riverCenterX(streamCenterZ(0)) + 3, WORLD_SIZE / 2);
        z = streamCenterZ(x) + this.randRange(-1.2, 1.2);
        s = this.randRange(0.2, 0.5);
      }
      const y = terrainHeight(x, z);
      dummy.position.set(x, y - s * 0.25, z);
      dummy.rotation.set(this.randRange(0, 0.5), this.randRange(0, Math.PI * 2), this.randRange(0, 0.5));
      dummy.scale.set(s * this.randRange(0.9, 1.5), s, s * this.randRange(0.9, 1.4));
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    rocks.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(rocks);
  }

  private createRiver(): void {
    const length = WORLD_SIZE + 60;
    const riverMat = createWaterMaterial(this.textures.waterNormal, 0.09);
    this.waterMaterial = riverMat;
    this.waterUniforms = riverMat.uniforms;

    const river = new THREE.Mesh(buildRiverGeometry(length, terrainHeight), riverMat);
    river.renderOrder = 2;
    river.frustumCulled = false;
    this.worldGroup.add(river);
    this.waterMesh = river;

    const streamMat = createWaterMaterial(this.textures.waterNormal, 0.16);
    this.streamUniforms = streamMat.uniforms;
    const stream = new THREE.Mesh(buildStreamGeometry(WORLD_SIZE / 2 + 30, terrainHeight), streamMat);
    stream.renderOrder = 2;
    stream.frustumCulled = false;
    this.worldGroup.add(stream);

    // Roseaux et plantes de berge (billboards de fougères étirés)
    if (this.textures.fern) {
      const quad = new THREE.PlaneGeometry(1, 1);
      quad.translate(0, 0.5, 0);
      const reedMat = this.mat.fern.clone();
      reedMat.color.setHex(0xd6e2b0);
      const count = 160;
      const reeds = new THREE.InstancedMesh(quad, reedMat, count * 2);
      const dummy = new THREE.Object3D();
      let idx = 0;
      for (let i = 0; i < count; i++) {
        const z = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
        const side = i % 2 === 0 ? -1 : 1;
        const x = riverCenterX(z) + side * (riverHalfWidth(z) + this.randRange(0.1, 1.2));
        const y = terrainHeight(x, z);
        if (y < WATER_LEVEL - 0.15) continue;
        const sc = this.randRange(0.9, 1.6);
        const rot = this.randRange(0, Math.PI);
        for (let k = 0; k < 2; k++) {
          dummy.position.set(x, y - 0.05, z);
          dummy.rotation.set(0, rot + (k * Math.PI) / 2, 0);
          dummy.scale.set(sc * 0.5, sc, 1);
          dummy.updateMatrix();
          reeds.setMatrixAt(idx++, dummy.matrix);
        }
      }
      reeds.count = idx;
      reeds.castShadow = false;
      reeds.receiveShadow = true;
      reeds.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(reeds);
    }
    // Grandes feuilles tropicales (héliconias, marantacées) serrées sur les deux berges
    if (this.textures.bigleaf) {
      const quad = new THREE.PlaneGeometry(1, 1);
      quad.translate(0, 0.5, 0);
      const n = this.quality.preset === "mobile" ? 160 : 280;
      const mesh = new THREE.InstancedMesh(quad, this.mat.bigleaf, n * 2);
      const dummy = new THREE.Object3D();
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const z = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
        const side = i % 2 === 0 ? -1 : 1;
        const x = riverCenterX(z) + side * (riverHalfWidth(z) + this.randRange(0.15, 2.4));
        const y = terrainHeight(x, z);
        if (y < WATER_LEVEL - 0.2) continue;
        const sc = this.randRange(1.6, 3.0);
        const rot = this.randRange(0, Math.PI);
        for (let k = 0; k < 2; k++) {
          dummy.position.set(x + this.randRange(-0.2, 0.2), y - 0.04, z + this.randRange(-0.2, 0.2));
          dummy.rotation.set(this.randRange(-0.15, 0.2), rot + (k * Math.PI) / 2, 0);
          dummy.scale.set(sc * 1.1, sc, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
      mesh.count = idx;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(mesh);
    }
  }

  /** Palmiers raphia / éléis le long des berges (troncs fibreux, frondes retombantes). */
  private createPalms(): void {
    const n = this.quality.preset === "mobile" ? Math.round(PALM_COUNT * 0.55) : PALM_COUNT;
    const dummy = new THREE.Object3D();
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 1, 8, 1, true);
    const trunks = new THREE.InstancedMesh(trunkGeo, this.mat.trunk, n);
    const FRONDS = 7;
    const frondGeo = new THREE.PlaneGeometry(1.1, 2.4);
    frondGeo.translate(0, -1.0, 0);
    const fronds = new THREE.InstancedMesh(frondGeo, this.mat.bigleaf, n * FRONDS);
    let fi = 0;
    let ti = 0;
    for (let i = 0; i < n * 3 && ti < n; i++) {
      const z = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const x = riverCenterX(z) + side * (riverHalfWidth(z) + this.randRange(1.2, 4.5));
      if (distanceToWaterEdge(x, z) < 0.4) continue;
      if (Math.hypot(x, z) < 8) continue;
      const gy = terrainHeight(x, z);
      const h = this.randRange(7.5, 13);
      dummy.position.set(x, gy + h / 2 - 0.2, z);
      dummy.rotation.set(this.randRange(-0.08, 0.08), this.randRange(0, Math.PI), this.randRange(-0.08, 0.08));
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(ti, dummy.matrix);
      const crownY = gy + h - 0.3;
      for (let k = 0; k < FRONDS; k++) {
        const a = (k / FRONDS) * Math.PI * 2 + this.randRange(-0.2, 0.2);
        dummy.position.set(x + Math.cos(a) * 0.35, crownY, z + Math.sin(a) * 0.35);
        dummy.rotation.set(this.randRange(0.85, 1.35), -a, this.randRange(-0.2, 0.2));
        const sc = this.randRange(1.6, 2.6);
        dummy.scale.set(sc * 0.55, sc, 1);
        dummy.updateMatrix();
        fronds.setMatrixAt(fi++, dummy.matrix);
      }
      ti++;
    }
    trunks.count = ti;
    fronds.count = fi;
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    trunks.instanceMatrix.needsUpdate = true;
    fronds.castShadow = false;
    fronds.receiveShadow = true;
    fronds.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(trunks);
    this.worldGroup.add(fronds);
  }

  /** Voûte de feuillage et lianes qui recouvrent la rivière (tunnel vert de la photo). */
  private createRiverCanopy(): void {
    const dummy = new THREE.Object3D();
    const n = this.quality.preset === "mobile" ? 80 : 140;
    const quad = new THREE.PlaneGeometry(1, 1);
    const canopy = new THREE.InstancedMesh(quad, this.mat.foliage, n);
    let ci = 0;
    const bankTrees = this.trees.filter((t) => distanceToWaterEdge(t.x, t.z) < 8);
    const sources = bankTrees.length > 0 ? bankTrees : this.trees;
    for (let i = 0; i < n && sources.length > 0; i++) {
      const t = sources[Math.floor(this.rng() * sources.length)];
      const toward = riverCenterX(t.z) - t.x;
      const dir = toward === 0 ? 1 : Math.sign(toward);
      const x = t.x + dir * this.randRange(0.8, 3.5);
      const z = t.z + this.randRange(-1.2, 1.2);
      const y = terrainHeight(t.x, t.z) + this.randRange(4.5, 9);
      dummy.position.set(x, y, z);
      dummy.rotation.set(-0.55 + this.randRange(-0.25, 0.1), this.randRange(0, Math.PI), this.randRange(-0.25, 0.25));
      const sc = this.randRange(2.2, 3.8);
      dummy.scale.set(sc * 1.15, sc, 1);
      dummy.updateMatrix();
      canopy.setMatrixAt(ci++, dummy.matrix);
    }
    canopy.count = ci;
    canopy.castShadow = false;
    canopy.receiveShadow = true;
    canopy.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(canopy);

    // Lianes retombant vers l'eau
    const vines = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.03, 1, 5), this.mat.wood, 60);
    let vi = 0;
    for (let i = 0; i < 60; i++) {
      const z = this.randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const x = riverCenterX(z) + side * (riverHalfWidth(z) * 0.7);
      const len = this.randRange(1.8, 4.5);
      dummy.position.set(x, WATER_LEVEL + 1.2 + len / 2, z);
      dummy.rotation.set(this.randRange(-0.15, 0.15), 0, this.randRange(-0.2, 0.2));
      dummy.scale.set(1, len, 1);
      dummy.updateMatrix();
      vines.setMatrixAt(vi++, dummy.matrix);
    }
    vines.count = vi;
    vines.castShadow = false;
    vines.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(vines);
  }

  // Poussière / pollen en suspension dans les rais de lumière
  private createDust(): void {
    const count = Math.max(1, Math.round(this.quality.dust * SCENE_CONFIG.dustMultiplier));
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = this.randRange(-20, 20);
      positions[i * 3 + 1] = this.randRange(0.2, 7);
      positions[i * 3 + 2] = this.randRange(-20, 20);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfff3c8,
      size: 0.06,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.worldGroup.add(this.dust);
  }

  // =========================================================
  // RESSOURCES
  // =========================================================

  private createResources(): void {
    const kinds: ResourceKind[] = ["Fruits", "Bois", "Pierres"];
    for (let i = 0; i < RESOURCE_COUNT; i++) {
      let x = this.randRange(-WORLD_SIZE / 2 + 4, WORLD_SIZE / 2 - 4);
      const z = this.randRange(-WORLD_SIZE / 2 + 4, WORLD_SIZE / 2 - 4);
      if (Math.hypot(x, z) < 8) x += 8;
      if (distanceToWaterEdge(x, z) < 1.0) x += 7;
      this.createResource(i, x, z, kinds[i % 3]);
    }
    this.createCamps();
  }

  // Machette plantée dans une souche près du départ, camp de braconniers
  // (pistolet + munitions) et poste d'éco-gardes abandonné (M16 + chargeurs)
  private createCamps(): void {
    let id = RESOURCE_COUNT;
    const pickSpot = (minR: number, maxR: number): { x: number; z: number } => {
      for (let i = 0; i < 40; i++) {
        const a = this.randRange(0, Math.PI * 2);
        const r = this.randRange(minR, maxR);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (Math.abs(x) > WORLD_SIZE / 2 - 8 || Math.abs(z) > WORLD_SIZE / 2 - 8) continue;
        if (distanceToWaterEdge(x, z) < 5) continue;
        if (this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.5)) continue;
        return { x, z };
      }
      return { x: 20, z: 20 };
    };

    // Machette
    const m = pickSpot(14, 26);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 10), this.mat.trunk);
    stump.position.set(m.x, terrainHeight(m.x, m.z) + 0.3, m.z);
    stump.castShadow = true;
    this.worldGroup.add(stump);
    this.createResource(id++, m.x, m.z, "Machette", 0.6);

    // Affût de chasseur près du départ : Calibre 12 + boîte de cartouches
    const blind = pickSpot(18, 32);
    const crate12 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.55), new THREE.MeshStandardMaterial({ color: 0x5c4228, roughness: 0.88 }));
    crate12.position.set(blind.x, terrainHeight(blind.x, blind.z) + 0.22, blind.z);
    crate12.castShadow = true;
    this.worldGroup.add(crate12);
    this.createResource(id++, blind.x, blind.z, "Calibre12", 0.48);
    this.createResource(id++, blind.x + 0.75, blind.z + 0.35, "MunitionsCalibre12");

    // Camp de braconniers
    const camp = pickSpot(40, 65);
    this.campPos = camp;
    this.buildPoacherCamp(camp.x, camp.z);
    this.createResource(id++, camp.x - 1.6, camp.z - 0.4, "LunettesIR", 0.5);
    this.createResource(id++, camp.x + 1.2, camp.z + 0.6, "Pistolet", 0.42);
    this.createResource(id++, camp.x - 1.0, camp.z + 1.2, "MunitionsPistolet");
    this.createResource(id++, camp.x + 0.4, camp.z - 1.6, "MunitionsPistolet");
    this.createResource(id++, camp.x + 1.5, camp.z - 0.7, "Calibre12", 0.28);
    this.createResource(id++, camp.x - 0.3, camp.z + 1.5, "MunitionsCalibre12");

    // Poste d'éco-gardes
    let post = pickSpot(55, 80);
    if (Math.hypot(post.x - camp.x, post.z - camp.z) < 40) post = { x: -post.x, z: -post.z };
    this.postPos = post;
    this.buildRangerPost(post.x, post.z);
    this.createResource(id++, post.x + 0.3, post.z - 0.9, "GPS", 0.84);
    this.createResource(id++, post.x + 0.8, post.z + 0.9, "M16", 0.5);
    this.createResource(id++, post.x - 1.3, post.z + 0.4, "MunitionsM16");
    this.createResource(id++, post.x + 1.6, post.z - 1.0, "MunitionsM16");
    this.createResource(id++, post.x - 0.5, post.z - 1.6, "MunitionsPistolet");
    this.createResource(id++, post.x + 1.2, post.z + 1.5, "MunitionsCalibre12");
  }

  private buildPoacherCamp(x: number, z: number): void {
    const g = new THREE.Group();
    g.position.set(x, terrainHeight(x, z), z);
    const tarp = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.0), new THREE.MeshStandardMaterial({ color: 0x2f4a6b, roughness: 0.9, side: THREE.DoubleSide }));
    tarp.rotation.set(-Math.PI / 2 + 0.55, 0, 0);
    tarp.position.set(0, 1.5, -1.2);
    tarp.castShadow = true;
    g.add(tarp);
    for (const sx of [-1.7, 1.7]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.1, 6), this.mat.trunk);
      pole.position.set(sx, 1.05, -0.3);
      g.add(pole);
    }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x6d5230, roughness: 0.9 }));
    crate.position.set(1.4, 0.25, 0.4);
    crate.castShadow = true;
    g.add(crate);
    const firepit = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x151210, roughness: 1 }));
    firepit.position.set(-0.8, 0.05, 1.4);
    g.add(firepit);
    // Défenses d'ivoire saisies : indice du trafic
    const tuskMat = makeMaterial(0xe9e2cc, 0.4);
    for (let i = 0; i < 2; i++) {
      const tusk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 1.1, 8), tuskMat);
      tusk.position.set(-1.6 + i * 0.3, 0.12, -0.2);
      tusk.rotation.set(Math.PI / 2, 0, 0.3 + i * 0.2);
      g.add(tusk);
    }
    this.worldGroup.add(g);
  }

  private buildRangerPost(x: number, z: number): void {
    const g = new THREE.Group();
    g.position.set(x, terrainHeight(x, z), z);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a6b45, roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 0.15), wallMat);
    back.position.set(0, 1.2, -1.6);
    back.castShadow = true;
    g.add(back);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 3.2), wallMat);
    side.position.set(-2.1, 1.2, 0);
    side.castShadow = true;
    g.add(side);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 3.8), new THREE.MeshStandardMaterial({ color: 0x8a8d87, metalness: 0.6, roughness: 0.4 }));
    roof.position.set(0, 2.5, 0.1);
    roof.rotation.x = 0.08;
    roof.castShadow = true;
    g.add(roof);
    for (const [px, pz] of [
      [2.1, 1.6],
      [2.1, -1.6],
      [-2.1, 1.6],
    ]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.5, 8), this.mat.trunk);
      pole.position.set(px, 1.25, pz);
      g.add(pole);
    }
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.85 }));
    table.position.set(0.6, 0.8, -0.9);
    table.castShadow = true;
    g.add(table);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0xd9c27a, roughness: 0.7 }));
    sign.position.set(0, 1.9, -1.5);
    g.add(sign);
    this.addGabonFlag(g, 3, 1.5, 4);
    this.worldGroup.add(g);
  }

  private createResource(id: number, x: number, z: number, kind: ResourceKind, lift = 0): void {
    const group = new THREE.Group();
    const y = terrainHeight(x, z) + lift;
    group.position.set(x, y, z);

    if (kind === "Machette" || kind === "Pistolet" || kind === "M16" || kind === "Calibre12") {
      const weaponId: WeaponId =
        kind === "Machette" ? "machette" : kind === "Pistolet" ? "pistolet" : kind === "Calibre12" ? "calibre12" : "m16";
      const pickup = createWeaponPickup(weaponId);
      pickup.rotation.y = this.randRange(0, Math.PI * 2);
      group.add(pickup);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.36, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd27a, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      group.add(ring);
    } else if (kind === "GPS") {
      const gps = createGpsModel();
      gps.rotation.y = this.randRange(0, Math.PI * 2);
      group.add(gps);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.24, 0.32, 16),
        new THREE.MeshBasicMaterial({ color: 0x40ff90, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      group.add(ring);
    } else if (kind === "LunettesIR") {
      const nv = createNightVisionModel();
      nv.rotation.y = this.randRange(0, Math.PI * 2);
      group.add(nv);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.24, 0.32, 16),
        new THREE.MeshBasicMaterial({ color: 0x40ff60, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      group.add(ring);
    } else if (kind === "MunitionsPistolet" || kind === "MunitionsM16" || kind === "MunitionsCalibre12") {
      const boxMesh = createAmmoBox(kind === "MunitionsM16" ? "rifle" : kind === "MunitionsCalibre12" ? "shotgun" : "pistol");
      boxMesh.rotation.y = this.randRange(0, Math.PI * 2);
      group.add(boxMesh);
    } else if (kind === "Viande") {
      const meat = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8c1f1f, roughness: 0.7 }));
      meat.scale.set(1.4, 0.7, 1);
      meat.position.y = 0.15;
      meat.castShadow = true;
      group.add(meat);
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), makeMaterial(0xe8e0c8, 0.5));
      bone.rotation.z = Math.PI / 2;
      bone.position.set(0, 0.17, 0.1);
      group.add(bone);
    } else if (kind === "Fruits") {
      // Grappe de fruits rouges (atanga / fruits sauvages)
      for (let k = 0; k < 4; k++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), this.mat.fruit);
        const a = (k / 4) * Math.PI * 2;
        mesh.position.set(Math.cos(a) * 0.16, 0.18 + (k % 2) * 0.12, Math.sin(a) * 0.16);
        mesh.castShadow = true;
        group.add(mesh);
      }
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), this.mat.bigleaf);
      leaf.position.y = 0.0;
      leaf.rotation.y = this.randRange(0, Math.PI);
      leaf.scale.set(0.8, 0.8, 1);
      leaf.geometry.translate(0, 0.45, 0);
      group.add(leaf);
    } else if (kind === "Bois") {
      // Branche morte tombée, avec écorce
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.4, 8), this.mat.trunk);
      mesh.rotation.z = Math.PI / 2;
      mesh.rotation.y = this.randRange(0, Math.PI * 2);
      mesh.position.y = 0.12;
      mesh.castShadow = true;
      group.add(mesh);
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 6), this.mat.trunk);
      stub.position.set(0.2, 0.3, 0);
      stub.rotation.z = -0.6;
      group.add(stub);
    } else {
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 1), this.mat.rock);
      mesh.position.y = 0.16;
      mesh.scale.set(1.2, 0.7, 1.0);
      mesh.rotation.y = this.randRange(0, Math.PI);
      mesh.castShadow = true;
      group.add(mesh);
    }

    if (Object.keys(this.toonMats).length > 0) this.toonify(group);
    this.worldGroup.add(group);
    this.resources.push({ id, kind, group, collected: false, baseY: y });
  }

  private findNearestResource(maxDistance = 3.0): ResourceData | null {
    let best: ResourceData | null = null;
    let bestDist = maxDistance;
    for (const res of this.resources) {
      if (res.collected) continue;
      const dx = this.player.position.x - res.group.position.x;
      const dz = this.player.position.z - res.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < bestDist) {
        bestDist = d;
        best = res;
      }
    }
    return best;
  }

  private isNearRiver(): boolean {
    return isNearWater(this.player.position.x, this.player.position.z, 2.2);
  }

  private isInRiver(): boolean {
    return isInWater(this.player.position.x, this.player.position.z);
  }

  private isNearShelter(): boolean {
    if (!this.shelterPos) return false;
    return Math.hypot(this.player.position.x - this.shelterPos.x, this.player.position.z - this.shelterPos.z) < 3.0;
  }

  private collectResource(): void {
    const carcass = this.findCarcass();
    if (carcass) {
      this.butcher(carcass);
      return;
    }
    const res = this.findNearestResource();
    if (!res) {
      if (this.isNearRiver()) {
        this.thirst = Math.min(100, this.thirst + 40);
        this.say("Tu bois l'eau fraîche de la rivière.");
      } else {
        this.say("Aucune ressource à proximité.");
      }
      return;
    }
    res.collected = true;
    res.group.visible = false;
    this.resourcesCollected += 1;
    this.sfx.pickup();
    if (this.netRole !== "solo") this.newCollected.push(res.id);

    this.addXp(XP.resource);
    switch (res.kind) {
      case "Machette":
        this.addWeapon("machette");
        this.addXp(XP.weapon);
        this.say("Machette récupérée ! Touche 2 pour l'équiper.", 4);
        return;
      case "Pistolet":
        this.addWeapon("pistolet");
        this.ammoPistol += 12;
        this.addXp(XP.weapon);
        this.say("Pistolet 9 mm trouvé (+12 munitions). Touche 4, clic gauche pour tirer.", 5);
        return;
      case "M16":
        this.addWeapon("m16");
        this.ammoRifle += 30;
        this.addXp(XP.weapon);
        this.say("Fusil M16 des éco-gardes (+30 cartouches). Touche 5. Maintiens le clic pour tirer.", 5);
        return;
      case "Calibre12":
        this.addWeapon("calibre12");
        this.ammoShotgun += 8;
        this.addXp(XP.weapon);
        this.say("Fusil à pompe Calibre 12 trouvé (+8 cartouches) ! Touche 6 pour l'équiper.", 5);
        return;
      case "MunitionsPistolet":
        this.ammoPistol += 10;
        this.say("+10 munitions 9 mm.");
        return;
      case "MunitionsM16":
        this.ammoRifle += 30;
        this.say("+30 cartouches 5,56 mm.");
        return;
      case "MunitionsCalibre12":
        this.ammoShotgun += 8;
        this.say("+8 cartouches Calibre 12.");
        return;
      case "GPS":
        this.hasGps = true;
        this.gpsOn = true;
        this.addXp(XP.weapon);
        this.say("GPS de terrain récupéré ! Mini-carte activée (M pour afficher/masquer).", 5);
        return;
      case "LunettesIR":
        this.hasNightVision = true;
        this.nvBattery = 1;
        this.addXp(XP.weapon);
        this.say("Lunettes infrarouges trouvées ! N pour la vision thermique (batterie limitée, se recharge au feu de l'abri).", 6);
        return;
      default:
        this.inventory[res.kind] += 1;
        this.say(`${resourceLabel(res.kind)} ramassé !`);
    }
  }

  private eatFruit(): void {
    if (this.inventory.Fruits <= 0) {
      this.say("Tu n'as pas de fruits.");
      return;
    }
    this.inventory.Fruits -= 1;
    this.hunger = Math.min(100, this.hunger + 30);
    this.health = Math.min(100, this.health + 5);
    this.addXp(Math.round(XP.resource / 2));
    this.say(`Tu manges un fruit sauvage. (+${Math.round(XP.resource / 2)} XP)`);
  }

  private eatMeat(): void {
    if (this.inventory.Viande <= 0) {
      this.say("Tu n'as pas de viande. Chasse un animal.");
      return;
    }
    if (!this.isNearShelter()) {
      this.say("Il faut un feu : mange la viande près de ton abri (B pour construire).");
      return;
    }
    this.inventory.Viande -= 1;
    this.hunger = Math.min(100, this.hunger + 55);
    this.health = Math.min(100, this.health + 12);
    this.addXp(XP.resource);
    this.say(`Tu fais griller la viande au feu. Un vrai festin. (+${XP.resource} XP)`);
  }

  private addWeapon(id: WeaponId): void {
    if (!this.weapons.includes(id)) this.weapons.push(id);
    this.weapons.sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot);
    this.currentWeapon = id;
    this.updateHeldWeapon();
  }

  private selectWeapon(id: WeaponId): void {
    if (!this.weapons.includes(id)) {
      this.say(`Tu n'as pas de ${WEAPONS[id].label.toLowerCase()}.`);
      return;
    }
    if (this.currentWeapon === id) return;
    this.currentWeapon = id;
    this.updateHeldWeapon();
    this.sfx.click();
    this.say(`${WEAPONS[id].label} en main.`, 1.5);
  }

  private cycleWeapon(dir: number): void {
    if (this.weapons.length < 2) return;
    const idx = this.weapons.indexOf(this.currentWeapon);
    const next = this.weapons[(idx + dir + this.weapons.length) % this.weapons.length];
    this.selectWeapon(next);
  }

  // =========================================================
  // ANIMAUX ET CHASSE
  // =========================================================

  private createAnimals(): void {
    const plan: Species[] = [
      "potamochere", "potamochere", "potamochere", "potamochere", "potamochere",
      "cephalophe", "cephalophe", "cephalophe", "cephalophe", "cephalophe", "cephalophe", "cephalophe",
      "buffle", "buffle",
    ];
    for (let i = 0; i < plan.length; i++) {
      const species = plan[i];
      const def = SPECIES[species];
      const group = new THREE.Group();
      let x = this.randRange(-WORLD_SIZE / 2 + 8, WORLD_SIZE / 2 - 8);
      let z = this.randRange(-WORLD_SIZE / 2 + 8, WORLD_SIZE / 2 - 8);
      if (def.aggressive && Math.hypot(x, z) < 28) {
        x += x >= 0 ? 28 : -28;
        x = clamp(x, -WORLD_SIZE / 2 + 8, WORLD_SIZE / 2 - 8);
      }
      if (distanceToWaterEdge(x, z) < 3) z += 8;
      group.position.set(x, terrainHeight(x, z), z);

      const built = assembleAnimal(species);
      while (built.group.children.length) group.add(built.group.children[0]);
      const legs = built.legs;
      const materialList = built.materials;
      group.scale.setScalar(def.scale);
      group.traverse((o) => o.layers.enable(7));
      this.worldGroup.add(group);

      const dir = new THREE.Vector3(this.randRange(-1, 1), 0, this.randRange(-1, 1)).normalize();
      this.animals.push({
        species,
        group,
        direction: dir,
        speed: this.randRange(def.speed[0], def.speed[1]),
        aggressive: def.aggressive,
        legs,
        hp: def.hp,
        maxHp: def.hp,
        fleeUntil: 0,
        dead: false,
        fall: 0,
        fallSide: 1,
        butchered: false,
        respawnAt: 0,
        hitFlash: 0,
        knock: new THREE.Vector3(),
        materials: materialList,
        decal: null,
      });
    }
    this.createBloodSystem();
  }

  private createBloodSystem(): void {
    const max = 160;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    const mat = new THREE.PointsMaterial({ color: 0x8a0f0f, size: 0.07, transparent: true, opacity: 0.95, depthWrite: false });
    this.bloodPoints = new THREE.Points(geo, mat);
    this.bloodPoints.frustumCulled = false;
    this.worldGroup.add(this.bloodPoints);
    this.blood = [];
  }

  private spawnBlood(at: THREE.Vector3, amount: number): void {
    for (let i = 0; i < amount; i++) {
      if (this.blood.length >= 160) this.blood.shift();
      this.blood.push({
        pos: at.clone().add(new THREE.Vector3(this.randRange(-0.15, 0.15), this.randRange(0, 0.2), this.randRange(-0.15, 0.15))),
        vel: new THREE.Vector3(this.randRange(-1.4, 1.4), this.randRange(1.0, 3.2), this.randRange(-1.4, 1.4)),
        life: this.randRange(0.5, 0.9),
      });
    }
  }

  private updateBlood(delta: number): void {
    if (!this.bloodPoints) return;
    const attr = this.bloodPoints.geometry.attributes.position as THREE.BufferAttribute;
    let n = 0;
    for (let i = this.blood.length - 1; i >= 0; i--) {
      const b = this.blood[i];
      b.life -= delta;
      if (b.life <= 0) {
        this.blood.splice(i, 1);
        continue;
      }
      b.vel.y -= 9.8 * delta;
      b.pos.addScaledVector(b.vel, delta);
      const ground = terrainHeight(b.pos.x, b.pos.z) + 0.02;
      if (b.pos.y < ground) {
        b.pos.y = ground;
        b.vel.set(0, 0, 0);
      }
      attr.setXYZ(n++, b.pos.x, b.pos.y, b.pos.z);
    }
    this.bloodPoints.geometry.setDrawRange(0, n);
    attr.needsUpdate = true;
  }

  private placeBloodDecal(animal: AnimalData): void {
    if (animal.decal) {
      this.worldGroup.remove(animal.decal);
      animal.decal = null;
    }
    const r = 0.5 + 0.5 * animal.group.scale.x;
    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(r, 14),
      new THREE.MeshStandardMaterial({ color: 0x4a0909, roughness: 0.6, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(animal.group.position.x, terrainHeight(animal.group.position.x, animal.group.position.z) + 0.015, animal.group.position.z);
    decal.scale.set(this.randRange(0.8, 1.3), this.randRange(0.8, 1.3), 1);
    this.worldGroup.add(decal);
    animal.decal = decal;
  }

  private respawnAnimal(animal: AnimalData): void {
    for (let i = 0; i < 20; i++) {
      const x = this.randRange(-WORLD_SIZE / 2 + 8, WORLD_SIZE / 2 - 8);
      const z = this.randRange(-WORLD_SIZE / 2 + 8, WORLD_SIZE / 2 - 8);
      if (Math.hypot(x - this.player.position.x, z - this.player.position.z) < 30) continue;
      if (distanceToWaterEdge(x, z) < 3) continue;
      animal.group.position.set(x, terrainHeight(x, z), z);
      break;
    }
    animal.hp = animal.maxHp;
    animal.dead = false;
    animal.butchered = false;
    animal.fall = 0;
    animal.fleeUntil = 0;
    animal.group.visible = true;
    animal.group.rotation.z = 0;
    animal.group.rotation.x = 0;
    if (animal.decal) {
      this.worldGroup.remove(animal.decal);
      animal.decal = null;
    }
  }

  private damageAnimal(animal: AnimalData, amount: number, now: number, from: THREE.Vector3): void {
    if (animal.dead) return;
    if (!this.huntingEnabled) {
      this.say("La chasse est désactivée (option du menu).", 2);
      return;
    }
    if (this.netRole === "client") {
      // L'hôte fait autorité : on envoie le coup et on joue seulement le retour visuel
      this.outgoingHits.push({ index: this.animals.indexOf(animal), damage: amount, fromX: from.x, fromZ: from.z });
      animal.hitFlash = 0.15;
      this.hitMarkerUntil = performance.now() + 220;
      this.sfx.hit();
      const hp = animal.group.position.clone();
      hp.y += 0.6 * animal.group.scale.x;
      this.spawnBlood(hp, 10);
      animal.hp = Math.max(1, animal.hp - amount);
      return;
    }
    animal.hp -= amount;
    animal.hitFlash = 0.15;
    this.hitMarkerUntil = performance.now() + 220;
    this.sfx.hit();

    const hitPos = animal.group.position.clone();
    hitPos.y += 0.6 * animal.group.scale.x;
    this.spawnBlood(hitPos, 10);

    // Recul dans la direction du coup
    const push = this.tmpVec2.subVectors(animal.group.position, from);
    push.y = 0;
    push.normalize().multiplyScalar(animal.species === "buffle" ? 0.8 : 2.2);
    animal.knock.add(push);

    const def = SPECIES[animal.species];
    if (animal.hp <= 0) {
      animal.dead = true;
      animal.fall = 0;
      animal.fallSide = Math.random() < 0.5 ? -1 : 1;
      animal.respawnAt = now + 180;
      this.kills += 1;
      this.addXp(XP.kill[animal.species] ?? XP.resource * 3);
      this.spawnBlood(hitPos, 18);
      this.placeBloodDecal(animal);
      this.say(`${def.label} abattu ! Approche et appuie sur E pour le dépecer (${def.meat} viande).`, 5);
    } else if (animal.aggressive) {
      // Blessé : le potamochère riposte, le buffle charge ; très affaibli, ils fuient
      animal.fleeUntil = animal.hp < animal.maxHp * 0.25 ? now + 6 : 0;
    } else {
      animal.fleeUntil = now + 7;
    }
  }

  private findCarcass(maxDistance = 2.6): AnimalData | null {
    let best: AnimalData | null = null;
    let bestD = maxDistance;
    for (const a of this.animals) {
      if (!a.dead || a.butchered || a.fall < 0.9) continue;
      const d = Math.hypot(a.group.position.x - this.player.position.x, a.group.position.z - this.player.position.z);
      if (d < bestD + a.group.scale.x * 0.5) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  private butcher(animal: AnimalData): void {
    const def = SPECIES[animal.species];
    const bonus = this.currentWeapon === "couteau" || this.currentWeapon === "machette" ? 1 : 0;
    const meat = def.meat + bonus;
    animal.butchered = true;
    animal.group.visible = false;
    animal.respawnAt = this.clock.elapsedTime + 150;
    if (this.netRole === "client") this.outgoingHits.push({ index: this.animals.indexOf(animal), damage: -1, fromX: 0, fromZ: 0 });
    this.inventory.Viande += meat;
    this.resourcesCollected += 1;
    this.sfx.pickup();
    this.say(
      bonus > 0
        ? `Tu dépèces le ${def.label.toLowerCase()} proprement : +${meat} viande.`
        : `Tu dépèces le ${def.label.toLowerCase()} à mains nues : +${meat} viande (une lame en donnerait plus).`,
      4
    );
  }

  /** Animal visé (arme à feu) ou à portée de lame, pour l'affichage de sa vie. */
  private findTargetAnimal(): { label: string; hp: number; maxHp: number } | null {
    const def = WEAPONS[this.currentWeapon];
    let best: AnimalData | null = null;
    if (def.kind === "ranged") {
      const origin = this.camera.position;
      const dir = this.camera.getWorldDirection(this.tmpVec);
      let bestScore = Infinity;
      const center = new THREE.Vector3();
      for (const a of this.animals) {
        if (a.dead) continue;
        center.copy(a.group.position);
        center.y += 0.55 * a.group.scale.x;
        const to = center.sub(origin);
        const t = to.dot(dir);
        if (t < 0.5 || t > def.range) continue;
        const perp = to.sub(this.tmpVec2.copy(dir).multiplyScalar(t)).length();
        if (perp < 1.3 * a.group.scale.x && perp < bestScore) {
          bestScore = perp;
          best = a;
        }
      }
    } else {
      let bestD = def.range * 1.8;
      for (const a of this.animals) {
        if (a.dead) continue;
        const d = Math.hypot(a.group.position.x - this.player.position.x, a.group.position.z - this.player.position.z);
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
    }
    if (!best) return null;
    return { label: SPECIES[best.species].label, hp: Math.max(0, best.hp), maxHp: best.maxHp };
  }

  private updateAnimalsFromNetwork(delta: number, elapsed: number): void {
    let threat = false;
    const targets = this.netAnimalTargets ?? [];
    this.animals.forEach((animal, i) => {
      if (animal.hitFlash > 0) {
        animal.hitFlash -= delta;
        const f = animal.hitFlash > 0 ? 1 : 0;
        for (const m of animal.materials) m.emissive.setRGB(0.6 * f, 0.05 * f, 0.05 * f);
      }
      const t = targets[i];
      if (!t) return;
      // Mort reçue du réseau
      if (t.dead && !animal.dead) {
        animal.dead = true;
        animal.fall = 0;
        animal.fallSide = 1;
        this.placeBloodDecal(animal);
      }
      if (!t.dead && animal.dead) {
        animal.dead = false;
        animal.butchered = false;
        animal.fall = 0;
        animal.group.rotation.z = 0;
        animal.group.visible = true;
        if (animal.decal) {
          this.worldGroup.remove(animal.decal);
          animal.decal = null;
        }
      }
      animal.butchered = t.butchered;
      animal.group.visible = !t.butchered;
      animal.hp = t.hp;
      animal.maxHp = Math.max(animal.maxHp, t.hp);

      const dx = t.x - animal.group.position.x;
      const dz = t.z - animal.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 12) {
        animal.group.position.x = t.x;
        animal.group.position.z = t.z;
      } else {
        const k = Math.min(1, delta * 8);
        animal.group.position.x += dx * k;
        animal.group.position.z += dz * k;
      }
      animal.group.position.y = terrainHeight(animal.group.position.x, animal.group.position.z);
      let dy = t.yaw - animal.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      animal.group.rotation.y += dy * Math.min(1, delta * 8);

      if (animal.dead) {
        if (animal.fall < 1) {
          animal.fall = Math.min(1, animal.fall + delta * 1.6);
          const ease = 1 - (1 - animal.fall) * (1 - animal.fall);
          animal.group.rotation.z = animal.fallSide * ease * (Math.PI / 2) * 0.96;
          animal.group.position.y += ease * 0.18 * animal.group.scale.x;
        }
        return;
      }
      const moving = dist > 0.05;
      const swing = moving ? Math.sin(elapsed * 10) * 0.5 : 0;
      animal.legs.forEach((leg, k) => {
        leg.rotation.x = k % 2 === 0 ? swing : -swing;
      });
      const toPlayer = Math.hypot(this.player.position.x - animal.group.position.x, this.player.position.z - animal.group.position.z);
      if (animal.aggressive && toPlayer < 11 && !this.dead) {
        threat = true;
        const scared = this.hasSpear || this.currentWeapon === "lance";
        if (toPlayer < 1.4 * animal.group.scale.x && !(scared && animal.species !== "buffle")) {
          this.receiveCharge(SPECIES[animal.species].label, SPECIES[animal.species].damage, delta, animal);
        }
      }
    });
    this.threatNearby = threat;
    this.updateBlood(delta);
  }

  private updateAnimals(delta: number, elapsed: number): void {
    if (this.netRole === "client") {
      this.updateAnimalsFromNetwork(delta, elapsed);
      return;
    }
    let threat = false;
    const half = WORLD_SIZE / 2;
    const now = this.clock.elapsedTime;

    for (const animal of this.animals) {
      if (animal.hitFlash > 0) {
        animal.hitFlash -= delta;
        const f = animal.hitFlash > 0 ? 1 : 0;
        for (const m of animal.materials) m.emissive.setRGB(0.6 * f, 0.05 * f, 0.05 * f);
      }

      if (animal.dead) {
        if (animal.butchered) {
          if (now >= animal.respawnAt) this.respawnAnimal(animal);
          continue;
        }
        // Chute sur le flanc
        if (animal.fall < 1) {
          animal.fall = Math.min(1, animal.fall + delta * 1.6);
          const t = animal.fall;
          const ease = 1 - (1 - t) * (1 - t);
          animal.group.rotation.z = animal.fallSide * ease * (Math.PI / 2) * 0.96;
          animal.group.position.y = terrainHeight(animal.group.position.x, animal.group.position.z) + ease * 0.18 * animal.group.scale.x;
          // Pattes raides
          animal.legs.forEach((leg, i) => {
            leg.rotation.x = (i % 2 === 0 ? 0.3 : -0.2) * ease;
          });
        }
        if (now >= animal.respawnAt) this.respawnAnimal(animal);
        continue;
      }

      const def = SPECIES[animal.species];
      const toPlayer = this.tmpVec.subVectors(this.player.position, animal.group.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      let speed = animal.speed;
      const fleeing = now < animal.fleeUntil || (animal.hp < animal.maxHp * 0.25 && dist < 14);
      const scared = !animal.aggressive || this.hasSpear || this.currentWeapon === "lance" || (this.isRangedEquipped && (this.aimBlend > 0.35 || this.mouseLeft));

      if (fleeing && dist < 24) {
        animal.direction.copy(toPlayer).multiplyScalar(-1).normalize();
        speed = def.fleeSpeed;
      } else if (animal.aggressive && dist < 11 && !this.dead && this.outfit.ability !== "charm") {
        threat = true;
        if (scared && animal.species !== "buffle") {
          animal.direction.copy(toPlayer).multiplyScalar(-1).normalize();
          speed = def.fleeSpeed * 0.9;
        } else {
          animal.direction.copy(toPlayer).normalize();
          speed = def.chargeSpeed;
          if (dist < 1.4 * animal.group.scale.x) {
            this.receiveCharge(def.label, def.damage, delta, animal);
          }
        }
      } else if (!animal.aggressive && dist < 7) {
        // Le céphalophe détale dès qu'on approche
        animal.direction.copy(toPlayer).multiplyScalar(-1).normalize();
        speed = def.fleeSpeed * 0.8;
      } else if (Math.random() < 0.6 * delta) {
        animal.direction.set(this.randRange(-1, 1), 0, this.randRange(-1, 1)).normalize();
      }

      // Évite l'eau (sauf en pleine charge)
      const nextX = animal.group.position.x + animal.direction.x * speed * delta;
      const nextZ = animal.group.position.z + animal.direction.z * speed * delta;
      if (distanceToWaterEdge(nextX, nextZ) < 0.6 && !(animal.aggressive && dist < 10)) {
        animal.direction.multiplyScalar(-1);
      }

      animal.group.position.addScaledVector(animal.direction, speed * delta);
      if (animal.knock.lengthSq() > 0.0001) {
        animal.group.position.addScaledVector(animal.knock, delta);
        animal.knock.multiplyScalar(Math.max(0, 1 - delta * 6));
      }
      animal.group.position.x = clamp(animal.group.position.x, -half, half);
      animal.group.position.z = clamp(animal.group.position.z, -half, half);
      animal.group.position.y = terrainHeight(animal.group.position.x, animal.group.position.z);
      if (animal.direction.lengthSq() > 0.01) {
        animal.group.rotation.y = Math.atan2(-animal.direction.x, -animal.direction.z);
      }
      const swing = Math.sin(elapsed * 8 * (speed / 1.2)) * 0.5;
      animal.legs.forEach((leg, i) => {
        leg.rotation.x = i % 2 === 0 ? swing : -swing;
      });
    }
    this.threatNearby = threat;
    this.updateBlood(delta);
  }

  // =========================================================
  // PERSONNAGE
  // =========================================================

  private createPlayer(): void {
    const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, position: THREE.Vector3): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const capsule = (radius: number, length: number, material: THREE.Material, parent: THREE.Object3D, position: THREE.Vector3) =>
      addMesh(new THREE.CapsuleGeometry(radius, length, 4, 10), material, parent, position);

    capsule(0.29, 0.72, this.playerBodyMat, this.mannequin, new THREE.Vector3(0, 1.28, 0));
    capsule(0.255, 0.3, this.playerPantsMat, this.mannequin, new THREE.Vector3(0, 0.78, 0));
    capsule(0.305, 0.46, this.playerClothMat, this.mannequin, new THREE.Vector3(0, 1.37, -0.012));
    const vest = capsule(0.235, 0.38, this.playerGearMat, this.mannequin, new THREE.Vector3(0, 1.39, -0.105));
    vest.scale.set(1.12, 1, 0.76);
    for (const x of [-0.115, 0.115]) {
      const strap = addMesh(new THREE.BoxGeometry(0.055, 0.48, 0.045), this.playerBootMat, this.mannequin, new THREE.Vector3(x, 1.42, -0.276));
      strap.rotation.z = x < 0 ? -0.12 : 0.12;
      const chestPouch = addMesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), this.playerGearMat, this.mannequin, new THREE.Vector3(x * 1.65, 1.3, -0.282));
      chestPouch.rotation.z = x < 0 ? -0.06 : 0.06;
    }
    const collar = addMesh(new THREE.TorusGeometry(0.11, 0.035, 8, 16), this.playerGearMat, this.mannequin, new THREE.Vector3(0, 1.69, -0.035));
    collar.rotation.x = Math.PI / 2;

    const neck = addMesh(new THREE.CylinderGeometry(0.075, 0.09, 0.16, 10), this.playerBodyMat, this.mannequin, new THREE.Vector3(0, 1.82, 0));
    neck.castShadow = true;
    const head = addMesh(new THREE.SphereGeometry(0.19, 24, 18), this.playerBodyMat, this.mannequin, new THREE.Vector3(0, 2.03, 0));
    head.scale.set(0.92, 1.12, 0.94);
    const hair = addMesh(new THREE.SphereGeometry(0.195, 16, 12), this.playerHairMat, this.mannequin, new THREE.Vector3(0, 2.13, 0.015));
    hair.scale.set(1, 0.56, 0.98);
    const backHair = addMesh(new THREE.SphereGeometry(0.145, 12, 10), this.playerHairMat, this.mannequin, new THREE.Vector3(0, 1.96, 0.105));
    backHair.scale.set(1.05, 1.2, 0.72);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xd5c6a8, roughness: 0.72 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x201b17, roughness: 0.8 });
    const browMat = new THREE.MeshStandardMaterial({ color: 0x34241d, roughness: 0.9 });
    for (const x of [-0.067, 0.067]) {
      addMesh(new THREE.SphereGeometry(0.022, 8, 6), eyeMat, this.mannequin, new THREE.Vector3(x, 2.035, -0.163));
      addMesh(new THREE.SphereGeometry(0.011, 8, 6), pupilMat, this.mannequin, new THREE.Vector3(x, 2.035, -0.182));
      const brow = addMesh(new THREE.CapsuleGeometry(0.012, 0.05, 3, 6), browMat, this.mannequin, new THREE.Vector3(x, 2.075, -0.16));
      brow.rotation.z = x < 0 ? -0.12 : 0.12;
    }
    const nose = addMesh(new THREE.ConeGeometry(0.035, 0.085, 8), this.playerBodyMat, this.mannequin, new THREE.Vector3(0, 1.99, -0.19));
    nose.rotation.x = -Math.PI / 2;
    for (const x of [-0.19, 0.19]) {
      addMesh(new THREE.SphereGeometry(0.055, 10, 8), this.playerBodyMat, this.mannequin, new THREE.Vector3(x, 2.02, 0));
      const shoulderPad = addMesh(new THREE.SphereGeometry(0.13, 12, 8), this.playerGearMat, this.mannequin, new THREE.Vector3(x * 1.48, 1.58, 0));
      shoulderPad.scale.set(1.15, 0.72, 1);
    }

    const backpack = capsule(0.19, 0.42, this.playerGearMat, this.mannequin, new THREE.Vector3(0, 1.32, 0.235));
    backpack.scale.set(1.15, 1, 0.72);
    for (const x of [-0.18, 0.18]) {
      const harness = addMesh(new THREE.BoxGeometry(0.045, 0.56, 0.04), this.playerBootMat, this.mannequin, new THREE.Vector3(x, 1.4, -0.13));
      harness.rotation.z = x < 0 ? -0.2 : 0.2;
    }
    const belt = addMesh(new THREE.CylinderGeometry(0.255, 0.255, 0.085, 16), this.playerGearMat, this.mannequin, new THREE.Vector3(0, 0.96, 0));
    belt.scale.z = 0.82;
    for (const x of [-0.22, 0.22]) {
      const pouch = addMesh(new THREE.BoxGeometry(0.12, 0.15, 0.12), this.playerGearMat, this.mannequin, new THREE.Vector3(x, 0.97, -0.04));
      pouch.rotation.z = x < 0 ? -0.08 : 0.08;
    }

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.33, 1.62, 0);
    this.mannequin.add(leftArm);
    capsule(0.105, 0.34, this.playerClothMat, leftArm, new THREE.Vector3(0, -0.23, 0));
    const leftForearm = new THREE.Group();
    leftForearm.position.y = -0.48;
    leftArm.add(leftForearm);
    capsule(0.082, 0.3, this.playerGearMat, leftForearm, new THREE.Vector3(0, -0.19, 0));
    addMesh(new THREE.SphereGeometry(0.08, 10, 8), this.playerBodyMat, leftForearm, new THREE.Vector3(0, -0.42, -0.01));

    const rightArm = new THREE.Group();
    rightArm.position.set(0.33, 1.62, 0);
    this.mannequin.add(rightArm);
    capsule(0.105, 0.34, this.playerClothMat, rightArm, new THREE.Vector3(0, -0.23, 0));
    const rightForearm = new THREE.Group();
    rightForearm.position.y = -0.48;
    rightArm.add(rightForearm);
    capsule(0.082, 0.3, this.playerGearMat, rightForearm, new THREE.Vector3(0, -0.19, 0));
    addMesh(new THREE.SphereGeometry(0.08, 10, 8), this.playerBodyMat, rightForearm, new THREE.Vector3(0, -0.42, -0.01));

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.145, 0.76, 0);
    this.mannequin.add(leftLeg);
    capsule(0.13, 0.36, this.playerPantsMat, leftLeg, new THREE.Vector3(0, -0.23, 0));
    const leftShin = new THREE.Group();
    leftShin.position.y = -0.48;
    leftLeg.add(leftShin);
    capsule(0.095, 0.31, this.playerPantsMat, leftShin, new THREE.Vector3(0, -0.18, 0));
    const leftBoot = capsule(0.105, 0.12, this.playerBootMat, leftShin, new THREE.Vector3(0, -0.39, -0.045));
    leftBoot.scale.set(1, 0.7, 1.65);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.145, 0.76, 0);
    this.mannequin.add(rightLeg);
    capsule(0.13, 0.36, this.playerPantsMat, rightLeg, new THREE.Vector3(0, -0.23, 0));
    const rightShin = new THREE.Group();
    rightShin.position.y = -0.48;
    rightLeg.add(rightShin);
    capsule(0.095, 0.31, this.playerPantsMat, rightShin, new THREE.Vector3(0, -0.18, 0));
    const rightBoot = capsule(0.105, 0.12, this.playerBootMat, rightShin, new THREE.Vector3(0, -0.39, -0.045));
    rightBoot.scale.set(1, 0.7, 1.65);

    this.fallbackLimbs = { leftArm, rightArm, leftLeg, rightLeg };
    this.fallbackSocket.position.set(0.48, 1.15, -0.12);
    this.fallbackSocket.rotation.set(0, 0, 0);
    this.mannequin.add(this.fallbackSocket);

    this.player.add(this.mannequin);
    this.scene.add(this.player);
  }

  private animateFallbackCharacter(delta: number, moveState: "idle" | "walk" | "run"): void {
    if (!this.fallbackLimbs) return;
    const moving = moveState !== "idle" && !this.dead && this.sleepingTimer <= 0;
    const running = moving && moveState === "run";
    const amplitude = moving ? (running ? 0.62 : 0.34) : 0.025;
    const frequency = running ? 10 : 6;
    this.fallbackCycle += delta * (moving ? frequency : 1.8);
    const swing = Math.sin(this.fallbackCycle) * amplitude;
    this.fallbackLimbs.leftLeg.rotation.x = swing;
    this.fallbackLimbs.rightLeg.rotation.x = -swing;
    this.fallbackLimbs.leftArm.rotation.x = -swing * 0.8;
    this.fallbackLimbs.rightArm.rotation.x = swing * 0.8;
    this.mannequin.position.y = moving ? Math.abs(Math.sin(this.fallbackCycle * 2)) * (running ? 0.045 : 0.018) : Math.sin(this.fallbackCycle) * 0.008;
  }

  private buildRig(): void {
    if (this.rig) {
      this.player.remove(this.rig.root);
      this.rig.dispose();
      this.rig = null;
    }
    if (!this.characterAssets) {
      this.mannequin.visible = true;
      this.updateHeldWeapon();
      return;
    }
    this.rig = new CharacterRig(this.characterAssets[this.character]);
    this.rig.root.traverse((o) => o.layers.enable(7));
    this.player.add(this.rig.root);
    this.mannequin.visible = false;
    this.updateHeldWeapon();
    this.applyOutfit();
  }

  private applyCharacterLook(): void {
    if (this.character === "LANDRY") {
      this.playerBodyMat.color.setHex(0x704d37);
      this.playerClothMat.color.setHex(0x39483f);
      this.playerPantsMat.color.setHex(0x37352d);
      this.playerHairMat.color.setHex(0x211b17);
    } else {
      this.playerBodyMat.color.setHex(0x885f46);
      this.playerClothMat.color.setHex(0x566044);
      this.playerPantsMat.color.setHex(0x3a352c);
      this.playerHairMat.color.setHex(0x241917);
    }
    this.buildRig();
  }

  private get weaponSocket(): THREE.Object3D {
    return this.rig ? this.rig.socket : this.fallbackSocket;
  }

  private updateHeldWeapon(): void {
    if (this.heldWeapon) {
      this.heldWeapon.parent?.remove(this.heldWeapon);
      this.heldWeapon = null;
    }
    const model = createWeaponModel(this.currentWeapon);
    this.weaponSocket.add(model);
    this.heldWeapon = model;
  }

  // =========================================================
  // COMBAT
  // =========================================================

  private get isRangedEquipped(): boolean {
    return WEAPONS[this.currentWeapon].kind === "ranged";
  }

  private updateCombat(delta: number): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= delta;
      if (this.muzzleTimer <= 0) {
        this.muzzleFlash.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }

    // Coup de mêlée : les dégâts tombent au milieu du geste
    if (this.pendingMeleeHit && this.rig && this.rig.swingPhase >= 0.45) {
      this.pendingMeleeHit = false;
      this.applyMeleeHit();
    } else if (this.pendingMeleeHit && !this.rig) {
      this.pendingMeleeHit = false;
      this.applyMeleeHit();
    }

    if (this.dead || this.paused) return;
    const def = WEAPONS[this.currentWeapon];
    if (this.mouseLeft && def.automatic && this.attackCooldown <= 0) {
      this.attack();
    }

    // Blocage / parade : clic droit (mêlée) ou touche Q / Ctrl
    const wantBlock = !this.isRangedEquipped && (this.mouseRight || this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.touchBlock);
    if (wantBlock && !this.blocking) {
      this.blocking = true;
      this.blockStartedAt = this.clock.elapsedTime;
    } else if (!wantBlock) {
      this.blocking = false;
    }
    if (this.blocking) this.stamina = Math.max(0, this.stamina - 8 * delta);
    if (this.blocking && this.stamina <= 1) this.blocking = false;
  }

  private attack(): void {
    if (this.dead || this.attackCooldown > 0) return;
    const def = WEAPONS[this.currentWeapon];
    this.attackCooldown = def.cooldown;

    if (def.kind === "melee") {
      const started = this.rig ? this.rig.startSwing(def.cooldown + 0.1) : true;
      if (!started) return;
      this.sfx.swing();
      this.pendingMeleeHit = true;
      this.playerYaw = this.camYaw;
      return;
    }

    // Arme à feu (Pistolet, M16 ou Calibre 12)
    const isShotgun = def.ammo === "shotgun";
    const ammo = def.ammo === "pistol" ? this.ammoPistol : isShotgun ? this.ammoShotgun : this.ammoRifle;
    if (ammo <= 0) {
      this.sfx.click();
      this.say(
        def.ammo === "pistol"
          ? "Plus de munitions 9 mm !"
          : isShotgun
            ? "Plus de cartouches Calibre 12 !"
            : "Chargeur M16 vide !",
        1.5
      );
      this.attackCooldown = 0.4;
      return;
    }
    if (def.ammo === "pistol") this.ammoPistol -= 1;
    else if (isShotgun) this.ammoShotgun -= 1;
    else this.ammoRifle -= 1;

    this.playerYaw = this.camYaw;
    this.sfx.gunshot(def.ammo === "pistol" ? "pistol" : isShotgun ? "shotgun" : "rifle");
    this.camPitch = clamp(
      this.camPitch + (isShotgun ? -0.028 : def.ammo === "pistol" ? -0.012 : -0.007),
      -0.2,
      1.05
    );
    this.camYaw += (Math.random() - 0.5) * (isShotgun ? 0.01 : 0.004);

    // Éclair de bouche
    const muzzle = muzzleOffset(this.currentWeapon);
    this.weaponSocket.updateWorldMatrix(true, false);
    this.weaponSocket.localToWorld(muzzle);
    this.muzzleFlash.position.copy(muzzle);
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(isShotgun ? 1.85 : def.ammo === "rifle" ? 1.3 : 1);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleLight.intensity = isShotgun ? 9 : 6;
    this.muzzleTimer = isShotgun ? 0.09 : 0.06;

    // Tir : rayon ou gerbe de chevrotines (Calibre 12) depuis la caméra
    const origin = this.camera.position.clone();
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const spread = this.aimBlend > 0.5 ? 0.004 : 0.02;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    let best: AnimalData | null = null;
    let bestT = def.range;
    const center = new THREE.Vector3();
    const toCenter = new THREE.Vector3();
    const hitCone = isShotgun ? 1.55 : 0.75;
    for (const animal of this.animals) {
      if (animal.dead) continue;
      center.copy(animal.group.position);
      center.y += 0.55 * animal.group.scale.x;
      toCenter.subVectors(center, origin);
      const t = toCenter.dot(dir);
      if (t < 0.5 || t > bestT) continue;
      const perp = toCenter.sub(dir.clone().multiplyScalar(t)).length();
      if (perp < hitCone * animal.group.scale.x) {
        best = animal;
        bestT = t;
      }
    }
    if (best) {
      // Le Calibre 12 inflige des dégâts accrus à courte portée et repousse même un buffle
      const distBonus = isShotgun && bestT < 10 ? 1.25 : 1;
      this.damageAnimal(best, Math.round(def.damage * distBonus), this.clock.elapsedTime, origin);
      if (best.aggressive && !best.dead) {
        best.fleeUntil = Math.max(best.fleeUntil, this.clock.elapsedTime + (isShotgun ? 2.4 : 1.6));
        const push = this.tmpVec2.subVectors(best.group.position, this.player.position);
        push.y = 0;
        if (push.lengthSq() > 0.0001) {
          best.knock.add(push.normalize().multiplyScalar(isShotgun ? 4.8 : 2.8));
        }
      }
    }
  }

  private applyMeleeHit(): void {
    const def = WEAPONS[this.currentWeapon];
    const forward = new THREE.Vector3(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
    let hitAny = false;
    for (const animal of this.animals) {
      if (animal.dead) continue;
      const to = this.tmpVec2.subVectors(animal.group.position, this.player.position);
      to.y = 0;
      const d = to.length();
      if (d > def.range + 0.6 * animal.group.scale.x) continue;
      const cos = to.normalize().dot(forward);
      if (cos < 0.5) continue;
      this.damageAnimal(animal, def.damage, this.clock.elapsedTime, this.player.position);
      if (animal.aggressive && !animal.dead) {
        animal.fleeUntil = Math.max(animal.fleeUntil, this.clock.elapsedTime + 1.2);
        const push = animal.group.position.clone().sub(this.player.position);
        push.y = 0;
        if (push.lengthSq() > 0.0001) animal.knock.add(push.normalize().multiplyScalar(3.2));
      }
      hitAny = true;
    }
    if (!hitAny && this.currentWeapon === "machette") {
      // La machette permet aussi de couper du bois sur les troncs proches
      for (const tree of this.trees) {
        if (Math.hypot(tree.x - this.player.position.x, tree.z - this.player.position.z) < def.range + tree.r) {
          if (Math.random() < 0.35) {
            this.inventory.Bois += 1;
            this.say("Tu coupes une branche : +1 bois.", 2);
          }
          break;
        }
      }
    }
  }

  // =========================================================
  // ABRI ET LANCE
  // =========================================================

  private craftSpear(): void {
    if (this.hasSpear) {
      this.say("Tu possèdes déjà une lance.");
      return;
    }
    if (this.inventory.Bois >= 2 && this.inventory.Pierres >= 1) {
      this.inventory.Bois -= 2;
      this.inventory.Pierres -= 1;
      this.hasSpear = true;
      this.addWeapon("lance");
      this.addXp(XP.spear);
      this.say(`Lance fabriquée ! Les animaux te craignent désormais (touche 3). (+${XP.spear} XP)`, 4);
    } else {
      this.say("Il faut 2 bois et 1 pierre pour une lance.");
    }
  }

  /** Action B : construire l'abri, ou s'y reposer jusqu'à l'aube s'il existe déjà. */
  private buildShelter(): void {
    if (this.hasShelter) {
      if (this.isNearShelter()) {
        this.restAtShelter();
      } else {
        const d = this.shelterDistance();
        this.say(`Ton abri est à ${Math.round(d)} m (${this.shelterHeading()}). Rejoins-le pour te reposer (B).`, 3);
      }
      return;
    }
    if (this.inventory.Bois < 5) {
      this.say(`Il faut 5 bois pour construire un abri (tu en as ${this.inventory.Bois}). Ramasse des branches ou coupe-les à la machette.`, 3.5);
      return;
    }
    if (this.isInRiver() || distanceToWaterEdge(this.player.position.x, this.player.position.z) < 1.2) {
      this.say("Trop près de l'eau pour construire : éloigne-toi de la berge.");
      return;
    }
    if (this.threatNearby) {
      this.say("Impossible de construire : un animal dangereux rôde !");
      return;
    }
    this.inventory.Bois -= 5;
    this.hasShelter = true;
    this.spawnShelter(this.player.position.x, this.player.position.z);
    this.sfx.pickup();
    this.addXp(XP.shelter);
    this.say(`Abri construit ! (+${XP.shelter} XP) Le feu te permet de griller la viande (G). Appuie sur B près de l'abri pour dormir.`, 6);
  }

  /** Public : déclenche l'action B depuis l'interface (bouton HUD / menu pause). */
  pressBuild(): void {
    if (!this.gameStarted || this.dead) return;
    this.buildShelter();
    this.emitSnapshot();
  }

  private shelterDistance(): number {
    if (!this.shelterPos) return Infinity;
    return Math.hypot(this.player.position.x - this.shelterPos.x, this.player.position.z - this.shelterPos.z);
  }

  private shelterHeading(): string {
    if (!this.shelterPos) return "";
    const dx = this.shelterPos.x - this.player.position.x;
    const dz = this.shelterPos.z - this.player.position.z;
    const ns = Math.abs(dz) > Math.abs(dx) * 0.4 ? (dz < 0 ? "nord" : "sud") : "";
    const ew = Math.abs(dx) > Math.abs(dz) * 0.4 ? (dx < 0 ? "ouest" : "est") : "";
    return ns && ew ? `${ns}-${ew}` : ns || ew;
  }

  private restAtShelter(): void {
    if (this.threatNearby) {
      this.say("Impossible de dormir : un animal dangereux rôde près de l'abri !");
      return;
    }
    if (this.hunger < 15 || this.thirst < 15) {
      this.say("Tu es trop affamé ou assoiffé pour dormir. Mange et bois d'abord.");
      return;
    }
    const phase = (this.dayTime / this.dayLength) % 1;
    // Aube = 06h00 ; on avance jusqu'à la prochaine aube pendant que le personnage s'allonge sur le lit
    const dawn = 6 / 24;
    let advance = dawn - phase;
    if (advance <= 0.02) advance += 1;
    const slept = advance * this.dayLength;
    const hours = (advance * 24).toFixed(0);

    // Place le personnage sur le lit de camp de la cabane, face au feu réaliste
    if (this.shelterPos) {
      const bedX = this.shelterPos.x - 0.52;
      const bedZ = this.shelterPos.z - 0.22;
      this.player.position.set(bedX, terrainHeight(this.shelterPos.x, this.shelterPos.z), bedZ);
      this.playerYaw = Math.PI; // tête sur l'oreiller, pieds vers le feu
      this.camYaw = 0.45;
      this.camPitch = 0.28;
    }

    const duration = 4.2;
    this.sleepingTimer = duration;
    this.sleepAdvanceRate = slept / duration;

    this.stamina = 100;
    this.health = Math.min(100, this.health + 25 + advance * 20);
    this.hunger = Math.max(0, this.hunger - advance * 22);
    this.thirst = Math.max(0, this.thirst - advance * 30);
    this.addXp(XP.rest + Math.round(advance * XP.perHour * 20));
    this.addXp(XP.rest + Math.round(advance * XP.perHour * 20));

    // Les animaux se redistribuent pendant la nuit
    for (const a of this.animals) {
      if (!a.dead && Math.hypot(a.group.position.x - this.player.position.x, a.group.position.z - this.player.position.z) < 25) {
        this.respawnAnimal(a);
      }
    }
    this.say(`🛏️ Tu t'allonges sur le lit près du feu crépitant pour ${hours} h de sommeil…`, 5);
  }

  private removeShelter(): void {
    if (this.shelterGroup) {
      this.worldGroup.remove(this.shelterGroup);
      this.shelterGroup = null;
    }
    this.shelterPos = null;
    this.shelterFireLight = null;
    this.shelterFlames = [];
    this.shelterSparks = null;
  }

  private spawnShelter(x: number, z: number): void {
    const shelter = this.buildShelterGroup(x, z, true);
    this.toonify(shelter);
    this.worldGroup.add(shelter);
    this.shelterGroup = shelter;
    this.shelterPos = { x, z };
  }

  private buildShelterGroup(x: number, z: number, isPlayerShelter = false): THREE.Group {
    const shelter = new THREE.Group();
    shelter.position.set(x, terrainHeight(x, z), z);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, 2.7), this.mat.shelter);
    roof.position.y = 2.0;
    roof.rotation.z = -0.18;
    roof.castShadow = true;
    shelter.add(roof);

    // Toit de grandes feuilles
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), this.mat.bigleaf);
      leaf.position.set(-1.2 + i * 0.5, 2.1 + i * 0.09, (i % 2) * 0.8 - 0.4);
      leaf.rotation.set(-Math.PI / 2 + 0.25, 0, 0.3);
      shelter.add(leaf);
    }

    for (const side of [-1, 1]) {
      const support = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.0, 8), this.mat.trunk);
      support.position.set(side * 1.35, 1.0, 0.1);
      support.castShadow = true;
      shelter.add(support);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.0, 8), this.mat.trunk);
      back.position.set(side * 1.35, 1.0, -1.15);
      shelter.add(back);
    }

    // Lit de camp forestier sous la cabane (cadre en bois, pieds, natte/matelas et oreiller)
    const bedGroup = new THREE.Group();
    bedGroup.position.set(-0.52, 0, -0.22);
    const frameMat = this.mat.wood;
    const mattressMat = new THREE.MeshStandardMaterial({ color: 0x3f6b4e, roughness: 0.85 });
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xe6dec8, roughness: 0.75 });
    const blanketMat = new THREE.MeshStandardMaterial({ color: 0x8c4a27, roughness: 0.88 });
    mattressMat.userData.keep = true;
    pillowMat.userData.keep = true;
    blanketMat.userData.keep = true;

    for (const [lx, lz] of [
      [-0.44, -0.88],
      [0.44, -0.88],
      [-0.44, 0.88],
      [0.44, 0.88],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.36, 6), this.mat.trunk);
      leg.position.set(lx, 0.18, lz);
      leg.castShadow = true;
      bedGroup.add(leg);
    }
    for (const sx of [-0.44, 0.44]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.92, 6), frameMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(sx, 0.34, 0);
      bedGroup.add(rail);
    }
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 1.84), mattressMat);
    mattress.position.set(0, 0.4, 0);
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    bedGroup.add(mattress);

    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.11, 0.95), blanketMat);
    blanket.position.set(0, 0.41, 0.38);
    bedGroup.add(blanket);

    const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.68, 10), pillowMat);
    pillow.rotation.z = Math.PI / 2;
    pillow.position.set(0, 0.5, -0.68);
    pillow.castShadow = true;
    bedGroup.add(pillow);
    shelter.add(bedGroup);

    // Feu de camp réaliste (pierres, bûches croisées, lit de braises, flammes multicouches et étincelles)
    const fireGroup = new THREE.Group();
    fireGroup.position.set(0, 0, 1.65);
    shelter.add(fireGroup);

    const fire = new THREE.PointLight(0xff8c2b, 2.2, 13, 1.8);
    fire.position.set(0, 0.75, 0);
    fireGroup.add(fire);

    // Couronne de pierres du foyer
    for (let i = 0; i < 8; i++) {
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), this.mat.rock);
      const a = (i / 8) * Math.PI * 2;
      stone.position.set(Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42);
      stone.scale.set(1.2, 0.75, 1.0);
      fireGroup.add(stone);
    }

    // Bûches croisées en étoile dans le foyer
    const charredMat = new THREE.MeshStandardMaterial({ color: 0x2a180d, roughness: 0.95, emissive: 0x3a1100, emissiveIntensity: 0.35 });
    charredMat.userData.keep = true;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.2;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.68, 7), charredMat);
      log.position.set(Math.cos(a) * 0.14, 0.12, Math.sin(a) * 0.14);
      log.rotation.set(Math.PI / 2 - 0.32, a, 0);
      log.castShadow = true;
      fireGroup.add(log);
    }

    // Lit de braises incandescentes
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5500 })
    );
    ember.scale.set(1.2, 0.35, 1.2);
    ember.position.set(0, 0.07, 0);
    ember.layers.enable(7);
    fireGroup.add(ember);

    // Flammes multicouches (cœur jaune blanc, flammes orange et pointes rouges)
    const flameSpecs = [
      { r: 0.17, h: 0.62, color: 0xfff3a8, x: 0, z: 0, opacity: 0.95 },
      { r: 0.22, h: 0.78, color: 0xff9a1f, x: 0.05, z: -0.04, opacity: 0.85 },
      { r: 0.2, h: 0.72, color: 0xff6a00, x: -0.06, z: 0.04, opacity: 0.82 },
      { r: 0.15, h: 0.58, color: 0xff3b00, x: 0.04, z: 0.06, opacity: 0.75 },
      { r: 0.14, h: 0.54, color: 0xffb833, x: -0.05, z: -0.05, opacity: 0.85 },
    ];
    const flames: THREE.Mesh[] = [];
    for (const spec of flameSpecs) {
      const coneGeo = new THREE.ConeGeometry(spec.r, spec.h, 7);
      coneGeo.translate(0, spec.h / 2, 0);
      const flameMat = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      flameMat.userData.keep = true;
      const flame = new THREE.Mesh(coneGeo, flameMat);
      flame.position.set(spec.x, 0.08, spec.z);
      flame.layers.enable(7);
      fireGroup.add(flame);
      flames.push(flame);
    }

    // Étincelles / flammèches qui s'élèvent au-dessus du feu
    const sparkCount = 24;
    const sparkPos = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount; i++) {
      sparkPos[i * 3] = (Math.random() - 0.5) * 0.35;
      sparkPos[i * 3 + 1] = 0.15 + Math.random() * 1.4;
      sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xffc864,
      size: 0.055,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.position.set(0, 0.1, 0);
    fireGroup.add(sparks);

    if (isPlayerShelter) {
      this.shelterFireLight = fire;
      this.shelterFlames = flames;
      this.shelterSparks = sparks;
    }

    this.addGabonFlag(shelter, 1.55, 0.2, 2.4);
    return shelter;
  }

  /** Drapeau gabonais : bandes horizontales vert, jaune, bleu. */
  private addGabonFlag(parent: THREE.Object3D, poleX: number, poleZ: number, poleH: number): void {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, poleH, 8), this.mat.rock);
    pole.position.set(poleX, poleH / 2, poleZ);
    pole.castShadow = true;
    parent.add(pole);
    const w = 0.95;
    const stripeH = 0.22;
    const colors = [0x009e60, 0xfcd116, 0x3a75c4];
    colors.forEach((hex, i) => {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(w, stripeH),
        new THREE.MeshStandardMaterial({ color: hex, side: THREE.DoubleSide, roughness: 0.65, metalness: 0.05 })
      );
      stripe.position.set(poleX + w / 2 + 0.04, poleH - 0.12 - i * stripeH, poleZ);
      parent.add(stripe);
    });
  }

  // =========================================================
  // COMMANDES
  // =========================================================

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "F5" || event.code === "F9") event.preventDefault();
    if (!this.gameStarted) return;

    if (this.uiCapture) return;
    this.keys.add(event.code);
    if (event.repeat || this.paused) return;

    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

    switch (event.code) {
      case "KeyE":
        if (!this.dead && !this.tryTame()) this.collectResource();
        break;
      case "KeyO":
        if (event.shiftKey) return; // ⇧O : dressing (interface)
        if (!this.dead) this.cycleOutfit();
        break;
      case "KeyP":
        this.togglePhotoMode();
        break;
      case "KeyF":
        if (!this.dead) this.eatFruit();
        break;
      case "KeyG":
        if (!this.dead) this.eatMeat();
        break;
      case "Digit1":
      case "Numpad1":
        if (!this.dead) this.selectWeapon("couteau");
        break;
      case "Digit2":
      case "Numpad2":
        if (!this.dead) this.selectWeapon("machette");
        break;
      case "Digit3":
      case "Numpad3":
        if (!this.dead) this.selectWeapon("lance");
        break;
      case "Digit4":
      case "Numpad4":
        if (!this.dead) this.selectWeapon("pistolet");
        break;
      case "Digit5":
      case "Numpad5":
        if (!this.dead) this.selectWeapon("m16");
        break;
      case "Digit6":
      case "Numpad6":
        if (!this.dead) this.selectWeapon("calibre12");
        break;
      case "Tab":
        event.preventDefault();
        if (!this.dead) this.cycleWeapon(1);
        break;
      case "KeyN":
        if (!this.dead) this.toggleNightVision();
        break;
      case "Space":
        event.preventDefault();
        if (!this.dead) this.jump();
        break;
      case "KeyM":
        if (!this.dead) this.toggleGps();
        break;
      case "KeyI":
        this.inventoryOpen = !this.inventoryOpen;
        break;
      case "KeyC":
        if (!this.dead) this.craftSpear();
        break;
      case "KeyB":
        if (!this.dead) this.buildShelter();
        break;
      case "F5":
        this.callbacks.onRequestSave();
        break;
      case "F9":
        this.callbacks.onRequestLoad();
        break;
      case "Escape":
        if (this.photoMode) {
          this.photoMode = false;
          break;
        }
        this.callbacks.onRequestPause();
        break;
      default:
        return;
    }
    this.emitSnapshot();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  private onWheel = (event: WheelEvent): void => {
    if (!this.gameStarted || this.paused || this.uiCapture || !this.pointerLocked) return;
    if (this.cameraMode === "first") return;
    event.preventDefault();
    const delta = Math.sign(event.deltaY) * 0.55;
    const min = this.cameraMode === "shoulder" ? 1.6 : this.cameraMode === "selfie" ? 1.4 : 2.4;
    const max = this.cameraMode === "cinematic" ? 18 : this.cameraMode === "selfie" ? 4 : 9;
    this.camDistTarget = clamp(this.camDistTarget + delta, min, max);
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked || this.paused || !this.gameStarted) return;
    this.camYaw -= event.movementX * MOUSE_SENSITIVITY;
    this.camPitch += event.movementY * MOUSE_SENSITIVITY;
    this.camPitch = clamp(this.camPitch, -0.2, 1.05);
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (!this.pointerLocked || this.paused || !this.gameStarted || this.dead) return;
    if (event.button === 0) {
      this.mouseLeft = true;
      this.attack();
    } else if (event.button === 2) {
      this.mouseRight = true;
      if (!this.isRangedEquipped && this.outfit.ability === "purify") this.purify();
    }
  };

  private onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.mouseLeft = false;
    if (event.button === 2) this.mouseRight = false;
  };

  private onContextMenu = (event: Event): void => {
    if (this.pointerLocked || this.gameStarted) event.preventDefault();
  };

  private uiCapture = false;

  /** Quand l'interface (chat) capture le clavier, on ne met pas en pause à la perte du pointeur. */
  setUiCapture(capturing: boolean): void {
    this.uiCapture = capturing;
    if (capturing) {
      this.keys.clear();
      this.mouseLeft = false;
      this.mouseRight = false;
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
  }

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (!this.pointerLocked) {
      this.mouseLeft = false;
      this.mouseRight = false;
    }
    // Ne plus mettre en pause à chaque clic UI / perte de souris : Échap suffit.
  };

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    const cssW = parent ? parent.clientWidth : window.innerWidth;
    const cssH = parent ? parent.clientHeight : window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    // Plafond de résolution : 1080 lignes (mobile), 1440 (HD), 2160 (4K HDMI)
    const capRatio = Math.min(this.quality.pixelRatioMax, dpr, this.quality.targetHeight / Math.max(1, cssH));
    const ratio = Math.max(0.5, capRatio * this.renderScale);
    const width = Math.max(1, Math.round(cssW * ratio));
    const height = Math.max(1, Math.round(cssH * ratio));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.camera.aspect = cssW / Math.max(1, cssH);
    this.camera.updateProjectionMatrix();
    this.thermal?.setSize(width, height);
    this.realism?.setSize(width, height);
  };

  setQuality(preset: QualityPreset): void {
    const resolved = preset === "auto" ? detectQualityPreset() : preset;
    const q = QUALITY_PRESETS[resolved];
    const rebuildWorld = q.vegetation !== this.quality.vegetation || q.dust !== this.quality.dust;
    this.quality = q;
    this.renderScale = 1;
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    for (const t of Object.values(this.textures)) {
      if (t) {
        t.anisotropy = Math.min(q.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
        t.needsUpdate = true;
      }
    }
    if (rebuildWorld && this.gameStarted) {
      const save = this.getSaveData();
      this.buildWorld(this.worldSeed);
      this.applySave(save);
    }
    this.resize();
  }

  private sizeTmp = new THREE.Vector2();

  getPerfInfo(): PerfInfo {
    const size = this.renderer.getSize(this.sizeTmp);
    return {
      fps: Math.round(this.fpsSmoothed),
      renderScale: this.renderScale,
      renderWidth: size.x,
      renderHeight: size.y,
      preset: this.quality.preset,
      isTouch: this.isTouch,
    };
  }

  /** Entrées tactiles (joystick virtuel et zone de regard). */
  setTouchMove(x: number, z: number): void {
    this.touchMove.x = clamp(x, -1, 1);
    this.touchMove.z = clamp(z, -1, 1);
  }

  setTouchRun(run: boolean): void {
    this.touchRun = run;
  }

  applyTouchLook(dx: number, dy: number): void {
    if (!this.gameStarted || this.paused) return;
    this.camYaw -= dx * MOUSE_SENSITIVITY * 1.6;
    this.camPitch = clamp(this.camPitch + dy * MOUSE_SENSITIVITY * 1.6, -0.2, 1.05);
  }

  /** Actions depuis les boutons tactiles. */
  touchAction(
    action:
      | "attack"
      | "attackStart"
      | "attackEnd"
      | "aimToggle"
      | "interact"
      | "jump"
      | "eat"
      | "eatFruit"
      | "eatMeat"
      | "weapon"
      | "blockStart"
      | "blockEnd"
      | "runStart"
      | "runEnd"
      | "build"
      | "spear"
      | "gps"
      | "nightVision"
      | "inventory"
      | "outfit"
  ): void {
    if (action === "attackEnd") this.mouseLeft = false;
    if (action === "blockEnd") this.touchBlock = false;
    if (action === "runEnd") this.touchRun = false;
    if (!this.gameStarted || this.paused || this.dead) return;
    switch (action) {
      case "attack":
        this.attack();
        break;
      case "attackStart":
        this.mouseLeft = true;
        this.attack();
        break;
      case "aimToggle":
        this.mouseRight = !this.mouseRight;
        break;
      case "interact":
        this.collectResource();
        break;
      case "jump":
        this.jump();
        this.touchJumpHeld = true;
        window.setTimeout(() => (this.touchJumpHeld = false), 1200);
        break;
      case "eat":
        if (this.inventory.Fruits > 0) this.eatFruit();
        else this.eatMeat();
        break;
      case "eatFruit":
        this.eatFruit();
        break;
      case "eatMeat":
        this.eatMeat();
        break;
      case "weapon":
        this.cycleWeapon(1);
        break;
      case "blockStart":
        this.touchBlock = true;
        if (!this.blocking) {
          this.blocking = true;
          this.blockStartedAt = this.clock.elapsedTime;
        }
        break;
      case "runStart":
        this.touchRun = true;
        break;
      case "build":
        this.buildShelter();
        break;
      case "spear":
        this.craftSpear();
        break;
      case "gps":
        this.toggleGps();
        break;
      case "nightVision":
        this.toggleNightVision();
        break;
      case "inventory":
        this.inventoryOpen = !this.inventoryOpen;
        break;
      case "outfit":
        this.cycleOutfit();
        break;
    }
    this.emitSnapshot();
  }

  private updateAdaptiveResolution(delta: number, elapsed: number): void {
    if (delta <= 0) return;
    const fps = 1 / delta;
    this.fpsSmoothed += (fps - this.fpsSmoothed) * 0.05;
    if (!this.quality.dynamicResolution || !this.gameStarted) return;
    if (elapsed - this.lastQualityAdjust < 2.0) return;
    const target = this.isTouch ? 28 : 30;
    if (this.fpsSmoothed < target - 7 && this.renderScale > 0.75) {
      this.renderScale = Math.max(0.75, this.renderScale - 0.05);
      this.lastQualityAdjust = elapsed;
      this.resize();
    } else if (this.fpsSmoothed > target + 6 && this.renderScale < 1) {
      this.renderScale = Math.min(1, this.renderScale + 0.05);
      this.lastQualityAdjust = elapsed;
      this.resize();
    }
  }

  // =========================================================
  // SAUT ET ESQUIVE
  // =========================================================

  private jumpsUsed = 0;

  /** Saut haut (≈2,4 m) avec double saut en l'air (≈3,6 m cumulés). */
  private jump(): void {
    if (this.dead) return;
    if (this.jumping && this.jumpsUsed >= 2) return;
    if (this.stamina < 6) {
      if (!this.jumping) this.say("Trop essoufflé pour sauter !", 1.2);
      return;
    }
    const second = this.jumping;
    this.jumping = true;
    this.jumpsUsed = second ? 2 : 1;
    this.jumpVelocity = second ? 6.4 : 7.6;
    this.stamina = Math.max(0, this.stamina - (second ? 5 : 6));
    // Fenêtre d'esquive : pendant la montée, les charges sont évitées
    this.dodgeUntil = this.clock.elapsedTime + (second ? 0.5 : 0.7);
    this.sfx.swing();
  }

  private updateJump(delta: number): void {
    if (!this.jumping) {
      this.jumpHeight = 0;
      this.jumpsUsed = 0;
      this.gliding = false;
      return;
    }
    const holding = this.keys.has("Space") || this.touchJumpHeld;
    this.gliding = this.outfit.ability === "glide" && holding && this.jumpVelocity < 0 && this.jumpHeight > 0.5;
    if (this.gliding) {
      this.jumpVelocity = Math.max(this.jumpVelocity - 12 * delta, -1.1);
      this.stamina = Math.max(0, this.stamina - 3 * delta);
      if (this.stamina <= 0) this.gliding = false;
    } else {
      this.jumpVelocity -= 12 * delta;
    }
    this.jumpHeight += this.jumpVelocity * delta;
    if (this.jumpHeight <= 0) {
      this.jumpHeight = 0;
      this.jumping = false;
      this.jumpVelocity = 0;
      this.jumpsUsed = 0;
    }
  }

  /** Vrai si une attaque est esquivée à cet instant (saut en cours). */
  private isDodging(): boolean {
    return this.clock.elapsedTime < this.dodgeUntil || this.jumpHeight > 0.3;
  }

  /** Dégâts d'une charge : parade parfaite, blocage, esquive ou impact. */
  private receiveCharge(label: string, dps: number, delta: number, animal: AnimalData): void {
    if (this.isDodging()) {
      this.registerDodge(label);
      return;
    }
    const now = this.clock.elapsedTime;
    const def = WEAPONS[this.currentWeapon];
    if (this.blocking && def.kind === "melee") {
      const since = now - this.blockStartedAt;
      if (since >= 0 && since <= def.parryWindow) {
        this.parryLockUntil = now + 0.6;
        animal.fleeUntil = now + 2.4;
        const push = this.tmpVec2.subVectors(animal.group.position, this.player.position);
        push.y = 0;
        if (push.lengthSq() > 0.0001) animal.knock.add(push.normalize().multiplyScalar(4.5));
        this.sfx.hit();
        this.say(`Parade ! Tu repousses le ${label.toLowerCase()} avec ${def.label.toLowerCase()}.`, 2);
        return;
      }
      const reduced = dps * (1 - def.blockReduction);
      this.health = Math.max(0, this.health - reduced * delta);
      this.stamina = Math.max(0, this.stamina - 18 * delta);
      this.lastDamageSource = "animal";
      return;
    }
    this.health = Math.max(0, this.health - dps * delta);
    this.lastDamageSource = "animal";
  }

  private registerDodge(label: string): void {
    const now = this.clock.elapsedTime;
    if (now - this.lastDodgeFeedback < 0.8) return;
    this.lastDodgeFeedback = now;
    this.dodges += 1;
    this.hitMarkerUntil = performance.now() + 200;
    this.say(`Esquive ! Tu as sauté par-dessus la charge du ${label.toLowerCase()}.`, 2);
  }

  // =========================================================
  // BOUCLE PRINCIPALE
  // =========================================================

  private loop = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    const delta = Math.min(0.05, this.clock.getDelta());
    if (!this.gameStarted) return;
    if (this.paused && !this.photoMode) return;
    const elapsed = this.clock.elapsedTime;
    this.updateAdaptiveResolution(delta, elapsed);

    let moveState: "idle" | "walk" | "run" = "idle";
    let speedFactor = 1;
    if (this.gameStarted && !this.paused) {
      if (!this.dead) {
        const move = this.updatePlayer(delta);
        moveState = move.state;
        speedFactor = move.speedFactor;
        this.lastMoveState = moveState;
        this.updateSurvival(delta);
      }
      this.updateCombat(delta);
      this.updateAnimals(delta, elapsed);
      this.updateGadgets(delta);
      if (!this.dead) this.updateWhimsy(delta, elapsed);
      this.updateCompanions(delta);
      this.purifyCooldown = Math.max(0, this.purifyCooldown - delta);
      this.dayTime += delta;
      this.timeSurvived += this.dead ? 0 : delta;
    }

    const aiming = this.gameStarted && !this.dead && !this.paused && this.mouseRight && this.isRangedEquipped;
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * Math.min(1, delta * 8);
    if (aiming) this.playerYaw = this.camYaw;
    this.player.rotation.y = this.playerYaw;

    if (this.sleepingTimer > 0 && !this.paused && !this.dead) {
      const dt = Math.min(delta, this.sleepingTimer);
      this.sleepingTimer = Math.max(0, this.sleepingTimer - delta);
      this.dayTime += this.sleepAdvanceRate * dt;
      this.timeSurvived += this.sleepAdvanceRate * dt;
      if (this.sleepingTimer <= 0) {
        if (this.shelterPos) {
          const wakeX = this.shelterPos.x + 0.35;
          const wakeZ = this.shelterPos.z + 0.55;
          this.player.position.set(wakeX, terrainHeight(wakeX, wakeZ), wakeZ);
        }
        this.say("☀️ L'aube se lève : tu te réveilles reposé au coin du feu !", 4.5);
      }
    }

    if (this.rig) {
      this.rig.setMoveState(this.dead || this.sleepingTimer > 0 ? "idle" : moveState, speedFactor);
      this.rig.setAiming(aiming && this.sleepingTimer <= 0 && !this.swimming, delta);
      this.rig.setFallen(this.dead, delta);
      this.rig.setSleeping(this.sleepingTimer > 0 && !this.dead, delta);
      this.rig.setSwimming(this.swimming && this.sleepingTimer <= 0 && !this.dead, moveState !== "idle", delta);
      const paused = this.paused && this.gameStarted;
      // Regard : vers la direction de la caméra (comme si le personnage observait ce que voit le joueur)
      let relYaw = this.camYaw - this.playerYaw;
      while (relYaw > Math.PI) relYaw -= Math.PI * 2;
      while (relYaw < -Math.PI) relYaw += Math.PI * 2;
      // Si la caméra regarde trop vers l'arrière, la tête revient devant
      const lookYaw = Math.abs(relYaw) > 1.6 ? 0 : relYaw;
      this.rig.setLookTarget(-lookYaw * 0.7, this.camPitch * 0.5 - 0.1);
      // Inclinaison dans les virages (vitesse de rotation) et pente du sol
      let dYaw = this.playerYaw - this.prevPlayerYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      this.prevPlayerYaw = this.playerYaw;
      if (delta > 0) this.yawRate += ((dYaw / delta) - this.yawRate) * Math.min(1, delta * 8);
      const moveFactor = moveState === "run" ? 1 : moveState === "walk" ? 0.5 : 0;
      const fx = -Math.sin(this.playerYaw);
      const fz = -Math.cos(this.playerYaw);
      const ahead = terrainHeight(this.player.position.x + fx * 0.6, this.player.position.z + fz * 0.6);
      const behind = terrainHeight(this.player.position.x - fx * 0.6, this.player.position.z - fz * 0.6);
      this.rig.setBodyDynamics(-this.yawRate * 0.06 * moveFactor, Math.atan2(ahead - behind, 1.2) * (this.jumpHeight > 0 ? 0 : 1));
      this.rig.update(paused ? 0 : delta, this.player.quaternion, this.camPitch);
    }
    if (!this.rig) this.animateFallbackCharacter(delta, this.dead ? "idle" : moveState);

    if (this.contactShadow) {
      this.contactShadow.position.set(this.player.position.x, terrainHeight(this.player.position.x, this.player.position.z) + 0.02, this.player.position.z);
      const s = 1 + this.jumpHeight * 0.4;
      this.contactShadow.scale.set(s, s, 1);
      (this.contactShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - this.jumpHeight * 0.3);
      this.contactShadow.visible = this.gameStarted && !this.swimming && this.sleepingTimer <= 0;
    }
    if (this.swimRipple) {
      this.swimRipple.visible = this.gameStarted && this.swimming && !this.dead;
      if (this.swimRipple.visible) {
        this.swimRipple.position.set(this.player.position.x, WATER_LEVEL + 0.025, this.player.position.z);
        const pulse = 1 + Math.sin(elapsed * 5.5) * 0.18 + (moveState !== "idle" ? 0.22 : 0);
        this.swimRipple.scale.set(pulse, pulse, 1);
      }
    }
    if (this.charLights && this.gameStarted) {
      const daylight = 1 - this.nightAmount;
      this.charLights.update(this.player.position, this.camera, this.sun.color, daylight);
      this.charLights.setEnabled(!this.dead);
    }
    this.updateRemotePlayers(delta);
    if (this.outfitLayer) animateOutfit(this.outfitLayer, elapsed, moveState !== "idle", this.gliding, this.nightAmount);
    this.updateDayNight();
    this.updateCamera();
    this.animateNature(elapsed, delta);

    if (this.gameStarted) {
      this.snapshotAccumulator += delta;
      if (this.snapshotAccumulator >= (this.isTouch ? 0.2 : 0.12)) {
        this.snapshotAccumulator = 0;
        this.emitSnapshot();
      }
    }

    const nvTarget = this.nightVisionOn && this.gameStarted ? 1 : 0;
    this.nvBlend += (nvTarget - this.nvBlend) * Math.min(1, delta * 6);
    if (this.nvBlend > 0.01) {
      if (!this.thermal) {
        const size = this.renderer.getSize(new THREE.Vector2());
        this.thermal = new ThermalPass(size.x, size.y);
      }
      this.thermal.render(this.renderer, this.scene, this.camera, elapsed, this.nvBlend, this.nvBattery);
    } else if (this.realism) {
      this.realism.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private updatePlayer(delta: number): { state: "idle" | "walk" | "run"; speedFactor: number } {
    const k = this.uiCapture ? new Set<string>() : this.keys;
    let ix = 0;
    let iz = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) iz -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) iz += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) ix -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) ix += 1;
    if (ix === 0 && iz === 0 && (Math.abs(this.touchMove.x) > 0.1 || Math.abs(this.touchMove.z) > 0.1)) {
      ix = this.touchMove.x;
      iz = this.touchMove.z;
    }

    const len = Math.hypot(ix, iz);
    const moving = len > 0.05;

    // Pendant le sommeil sur le lit de la cabane, le personnage reste allongé
    if (this.sleepingTimer > 0) {
      this.swimming = false;
      if (this.shelterPos) {
        const bedY = terrainHeight(this.shelterPos.x, this.shelterPos.z);
        this.player.position.set(this.shelterPos.x - 0.52, bedY, this.shelterPos.z - 0.22);
      }
      return { state: "idle", speedFactor: 1 };
    }

    const keyboardMove = k.has("KeyW") || k.has("KeyS") || k.has("KeyA") || k.has("KeyD") || k.has("ArrowUp") || k.has("ArrowDown") || k.has("ArrowLeft") || k.has("ArrowRight");
    const wantsRun = keyboardMove ? k.has("ShiftLeft") || k.has("ShiftRight") : this.touchRun || len > 0.92;
    const running = moving && wantsRun && this.stamina > 1;
    let speed = running ? RUN_SPEED : WALK_SPEED;
    if (this.gliding) speed = RUN_SPEED * 1.15;
    if (this.isInRiver() && this.outfit.ability !== "float") {
      speed = running ? RUN_SPEED * 0.72 : WALK_SPEED * 0.78;
    }

    if (moving) {
      ix /= len;
      iz /= len;
      const forwardX = -Math.sin(this.camYaw);
      const forwardZ = -Math.cos(this.camYaw);
      const rightX = Math.cos(this.camYaw);
      const rightZ = -Math.sin(this.camYaw);
      const dx = rightX * ix - forwardX * iz;
      const dz = rightZ * ix - forwardZ * iz;

      this.player.position.x += dx * speed * delta;
      this.player.position.z += dz * speed * delta;

      // En visée, le corps reste face à la caméra ; sinon il suit le déplacement
      if (!(this.mouseRight && this.isRangedEquipped)) {
        const targetYaw = Math.atan2(-dx, -dz);
        let diff = targetYaw - this.playerYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.playerYaw += diff * Math.min(1, delta * 12);
      }
    }

    for (const tree of this.nearbyTrees(this.player.position.x, this.player.position.z)) {
      const dx = this.player.position.x - tree.x;
      const dz = this.player.position.z - tree.z;
      const minDist = tree.r + 0.42;
      const d2 = dx * dx + dz * dz;
      if (d2 < minDist * minDist && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        this.player.position.x = tree.x + (dx / d) * minDist;
        this.player.position.z = tree.z + (dz / d) * minDist;
      }
    }

    const half = WORLD_SIZE / 2 - 1;
    this.player.position.x = clamp(this.player.position.x, -half, half);
    this.player.position.z = clamp(this.player.position.z, -half, half);
    this.updateJump(delta);
    let groundY = terrainHeight(this.player.position.x, this.player.position.z);
    const waterDepth = WATER_LEVEL - groundY;
    if (this.outfit.ability === "float" && groundY < WATER_LEVEL) {
      groundY = WATER_LEVEL + 0.05;
      this.swimming = false;
      this.player.position.y = groundY + this.jumpHeight;
    } else if (waterDepth > 0.25 && this.jumpHeight < 0.25) {
      // Traversée de la rivière à la nage : le personnage flotte à la surface de l'eau
      this.swimming = true;
      this.player.position.y = WATER_LEVEL - 0.52 + Math.sin(this.clock.elapsedTime * 3.2) * 0.03;
    } else {
      this.swimming = false;
      this.player.position.y = groundY + this.jumpHeight;
    }

    const nearShelter = this.isNearShelter();
    if (running) {
      this.stamina = Math.max(0, this.stamina - 22 * delta);
    } else {
      this.stamina = Math.min(100, this.stamina + (nearShelter ? 28 : 14) * delta);
    }

    if (!moving) return { state: "idle", speedFactor: 1 };
    if (running) return { state: "run", speedFactor: speed / RUN_SPEED };
    return { state: "walk", speedFactor: speed / WALK_SPEED };
  }

  private updateSurvival(delta: number): void {
    this.hunger = Math.max(0, this.hunger - 0.35 * delta);
    this.thirst = Math.max(0, this.thirst - 0.6 * delta);

    if (this.hunger <= 0) {
      this.health = Math.max(0, this.health - 1.5 * delta);
      this.lastDamageSource = "hunger";
    }
    if (this.thirst <= 0) {
      this.health = Math.max(0, this.health - 3.0 * delta);
      this.lastDamageSource = "thirst";
    }
    if (this.isNearShelter() && this.hunger > 20 && this.thirst > 20) {
      this.health = Math.min(100, this.health + 1.2 * delta);
    }
    this.addSurvivalXp();

    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.keys.clear();
      this.addXp(XP.perHour * 3); // bonus de survie
      const cause =
        this.lastDamageSource === "thirst" ? "déshydratation" : this.lastDamageSource === "hunger" ? "famine" : "attaque d'un animal sauvage";
      this.say("Tu as succombé dans la forêt.", 60);
      this.callbacks.onDeath({
        cause,
        timeSurvived: this.timeSurvived,
        resourcesCollected: this.resourcesCollected,
        hasSpear: this.hasSpear,
        hasShelter: this.hasShelter,
        kills: this.kills,
      });
      this.emitSnapshot();
    }
  }

  private updateCamera(): void {
    this.camDistance += (this.camDistTarget - this.camDistance) * 0.12;

    const rightX = Math.cos(this.camYaw);
    const rightZ = -Math.sin(this.camYaw);
    const eyeY = this.player.position.y + 1.58;
    const mode = this.cameraMode;
    const aiming = this.aimBlend;

    // Visibilité du corps : caché en 1re personne
    const showBody = mode !== "first";
    if (this.rig) this.rig.root.visible = showBody;
    this.mannequin.visible = showBody && !this.rig;
    if (this.outfitLayer) this.outfitLayer.group.visible = showBody;

    let pivotX = this.player.position.x;
    let pivotY = eyeY;
    let pivotZ = this.player.position.z;
    let dist = this.camDistance;
    let fov = 70;
    let lookX = pivotX;
    let lookY = pivotY;
    let lookZ = pivotZ;

    const dirX = Math.sin(this.camYaw) * Math.cos(this.camPitch);
    const dirY = Math.sin(this.camPitch);
    const dirZ = Math.cos(this.camYaw) * Math.cos(this.camPitch);

    if (mode === "first") {
      fov = 75 - 8 * aiming;
      pivotY = eyeY - 0.02;
      dist = 0.08;
      lookX = pivotX - dirX;
      lookY = pivotY - dirY;
      lookZ = pivotZ - dirZ;
    } else if (mode === "shoulder" || aiming > 0.2) {
      const sh = 0.55 + 0.25 * aiming;
      pivotX += rightX * sh;
      pivotZ += rightZ * sh;
      pivotY -= 0.08 * aiming;
      dist = Math.min(dist, 2.5 - 0.3 * aiming);
      fov = 65 - 10 * aiming;
    } else if (mode === "cinematic") {
      pivotY = eyeY + 0.85;
      fov = 52;
      dist = Math.max(dist, 8);
    } else if (mode === "selfie") {
      // Caméra devant le visage, regard vers le personnage
      fov = 58;
      dist = Math.max(1.6, dist);
      const fx = -Math.sin(this.playerYaw);
      const fz = -Math.cos(this.playerYaw);
      pivotX = this.player.position.x + fx * dist;
      pivotY = eyeY + 0.05 - this.camPitch * 0.4;
      pivotZ = this.player.position.z + fz * dist;
      lookX = this.player.position.x;
      lookY = eyeY - 0.1;
      lookZ = this.player.position.z;
      dist = 0;
    } else {
      fov = 70;
    }

    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();

    if (mode === "selfie") {
      const gy = terrainHeight(pivotX, pivotZ) + 0.35;
      this.camera.position.set(pivotX, Math.max(gy, pivotY), pivotZ);
      this.tmpVec2.set(lookX, lookY, lookZ);
      this.camera.lookAt(this.tmpVec2);
    } else if (mode === "first") {
      this.camera.position.set(this.player.position.x, eyeY, this.player.position.z);
      this.tmpVec2.set(this.player.position.x - dirX, eyeY - dirY, this.player.position.z - dirZ);
      this.camera.lookAt(this.tmpVec2);
    } else {
      let distance = dist;
      for (let d = dist; d > 1.0; d -= 0.4) {
        const cx = pivotX + dirX * d;
        const cz = pivotZ + dirZ * d;
        let blocked = false;
        for (const tree of this.nearbyTrees(cx, cz)) {
          const ddx = cx - tree.x;
          const ddz = cz - tree.z;
          const r = tree.r + 0.3;
          if (ddx * ddx + ddz * ddz < r * r) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          distance = d;
          break;
        }
        distance = d - 0.4;
      }
      const cx = pivotX + dirX * distance;
      const cz = pivotZ + dirZ * distance;
      const groundY = terrainHeight(cx, cz) + 0.4;
      this.camera.position.set(cx, Math.max(groundY, pivotY + dirY * distance), cz);
      this.tmpVec2.set(pivotX, pivotY, pivotZ);
      this.camera.lookAt(this.tmpVec2);
    }

    this.sun.target.position.copy(this.player.position);
    this.sun.target.updateMatrixWorld();
  }

  private updateDayNight(): void {
    const phase = (this.dayTime / this.dayLength) % 1;
    const elevation = sunElevation(phase);
    // Lumière du jour : montée douce dès l'horizon, plateau long
    const daylight = smoothstep(-0.05, 0.35, elevation);
    const twilight = clamp(1 - Math.abs(elevation) * 3.2, 0, 1); // aube / crépuscule
    const night = smoothstep(0.0, -0.25, elevation);

    const azimuth = phase * Math.PI * 2;
    this.sun.position.set(
      this.player.position.x + Math.cos(azimuth) * 40,
      Math.max(2, 4 + Math.max(0, elevation) * 50),
      this.player.position.z + Math.sin(azimuth) * 25 + 10
    );
    // La nuit, une faible lumière lunaire bleutée garde la forêt lisible
    this.sun.intensity = (0.22 + daylight * 1.15) * SCENE_CONFIG.light.sunIntensity;
    this.hemi.intensity = (0.28 + daylight * 0.58 + night * 0.1) * SCENE_CONFIG.light.hemiIntensity;

    // Palette pastel "Nikki" : brume lavande-menthe le jour, pêche au crépuscule, bleu nuit profond
    const dayColor = new THREE.Color(SCENE_CONFIG.fog.day);
    const duskColor = new THREE.Color(SCENE_CONFIG.fog.dusk);
    const nightColor = new THREE.Color(SCENE_CONFIG.fog.night);
    const color = nightColor.clone().lerp(dayColor, daylight).lerp(duskColor, twilight * 0.6);
    this.fog.color.copy(color);
    (this.scene.background as THREE.Color).copy(color);
    this.nightAmount = night;

    const warm = new THREE.Color(SCENE_CONFIG.light.sunDusk);
    const neutral = new THREE.Color(SCENE_CONFIG.light.sunColor);
    const moon = new THREE.Color(SCENE_CONFIG.light.moon);
    this.sun.color.copy(neutral).lerp(warm, twilight).lerp(moon, night);
    this.hemi.color.setHex(SCENE_CONFIG.light.hemiSky).lerp(moon, night * 0.6);

    if (this.skyUniforms) {
      const u = this.skyUniforms;
      const sky = SCENE_CONFIG.sky;
      u.top.value.setHex(sky.nightTop).lerp(new THREE.Color(sky.dayTop), daylight).lerp(new THREE.Color(sky.duskTop), twilight * 0.5);
      u.horizon.value.setHex(sky.nightHorizon).lerp(new THREE.Color(sky.dayHorizon), daylight).lerp(new THREE.Color(sky.duskHorizon), twilight * 0.8);
      u.bottom.value.copy(color);
      u.sunDir.value.copy(this.sun.position).sub(this.player.position).normalize();
      u.sunColor.value.copy(this.sun.color);
    }
    if (this.fireflies) {
      const mat = this.fireflies.material as THREE.PointsMaterial;
      mat.opacity = night * (this.outfit.ability === "glow" ? 1 : 0.8);
      this.fireflies.position.x = this.player.position.x;
      this.fireflies.position.z = this.player.position.z;
      this.fireflies.rotation.y += 0.0004;
    }

    if (this.dust) {
      (this.dust.material as THREE.PointsMaterial).opacity = 0.08 + daylight * 0.5;
    }
  }

  /** Heure solaire en jeu (0..24). */
  get gameHour(): number {
    return ((this.dayTime / this.dayLength) % 1) * 24;
  }

  setDayLength(seconds: number): void {
    const next = clamp(seconds, 300, 7200);
    // Conserve l'heure courante lors du changement de durée
    const phase = (this.dayTime / this.dayLength) % 1;
    this.dayLength = next;
    this.dayTime = phase * next;
    if (this.gameStarted) this.say(`Durée d'une journée : ${Math.round(next / 60)} minutes.`, 2);
  }

  getDayLength(): number {
    return this.dayLength;
  }

  private animateNature(elapsed: number, delta: number): void {
    for (const res of this.resources) {
      if (res.collected || res.kind !== "Fruits") continue;
      res.group.position.y = res.baseY + Math.sin(elapsed * 2 + res.id) * 0.03;
    }
    if (this.gameStarted) {
      const edge = distanceToWaterEdge(this.player.position.x, this.player.position.z);
      this.ambience.setWaterProximity(1 - clamp((edge + 1) / 14, 0, 1));
    }
    for (const u of [this.waterUniforms, this.streamUniforms]) {
      if (!u) continue;
      u.time.value = elapsed;
      u.sunDir.value.copy(this.sun.position).sub(this.player.position).normalize();
      u.sunColor.value.copy(this.sun.color).multiplyScalar(Math.min(1, this.sun.intensity));
      u.skyColor.value.copy(this.fog.color).multiplyScalar(1.15);
    }
    if (this.dust) {
      // La poussière dérive lentement et suit le joueur sans réécriture de buffer GPU
      this.dust.position.x = this.player.position.x;
      this.dust.position.y = Math.sin(elapsed * 0.5) * 0.08;
      this.dust.position.z = this.player.position.z;
      this.dust.rotation.y = elapsed * 0.01;
    }

    // Animation réaliste du feu de camp de la cabane (plus intense pendant le repos sur le lit)
    const restingBoost = this.sleepingTimer > 0 ? 1.55 : 1.0;
    if (this.shelterFireLight) {
      const flicker =
        1.0 +
        0.18 * Math.sin(elapsed * 13.7) +
        0.12 * Math.sin(elapsed * 23.1 + 1.4) +
        0.08 * Math.cos(elapsed * 37.0);
      this.shelterFireLight.intensity = 2.2 * restingBoost * flicker;
    }
    if (this.shelterFlames.length > 0) {
      for (let i = 0; i < this.shelterFlames.length; i++) {
        const flame = this.shelterFlames[i];
        const w1 = Math.sin(elapsed * (9.5 + i * 2.1) + i * 1.3);
        const w2 = Math.cos(elapsed * (12.2 + i * 1.7) + i * 0.7);
        const sy = (0.85 + 0.28 * w1) * restingBoost;
        const sxz = (0.9 + 0.14 * w2) * (this.sleepingTimer > 0 ? 1.2 : 1.0);
        flame.scale.set(sxz, sy, sxz);
        flame.rotation.z = w2 * 0.14;
        flame.rotation.x = w1 * 0.12;
      }
    }
    if (this.shelterSparks) {
      const attr = this.shelterSparks.geometry.attributes.position as THREE.BufferAttribute;
      const speed = (this.sleepingTimer > 0 ? 1.35 : 0.8) * delta;
      for (let i = 0; i < attr.count; i++) {
        let y = attr.getY(i) + speed * (0.7 + (i % 5) * 0.15);
        if (y > 1.65) {
          y = 0.12;
          attr.setX(i, (Math.sin(elapsed * 3 + i) * 0.5) * 0.3);
          attr.setZ(i, (Math.cos(elapsed * 2.7 + i) * 0.5) * 0.3);
        }
        attr.setY(i, y);
      }
      attr.needsUpdate = true;
    }
  }

  // =========================================================
  // MESSAGES ET SNAPSHOT
  // =========================================================

  private say(text: string, seconds = 2.8): void {
    this.transientMessage = text;
    this.transientUntil = performance.now() + seconds * 1000;
  }

  private contextualMessage(): string {
    if (this.dead) return "Tu as succombé dans la forêt.";
    if (performance.now() < this.transientUntil) return this.transientMessage;
    if (this.threatNearby && !this.hasSpear) {
      return this.isRangedEquipped
        ? "Danger : potamochère en approche ! Clic droit pour viser, clic gauche pour tirer."
        : "Danger : charge imminente ! Clic droit (ou Ctrl) pour parer, Espace pour sauter, clic gauche pour frapper.";
    }
    if (this.sleepingTimer > 0) {
      return "🛏️ Tu te reposes allongé sur le lit de la cabane, réchauffé par le feu de camp…";
    }
    if (this.swimming) {
      return "🏊 Tu traverses la rivière à la nage. Appuie sur E pour boire l'eau fraîche.";
    }
    if (this.isRangedEquipped) {
      const ammoKind = WEAPONS[this.currentWeapon].ammo;
      const ammo = ammoKind === "pistol" ? this.ammoPistol : ammoKind === "shotgun" ? this.ammoShotgun : this.ammoRifle;
      if (ammo <= 0) return "Plus de munitions. Cherche des boîtes de cartouches dans les camps.";
    }
    if (this.thirst < 20) return "Attention : tu as très soif ! Trouve la rivière à l'ouest.";
    if (this.hunger < 20) return "Attention : tu as faim ! Cherche des fruits rouges.";
    if (this.stamina < 20) return "Ralentis pour récupérer ton souffle.";
    const tame = this.nearTameableLabel();
    if (tame) return `${tame} à portée : appuie sur E pour l'apprivoiser (Murmure des Bêtes).`;
    const carcass = this.findCarcass();
    if (carcass) return `Carcasse de ${SPECIES[carcass.species].label.toLowerCase()} : appuie sur E pour dépecer.`;
    const near = this.findNearestResource();
    if (near) return `${resourceLabel(near.kind)} à portée : appuie sur E pour ramasser.`;
    if (this.isNearRiver()) return "Rivière proche : appuie sur E pour boire ou avance pour traverser à la nage.";
    if (this.isNearShelter()) return "Tu es à l'abri : B pour t'allonger sur le lit près du feu jusqu'à l'aube, G pour griller la viande.";
    if (!this.hasShelter && this.inventory.Bois >= 5) return "Tu as assez de bois : appuie sur B pour construire ton abri ici.";
    return "Survis dans la forêt équatoriale.";
  }

  // =========================================================
  // NIVEAUX D'ÉVOLUTION (Novice → Prix de Survie)
  // =========================================================

  private addXp(amount: number): void {
    if (this.dead || amount <= 0) return;
    this.xp += amount;
    this.xpTotalGained += amount;
    const before = levelFromXp(this.xp - amount);
    const after = levelFromXp(this.xp);
    if (after > before) {
      const def = levelInfo(after);
      this.say(`⬆️ Niveau ${after} atteint : ${def.name} !`, 4);
      if (after === MAX_LEVEL && !this.reachedFinalLevel) {
        this.reachedFinalLevel = true;
        this.say(`🏆 PRIX DE SURVIE OBTENU ! ${FINAL_LEVEL_NAME} — tu as survécu à la forêt !`, 8);
      }
    }
  }

  /** XP passive : +XP par heure de jeu de survie. */
  private addSurvivalXp(): void {
    const hour = Math.floor(this.gameHour);
    if (hour !== this.lastSurvivalXpHour) {
      this.lastSurvivalXpHour = hour;
      this.addXp(XP.perHour);
    }
  }

  private getXPProgress() {
    return xpProgress(this.xp);
  }

  getLevelInfo() {
    return { level: levelInfo(this.xp), progress: this.getXPProgress() };
  }

  private emitSnapshot(): void {
    const near = this.dead ? null : this.findNearestResource();
    this.callbacks.onSnapshot({
      character: this.character,
      health: this.health,
      hunger: this.hunger,
      thirst: this.thirst,
      stamina: this.stamina,
      inventory: { ...this.inventory },
      hasSpear: this.hasSpear,
      hasShelter: this.hasShelter,
      inventoryOpen: this.inventoryOpen,
      timeSurvived: this.timeSurvived,
      dayPhase: (this.dayTime / this.dayLength) % 1,
      gameHour: this.gameHour,
      dayLength: this.dayLength,
      message: this.contextualMessage(),
      nearResource: near ? near.kind : null,
      nearRiver: this.isNearRiver(),
      nearShelter: this.isNearShelter(),
      threatNearby: this.threatNearby,
      resourcesCollected: this.resourcesCollected,
      dead: this.dead,
      weapons: [...this.weapons],
      currentWeapon: this.currentWeapon,
      ammoPistol: this.ammoPistol,
      ammoRifle: this.ammoRifle,
      ammoShotgun: this.ammoShotgun,
      swimming: this.swimming,
      sleeping: this.sleepingTimer > 0,
      aiming: this.aimBlend > 0.5,
      kills: this.kills,
      hitMarker: performance.now() < this.hitMarkerUntil,
      nearCarcass: this.dead ? false : this.findCarcass() !== null,
      target: this.dead ? null : this.findTargetAnimal(),
      huntingEnabled: this.huntingEnabled,
      shelterDistance: this.hasShelter ? this.shelterDistance() : null,
      shelterHeading: this.hasShelter ? this.shelterHeading() : "",
      canBuild: !this.hasShelter && this.inventory.Bois >= 5 && !this.isInRiver() && !this.threatNearby,
      hasGps: this.hasGps,
      gpsOn: this.gpsOn,
      gps: this.hasGps && this.gpsOn ? this.buildGpsData() : null,
      compass: this.buildCompassData(),
      hasNightVision: this.hasNightVision,
      nightVisionOn: this.nightVisionOn,
      level: levelInfo(levelFromXp(this.xp)),
      levelProgress: xpProgress(this.xp),
      xpTotal: this.xpTotalGained,
      nvBattery: this.nvBattery,
      jumping: this.jumping,
      dodges: this.dodges,
      blocking: this.blocking,
      parrying: this.clock.elapsedTime < this.parryLockUntil,
      cameraMode: this.cameraMode,
      perf: this.getPerfInfo(),
      whimsy: {
        outfits: [...this.outfits],
        currentOutfit: this.currentOutfit,
        stylePieces: { ...this.stylePieces },
        whimstars: this.whimstarsCollected(),
        whimstarsTotal: this.whimstarsTotal,
        nsisim: this.nsisimMet(),
        nsisimTotal: this.nsisimTotal,
        styleScore: this.styleScore * (this.outfit.ability === "charm" ? 2 : 1),
        gliding: this.gliding,
        companions: this.companions.size,
        photoMode: this.photoMode,
        nearTameable: this.dead ? null : this.nearTameableLabel(),
      },
    });
  }
}
