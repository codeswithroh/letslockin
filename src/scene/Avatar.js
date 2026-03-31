import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Avatar — loads avatar.glb and drives fake-rig animations.
 *
 * The model has no armature, so we reparent mesh groups:
 *   upperBody group  — Body, Jumper, Head, Hair, Ears, etc.  → lean forward
 *   hipGroup         — Legs, Trousers, Right Shoe            → rotate to sit
 *
 * Coordinate notes (Blender Z-up → GLTF Y-up):
 *   Model height ≈ 1.7 m (feet at internal Y ≈ −0.85)
 *   FLOOR_OFFSET = 0.85  → root.y puts feet on Y = 0
 *   SIT_OFFSET   = 0.65  → root.y puts hips at chair-seat height
 */

const FLOOR_OFFSET = 0.85;
const SIT_OFFSET   = 0.65;

const lerp  = (a, b, t) => a + (b - a) * t;
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2*Math.PI; while (d < -Math.PI) d += 2*Math.PI; return a + d * t; };
const ease  = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;

export class Avatar {
  constructor(scene) {
    this.root   = new THREE.Group();
    this._ready = false;
    scene.add(this.root);

    // Rig groups (set up after model loads)
    this._upperBody = null;
    this._hipGroup  = null;

    // Pose state
    this._pose     = 'standing_idle';
    this._target   = 'standing_idle';
    this._poseT    = 1;
    this._poseDur  = 0.8;
    this._fromRX   = 0;   // root lean
    this._fromY    = FLOOR_OFFSET;
    this._fromUBRX = 0;   // upper body lean
    this._fromHipX = 0;   // hip group rotation (legs)

    // Movement
    this._moveSrc    = new THREE.Vector3();
    this._moveDst    = null;
    this._moveT      = 1;
    this._moveDur    = 1;
    this._moveOnDone = null;
    this._faceSrc    = 0;
    this._faceDst    = 0;

    // Walk path
    this._walkPath = [];
    this._walkIdx  = 0;
    this._walkDone = null;

    // Cycles
    this._breath    = 0;
    this._bob       = 0;
    this._typeCycle = 0;
  }

  // ── Public ────────────────────────────────────────────────────────────────

