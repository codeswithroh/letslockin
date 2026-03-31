import { PHASE, PomodoroTimer } from '../timer/PomodoroTimer.js';

const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 → 326.73

export class UI {
  constructor() {
    this._loadingScreen = document.getElementById('loading-screen');
    this._loadingFill   = document.getElementById('loading-fill');
    this._roomUI        = document.getElementById('room-ui');
    this._hud           = document.getElementById('hud');
    this._doneScreen    = document.getElementById('done-screen');
    this._toast         = document.getElementById('toast');
    this._toastTimer    = null;

    this._timerMM    = document.getElementById('timer-mm');
    this._timerSS    = document.getElementById('timer-ss');
    this._ring       = document.getElementById('ring-progress');
    this._phase      = document.getElementById('phase-badge');
    this._sessions   = document.getElementById('session-counter');
    this._pauseBtn   = document.getElementById('pause-btn');
    this._resetBtn   = document.getElementById('reset-btn');
    this._restartBtn = document.getElementById('restart-btn');
    this._startBtn   = document.getElementById('start-btn');
    this._doneMsg    = document.getElementById('done-message');
    this._flashEl    = document.getElementById('flash-overlay');

    // Todo state — shared between room-ui input and task panel
    this._todos = []; // [{ text, done }]

    this._setupModePills();
    this._setupTodoInput();
    this._setupCursor();
  }

  // ─── LOADING ─────────────────────────────────────────────────────────────

  showLoading() {
    this._loadingScreen?.classList.remove('hidden');
  }

  setLoadProgress(pct) {
    if (this._loadingFill) this._loadingFill.style.width = `${pct}%`;
  }

  hideLoading() {
    if (!this._loadingScreen) return;
    this._loadingScreen.classList.add('fade-out');
    setTimeout(() => this._loadingScreen.classList.add('hidden'), 650);
  }

  // ─── ROOM UI ─────────────────────────────────────────────────────────────

