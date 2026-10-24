// © ONOKO-CRÉATIONS — Tous droits réservés. Minkébé, jeu de survie.
import * as THREE from "three";

// =========================================================
// GADGETS : GPS et lunettes infrarouges
//  - modeles 3D a ramasser
//  - passe de post-traitement "vision thermique / nocturne"
// =========================================================

const matBlack = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.2 });
const matRubber = new THREE.MeshStandardMaterial({ color: 0x2a2d2f, roughness: 0.95 });
const matYellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.5 });
const matScreen = new THREE.MeshStandardMaterial({ color: 0x1b3b2a, emissive: 0x2fd37a, emissiveIntensity: 0.9, roughness: 0.3 });
const matLens = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0x2a8a3a, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.15 });
const matStrap = new THREE.MeshStandardMaterial({ color: 0x3a3a2c, roughness: 0.9 });

export function createGpsModel(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.17), matYellow);
  body.position.y = 0.015;
  body.castShadow = true;
  g.add(body);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.032, 0.1), matBlack);
  bezel.position.set(0, 0.016, -0.02);
  g.add(bezel);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.034, 0.085), matScreen);
  screen.position.set(0, 0.016, -0.02);
  g.add(screen);
  for (let i = 0; i < 3; i++) {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 8), matRubber);
    btn.position.set(-0.03 + i * 0.03, 0.034, 0.055);
    g.add(btn);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.07, 8), matRubber);
  antenna.position.set(0.04, 0.03, -0.1);
  antenna.rotation.x = 0.5;
  g.add(antenna);
  return g;
}

export function createNightVisionModel(): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.05), matBlack);
  frame.position.y = 0.05;
  frame.castShadow = true;
  g.add(frame);
  for (const side of [-1, 1]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.11, 16), matBlack);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(side * 0.055, 0.05, -0.06);
    tube.castShadow = true;
    g.add(tube);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16), matLens);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(side * 0.055, 0.05, -0.117);
    g.add(lens);
  }
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 20, Math.PI), matStrap);
  strap.rotation.x = Math.PI / 2;
  strap.rotation.z = Math.PI;
  strap.position.set(0, 0.05, 0.02);
  g.add(strap);
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), matRubber);
  battery.position.set(0, 0.09, 0.0);
  g.add(battery);
  return g;
}

// ---------------------------------------------------------
// Passe de vision thermique / nocturne
// ---------------------------------------------------------

const thermalFragment = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tHeat;
uniform float time;
uniform float strength;
uniform float battery;
uniform vec2 resolution;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 palette(float t) {
  // Noir -> bleu nuit -> violet -> rouge -> orange -> jaune -> blanc
  vec3 c1 = vec3(0.0, 0.0, 0.05);
  vec3 c2 = vec3(0.07, 0.03, 0.35);
  vec3 c3 = vec3(0.55, 0.05, 0.45);
  vec3 c4 = vec3(0.95, 0.25, 0.05);
  vec3 c5 = vec3(1.0, 0.8, 0.1);
  vec3 c6 = vec3(1.0, 1.0, 0.95);
  if (t < 0.2) return mix(c1, c2, t / 0.2);
  if (t < 0.4) return mix(c2, c3, (t - 0.2) / 0.2);
  if (t < 0.6) return mix(c3, c4, (t - 0.4) / 0.2);
  if (t < 0.8) return mix(c4, c5, (t - 0.6) / 0.2);
  return mix(c5, c6, (t - 0.8) / 0.2);
}

