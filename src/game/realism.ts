// © ONOKO-CRÉATIONS — Tous droits réservés.
import * as THREE from "three";

/**
 * Réalisme avancé optimisé : cartes de normales / rugosité légères (256×256)
 * et éclairage d'appoint du personnage sans passe de post-traitement coûteuse.
 */

/** Normal map tangent-space à partir de la luminance de l'albedo (filtre Sobel léger 256×256). */
export function normalFromAlbedo(src: THREE.Texture, strength = 1.5, size = 256): THREE.Texture {
  const img = src.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined;
  if (!img) return src;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(img as CanvasImageSource, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size);
  const px = data.data;
  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
  }
  const out = ctx.createImageData(size, size);
  const o = out.data;
  const at = (x: number, y: number) => lum[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      o[i] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      o[i + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      o[i + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.repeat.copy(src.repeat);
  tex.anisotropy = src.anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** Carte de rugosité : les zones sombres (humus, fissures) sont plus rugueuses (256×256). */
export function roughnessFromAlbedo(src: THREE.Texture, minR = 0.45, maxR = 0.95, size = 256): THREE.Texture {
  const img = src.image as CanvasImageSource | undefined;
  if (!img) return src;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    const r = Math.round((maxR - l * (maxR - minR)) * 255);
    px[i] = px[i + 1] = px[i + 2] = r;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.repeat.copy(src.repeat);
  tex.anisotropy = src.anisotropy;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function applyPbrMaps(mat: THREE.MeshStandardMaterial, albedo: THREE.Texture | null, _bump = 1.4): void {
  if (!albedo) return;
  mat.map = albedo;
  mat.roughness = 0.88;
  mat.metalness = 0;
  mat.needsUpdate = true;
}

/** Éclairage d'appoint ultra-léger sur le personnage (1 seule PointLight sans ombre). */
export class CharacterLightKit {
  readonly fill: THREE.PointLight;
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.fill = new THREE.PointLight(0xfff5e6, 0.45, 7, 1.8);
    this.fill.castShadow = false;
    scene.add(this.fill);
  }

  update(player: THREE.Vector3, camera: THREE.Camera, sunColor: THREE.Color, daylight: number): void {
    this.tmp.subVectors(camera.position, player).setY(0);
    if (this.tmp.lengthSq() < 0.001) this.tmp.set(0, 0, 1);
    this.tmp.normalize();
    this.fill.color.copy(sunColor);
    this.fill.intensity = 0.22 + daylight * 0.35;
    this.fill.position.set(
      player.x + this.tmp.x * 1.5,
      player.y + 1.65,
      player.z + this.tmp.z * 1.5
    );
  }

  setEnabled(on: boolean): void {
    this.fill.visible = on;
  }
}

export interface RealismComposer {
  setSize: (w: number, h: number) => void;
  render: () => void;
  dispose: () => void;
}

export function createRealismComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, _mobile?: boolean): RealismComposer {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  const uniforms = {
    tDiffuse: { value: target.texture },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      uniform float time;
      varying vec2 vUv;

      float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 24.0) * 43758.5453);
      }

      void main() {
        vec3 color = texture2D(tDiffuse, vUv).rgb;
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luminance), color, 1.06);
        color = (color - 0.5) * 1.035 + 0.5;
        float shadows = 1.0 - smoothstep(0.04, 0.58, luminance);
        float highlights = smoothstep(0.42, 0.96, luminance);
        color *= mix(vec3(0.985, 1.015, 1.0), vec3(1.018, 1.006, 0.982), highlights);
        color *= mix(vec3(1.0), vec3(0.965, 1.012, 0.99), shadows * 0.55);

        vec2 centered = (vUv - 0.5) * vec2(resolution.x / max(resolution.y, 1.0), 1.0);
        float vignette = 1.0 - smoothstep(0.34, 0.92, length(centered)) * 0.18;
        float grain = (noise(floor(vUv * resolution)) - 0.5) * 0.012;
        color = color * vignette + grain;
        gl_FragColor = vec4(max(color, 0.0), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const postScene = new THREE.Scene();
  const postCamera = new THREE.Camera();
  postScene.add(quad);

  return {
    setSize: (w, h) => {
      const width = Math.max(1, Math.floor(w));
      const height = Math.max(1, Math.floor(h));
      target.setSize(width, height);
      uniforms.resolution.value.set(width, height);
    },
    render: () => {
      uniforms.time.value = performance.now() * 0.001;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    },
    dispose: () => {
      target.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