  showRoomUI(onStart) {
    this._roomUI.classList.remove('hidden');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this._roomUI.classList.add('visible'))
    );
    this._startBtn.onclick = () => onStart(this._readRoomConfig());
  }

  hideRoomUI() {
    this._roomUI.classList.remove('visible');
    setTimeout(() => this._roomUI.classList.add('hidden'), 750);
  }

  _readRoomConfig() {
    const active = document.querySelector('.rui-mode.active');
    if (!active) return { workMin: 25, breakMin: 5, longBreakMin: 15, sessions: 4 };
    return {
      workMin:      parseInt(active.dataset.work)      || 25,
      breakMin:     parseInt(active.dataset.break)     || 5,
      longBreakMin: parseInt(active.dataset.longbreak) || 15,
      sessions:     parseInt(active.dataset.sessions)  || 4,
    };
  }

  _setupModePills() {
    document.querySelectorAll('.rui-mode').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.rui-mode').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });
  }

  // ─── TODOS ───────────────────────────────────────────────────────────────

  _setupTodoInput() {
    const input  = document.getElementById('todo-input');
    const addBtn = document.getElementById('todo-add-btn');
    if (!input || !addBtn) return;

    const add = () => {
      const text = input.value.trim();
      if (!text) return;
      this._todos.push({ text, done: false });
      input.value = '';
      this._renderRoomTodoList();
      this.onTodosChanged?.(this._todos);
    };

    addBtn.addEventListener('click', add);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  }

  _renderRoomTodoList() {
    const ul = document.getElementById('todo-list');
    if (!ul) return;
    ul.innerHTML = '';
    this._todos.forEach((todo, i) => {
      const li = document.createElement('li');
      li.className = 'rui-todo-item' + (todo.done ? ' done' : '');

      li.innerHTML = `
        <span class="rui-todo-dot"></span>
        <span class="rui-todo-text">${this._esc(todo.text)}</span>
        <button class="rui-todo-remove" aria-label="Remove">×</button>
      `;

      li.addEventListener('click', e => {
        if (e.target.closest('.rui-todo-remove')) {
          this._todos.splice(i, 1);
        } else {
          todo.done = !todo.done;
        }
        this._renderRoomTodoList();
        this.onTodosChanged?.(this._todos);
      });

      ul.appendChild(li);
    });
  }

  /** Returns a copy of current todos (used by Game.js to push to monitor) */
  getTodos() { return [...this._todos]; }

  // ─── TASK PANEL (shown during work) ──────────────────────────────────────

  showTaskPanel() {
    const panel = document.getElementById('task-panel');
    if (!panel) return;
    this._renderTaskPanel();
    panel.classList.remove('hidden');
  }

  hideTaskPanel() {
    document.getElementById('task-panel')?.classList.add('hidden');
  }

  _renderTaskPanel() {
    const ul = document.getElementById('task-panel-list');
    if (!ul) return;
    ul.innerHTML = '';

    if (this._todos.length === 0) {
      const empty = document.createElement('li');
      empty.style.cssText = 'font-size:0.62rem;color:var(--dim);letter-spacing:1px;';
      empty.textContent = 'No tasks added';
      ul.appendChild(empty);
      return;
    }

    this._todos.forEach((todo, i) => {
      const li = document.createElement('li');
      li.className = 'task-panel-item' + (todo.done ? ' done' : '');
      li.innerHTML = `
        <span class="task-check"><span class="task-check-mark">✓</span></span>
        <span class="task-label">${this._esc(todo.text)}</span>
      `;
      li.addEventListener('click', () => {
        todo.done = !todo.done;
        li.classList.toggle('done', todo.done);
        this._renderRoomTodoList();
        this.onTodosChanged?.(this._todos);
      });
      ul.appendChild(li);
    });
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────

  showHUD(onPause, onReset) {
    this._hud.classList.remove('hidden');
    this._pauseBtn.onclick = onPause;
    this._resetBtn.onclick  = onReset;
  }

  hideHUD() {
    this._hud.classList.add('hidden');
  }

  updateHUD(remaining, progress, phase, session, totalSessions, isPaused) {
    const [mm, ss] = PomodoroTimer.format(remaining);
    this._timerMM.textContent = mm;
    this._timerSS.textContent = ss;

    this._ring.style.strokeDashoffset = RING_CIRCUMFERENCE * progress;

    const isBreak = phase === PHASE.BREAK || phase === PHASE.LONG_BREAK;
    const phaseLabel = phase === PHASE.WORK       ? 'FOCUS'
                     : phase === PHASE.BREAK      ? 'BREAK'
                     : phase === PHASE.LONG_BREAK ? 'LONG BREAK'
                     : 'DONE';

    this._phase.textContent = phaseLabel;
    this._phase.className   = 'phase-badge' + (isBreak ? ' break' : '');
    this._ring.className    = 'ring-progress' + (isBreak ? ' break' : '');
    this._sessions.textContent = `Session ${session} of ${totalSessions}`;

    this._pauseBtn.innerHTML = isPaused
      ? `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  }

  // ─── DONE SCREEN ─────────────────────────────────────────────────────────

  showDoneScreen(sessions, onRestart) {
    this._doneScreen.classList.remove('hidden');
    const done = this._todos.filter(t => t.done).length;
    const total = this._todos.length;
    const taskNote = total > 0 ? ` · ${done}/${total} tasks done` : '';
    this._doneMsg.textContent =
      `You crushed ${sessions} session${sessions > 1 ? 's' : ''}${taskNote}. Incredible work!`;
    this._restartBtn.onclick = () => {
      this._doneScreen.classList.add('hidden');
      onRestart();
    };
  }

  // ─── TOAST ───────────────────────────────────────────────────────────────

  toast(message, isBreak = false) {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toast.textContent = message;
    this._toast.className   = 'toast show' + (isBreak ? ' break-toast' : '');
    this._toastTimer = setTimeout(() => this._toast.classList.remove('show'), 3500);
  }

  // ─── FLASH ───────────────────────────────────────────────────────────────

  flash(color = '#FFB850') {
    if (!this._flashEl) return;
    this._flashEl.style.background = color;
    this._flashEl.style.opacity    = '0.25';
    setTimeout(() => { this._flashEl.style.opacity = '0'; }, 300);
  }

  // ─── CURSOR ──────────────────────────────────────────────────────────────

  _setupCursor() {
    const cursor = document.getElementById('cursor');
    if (!cursor) return;
    window.addEventListener('mousemove', e => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top  = `${e.clientY}px`;
    });
    document.addEventListener('mouseover', e => {
      if (e.target.closest('button, .rui-mode, .hud-btn, .task-panel-item, .rui-todo-item')) {
        document.body.classList.add('cur-hover');
      }
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest('button, .rui-mode, .hud-btn, .task-panel-item, .rui-todo-item')) {
        document.body.classList.remove('cur-hover');
      }
    });
  }

  // ─── Utils ───────────────────────────────────────────────────────────────

  _esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