void main() {
  vec4 scene = texture2D(tDiffuse, vUv);
  float lum = dot(scene.rgb, vec3(0.299, 0.587, 0.114));
  // Amplification de la scene (vision nocturne) : la foret froide reste sombre
  float ambient = pow(clamp(lum * 2.4, 0.0, 1.0), 0.75) * 0.42;
  // Sources de chaleur rendues dans tHeat (rouge = intensite)
  float heat = texture2D(tHeat, vUv).r;
  // Leger flou de la chaleur pour le halo
  vec2 px = 1.0 / resolution;
  float halo = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      halo += texture2D(tHeat, vUv + vec2(float(i), float(j)) * px * 3.0).r;
    }
  }
  halo /= 25.0;
  float t = clamp(ambient + heat * 0.95 + halo * 0.35, 0.0, 1.0);

  vec3 col = palette(t);
  // Grain et lignes de balayage
  float grain = (hash(vUv * resolution + fract(time * 60.0)) - 0.5) * 0.08;
  float scan = sin(vUv.y * resolution.y * 1.6 + time * 8.0) * 0.025;
  col += grain + scan;
  // Vignette circulaire des oculaires
  vec2 c = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
  float r = length(c);
  float vignette = 1.0 - smoothstep(0.62, 0.95, r);
  col *= vignette;
  // Batterie faible : clignotement et perte de contraste
  float flicker = battery < 0.15 ? (0.7 + 0.3 * step(0.5, fract(time * 6.0))) : 1.0;
  col *= flicker;

  // La cible de rendu est lineaire : on l'encode en sRGB pour le fondu
  vec3 sceneDisplay = pow(clamp(scene.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(mix(sceneDisplay, col, strength), 1.0);
}
`;

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export class ThermalPass {
  private sceneTarget: THREE.WebGLRenderTarget;
  private heatTarget: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private heatMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private coldMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private heatLayer = 7;

  constructor(width: number, height: number) {
    this.sceneTarget = new THREE.WebGLRenderTarget(width, height, { samples: 0 });
    this.heatTarget = new THREE.WebGLRenderTarget(Math.floor(width / 2), Math.floor(height / 2));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.sceneTarget.texture },
        tHeat: { value: this.heatTarget.texture },
        time: { value: 0 },
        strength: { value: 1 },
        battery: { value: 1 },
        resolution: { value: new THREE.Vector2(width, height) },
      },
      vertexShader: quadVertex,
      fragmentShader: thermalFragment,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  get layer(): number {
    return this.heatLayer;
  }

  setSize(width: number, height: number): void {
    this.sceneTarget.setSize(width, height);
    this.heatTarget.setSize(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)));
    (this.material.uniforms.resolution.value as THREE.Vector2).set(width, height);
  }

  /**
   * Rend la scene normalement puis une passe "chaleur" (objets du calque heat en blanc,
   * tout le reste en noir pour l'occlusion), puis compose.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, time: number, strength: number, battery: number): void {
    // 1. Scene normale
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);

    // 2. Passe chaleur : override material noir, sources chaudes blanches
    const prevOverride = scene.overrideMaterial;
    const prevFog = scene.fog;
    const prevBg = scene.background;
    scene.fog = null;
    scene.background = new THREE.Color(0x000000);
    scene.overrideMaterial = this.coldMaterial;
    const heatObjects: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o.layers.isEnabled(this.heatLayer) && (o as THREE.Mesh).isMesh) heatObjects.push(o as THREE.Mesh);
    });
    // overrideMaterial s'applique a tout ; on rend donc les sources chaudes dans un second temps
    renderer.setRenderTarget(this.heatTarget);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    const savedMats = heatObjects.map((m) => m.material);
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const anyObj = o as THREE.Mesh & { isPoints?: boolean; isSprite?: boolean; isLine?: boolean };
      if ((anyObj.isMesh || anyObj.isPoints || anyObj.isSprite || anyObj.isLine) && !o.layers.isEnabled(this.heatLayer) && o.visible) {
        hidden.push(o);
      }
    });
    // Rendu des sources chaudes par-dessus avec test de profondeur conserve
    renderer.autoClear = false;
    for (const m of heatObjects) m.material = this.heatMaterial;
    for (const o of hidden) o.visible = false;
    renderer.render(scene, camera);
    for (const o of hidden) o.visible = true;
    heatObjects.forEach((m, i) => (m.material = savedMats[i]));
    renderer.autoClear = true;

    scene.overrideMaterial = prevOverride;
    scene.fog = prevFog;
    scene.background = prevBg;

    // 3. Composition plein ecran
    this.material.uniforms.time.value = time;
    this.material.uniforms.strength.value = strength;
    this.material.uniforms.battery.value = battery;
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.sceneTarget.dispose();
    this.heatTarget.dispose();
    this.material.dispose();
  }
}
