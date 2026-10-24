// © ONOKO-CRÉATIONS — Tous droits réservés. Minkébé, jeu de survie.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

// =========================================================
// PERSONNAGES glTF rigges Mixamo
//  - LANDRY  : Landry.glb, animations Idle / Walk / Run
//  - ANNIQUE : Annique.glb, animations retargetees depuis Landry
// Repere canonique de la main droite (T-pose, personnage face a -Z) :
//  +X = direction des doigts, -Y = paume, -Z = pouce (avant)
// =========================================================

export type CharacterId = "ANNIQUE" | "LANDRY";

export interface CharacterAsset {
  scene: THREE.Group;
  clips: { idle: THREE.AnimationClip; walk: THREE.AnimationClip; run: THREE.AnimationClip };
  height: number;
  facingFix: number; // rotation Y a appliquer pour regarder vers -Z
}

const HIP = "mixamorigHips";
const LEFT_ARM = "mixamorigLeftArm";
const LEFT_FOREARM = "mixamorigLeftForeArm";
const RIGHT_ARM = "mixamorigRightArm";
const RIGHT_FOREARM = "mixamorigRightForeArm";
const RIGHT_HAND = "mixamorigRightHand";
const SPINE = "mixamorigSpine1";
const SPINE2 = "mixamorigSpine2";
const NECK = "mixamorigNeck";
const HEAD = "mixamorigHead";
const LEFT_SHOULDER = "mixamorigLeftShoulder";
const RIGHT_SHOULDER = "mixamorigRightShoulder";

