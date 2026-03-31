import * as THREE from 'three';
import { Room } from './scene/Room.js';
import { Pill } from './scene/Pill.js';
import { CameraControls } from './scene/Controls.js';
import { PomodoroTimer, PHASE } from './timer/PomodoroTimer.js';
import { UI } from './ui/UI.js';

const STATE = {
  LOADING: 'loading', ROOM_UI: 'room_ui',
  SITTING_DOWN: 'sitting_down', WORK: 'work',
  STANDING_UP: 'standing_up', BREAK: 'break', DONE: 'done',
};

const CAM = {
  room_ui: { pos: new THREE.Vector3(0.4,  1.1,  1.6),  at: new THREE.Vector3(-0.4, 0.6, -0.5) },
  work:    { pos: new THREE.Vector3(0.55, 1.05, 0.35), at: new THREE.Vector3(-0.8, 0.72,-0.65) },
  break:   { pos: new THREE.Vector3(0.3,  1.3,  1.4),  at: new THREE.Vector3(-0.2, 0.5,  0.0) },
};

export class Game {
  constructor(canvas) {
    this._canvas = canvas;
    this._state  = STATE.LOADING;
    this._paused = false;
    this._clock  = new THREE.Clock();

    this._camPos    = new THREE.Vector3();
    this._camAt     = new THREE.Vector3();
    this._camPosDst = new THREE.Vector3();
    this._camAtDst  = new THREE.Vector3();

    this._walkScheduled  = false;
    this._orbitAngle     = 0;
    this._idleWandering  = false;
    this._lastClockTime  = '';

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._initParticles();

    this.ui   = new UI();
    this.room = new Room(this._scene);
    this.pill = new Pill(this._scene);
    this.timer = null;
    this.ctrl  = new CameraControls(this._camera, canvas);

    // Wire todo changes → redraw monitor
    this.ui.onTodosChanged = todos => this._drawMonitor(todos);

    this._loadAssets();
  }

  start() { this._render(); }

  // ── Init ─────────────────────────────────────────────────────────────────

  _initRenderer() {
    this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.shadowMap.enabled   = true;
    this._renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
    this._renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 0.88;
    this._renderer.setClearColor(0x060404);
    window.addEventListener('resize', () => {
      this._renderer.setSize(window.innerWidth, window.innerHeight);
      this._camera.aspect = window.innerWidth / window.innerHeight;
      this._camera.updateProjectionMatrix();
    });
  }

