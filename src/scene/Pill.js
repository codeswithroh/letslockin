import * as THREE from 'three';

/**
 * Pill — a 3D pill that replaces the avatar.
 * Exposes the same public API as Avatar so Game.js needs no structural changes.
 * Pure procedural animation — no rig, no GLB.
 */

const lerp  = (a, b, t) => a + (b - a) * t;
const lerpA = (a, b, t) => {
  let d = b - a;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};
const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;

const H = { standing: 0.28, sitting: 0.676 }; // sitting = chair_plane.y(0.436) + half-height(0.24)

export class Pill {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);

    // ── Body — warm amber pill ────────────────────────────────────────────
    const bodyGeo = new THREE.CapsuleGeometry(0.10, 0.28, 8, 24);
    this._mat = new THREE.MeshStandardMaterial({
      color:            0xFF8C32,
      roughness:        0.30,
      metalness:        0.05,
      emissive:         new THREE.Color(0xFF8C32),
      emissiveIntensity: 0.07,
    });
    this._body = new THREE.Mesh(bodyGeo, this._mat);
    this._body.castShadow = true;
    this.root.add(this._body);

    // ── Eyes — two tiny dark spheres on the front face ────────────────────
    const eyeGeo = new THREE.SphereGeometry(0.014, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x100808, roughness: 0.9 });
    this._eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this._eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    this._eyeL.position.set(-0.035, 0.06, 0.095);
    this._eyeR.position.set( 0.035, 0.06, 0.095);
    this._body.add(this._eyeL);
    this._body.add(this._eyeR);

    // ── State ─────────────────────────────────────────────────────────────
    this._pose   = 'standing_idle';
    this._poseY  = H.standing;
    this._time   = 0;

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

    this._ready = true;
  }

  // ── Public API (matches Avatar) ───────────────────────────────────────────

  /** No async loading needed — returns a resolved promise to match Avatar API */
  load() { return Promise.resolve(); }

  setPosition(pos) {
    this.root.position.set(pos.x, this._poseY, pos.z);
  }

  faceAngle(ry) {
    this._faceSrc = this._faceDst = ry;
    this.root.rotation.y = ry;
  }

  setPose(name) {
    this._pose  = name;
    this._poseY = name.startsWith('sitting') ? H.sitting : H.standing;
  }

  moveTo(target, duration = 1.5, onDone = null) {
    this._moveSrc.set(this.root.position.x, 0, this.root.position.z);
    this._moveDst    = new THREE.Vector3(target.x, 0, target.z);
    this._moveT      = 0;
    this._moveDur    = duration;
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
    this._time += delta;

    // ── Smooth height ──
    this.root.position.y = lerp(this.root.position.y, this._poseY, delta * 4);

    // ── Procedural overlay per pose ──
    const isTyping   = this._pose === 'sitting_typing';
    const isWalking  = this._pose === 'walking';
    const isStretch  = this._pose === 'stretching';

    if (isTyping) {
      // ── Music groove — clearly visible from behind-the-shoulder camera ──────
      const beat  = Math.sin(this._time * 5.8);         // ~0.92 Hz primary bounce
      const half  = Math.sin(this._time * 2.9 + 0.6);   // half-time accent
      const sway  = Math.sin(this._time * 1.30);         // slow side sway
      const flow  = (Math.sin(this._time * 0.28) + 1) * 0.5; // 0→1 intensity ebb/flow

      // Vertical bob — big enough to clearly see up-down movement
      this._body.position.y =
        (Math.abs(beat) * 0.072 + Math.abs(half) * 0.028) * (0.65 + flow * 0.35)
        + Math.sin(this._time * 14.0) * 0.006; // rapid micro typing vibration

      // Pitch — nod forward/back with the beat
      this._body.rotation.x =
        0.14 + (beat * 0.085 + half * 0.040) * (0.60 + flow * 0.40);

      // Roll — pronounced side-to-side groove sway
      this._body.rotation.z =
        sway * 0.110 + Math.sin(this._time * 2.7) * 0.025;

      // Yaw — head turns to follow the sway (trails with lerp)
      this._body.rotation.y =
        lerp(this._body.rotation.y, sway * 0.070, delta * 3);

    } else if (isWalking) {
      // Bounce and sway
      this._body.position.y  = Math.abs(Math.sin(this._time * 7.0)) * 0.028;
      this._body.rotation.z  = Math.sin(this._time * 7.0) * 0.14;
      this._body.rotation.x  = lerp(this._body.rotation.x, 0.08, delta * 5);
    } else if (isStretch) {
      // Lean back
      this._body.rotation.x  = lerp(this._body.rotation.x, -0.42, delta * 3);
      this._body.position.y  = Math.sin(this._time * 0.9) * 0.014;
      this._body.rotation.z  = Math.sin(this._time * 0.6) * 0.04;
    } else {
      // Gentle idle breath — visible slow sway
      this._body.position.y  = Math.sin(this._time * 1.1) * 0.016;
      this._body.rotation.x  = lerp(this._body.rotation.x, 0, delta * 3);
      this._body.rotation.z  = Math.sin(this._time * 0.55) * 0.026;
    }

    // ── Face tracking toward monitor when sitting ──
    if (this._pose === 'sitting_idle' || isTyping) {
      this.root.rotation.y = lerp(this.root.rotation.y, this._faceDst || -Math.PI / 2, delta * 2);
    }

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

  // ── Walk path ──────────────────────────────────────────────────────────────

  _nextWaypoint() {
    if (this._walkIdx >= this._walkPath.length) {
      this.setPose('standing_idle');
      const cb = this._walkDone; this._walkDone = null;
      if (cb) cb();
      return;
    }
    const pt   = this._walkPath[this._walkIdx++];
    const curr = new THREE.Vector3(this.root.position.x, 0, this.root.position.z);
    const dist = curr.distanceTo(new THREE.Vector3(pt.x, 0, pt.z));
    this.setPose('walking');
    this.moveTo(pt, Math.max(0.4, dist / 1.3), () => this._nextWaypoint());
  }
}