  load() {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load('/models/avatar.glb', (gltf) => {
        const model = gltf.scene;
        this.root.add(model);

        // Hide duplicate backup meshes
        ['body backup','Head backup'].forEach(n => {
          const o = model.getObjectByName(n);
          if (o) o.visible = false;
        });

        model.traverse(o => {
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
        });

        this._buildRig(model);
        this._ready = true;
        resolve();
      }, undefined, reject);
    });
  }

  setPosition(pos) {
    this.root.position.set(pos.x, 0, pos.z);
    this._applyPoseY();
  }

  faceAngle(ry) {
    this._faceSrc = this._faceDst = ry;
    this.root.rotation.y = ry;
  }

  setPose(name, duration = 0.8) {
    if (this._target === name && this._poseT >= 1) return;
    // Snapshot current state
    this._fromRX   = this.root.rotation.x;
    this._fromY    = this.root.position.y;
    this._fromUBRX = this._upperBody ? this._upperBody.rotation.x : 0;
    this._fromHipX = this._hipGroup  ? this._hipGroup.rotation.x  : 0;
    this._target  = name;
    this._poseT   = 0;
    this._poseDur = duration;
  }

  moveTo(target, duration = 1.5, onDone = null) {
    this._moveSrc.set(this.root.position.x, 0, this.root.position.z);
    this._moveDst = new THREE.Vector3(target.x, 0, target.z);
    this._moveT   = 0;
    this._moveDur = duration;
    this._moveOnDone = onDone;

    const dx = target.x - this.root.position.x;
    const dz = target.z - this.root.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.05) {
      this._faceDst = Math.atan2(dx, dz);
    }
  }

  walkPath(path, onDone = null) {
    this._walkPath = [...path];
    this._walkIdx  = 0;
    this._walkDone = onDone;
    this._nextWaypoint();
  }

  stopWalk() {
    this._walkPath   = [];
    this._walkIdx    = 0;
    this._moveDst    = null;
    this._moveOnDone = null;
  }

  update(delta) {
    if (!this._ready) return;

    this._breath    += delta * 0.85;
    this._bob       += delta * 6.0;
    this._typeCycle += delta * 4.2;

    // ── Pose blend ──
    if (this._poseT < 1) {
      this._poseT = Math.min(1, this._poseT + delta / this._poseDur);
      const t  = ease(this._poseT);
      const to = this._poseTarget(this._target);

      this.root.position.y = lerp(this._fromY,    to.rootY,  t);
      this.root.rotation.x = lerp(this._fromRX,   to.rootRX, t);
      if (this._upperBody)
        this._upperBody.rotation.x = lerp(this._fromUBRX, to.ubRX, t);
      if (this._hipGroup)
        this._hipGroup.rotation.x  = lerp(this._fromHipX,  to.hipX, t);
    } else {
      this._pose = this._target;
    }

    this._applyProcedural(delta);

    // ── Movement ──
    if (this._moveDst && this._moveT < 1) {
      this._moveT = Math.min(1, this._moveT + delta / this._moveDur);
      const t = ease(this._moveT);
      this.root.position.x = lerp(this._moveSrc.x, this._moveDst.x, t);
      this.root.position.z = lerp(this._moveSrc.z, this._moveDst.z, t);
      this._faceSrc = lerpA(this._faceSrc, this._faceDst, delta * 5);
      this.root.rotation.y = this._faceSrc;

      if (this._moveT >= 1) {
        this._moveDst = null;
        const cb = this._moveOnDone;
        this._moveOnDone = null;
        if (cb) cb();
      }
    }
  }

  // ── Rig ───────────────────────────────────────────────────────────────────

  _buildRig(model) {
    // ── Upper-body group (lean forward when typing) ──
    this._upperBody = new THREE.Group();
    // Position pivot at shoulder/chest height in model space
    // Body center in Blender Z=-0.09 → Three.js Y=-0.09; chest a bit above → Y≈0.05
    this._upperBody.position.set(0, 0.05, 0);
    model.add(this._upperBody);

    const upperNames = ['Body','Jumper','Head','Head backup','Hair','Ears','Hat 2',
                        'Nose','Sphere','Teeth lower','Teeth upper','Tounge'];
    upperNames.forEach(name => {
      const obj = model.getObjectByName(name);
      if (!obj || obj.parent === this._upperBody) return;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      obj.removeFromParent();
      this._upperBody.add(obj);
      // Convert world pos back to upperBody local
      this._upperBody.worldToLocal(wp);
      obj.position.copy(wp);
    });

    // ── Hip group (rotate legs to sitting position) ──
    this._hipGroup = new THREE.Group();
    // Hip pivot at the waist: between body bottom and legs top
    // Body bottom ≈ Y = -0.09 - 0.698/2 = -0.44  Legs top ≈ Y = -0.25 + 0.82/2 = 0.16
    // Pivot at Y ≈ -0.05 (just below the waist seam)
    this._hipGroup.position.set(0, -0.05, 0);
    model.add(this._hipGroup);

    const lowerNames = ['Legs','Trousers','Right Shoe'];
    lowerNames.forEach(name => {
      const obj = model.getObjectByName(name);
      if (!obj) return;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      obj.removeFromParent();
      this._hipGroup.add(obj);
      this._hipGroup.worldToLocal(wp);
      obj.position.copy(wp);
    });
  }

  // ── Pose targets ──────────────────────────────────────────────────────────

  _poseTarget(name) {
    switch (name) {
      case 'sitting_idle':
        return {
          rootY:  SIT_OFFSET,
          rootRX: 0,
          ubRX:   0.28,       // lean upper body forward onto desk
          hipX:   Math.PI / 2 - 0.12, // legs horizontal (90° - small correction)
        };
      case 'sitting_typing':
        return {
          rootY:  SIT_OFFSET,
          rootRX: 0,
          ubRX:   0.32,
          hipX:   Math.PI / 2 - 0.12,
        };
      case 'walking':
        return { rootY: FLOOR_OFFSET, rootRX: 0.05, ubRX: 0, hipX: 0 };
      case 'stretching':
        return { rootY: FLOOR_OFFSET, rootRX: -0.20, ubRX: -0.45, hipX: 0 };
      default: // standing_idle
        return { rootY: FLOOR_OFFSET, rootRX: 0, ubRX: 0, hipX: 0 };
    }
  }

  _applyPoseY() {
    const t = this._poseTarget(this._pose);
    this.root.position.y = t.rootY;
    this._fromY = t.rootY;
  }

  // ── Procedural overlays ───────────────────────────────────────────────────

  _applyProcedural(delta) {
    const breath  = Math.sin(this._breath) * 0.006;
    const isTyping  = this._pose === 'sitting_typing' || this._target === 'sitting_typing';
    const isWalking = this._pose === 'walking'        || this._target === 'walking';

    if (isTyping && this._upperBody) {
      // Rock upper body very subtly while typing
      const tOsc = Math.sin(this._typeCycle) * 0.018;
      this._upperBody.rotation.x += tOsc;
      this._upperBody.rotation.z  = Math.sin(this._typeCycle * 0.5) * 0.01;
      this.root.position.y += breath;
    } else if (isWalking) {
      const bobY = Math.abs(Math.sin(this._bob)) * 0.022;
      this.root.position.y += bobY;
      this.root.rotation.z  = Math.sin(this._bob) * 0.035;
      if (this._upperBody) this._upperBody.rotation.z = Math.sin(this._bob + Math.PI) * 0.04;
    } else {
      if (this._upperBody) this._upperBody.rotation.z = Math.sin(this._breath * 0.4) * 0.01;
      this.root.position.y += breath;
    }
  }

  // ── Walk path ──────────────────────────────────────────────────────────────

  _nextWaypoint() {
    if (this._walkIdx >= this._walkPath.length) {
      this.setPose('standing_idle', 0.5);
      const cb = this._walkDone; this._walkDone = null;
      if (cb) cb();
      return;
    }
    const pt   = this._walkPath[this._walkIdx++];
    const curr = new THREE.Vector3(this.root.position.x, 0, this.root.position.z);
    const dist = curr.distanceTo(new THREE.Vector3(pt.x, 0, pt.z));
    this.setPose('walking', 0.3);
    this.moveTo(pt, Math.max(0.4, dist / 1.3), () => this._nextWaypoint());
  }
}