  _initScene() {
    this._scene  = new THREE.Scene();
    this._scene.fog = new THREE.FogExp2(0x100808, 0.10);
    this._camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.05, 25);
    const c = CAM.room_ui;
    this._camPos.copy(c.pos);    this._camPosDst.copy(c.pos);
    this._camAt.copy(c.at);      this._camAtDst.copy(c.at);
  }

  _initLights() {
    this._scene.add(new THREE.AmbientLight(0xFFDDAA, 0.55));

    const sun = new THREE.DirectionalLight(0xC8DEFF, 1.3);
    sun.position.set(-1.5, 3.5, -1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.1; sun.shadow.camera.far = 10;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -2.5;
    sun.shadow.camera.right = sun.shadow.camera.top   =  2.5;
    sun.shadow.bias = -0.002;
    this._scene.add(sun);

    this._deskLight = new THREE.PointLight(0xFFCC55, 2.5, 1.8);
    this._deskLight.position.set(-1.32, 1.05, -0.78);
    this._scene.add(this._deskLight);

    this._monitorLight = new THREE.PointLight(0x3355CC, 0.8, 0.7);
    this._monitorLight.position.set(-1.35, 0.82, -0.95);
    this._scene.add(this._monitorLight);

    const fill = new THREE.PointLight(0xFFEE88, 0.35, 5);
    fill.position.set(-0.5, 1.6, -0.2);
    this._scene.add(fill);
  }

  _initParticles() {
    const count = 280;
    const positions = new Float32Array(count * 3);
    const speeds    = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 3;
      positions[i * 3 + 1] = Math.random() * 1.8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
      speeds[i]            = 0.04 + Math.random() * 0.08;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._particlePositions = positions;
    this._particleSpeeds    = speeds;
    this._particleCount     = count;

    this._particles = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xFFCC88, size: 0.004, transparent: true, opacity: 0.55, sizeAttenuation: true,
    }));
    this._scene.add(this._particles);
  }

  _updateParticles(delta) {
    const pos = this._particlePositions;
    for (let i = 0; i < this._particleCount; i++) {
      pos[i * 3 + 1] += this._particleSpeeds[i] * delta;
      if (pos[i * 3 + 1] > 1.85) {
        pos[i * 3 + 1] = 0;
        pos[i * 3]     = (Math.random() - 0.5) * 3;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
      }
    }
    this._particles.geometry.attributes.position.needsUpdate = true;
  }

  // ── Clock canvas (desk alarm clock) ──────────────────────────────────────

  _localTimeStr() {
    const n = new Date();
    return String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
  }

  _setupClockDisplay() {
    this._clockCanvas = document.createElement('canvas');
    this._clockCanvas.width  = 256;
    this._clockCanvas.height = 128;
    this._clockTex = new THREE.CanvasTexture(this._clockCanvas);

    const clockMat = new THREE.MeshBasicMaterial({
      map: this._clockTex,
      transparent: false,
    });

    // Strategy 1: replace the GLB 'time' mesh material directly (most reliable)
    let replaced = false;
    this.room.group.traverse(obj => {
      if (obj.isMesh && obj.name === 'time') {
        obj.material = clockMat;
        replaced = true;
      }
    });

    // Strategy 2: fallback overlay plane (if mesh not found by name)
    if (!replaced) {
      const geo = new THREE.PlaneGeometry(0.130, 0.072);
      const planeMat = new THREE.MeshBasicMaterial({
        map: this._clockTex, transparent: false,
        depthTest: false,
      });
      this._clockPlane = new THREE.Mesh(geo, planeMat);
      this._clockPlane.renderOrder = 2;
      this._clockPlane.position.set(-1.328, 0.668, -0.808);
      this._clockPlane.rotation.y = -0.277;
      this._scene.add(this._clockPlane);
    }

    this._updateClockDisplay(this._localTimeStr());
  }

  _updateClockDisplay(text) {
    if (!this._clockCanvas) return;
    const ctx = this._clockCanvas.getContext('2d');
    const w = 256, h = 128;
    // Dark background to mask the baked "13:00" texture underneath
    ctx.fillStyle = '#0A0505';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '900 72px Montserrat, sans-serif';
    ctx.fillStyle = '#FF4422';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,60,20,0.75)';
    ctx.shadowBlur  = 18;
    ctx.fillText(text, w / 2, h / 2);
    this._clockTex.needsUpdate = true;
  }

  // ── Monitor canvas (todo list on screen) ──────────────────────────────────

  _setupMonitorDisplay() {
    this._monitorCanvas = document.createElement('canvas');
    this._monitorCanvas.width  = 512;
    this._monitorCanvas.height = 320;

    // ── Laptop screen: replace the GLB mesh material with canvas texture ──
    // Cube020_1 has rotation.z≈π (180°) which flips the texture both horizontally
    // AND vertically. Compensate with repeat(-1,-1) + offset(1,1).
    this._laptopTex = new THREE.CanvasTexture(this._monitorCanvas);
    this._laptopTex.repeat.set(-1, -1);
    this._laptopTex.offset.set(1, 1);
    const laptopMat = new THREE.MeshBasicMaterial({ map: this._laptopTex });
    this.room.group.traverse(obj => {
      if (obj.isMesh && (obj.name === 'Cube020_1' || obj.name === 'Cube020_2')) {
        obj.material = laptopMat;
      }
    });

    this._drawMonitor([]);
  }

  _drawMonitor(todos) {
    if (!this._monitorCanvas) return;
    const ctx = this._monitorCanvas.getContext('2d');
    const W = 512, H = 320;

    // Background — dark screen
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#080612';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 12);
    ctx.fill();

    // Subtle scanline texture
    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 1);
    }

    // Header
    ctx.font = '700 18px Montserrat, sans-serif';
    ctx.fillStyle = '#FF8C32';
    ctx.textAlign = 'left';
    ctx.letterSpacing = '4px';
    ctx.fillText("TODAY'S FOCUS", 32, 44);

    // Divider
    ctx.fillStyle = 'rgba(255,140,50,0.18)';
    ctx.fillRect(32, 56, W - 64, 1);

    // Todo items
    if (todos.length === 0) {
      ctx.font = '400 15px Montserrat, sans-serif';
      ctx.fillStyle = 'rgba(240,234,224,0.22)';
      ctx.textAlign = 'center';
      ctx.letterSpacing = '2px';
      ctx.fillText('Add tasks before locking in', W / 2, 140);
    } else {
      ctx.textAlign = 'left';
      ctx.letterSpacing = '0.5px';
      const maxVisible = 7;
      const shown = todos.slice(0, maxVisible);
      shown.forEach((todo, i) => {
        const y = 90 + i * 32;
        const done = todo.done;

        // Checkbox
        ctx.strokeStyle = done ? '#FF8C32' : 'rgba(255,140,50,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(32, y - 11, 14, 14, 3);
        ctx.stroke();
        if (done) {
          ctx.fillStyle = 'rgba(255,140,50,0.3)';
          ctx.beginPath();
          ctx.roundRect(32, y - 11, 14, 14, 3);
          ctx.fill();
          // Checkmark
          ctx.strokeStyle = '#FF8C32';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(35, y - 4);
          ctx.lineTo(38, y - 1);
          ctx.lineTo(44, y - 8);
          ctx.stroke();
        }

        // Text
        ctx.font = done
          ? '400 14px Montserrat, sans-serif'
          : '400 14px Montserrat, sans-serif';
        ctx.fillStyle = done ? 'rgba(240,234,224,0.28)' : 'rgba(240,234,224,0.82)';

        const maxW = W - 64 - 24;
        let text = todo.text;
        // Truncate if too long
        while (ctx.measureText(text).width > maxW && text.length > 1) {
          text = text.slice(0, -1);
        }
        if (text !== todo.text) text += '…';

        ctx.fillText(text, 56, y);

        // Strikethrough
        if (done) {
          const tw = ctx.measureText(text).width;
          ctx.strokeStyle = 'rgba(240,234,224,0.28)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(56, y - 2);
          ctx.lineTo(56 + tw, y - 2);
          ctx.stroke();
        }
      });

      if (todos.length > maxVisible) {
        ctx.font = '400 12px Montserrat, sans-serif';
        ctx.fillStyle = 'rgba(240,234,224,0.22)';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '1px';
        ctx.fillText(`+${todos.length - maxVisible} more`, W / 2, H - 20);
      }
    }

    if (this._laptopTex) this._laptopTex.needsUpdate = true;
  }

  // ── Asset loading ─────────────────────────────────────────────────────────

  async _loadAssets() {
    this.ui.showLoading();
    this.ui.setLoadProgress(0);

    try {
      await Promise.all([
        this.room.load(pct => this.ui.setLoadProgress(pct)),
        this.pill.load(),
      ]);
    } catch (err) {
      console.error('Load error:', err);
    }
    this.ui.setLoadProgress(100);

    this._positions = this.room.getPositions();
    // Spawn pill in the room (not at the desk) for idle wandering
    this.pill.setPosition(this._positions.roomStart);
    this.pill.faceAngle(0);
    this.pill.setPose('standing_idle');

    this._setupClockDisplay();
    this._setupMonitorDisplay();
    this._setCam('room_ui');
    this.ctrl.applyToCamera(CAM.room_ui.pos, CAM.room_ui.at);

    setTimeout(() => {
      this.ui.hideLoading();
      this._setState(STATE.ROOM_UI);
    }, 400);
  }

  // ── State machine ─────────────────────────────────────────────────────────

  _startSession(config) {
    this._stopIdleWander();

    this.timer = new PomodoroTimer(config);
    this.timer.onPhaseChange = ph => this._handlePhaseChange(ph);
    this.timer.onTick = (rem, prog) => {
      this.ui.updateHUD(rem, prog, this.timer.phase, this.timer.session, this.timer.totalSessions, this._paused);
      const [mm, ss] = PomodoroTimer.format(rem);
      this._updateClockDisplay(`${mm}:${ss}`);
    };
    this.timer.onDone = () => this._setState(STATE.DONE);

    this.ui.hideRoomUI();
    this.ui.showHUD(() => this._togglePause(), () => this._reset());
    this.ui.showTaskPanel();
    this._setCam('work');

    // Walk the pill from its current wander position to the desk seat, then sit
    this._state = STATE.SITTING_DOWN;
    this.pill.walkPath([this._positions.deskSeat], () => {
      this.pill.faceAngle(this._positions.seatFacing);
      this._setState(STATE.SITTING_DOWN);
    });
  }

  _setState(s) {
    this._state = s;
    switch (s) {

      case STATE.ROOM_UI:
        this._lastClockTime = '';            // force clock refresh
        this._drawMonitor(this.ui.getTodos());
        this.ui.showRoomUI(config => this._startSession(config));
        this._startIdleWander();
        break;

      case STATE.SITTING_DOWN:
        this.pill.setPose('sitting_idle');
        setTimeout(() => {
          if (this._state === STATE.SITTING_DOWN) this._setState(STATE.WORK);
        }, 1300);
        break;

      case STATE.WORK:
        this.pill.setPose('sitting_typing');
        this.timer.start();
        this._deskLight.intensity    = 2.5;
        this._monitorLight.intensity = 0.8;
        break;

      case STATE.STANDING_UP: {
        this.timer.pause();
        this.pill.setPose('standing_idle');
        const isLong = this.timer.phase === PHASE.LONG_BREAK;
        this.ui.toast(isLong ? 'Long break — rest up!' : 'Break time — step away.', true);
        this.ui.flash('#5AC8FF');
        this.ui.hideTaskPanel();
        this._setCam('break');
        setTimeout(() => {
          if (this._state === STATE.STANDING_UP) this._setState(STATE.BREAK);
        }, 1600);
        break;
      }

      case STATE.BREAK:
        this.timer.resume();
        this._deskLight.intensity    = 0.5;
        this._monitorLight.intensity = 0.1;
        this._startBreakWalk();
        break;

      case STATE.DONE:
        this.pill.setPose('stretching');
        this.ui.hideHUD();
        this.ui.hideTaskPanel();
        this._setCam('room_ui');
        this._updateClockDisplay('✓');
        setTimeout(() => this.ui.showDoneScreen(this.timer.session - 1, () => this._reset()), 1200);
        break;
    }
  }

  _handlePhaseChange(phase) {
    if (phase === PHASE.WORK) {
      this.pill.stopWalk();
      this._walkScheduled = false;
      this.pill.walkPath([this._positions.deskSeat], () => {
        this.pill.faceAngle(this._positions.seatFacing);
        this._setState(STATE.SITTING_DOWN);
      });
      this._setCam('work');
      this.ui.toast('Time to lock in!', false);
      this.ui.flash('#FF8C32');
      this.ui.showTaskPanel();
    } else if (phase === PHASE.BREAK || phase === PHASE.LONG_BREAK) {
      this._setState(STATE.STANDING_UP);
    }
  }

  _startBreakWalk() {
    if (this._walkScheduled) return;
    this._walkScheduled = true;
    this.pill.walkPath([...this._positions.walkPath], () => {
      this._walkScheduled = false;
      if (this._state === STATE.BREAK) {
        this.pill.setPose('stretching');
        setTimeout(() => {
          if (this._state === STATE.BREAK) this.pill.setPose('standing_idle');
        }, 2800);
      }
    });
  }

  // ── Idle wander (ROOM_UI state) ───────────────────────────────────────────

  _startIdleWander() {
    this._idleWandering = true;
    this._doIdleWalk();
  }

  _stopIdleWander() {
    this._idleWandering = false;
    this.pill.stopWalk();
  }

  _doIdleWalk() {
    if (!this._idleWandering || this._state !== STATE.ROOM_UI) return;
    const path = [...this._positions.idleWalkPath];
    this.pill.walkPath(path, () => {
      if (this._idleWandering && this._state === STATE.ROOM_UI) this._doIdleWalk();
    });
  }

  _togglePause() {
    this._paused = !this._paused;
    this._paused ? this.timer?.pause() : this.timer?.resume();
    this.ui.toast(this._paused ? 'Paused' : 'Resumed');
  }

  _reset() {
    this.timer?.reset();
    this._paused        = false;
    this._walkScheduled = false;
    this._stopIdleWander();
    this.pill.setPosition(this._positions.roomStart);
    this.pill.faceAngle(0);
    this.pill.setPose('standing_idle');
    this._deskLight.intensity    = 2.5;
    this._monitorLight.intensity = 0.8;
    this._setCam('room_ui');
    this.ui.hideHUD();
    this.ui.hideTaskPanel();
    this._setState(STATE.ROOM_UI);
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  _setCam(key) {
    this._camPosDst.copy(CAM[key].pos);
    this._camAtDst.copy(CAM[key].at);
    this.ctrl.snapTo(0, 0);
  }

  _updateCamera(delta) {
    const k = 1 - Math.exp(-delta * 1.6);
    this._camPos.lerp(this._camPosDst, k);
    this._camAt.lerp(this._camAtDst, k);
    let finalPos = this._camPos.clone();

    if (this._state === STATE.WORK) {
      this._orbitAngle += delta * 0.022;
      finalPos.x += Math.sin(this._orbitAngle) * 0.18;
      finalPos.z += Math.cos(this._orbitAngle) * 0.18;
    }

    if (this._state === STATE.BREAK) {
      const ap = this.pill.root.position;
      this._camAtDst.set(
        ap.x * 0.25 + this._camAtDst.x * 0.75,
        0.55,
        ap.z * 0.25 + this._camAtDst.z * 0.75
      );
    }

    this.ctrl.applyToCamera(finalPos, this._camAt);
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  _render() {
    requestAnimationFrame(() => this._render());
    const delta = Math.min(this._clock.getDelta(), 0.05);

    if (!this._paused && this.timer) this.timer.update(delta);
    this.pill.update(delta);
    this.ctrl.update(delta);
    this._updateCamera(delta);
    this._updateParticles(delta);

    if (this._state === STATE.WORK || this._state === STATE.SITTING_DOWN) {
      this._deskLight.intensity = 2.5 + Math.sin(Date.now() * 0.003) * 0.12;
    }

    // Keep desk clock showing real local time when not in a work session
    if (this._state === STATE.ROOM_UI || this._state === STATE.BREAK || this._state === STATE.DONE) {
      const t = this._localTimeStr();
      if (t !== this._lastClockTime) {
        this._lastClockTime = t;
        this._updateClockDisplay(t);
      }
    }

    this._renderer.render(this._scene, this._camera);
  }
}
