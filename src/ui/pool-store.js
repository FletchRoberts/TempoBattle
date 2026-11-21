// Where opponents come from. Today: the bundled bot pool plus boards saved in this browser.
// Later: swap this class for one that talks to a server; the game only uses field/pick/submit.
import { pickOpponent, rateAgainst, buildPool } from '../bots/pool.js';

const KEY = 'tempoforge.submissions.v3'; // v3: 3 x 5 board
const MAX_LOCAL = 300;

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };

export class PoolStore {
  constructor(pool) {
    this.pool = pool;
    this.local = load();
    this.maxDay = Math.max(...Object.keys(pool.days).map(Number));
  }
  dayKey(day) { return Math.min(day, this.maxDay); }
  base(day) { return this.pool.days[this.dayKey(day)] || []; }
  field(day) { return [...this.base(day), ...this.local.filter(t => t.day === this.dayKey(day))]; }

  // Opponent inside the 40–60% band, never your own run's boards or someone you already fought this run.
  pick(day, rng, { runId, faced }) {
    return pickOpponent(this.field(day), { rng, exclude: t => t.runId === runId || faced.has(t.id) });
  }

  // Rate a player's board against the day's field and add it to the pool for future runs.
  submit({ runId, day, name, items, artifacts = {} }) {
    const wr = rateAgainst(items, this.base(day), day, artifacts);
    const team = { id: `local-${runId}-d${day}`, runId, day: this.dayKey(day), name, source: 'player', items, artifacts, wr };
    this.local = [...this.local.filter(t => t.id !== team.id), team].slice(-MAX_LOCAL);
    save(this.local);
    return team;
  }
}

export async function loadPoolStore() {
  try {
    const res = await fetch('data/pool.json');
    if (!res.ok) throw new Error(res.status);
    return new PoolStore(await res.json());
  } catch {
    // No bundled pool (e.g. it hasn't been built yet): make a quick one in the browser.
    return new PoolStore(buildPool({ seedsPerCombo: 1, smart: false }));
  }
}
