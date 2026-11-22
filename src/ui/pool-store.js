// Where opponents come from: the bundled bot pool, boards saved in this browser, and (on the
// published page) boards every player shares through the artifact's database. Later this class can
// talk to a real server instead; the game only uses prefetch/field/pick/submit.
import { pickOpponent, rateAgainst, buildPool } from '../bots/pool.js';
import { ITEMS } from '../data/items.js';
import { SKILLS } from '../data/skills.js';

const KEY = 'tempoforge.submissions.v5'; // v5: leveled skills, shop bonuses, run context
const MAX_LOCAL = 300;
const SHARED_PER_DAY = 200; // newest shared boards read per day

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };

// Shared boards come from other players: keep only well-formed items and skills we know.
const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
function cleanTeam(raw, day) {
  let list = raw?.items;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { return null; } }
  if (!Array.isArray(list)) return null;
  const items = list.filter(it => Array.isArray(it) && ITEMS[it[0]]).slice(0, 15).map(it =>
    [it[0], num(it[1], 1, 5, 1), num(it[2], 0, 4, 0), num(it[3], 0, 2, 0), num(it[4], 1, 3, 1), num(it[5], 1, 3, 1),
     typeof it[6] === 'string' ? it[6] : 0, num(it[7], 1, 6, 1), Array.isArray(it[8]) ? it[8].filter(m => typeof m === 'string') : 0,
     it[9] && typeof it[9] === 'object' ? Object.fromEntries(Object.entries(it[9]).filter(([k, v]) => typeof k === 'string' && Number.isFinite(+v)).map(([k, v]) => [k, num(v, 0, 1e6, 0)])) : 0]);
  if (!items.length) return null;
  const skills = (Array.isArray(raw.skills) ? raw.skills : []).filter(id => typeof id === 'string' && SKILLS[id]).slice(0, 60);
  const c = raw.ctx && typeof raw.ctx === 'object' ? raw.ctx : {};
  const ctx = { day, wins: num(c.wins, 0, 999, 0), livesLost: num(c.livesLost, 0, 20, 0), lives: num(c.lives, 0, 10, 10), gold: num(c.gold, 0, 999, 0), streak: num(c.streak, 0, 20, 0) };
  return { id: String(raw.id || '').slice(0, 80), runId: String(raw.runId || '').slice(0, 40), day, name: String(raw.name || 'Player').slice(0, 24),
    source: 'player', items, skills, ctx, wr: num(raw.wr, 0, 1, 0.5) };
}

export class PoolStore {
  constructor(pool) {
    this.pool = pool;
    this.local = load();
    this.shared = {}; // day -> [team] (absent = not fetched yet)
    this.maxDay = Math.max(...Object.keys(pool.days).map(Number));
    this.db = null;
    // The shared database exists only on the published page; elsewhere this stays null.
    window.claude?.use?.('db').then(db => { this.db = db; this.onShared?.(); }).catch(() => {});
  }
  // Bots cover days 1..maxDay. Past that (Endless mode) only boards players saved on that day exist.
  base(day) { return this.pool.days[day] || []; }
  // What a board is rated against: that day's bots, or the last bot day once past them.
  ratingField(day) { return this.pool.days[Math.min(day, this.maxDay)] || []; }
  field(day) {
    const ids = new Set(this.local.map(t => t.id));
    return [...this.base(day), ...this.local.filter(t => t.day === day), ...(this.shared[day] || []).filter(t => !ids.has(t.id))];
  }
  fetched(day) { return !this.db || day in this.shared; }
  hasDb() { return !!this.db; }
  sharedCount(day) { return (this.shared[day] || []).length; }
  col(day) { return this.db.collection(`days/d${day}/boards`); }

  // Read a day's shared boards ahead of the fight (newest first). Quietly does nothing without a db.
  async prefetch(day) {
    if (!this.db) return;
    try {
      const snap = await this.col(day).orderBy('at', 'desc').limit(SHARED_PER_DAY).get();
      this.shared[day] = snap.docs.map(d => cleanTeam(d.data(), day)).filter(Boolean);
    } catch { this.shared[day] ||= []; /* offline or not allowed: bots and local boards still work */ }
  }

  // An opponent inside your matchmaking band, never your own run's boards or someone you already fought this run.
  pick(day, rng, { runId, faced, band }) {
    return pickOpponent(this.field(day), { rng, band, exclude: t => t.runId === runId || faced.has(t.id) });
  }

  // Rate a player's board against the day's bot field and add it to the pool for future runs:
  // in this browser, and shared with every player when the database is available.
  // team.saved resolves 'shared' | 'local' (no database here) | 'failed'.
  submit({ runId, day, name, items, skills = [], ctx = {} }) {
    const wr = rateAgainst(items, this.ratingField(day), day, skills, ctx);
    const team = { id: `p-${runId}-d${day}`, runId, day, name, source: 'player', items, skills, ctx, wr };
    this.local = [...this.local.filter(t => t.id !== team.id), team].slice(-MAX_LOCAL);
    save(this.local);
    team.saved = !this.db ? Promise.resolve('local')
      // The board travels as JSON text so each document stays a flat, simple record.
      : this.col(day).doc(`${runId}`).set({ ...team, items: JSON.stringify(items), at: Date.now() })
        .then(() => { (this.shared[day] ||= []); return 'shared'; }, () => 'failed');
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
