/**
 * PomodoroTimer — pure logic, no DOM or Three.js dependencies.
 *
 * Presets researched:
 *   Classic    25 / 5   — Francesco Cirillo's original Pomodoro Technique
 *   DeskTime   52 / 17  — DeskTime productivity study of top 10% performers
 *   Ultradian  90 / 20  — Ultradian rhythm (Peretz Lavie / Nathaniel Kleitman)
 *   Long break: 15–30 min after every 4 work sessions (Classic guideline)
 */

export const PRESETS = {
  classic:    { workMin: 25,  breakMin: 5,  longBreakMin: 15, sessions: 4 },
  desktime:   { workMin: 52,  breakMin: 17, longBreakMin: 30, sessions: 4 },
  ultradian:  { workMin: 90,  breakMin: 20, longBreakMin: 30, sessions: 3 },
};

export const PHASE = {
  WORK:       'work',
  BREAK:      'break',
  LONG_BREAK: 'long_break',
  DONE:       'done',
};

export class PomodoroTimer {
  constructor({ workMin, breakMin, longBreakMin = 15, sessions = 4 } = PRESETS.classic) {
    this.workSec       = workMin * 60;
    this.breakSec      = breakMin * 60;
    this.longBreakSec  = longBreakMin * 60;
    this.totalSessions = sessions;

    this._currentSession = 1;
    this._phase          = PHASE.WORK;
    this._remaining      = this.workSec;
    this._running        = false;
    this._elapsed        = 0;

    // Callbacks
    this.onPhaseChange  = null; // (phase, session) => void
    this.onTick         = null; // (remaining, progress) => void
    this.onDone         = null; // () => void
  }

  get phase()    { return this._phase; }
  get session()  { return this._currentSession; }
  get running()  { return this._running; }
  get remaining(){ return this._remaining; }

  /** 0–1 progress within current phase */
  get progress() {
    const total = this._phaseTotal();
    return total > 0 ? 1 - (this._remaining / total) : 1;
  }

  start() {
    this._running = true;
  }

  pause() {
    this._running = false;
  }

  resume() {
    this._running = true;
  }

  reset() {
    this._currentSession = 1;
    this._phase          = PHASE.WORK;
    this._remaining      = this.workSec;
    this._running        = false;
    this._elapsed        = 0;
  }

  /** Call every animation frame. delta = seconds since last frame. */
  update(delta) {
    if (!this._running || this._phase === PHASE.DONE) return;

    this._remaining -= delta;
    this._elapsed   += delta;

    if (this._remaining <= 0) {
      this._advance();
    }

    if (this.onTick) {
      this.onTick(Math.max(0, this._remaining), this.progress);
    }
  }

  _advance() {
    if (this._phase === PHASE.WORK) {
      // Work session complete → break
      const isLast     = this._currentSession >= this.totalSessions;
      const isLongBreak = (this._currentSession % 4 === 0);

      if (isLast) {
        this._phase = PHASE.DONE;
        this._running = false;
        if (this.onDone) this.onDone();
        return;
      }

      this._phase     = isLongBreak ? PHASE.LONG_BREAK : PHASE.BREAK;
      this._remaining = isLongBreak ? this.longBreakSec : this.breakSec;

    } else {
      // Break complete → next work session
      this._currentSession++;
      this._phase     = PHASE.WORK;
      this._remaining = this.workSec;
    }

    if (this.onPhaseChange) {
      this.onPhaseChange(this._phase, this._currentSession);
    }
  }

  _phaseTotal() {
    switch (this._phase) {
      case PHASE.WORK:       return this.workSec;
      case PHASE.BREAK:      return this.breakSec;
      case PHASE.LONG_BREAK: return this.longBreakSec;
      default: return 1;
    }
  }

  /** Formatted MM:SS string */
  static format(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return [String(m).padStart(2, '0'), String(r).padStart(2, '0')];
  }
}
