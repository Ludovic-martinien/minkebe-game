// © ONOKO-CRÉATIONS — Tous droits réservés. Minkébé, jeu de survie.
import * as THREE from "three";

// =========================================================
// COURS D'EAU - riviere sinueuse + affluent, geometrie en ruban
// et shader d'eau (ecoulement, fresnel, profondeur, ecume)
// =========================================================

export const WATER_LEVEL = -0.6;
export const RIVER_BASE_X = -14.0;
const RIVER_DEPTH = 1.6;
const STREAM_DEPTH = 1.0;
const STREAM_BASE_Z = 26.0;

/** Centre de la riviere (axe X) pour une coordonnee Z donnee. */
export function riverCenterX(z: number): number {
  return RIVER_BASE_X + 7.0 * Math.sin(z * 0.042) + 2.6 * Math.sin(z * 0.11 + 1.3);
}

/** Demi-largeur de la riviere (varie le long du cours). */
export function riverHalfWidth(z: number): number {
  return 3.1 + 1.1 * Math.sin(z * 0.07 + 0.6);
}

/** Centre de l'affluent (axe Z) pour une coordonnee X donnee ; il vient de l'est. */
export function streamCenterZ(x: number): number {
  return STREAM_BASE_Z + 4.5 * Math.sin(x * 0.075 + 0.8);
}

export function streamHalfWidth(x: number): number {
  return 1.15 + 0.25 * Math.sin(x * 0.17);
}

export interface WaterInfo {
  /** distance horizontale au centre du cours d'eau le plus proche */
  d: number;
  /** demi-largeur locale */
  half: number;
  /** profondeur de creusement du lit */
  depth: number;
  kind: "river" | "stream";
}

export function waterInfo(x: number, z: number): WaterInfo {
  const rd = Math.abs(x - riverCenterX(z));
  const rh = riverHalfWidth(z);
  // Court-circuit rapide : l'affluent n'existe qu'autour de z ∈ [15, 37] et x > -24
  if (x > -24 && z > 15 && z < 37) {
    const zc = streamCenterZ(x);
    if (x > riverCenterX(zc) - 1.0) {
      const sd = Math.abs(z - zc);
      const sh = streamHalfWidth(x);
      if (sd / sh < rd / rh) {
        return { d: sd, half: sh, depth: STREAM_DEPTH, kind: "stream" };
      }
    }
  }
  return { d: rd, half: rh, depth: RIVER_DEPTH, kind: "river" };
}

export function distanceToWaterEdge(x: number, z: number): number {
  const w = waterInfo(x, z);
  return w.d - w.half;
}

export function isInWater(x: number, z: number): boolean {
  return distanceToWaterEdge(x, z) < 0;
}

export function isNearWater(x: number, z: number, margin = 1.8): boolean {
  return distanceToWaterEdge(x, z) < margin;
}

/** Profondeur d'eau au point (positive dans l'eau). */
export function waterDepthAt(terrainY: number): number {
  return WATER_LEVEL - terrainY;
}

// ---------------------------------------------------------
// Geometrie en ruban le long d'une courbe
// ---------------------------------------------------------

interface RibbonSample {
  cx: number;
  cz: number;
  half: number;
  /** direction tangente (ecoulement) */
  tx: number;
  tz: number;
}

