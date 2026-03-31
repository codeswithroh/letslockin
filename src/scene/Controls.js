import * as THREE from 'three';

/**
 * Drag-to-look camera controls.
 *
 * The camera stays at a game-set position; the user can grab and drag
 * to rotate the view direction (panoramic 360° inside the room).
 * Releases with smooth inertia (exponential damping).
 *
 * Usage:
 *   const ctrl = new CameraControls(camera, canvas);
 *   // each frame:
 *   ctrl.update(delta);
 */
export class CameraControls {
  constructor(camera, canvas) {
    this._cam     = camera;
    this._canvas  = canvas;
    this.enabled  = true;

    // Current view offsets (radians) from the game's intended look-at
    this.yaw      = 0;   // horizontal pan
    this.pitch    = 0;   // vertical tilt

    this._targetYaw   = 0;
    this._targetPitch = 0;

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

    // Inertia
    this._velX = 0;
    this._velY = 0;

    this._setupListeners();
  }

  // ── Public ───────────────────────────────────────────────────────────────

  /** Call every frame. Applies smooth damping toward drag target. */
  update(delta) {
    if (!this._dragging) {
      // Apply inertia
      this._targetYaw   += this._velX;
      this._targetPitch += this._velY;
      this._velX *= 0.88;
      this._velY *= 0.88;
    }

    // Clamp pitch so you can't flip upside-down
    this._targetPitch = Math.max(-0.45, Math.min(0.5, this._targetPitch));

    // Smooth damping
    const k = 1 - Math.exp(-delta * 10);
    this.yaw   += (this._targetYaw   - this.yaw)   * k;
    this.pitch += (this._targetPitch - this.pitch) * k;
  }

  /**
   * Apply the control offset on top of a base position + look-at.
   * Call this instead of camera.lookAt() directly.
   */
  applyToCamera(basePos, baseLookAt) {
    this._cam.position.copy(basePos);

    // Build look direction from yaw/pitch offset
    const dx = baseLookAt.x - basePos.x;
    const dy = baseLookAt.y - basePos.y;
    const dz = baseLookAt.z - basePos.z;
    const baseYaw   = Math.atan2(dx, dz);
    const baseDist  = Math.sqrt(dx * dx + dz * dz);
    const basePitch = Math.atan2(dy, baseDist);

    const totalYaw   = baseYaw   + this.yaw;
    const totalPitch = basePitch + this.pitch;
    const dist = 2.0;

    const lookAt = new THREE.Vector3(
      basePos.x + Math.sin(totalYaw) * Math.cos(totalPitch) * dist,
      basePos.y + Math.sin(totalPitch) * dist,
      basePos.z + Math.cos(totalYaw) * Math.cos(totalPitch) * dist
    );

    this._cam.lookAt(lookAt);
  }

  /** Snap to a specific facing direction (no transition) */
  snapTo(yaw, pitch) {
    this.yaw = this._targetYaw = yaw;
    this.pitch = this._targetPitch = pitch;
    this._velX = this._velY = 0;
  }

  // ── Listeners ────────────────────────────────────────────────────────────

  _setupListeners() {
    const el = this._canvas;

    // Mouse
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this._velX = this._velY = 0;
      el.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._dragging || !this.enabled) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;

      const sens = 0.0028;
      this._targetYaw   -= dx * sens;
      this._targetPitch -= dy * sens;

      // Track for inertia
      this._velX = -dx * sens * 0.35;
      this._velY = -dy * sens * 0.35;
    });

    window.addEventListener('mouseup', () => {
      this._dragging = false;
      this._canvas.style.cursor = '';
    });

    // Touch
    let lastTX = 0, lastTY = 0;
    el.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      this._dragging = true;
      lastTX = e.touches[0].clientX;
      lastTY = e.touches[0].clientY;
      this._velX = this._velY = 0;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this._dragging || !this.enabled) return;
      const dx = e.touches[0].clientX - lastTX;
      const dy = e.touches[0].clientY - lastTY;
      lastTX = e.touches[0].clientX;
      lastTY = e.touches[0].clientY;

      const sens = 0.003;
      this._targetYaw   -= dx * sens;
      this._targetPitch -= dy * sens;
      this._velX = -dx * sens * 0.3;
      this._velY = -dy * sens * 0.3;
    }, { passive: true });

    window.addEventListener('touchend', () => { this._dragging = false; });
  }
}
