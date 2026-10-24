// © ONOKO-CRÉATIONS — Tous droits réservés.
import * as THREE from "three";

// =========================================================
// DIRECTION ARTISTIQUE "NIKKI" : rendu doux, lumineux, pastel
//  - gradient map pour le cel-shading (MeshToonMaterial)
//  - ciel pastel en dome
//  - collectibles : Étoiles de Rêve (Whimstars), pièces de style,
//    Nsisim (esprits lumineux de la forêt) et lucioles
// =========================================================

let toonGradient: THREE.DataTexture | null = null;

/** 4 paliers d'ombrage doux : signature du cel-shading. */
export function getToonGradient(): THREE.DataTexture {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([110, 110, 110, 255, 170, 170, 170, 255, 225, 225, 225, 255, 255, 255, 255, 255]);
  toonGradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

/** Convertit un MeshStandardMaterial en MeshToonMaterial en gardant texture/couleur/alpha. */
export function toToon(mat: THREE.MeshStandardMaterial, saturate = 1.1): THREE.MeshToonMaterial {
  const color = mat.color.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(1, hsl.s * saturate), Math.min(1, hsl.l * 1.08 + 0.02));
  const toon = new THREE.MeshToonMaterial({
    color,
    map: mat.map,
    gradientMap: getToonGradient(),
    transparent: mat.transparent,
    opacity: mat.opacity,
    alphaTest: mat.alphaTest,
    side: mat.side,
    vertexColors: mat.vertexColors,
    emissive: mat.emissive,
    emissiveIntensity: mat.emissiveIntensity,
  });
  return toon;
}

/** Dôme de ciel pastel : dégradé zénith → horizon, teintes aurore/pêche/lavande. */
export function createSkyDome(radius: number): { mesh: THREE.Mesh; uniforms: { top: { value: THREE.Color }; horizon: { value: THREE.Color }; bottom: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color } } } {
  const uniforms = {
    top: { value: new THREE.Color(0x7fb6ff) },
    horizon: { value: new THREE.Color(0xffd9c2) },
    bottom: { value: new THREE.Color(0xbfe3c0) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff2c0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // toujours au fond
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.6));
        float sun = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(sun, 180.0) * 1.2 + pow(sun, 8.0) * 0.18);
        // Voile de nuages doux
        float c = sin(vDir.x * 7.0 + vDir.z * 5.0) * sin(vDir.z * 9.0 - vDir.x * 3.0);
        col += vec3(0.05) * smoothstep(0.55, 0.9, c) * smoothstep(0.05, 0.5, h);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

// ---------------------------------------------------------
// Collectibles
// ---------------------------------------------------------

export type CollectibleKind = "whimstar" | "fleurs" | "plumes" | "perles" | "fil" | "nsisim";

export interface Collectible {
  id: number;
  kind: CollectibleKind;
  group: THREE.Group;
  baseY: number;
  taken: boolean;
  /** pour les Nsisim : vitesse d'errance */
  wander?: THREE.Vector3;
}

const starShape = (() => {
  const shape = new THREE.Shape();
  const outer = 0.22;
  const inner = 0.1;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
})();

let starGeo: THREE.ExtrudeGeometry | null = null;
function getStarGeo(): THREE.ExtrudeGeometry {
  if (!starGeo) {
    starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    starGeo.userData.shared = true;
  }
  return starGeo;
}

const sharedGeo = {
  ring: new THREE.TorusGeometry(0.36, 0.015, 6, 20),
  petal: new THREE.CircleGeometry(0.11, 8),
  heart: new THREE.SphereGeometry(0.05, 6, 5),
  stem: new THREE.CylinderGeometry(0.012, 0.015, 0.32, 5),
  feather: new THREE.PlaneGeometry(0.12, 0.45),
  featherTip: new THREE.PlaneGeometry(0.12, 0.15),
  shell: new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  pearl: new THREE.SphereGeometry(0.07, 8, 6),
  spool: new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8),
  cap: new THREE.CylinderGeometry(0.13, 0.13, 0.02, 8),
  nsisimBody: new THREE.SphereGeometry(0.16, 10, 8),
  nsisimEar: new THREE.ConeGeometry(0.05, 0.14, 5),
  nsisimEye: new THREE.SphereGeometry(0.025, 5, 5),
};
for (const g of Object.values(sharedGeo)) g.userData.shared = true;