function buildRibbon(samples: RibbonSample[], across: number, margin: number, terrainHeight: (x: number, z: number) => number): THREE.BufferGeometry {
  const rows = samples.length;
  const positions = new Float32Array(rows * across * 3);
  const uvs = new Float32Array(rows * across * 2);
  const depths = new Float32Array(rows * across);
  const flows = new Float32Array(rows * across * 2);
  const indices: number[] = [];
  let dist = 0;

  for (let i = 0; i < rows; i++) {
    const s = samples[i];
    if (i > 0) dist += Math.hypot(s.cx - samples[i - 1].cx, s.cz - samples[i - 1].cz);
    // normale horizontale a la tangente
    const nx = -s.tz;
    const nz = s.tx;
    const w = s.half + margin;
    for (let j = 0; j < across; j++) {
      const t = (j / (across - 1)) * 2 - 1;
      const x = s.cx + nx * t * w;
      const z = s.cz + nz * t * w;
      const idx = i * across + j;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = WATER_LEVEL;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = t;
      uvs[idx * 2 + 1] = dist;
      depths[idx] = WATER_LEVEL - terrainHeight(x, z);
      flows[idx * 2] = s.tx;
      flows[idx * 2 + 1] = s.tz;
      if (i < rows - 1 && j < across - 1) {
        const a = idx;
        const b = idx + 1;
        const c = idx + across;
        const d = idx + across + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("depth", new THREE.BufferAttribute(depths, 1));
  geo.setAttribute("flow", new THREE.BufferAttribute(flows, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export function buildRiverGeometry(length: number, terrainHeight: (x: number, z: number) => number): THREE.BufferGeometry {
  const samples: RibbonSample[] = [];
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    // La riviere coule vers le sud (+Z -> -Z) : tangente orientee vers -Z
    const z = length / 2 - (i / steps) * length;
    const cx = riverCenterX(z);
    const dz = -0.5;
    const cx2 = riverCenterX(z + dz);
    const tx = cx2 - cx;
    const tz = dz;
    const len = Math.hypot(tx, tz) || 1;
    samples.push({ cx, cz: z, half: riverHalfWidth(z), tx: tx / len, tz: tz / len });
  }
  return buildRibbon(samples, 6, 1.4, terrainHeight);
}

export function buildStreamGeometry(xMax: number, terrainHeight: (x: number, z: number) => number): THREE.BufferGeometry {
  const samples: RibbonSample[] = [];
  const steps = 75;
  // L'affluent coule d'est en ouest (vers la riviere)
  const zJoin = streamCenterZ(riverCenterX(STREAM_BASE_Z));
  const xMin = riverCenterX(zJoin) + riverHalfWidth(zJoin) * 0.2;
  for (let i = 0; i <= steps; i++) {
    const x = xMax - (i / steps) * (xMax - xMin);
    const cz = streamCenterZ(x);
    const dx = -0.5;
    const cz2 = streamCenterZ(x + dx);
    const tx = dx;
    const tz = cz2 - cz;
    const len = Math.hypot(tx, tz) || 1;
    samples.push({ cx: x, cz, half: streamHalfWidth(x), tx: tx / len, tz: tz / len });
  }
  return buildRibbon(samples, 4, 0.9, terrainHeight);
}

// ---------------------------------------------------------
// Shader d'eau
// ---------------------------------------------------------

const vertexShader = /* glsl */ `
attribute float depth;
attribute vec2 flow;
uniform float time;
varying float vDepth;
varying vec2 vFlow;
varying vec3 vWorldPos;
#include <fog_pars_vertex>
void main() {
  vDepth = depth;
  vFlow = flow;
  vec3 p = position;
  p.y += (sin(p.x * 2.7 + time * 1.6) + sin(p.z * 2.1 - time * 1.9)) * 0.012 * clamp(depth, 0.0, 1.0);
  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  vWorldPos = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D normalMap;
uniform float time;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 shallowColor;
uniform vec3 deepColor;
uniform vec3 skyColor;
uniform float flowSpeed;
varying float vDepth;
varying vec2 vFlow;
varying vec3 vWorldPos;
#include <fog_pars_fragment>

void main() {
  if (vDepth < -0.08) discard;
  vec2 scroll = vFlow * time * flowSpeed;
  vec2 uv1 = vWorldPos.xz * 0.42 - scroll;
  vec2 uv2 = vWorldPos.xz * 0.19 + vec2(0.37, 0.11) - scroll * 0.55 + vec2(time * 0.015, 0.0);
  vec2 uv3 = vWorldPos.xz * 0.9 - scroll * 1.6;
  vec3 n1 = texture2D(normalMap, uv1).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(normalMap, uv2).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(normalMap, uv3).xyz * 2.0 - 1.0;
  float shallowness = 1.0 - smoothstep(0.0, 0.9, vDepth);
  vec2 nxy = n1.xy * 0.6 + n2.xy * 0.5 + n3.xy * (0.25 + 0.45 * shallowness);
  vec3 N = normalize(vec3(nxy.x * 0.42, 1.0, nxy.y * 0.42));

  vec3 V = normalize(cameraPosition - vWorldPos);
  float NdV = max(dot(N, V), 0.0);
  float fresnel = mix(0.03, 1.0, pow(1.0 - NdV, 3.5));

  float d = clamp(vDepth, 0.0, 2.0);
  vec3 base = mix(shallowColor, deepColor, smoothstep(0.0, 1.1, d));
  // Lumiere diffuse du soleil sur l'eau
  float diff = max(dot(N, sunDir), 0.0);
  base *= 0.55 + 0.55 * diff;
  vec3 col = mix(base, skyColor, fresnel * 0.7);

  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 220.0) * 1.6 + pow(max(dot(N, H), 0.0), 40.0) * 0.15;
  col += sunColor * spec;

  // Ecume : berges peu profondes et crete des vaguelettes
  float foamBank = (1.0 - smoothstep(-0.02, 0.26, vDepth)) * (0.55 + 0.45 * sin(n1.x * 6.0 + time * 2.2 + vWorldPos.z * 3.0));
  float foamWave = smoothstep(0.55, 0.95, length(nxy)) * 0.35 * shallowness;
  float foam = clamp(foamBank + foamWave, 0.0, 1.0);
  col = mix(col, vec3(0.86, 0.9, 0.86), foam * 0.75);

  float alpha = mix(0.22, 0.93, smoothstep(0.0, 0.55, vDepth)) + foam * 0.45;
  alpha *= smoothstep(-0.08, 0.02, vDepth);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
  #include <fog_fragment>
}
`;

export interface WaterMaterialUniforms {
  time: { value: number };
  normalMap: { value: THREE.Texture | null };
  sunDir: { value: THREE.Vector3 };
  sunColor: { value: THREE.Color };
  shallowColor: { value: THREE.Color };
  deepColor: { value: THREE.Color };
  skyColor: { value: THREE.Color };
  flowSpeed: { value: number };
  [uniform: string]: THREE.IUniform;
}

export function createWaterMaterial(normalMap: THREE.Texture | null, flowSpeed: number): THREE.ShaderMaterial & { uniforms: WaterMaterialUniforms } {
  if (normalMap) {
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(1, 1);
    normalMap.offset.set(0, 0);
  }
  const uniforms: WaterMaterialUniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    time: { value: 0 },
    normalMap: { value: normalMap },
    sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
    sunColor: { value: new THREE.Color(0xfff0c2) },
    // Eau "thé" des rivières forestières du Gabon : brun-vert, sombre en profondeur
    shallowColor: { value: new THREE.Color(0x4a6a52) },
    deepColor: { value: new THREE.Color(0x142820) },
    skyColor: { value: new THREE.Color(0x7d9470) },
    flowSpeed: { value: flowSpeed },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  return mat as THREE.ShaderMaterial & { uniforms: WaterMaterialUniforms };
}