function loadGLTF(url: string, timeoutMs = 8000): Promise<GLTF> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Délai dépassé : ${url}`)), timeoutMs);
    loader.load(
      url,
      (gltf) => {
        window.clearTimeout(timer);
        resolve(gltf);
      },
      undefined,
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function collectBones(root: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  return bones;
}

function snapshotPose(bones: THREE.Bone[]): { p: THREE.Vector3; q: THREE.Quaternion }[] {
  return bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
}

function restorePose(bones: THREE.Bone[], snap: { p: THREE.Vector3; q: THREE.Quaternion }[]): void {
  bones.forEach((b, i) => {
    b.position.copy(snap[i].p);
    b.quaternion.copy(snap[i].q);
  });
}

/**
 * Retarget d'un clip : pour chaque os, on transfere la rotation monde
 * relative a la pose de repos (delta), ce qui tolere des reperes d'os
 * differents entre les deux rigs tant que les T-poses coincident.
 */
function retargetClip(source: THREE.Object3D, target: THREE.Object3D, clip: THREE.AnimationClip, fps = 12): THREE.AnimationClip {
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);

  const srcBones = collectBones(source);
  const tgtBones = collectBones(target);
  const srcByName = new Map(srcBones.map((b) => [b.name, b]));
  const srcSnap = snapshotPose(srcBones);
  const tgtSnap = snapshotPose(tgtBones);

  const restS = new Map<string, THREE.Quaternion>();
  const restT = new Map<string, THREE.Quaternion>();
  for (const b of tgtBones) {
    const s = srcByName.get(b.name);
    if (!s) continue;
    restS.set(b.name, s.getWorldQuaternion(new THREE.Quaternion()));
    restT.set(b.name, b.getWorldQuaternion(new THREE.Quaternion()));
  }
  const srcHip = srcByName.get(HIP);
  const tgtHip = tgtBones.find((b) => b.name === HIP);
  const restPosS = srcHip ? srcHip.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  const restPosT = tgtHip ? tgtHip.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  const ratio = restPosS.y > 0.01 ? restPosT.y / restPosS.y : 1;

  const mixer = new THREE.AnimationMixer(source);
  const action = mixer.clipAction(clip);
  action.play();

  const frames = Math.max(2, Math.ceil(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const quatData = new Map<string, Float32Array>();
  const hipPos = new Float32Array(frames * 3);
  for (const b of tgtBones) if (srcByName.has(b.name)) quatData.set(b.name, new Float32Array(frames * 4));

  const qS = new THREE.Quaternion();
  const qInvRestS = new THREE.Quaternion();
  const qWorld = new THREE.Quaternion();
  const qParent = new THREE.Quaternion();
  const vPos = new THREE.Vector3();

  for (let f = 0; f < frames; f++) {
    const t = Math.min(f / fps, clip.duration);
    times[f] = t;
    mixer.setTime(t);
    source.updateMatrixWorld(true);

    for (const b of tgtBones) {
      const s = srcByName.get(b.name);
      if (!s) continue;
      s.getWorldQuaternion(qS);
      qInvRestS.copy(restS.get(b.name)!).invert();
      qWorld.copy(qS).multiply(qInvRestS).multiply(restT.get(b.name)!);
      if (b.parent) {
        b.parent.getWorldQuaternion(qParent).invert();
        b.quaternion.copy(qParent).multiply(qWorld);
      } else {
        b.quaternion.copy(qWorld);
      }
      if (b.name === HIP && b.parent) {
        s.getWorldPosition(vPos).sub(restPosS).multiplyScalar(ratio).add(restPosT);
        b.parent.worldToLocal(vPos);
        b.position.copy(vPos);
        hipPos[f * 3] = vPos.x;
        hipPos[f * 3 + 1] = vPos.y;
        hipPos[f * 3 + 2] = vPos.z;
      }
      b.updateMatrixWorld(false);
      const arr = quatData.get(b.name)!;
      arr[f * 4] = b.quaternion.x;
      arr[f * 4 + 1] = b.quaternion.y;
      arr[f * 4 + 2] = b.quaternion.z;
      arr[f * 4 + 3] = b.quaternion.w;
    }
  }

  mixer.stopAllAction();
  mixer.uncacheRoot(source);
  restorePose(srcBones, srcSnap);
  restorePose(tgtBones, tgtSnap);
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);

  const tracks: THREE.KeyframeTrack[] = [];
  for (const [name, values] of quatData) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
  }
  if (tgtHip) tracks.push(new THREE.VectorKeyframeTrack(`${HIP}.position`, times, hipPos));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Rendu realiste : conversion en MeshPhysicalMaterial avec peau/tissu credibles
 *  - textures en sRGB, anisotropie, normal map conservee
 *  - sheen (micro-fibres du tissu), legere diffusion sous-surface pour la peau
 *  - marque "keep" pour que le moteur n'applique pas le cel-shading aux personnages
 */
function upgradeCharacterMaterial(input: THREE.Material): THREE.Material {
  const src = input as THREE.MeshStandardMaterial;
  if (!src.isMeshStandardMaterial) {
    input.userData.keep = true;
    return input;
  }
  const isVisor = /visor/i.test(src.name);
  const std = new THREE.MeshStandardMaterial({
    name: src.name,
    map: src.map,
    normalMap: src.normalMap,
    normalScale: src.normalScale ? src.normalScale.clone() : new THREE.Vector2(1, 1),
    roughnessMap: src.roughnessMap,
    metalnessMap: src.metalnessMap,
    aoMap: src.aoMap,
    color: src.color.clone().multiplyScalar(1.05),
    roughness: isVisor ? 0.18 : 0.55,
    metalness: isVisor ? 0.5 : 0.02,
    side: THREE.FrontSide,
    envMapIntensity: 0.75,
  });
  if (std.map) {
    std.map.colorSpace = THREE.SRGBColorSpace;
    std.map.anisotropy = 4;
    std.map.needsUpdate = true;
  }
  if (std.normalMap) {
    std.normalMap.anisotropy = 4;
    std.normalMap.needsUpdate = true;
  }
  std.userData.keep = true;
  return std;
}

function measureHeight(scene: THREE.Object3D): number {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  return Math.max(1.2, box.max.y - box.min.y);
}

export async function loadCharacterAssets(): Promise<Record<CharacterId, CharacterAsset> | null> {
  try {
    const [landry, annique] = await Promise.all([loadGLTF("/models/Landry.glb"), loadGLTF("/models/Annique.glb")]);

    const find = (clips: THREE.AnimationClip[], name: string) => clips.find((c) => c.name === name) ?? clips[0];
    const landryClips = {
      idle: find(landry.animations, "Idle"),
      walk: find(landry.animations, "Walk"),
      run: find(landry.animations, "Run"),
    };

    const anniqueWrap = new THREE.Group();
    anniqueWrap.add(annique.scene);
    anniqueWrap.updateMatrixWorld(true);

    const landryWrap = new THREE.Group();
    landryWrap.add(landry.scene);
    landryWrap.updateMatrixWorld(true);

    const anniqueClips = {
      idle: retargetClip(landryWrap, anniqueWrap, landryClips.idle),
      walk: retargetClip(landryWrap, anniqueWrap, landryClips.walk),
      run: retargetClip(landryWrap, anniqueWrap, landryClips.run),
    };

    for (const root of [landryWrap, anniqueWrap]) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mesh.material = mats.length === 1 ? upgradeCharacterMaterial(mats[0]) : mats.map(upgradeCharacterMaterial);
        }
      });
    }

    return {
      LANDRY: { scene: landryWrap, clips: landryClips, height: measureHeight(landryWrap), facingFix: 0 },
      ANNIQUE: { scene: anniqueWrap, clips: anniqueClips, height: measureHeight(anniqueWrap), facingFix: 0 },
    };
  } catch (error) {
    console.warn("Modèles 3D Annique/Landry indisponibles ; utilisation du personnage de secours.", error);
    return null;
  }
}

// =========================================================
// RIG D'UN PERSONNAGE EN JEU
// =========================================================

export type MoveState = "idle" | "walk" | "run";

const AIM_BASIS = new THREE.Quaternion().setFromRotationMatrix(
  // T-pose : bras +X, paume -Y, pouce -Z  ->  visee : bras -Z, paume -X, pouce +Y
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0))
);

export class CharacterRig {
  readonly root = new THREE.Group();
  readonly socket = new THREE.Object3D();
  readonly height: number;

  private mixer: THREE.AnimationMixer;
  private actions: Record<MoveState, THREE.AnimationAction>;
  private current: MoveState = "idle";
  private restWorld = new Map<string, THREE.Quaternion>();
  private bones = new Map<string, THREE.Bone>();
  private aimWeight = 0;
  private swingTime = -1;
  private swingDuration = 0.5;
  private fallen = 0;
  private swimBlend = 0;
  private swimMoving = false;
  private sleepBlend = 0;

  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();
  private tmpQ3 = new THREE.Quaternion();

  // Vie procedurale
  private time = Math.random() * 10;
  private lookYaw = 0;
  private lookPitch = 0;
  private lean = 0;
  private leanTarget = 0;
  private bob = 0;
  private blinkTimer = 2 + Math.random() * 3;
  private blink = 0;
  private slopePitch = 0;
  private slopeTarget = 0;
  private speedFactor = 0;

  /** Direction que le personnage regarde (relative : yaw/pitch en radians, 0 = devant). */
  setLookTarget(yaw: number, pitch: number): void {
    this.lookYaw = THREE.MathUtils.clamp(yaw, -1.1, 1.1);
    this.lookPitch = THREE.MathUtils.clamp(pitch, -0.6, 0.6);
  }

  /** Inclinaison laterale (virage) et pente du sol sous les pieds. */
  setBodyDynamics(lean: number, slopePitch: number): void {
    this.leanTarget = THREE.MathUtils.clamp(lean, -0.35, 0.35);
    this.slopeTarget = THREE.MathUtils.clamp(slopePitch, -0.35, 0.35);
  }

  constructor(asset: CharacterAsset) {
    const model = SkeletonUtils.clone(asset.scene) as THREE.Group;
    this.root.add(model);
    this.height = asset.height;
    this.root.updateMatrixWorld(true);

    for (const b of collectBones(model)) this.bones.set(b.name, b);
    for (const name of [RIGHT_ARM, RIGHT_FOREARM, RIGHT_HAND, SPINE, SPINE2, NECK, HEAD]) {
      const b = this.bones.get(name);
      if (b) this.restWorld.set(name, b.getWorldQuaternion(new THREE.Quaternion()));
    }

    // Socket d'arme : repere canonique dans la paume droite
    const hand = this.bones.get(RIGHT_HAND);
    if (hand) {
      const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
      const handScale = hand.getWorldScale(new THREE.Vector3()).x || 1;
      this.socket.quaternion.copy(handQ).invert();
      this.socket.scale.setScalar(1 / handScale);
      const offset = new THREE.Vector3(0.08, -0.02, 0.0).applyQuaternion(this.socket.quaternion).divideScalar(handScale);
      this.socket.position.copy(offset);
      hand.add(this.socket);
    } else {
      this.socket.position.set(0.35, 1.0, 0);
      this.root.add(this.socket);
    }

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {
      idle: this.mixer.clipAction(asset.clips.idle),
      walk: this.mixer.clipAction(asset.clips.walk),
      run: this.mixer.clipAction(asset.clips.run),
    };
    for (const a of Object.values(this.actions)) {
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
    }
    this.actions.idle.setEffectiveWeight(1);
  }

  setMoveState(state: MoveState, speedFactor = 1): void {
    if (state !== this.current) {
      const from = this.actions[this.current];
      const to = this.actions[state];
      to.reset();
      to.setEffectiveWeight(1);
      to.crossFadeFrom(from, 0.25, true);
      this.current = state;
    }
    this.actions.walk.setEffectiveTimeScale(speedFactor);
    this.actions.run.setEffectiveTimeScale(speedFactor);
    this.speedFactor = state === "idle" ? 0 : state === "run" ? 1 : 0.5;
  }

  setAiming(aiming: boolean, delta: number): void {
    const target = aiming ? 1 : 0;
    this.aimWeight += (target - this.aimWeight) * Math.min(1, delta * 10);
  }

  get isAiming(): boolean {
    return this.aimWeight > 0.5;
  }

  startSwing(duration = 0.5): boolean {
    if (this.swingTime >= 0) return false;
    this.swingTime = 0;
    this.swingDuration = duration;
    return true;
  }

  get swingPhase(): number {
    return this.swingTime < 0 ? -1 : this.swingTime / this.swingDuration;
  }

  setFallen(fallen: boolean, delta: number): void {
    const target = fallen ? 1 : 0;
    this.fallen += (target - this.fallen) * Math.min(1, delta * 2.5);
  }

  setSwimming(swimming: boolean, moving: boolean, delta: number): void {
    const target = swimming ? 1 : 0;
    this.swimBlend += (target - this.swimBlend) * Math.min(1, delta * 6);
    this.swimMoving = moving;
  }

  setSleeping(sleeping: boolean, delta: number): void {
    const target = sleeping ? 1 : 0;
    this.sleepBlend += (target - this.sleepBlend) * Math.min(1, delta * 5);
  }

  update(delta: number, playerQuat: THREE.Quaternion, aimPitch: number): void {
    // Posture globale du corps : mort, allongé sur le lit, ou en train de nager
    if (this.fallen > 0.01) {
      this.root.rotation.x = -this.fallen * (Math.PI / 2);
      this.root.position.set(0, this.fallen * 0.25, 0);
    } else if (this.sleepBlend > 0.01) {
      // Allongé sur le dos sur le lit de camp de la cabane
      this.root.rotation.x = this.sleepBlend * (Math.PI / 2);
      this.root.position.set(0, this.sleepBlend * 0.44, this.sleepBlend * 0.65);
    } else if (this.swimBlend > 0.01) {
      const tilt = this.swimMoving ? -1.08 : -0.38;
      const bob = Math.sin(this.time * 3.2) * 0.04;
      this.root.rotation.x = this.swimBlend * tilt;
      this.root.position.set(0, this.swimBlend * (this.swimMoving ? 0.52 : 0.16) + bob * this.swimBlend, 0);
    } else {
      this.root.rotation.x = 0;
      this.root.position.set(0, 0, 0);
    }
    this.mixer.update(delta);
    this.time += delta;
    if (this.swingTime >= 0) {
      this.swingTime += delta;
      if (this.swingTime >= this.swingDuration) this.swingTime = -1;
    }

    this.updateLife(delta);

    const arm = this.bones.get(RIGHT_ARM);
    const forearm = this.bones.get(RIGHT_FOREARM);
    const hand = this.bones.get(RIGHT_HAND);
    if (!arm || !forearm || !hand) return;

    if (this.aimWeight > 0.001) {
      // Rotation de visee : AIM_BASIS puis inclinaison selon la camera
      const pitchQ = this.tmpQ3.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -aimPitch * 0.85);
      const aimQ = this.tmpQ2.copy(playerQuat).multiply(pitchQ).multiply(AIM_BASIS);
      for (const b of [arm, forearm, hand]) {
        const rest = this.restWorld.get(b.name);
        if (!rest || !b.parent) continue;
        const desired = this.tmpQ.copy(aimQ).multiply(rest);
        b.parent.getWorldQuaternion(this.tmpQ3).invert();
        const local = this.tmpQ3.multiply(desired);
        b.quaternion.slerp(local, this.aimWeight);
        b.updateMatrixWorld(false);
      }
    }

    if (this.swingTime >= 0 && arm.parent) {
      const t = this.swingTime / this.swingDuration;
      let angle: number;
      if (t < 0.4) angle = 2.0 * Math.sin((t / 0.4) * (Math.PI / 2));
      else if (t < 0.65) angle = 2.0 - 2.6 * ((t - 0.4) / 0.25);
      else angle = -0.6 * (1 - (t - 0.65) / 0.35);
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(playerQuat);
      const swingQ = this.tmpQ2.setFromAxisAngle(axis, angle);
      arm.parent.getWorldQuaternion(this.tmpQ3);
      const currentWorld = this.tmpQ.copy(this.tmpQ3).multiply(arm.quaternion);
      const desired = swingQ.multiply(currentWorld);
      arm.quaternion.copy(this.tmpQ3.invert().multiply(desired));
      arm.updateMatrixWorld(false);
    }
  }

  /**
   * Couche de vie par-dessus l'animation :
   *  respiration (poitrine/épaules), regard de la tête vers la caméra ou le point d'intérêt,
   *  clignement (micro-inclinaison), inclinaison du buste dans les virages et en course,
   *  adaptation du bassin à la pente.
   */
  private updateLife(delta: number): void {
    const k = Math.min(1, delta * 6);
    this.lean += (this.leanTarget - this.lean) * k;
    this.slopePitch += (this.slopeTarget - this.slopePitch) * Math.min(1, delta * 4);

    this.blinkTimer -= delta;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - delta * 7);

    const breath = Math.sin(this.time * (1.2 + this.speedFactor * 1.6));
    const axisX = new THREE.Vector3(1, 0, 0);
    const axisY = new THREE.Vector3(0, 1, 0);
    const axisZ = new THREE.Vector3(0, 0, 1);

    const applyLocal = (name: string, pitch: number, yaw: number, roll: number) => {
      const b = this.bones.get(name);
      if (!b) return;
      const q = this.tmpQ.setFromAxisAngle(axisX, pitch);
      q.multiply(this.tmpQ2.setFromAxisAngle(axisY, yaw));
      q.multiply(this.tmpQ3.setFromAxisAngle(axisZ, roll));
      b.quaternion.multiply(q);
    };

    // Respiration et balancement du buste
    applyLocal(SPINE, breath * 0.012 + this.slopePitch * 0.25 + this.speedFactor * 0.08, 0, this.lean * 0.5);
    applyLocal(SPINE2, breath * 0.018, 0, this.lean * 0.35);
    applyLocal(LEFT_SHOULDER, 0, 0, -breath * 0.012);
    applyLocal(RIGHT_SHOULDER, 0, 0, breath * 0.012);

    // Mouvements de brasse / crawl dans l'eau
    if (this.swimBlend > 0.01) {
      const rate = this.swimMoving ? 5.2 : 2.4;
      const stroke = Math.sin(this.time * rate) * this.swimBlend;
      const strokeCos = Math.cos(this.time * rate) * this.swimBlend;
      applyLocal(LEFT_ARM, -0.55 * this.swimBlend + stroke * 0.55, strokeCos * 0.35, -0.25 * this.swimBlend);
      applyLocal(RIGHT_ARM, -0.55 * this.swimBlend - stroke * 0.55, -strokeCos * 0.35, 0.25 * this.swimBlend);
      applyLocal(LEFT_FOREARM, -0.35 * this.swimBlend + strokeCos * 0.25, 0, 0);
      applyLocal(RIGHT_FOREARM, -0.35 * this.swimBlend - strokeCos * 0.25, 0, 0);
    }

    // Regard : cou + tête (relevés hors de l'eau quand on nage)
    const nod = this.blink * 0.05;
    const idleSway = this.speedFactor === 0 ? Math.sin(this.time * 0.6) * 0.03 : 0;
    const swimLift = this.swimBlend * (this.swimMoving ? -0.48 : -0.18);
    const lookYaw = this.lookYaw * (1 - this.sleepBlend);
    const lookPitch = this.lookPitch * (1 - this.sleepBlend) + swimLift;
    applyLocal(NECK, lookPitch * 0.45 + nod * 0.4, lookYaw * 0.4 + idleSway * 0.5, -this.lean * 0.3);
    applyLocal(HEAD, lookPitch * 0.65 + nod, lookYaw * 0.6 + idleSway, -this.lean * 0.4);

    // Bassin : adaptation à la pente (le corps reste vertical, les hanches suivent le sol)
    const hips = this.bones.get(HIP);
    if (hips) {
      hips.quaternion.multiply(this.tmpQ.setFromAxisAngle(axisX, this.slopePitch * 0.35));
      hips.quaternion.multiply(this.tmpQ2.setFromAxisAngle(axisZ, this.lean * 0.15));
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}