const sharedMat = {
  star: new THREE.MeshToonMaterial({ color: 0xfff0a0, emissive: 0xffd24a, emissiveIntensity: 0.95 }),
  ring: new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.72 }),
  petal: new THREE.MeshToonMaterial({ color: 0xff5e8a, emissive: 0xff2e6a, emissiveIntensity: 0.18, side: THREE.DoubleSide }),
  heart: new THREE.MeshToonMaterial({ color: 0xffd400 }),
  stem: new THREE.MeshToonMaterial({ color: 0x2f8f4e }),
  feather: new THREE.MeshToonMaterial({ color: 0x33c2d6, emissive: 0x1a7f9a, emissiveIntensity: 0.22, side: THREE.DoubleSide }),
  featherTip: new THREE.MeshToonMaterial({ color: 0xe03a3a, side: THREE.DoubleSide }),
  shell: new THREE.MeshToonMaterial({ color: 0xd8c7b0, side: THREE.DoubleSide }),
  pearl: new THREE.MeshToonMaterial({ color: 0xfff4ff, emissive: 0xd9b6ff, emissiveIntensity: 0.55 }),
  spool: new THREE.MeshToonMaterial({ color: 0xff9ad5, emissive: 0xff5bbf, emissiveIntensity: 0.48 }),
  cap: new THREE.MeshToonMaterial({ color: 0xffffff }),
  nsisimBody: new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0xa9ecff, emissiveIntensity: 0.85 }),
  nsisimEar: new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0xa9ecff, emissiveIntensity: 0.65 }),
  nsisimEye: new THREE.MeshBasicMaterial({ color: 0x223355 }),
};

export function createCollectibleMesh(kind: CollectibleKind): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case "whimstar": {
      const star = new THREE.Mesh(getStarGeo(), sharedMat.star);
      star.position.y = 0.5;
      g.add(star);
      const ring = new THREE.Mesh(sharedGeo.ring, sharedMat.ring);
      ring.position.y = 0.5;
      g.add(ring);
      break;
    }
    case "fleurs": {
      for (let i = 0; i < 5; i++) {
        const petal = new THREE.Mesh(sharedGeo.petal, sharedMat.petal);
        const a = (i / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.1, 0.32, Math.sin(a) * 0.1);
        petal.rotation.set(-Math.PI / 2 + 0.5, 0, -a);
        g.add(petal);
      }
      const heart = new THREE.Mesh(sharedGeo.heart, sharedMat.heart);
      heart.position.y = 0.34;
      g.add(heart);
      const stem = new THREE.Mesh(sharedGeo.stem, sharedMat.stem);
      stem.position.y = 0.16;
      g.add(stem);
      break;
    }
    case "plumes": {
      const feather = new THREE.Mesh(sharedGeo.feather, sharedMat.feather);
      feather.position.y = 0.4;
      feather.rotation.set(0.4, 0.6, 0.3);
      g.add(feather);
      const tip = new THREE.Mesh(sharedGeo.featherTip, sharedMat.featherTip);
      tip.position.set(0, 0.58, 0.001);
      tip.rotation.copy(feather.rotation);
      g.add(tip);
      break;
    }
    case "perles": {
      const shell = new THREE.Mesh(sharedGeo.shell, sharedMat.shell);
      shell.rotation.x = Math.PI;
      shell.position.y = 0.16;
      g.add(shell);
      const pearl = new THREE.Mesh(sharedGeo.pearl, sharedMat.pearl);
      pearl.position.y = 0.12;
      g.add(pearl);
      break;
    }
    case "fil": {
      const spool = new THREE.Mesh(sharedGeo.spool, sharedMat.spool);
      spool.position.y = 0.3;
      spool.rotation.z = 0.4;
      g.add(spool);
      for (const dy of [-0.1, 0.1]) {
        const cap = new THREE.Mesh(sharedGeo.cap, sharedMat.cap);
        cap.position.set(0, 0.3 + dy, 0);
        cap.rotation.z = 0.4;
        g.add(cap);
      }
      break;
    }
    case "nsisim": {
      const body = new THREE.Mesh(sharedGeo.nsisimBody, sharedMat.nsisimBody);
      body.position.y = 1.2;
      g.add(body);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(sharedGeo.nsisimEar, sharedMat.nsisimEar);
        ear.position.set(side * 0.09, 1.36, 0);
        ear.rotation.z = -side * 0.4;
        g.add(ear);
        const eye = new THREE.Mesh(sharedGeo.nsisimEye, sharedMat.nsisimEye);
        eye.position.set(side * 0.06, 1.22, -0.13);
        g.add(eye);
      }
      break;
    }
  }
  return g;
}

/** Lucioles : points lumineux qui dérivent doucement autour du joueur la nuit. */
export function createFireflies(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = 0.4 + Math.random() * 3;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xc8ff7a, size: 0.09, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
