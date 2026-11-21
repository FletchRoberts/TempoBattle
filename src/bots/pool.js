// Opponent pool: build it from bots, rate every team per day, and pick fair matchups.
import { makeRng } from '../core/rng.js';
import { MAX_DAYS, maxHp, fromSnapshot } from '../core/rules.js';
import { duel } from '../core/sim.js';
import { draftRun } from './drafter.js';
import { ARCHETYPES, SKILLS, botName } from './archetypes.js';

export const MATCH_BAND = [0.4, 0.6];

// One bot per archetype × skill × seed. Each bot contributes one team to every day.
// smart=false skips the slower simulation-guided redraft (used for the in-browser fallback).
export function buildPool({ seedsPerCombo = 2, baseSeed = 1, days = MAX_DAYS, smart = true, onProgress = () => {} } = {}) {
  const rng = makeRng(baseSeed);
  const bots = [];
  let n = 0;
  // Pass 1: every bot drafts on gut feel.
  for (const archId of Object.keys(ARCHETYPES)) for (const skillId of Object.keys(SKILLS)) for (let s = 0; s < seedsPerCombo; s++) {
    const seed = baseSeed * 100003 + n++;
    bots.push({ id: `bot-${archId}-${skillId}-${s}`, name: botName(rng), arch: archId, skill: skillId, seed,
      snaps: draftRun({ arch: ARCHETYPES[archId], skill: { ...SKILLS[skillId], lookahead: 0 }, seed, days }) });
  }
  // Pass 2: bots with lookahead redraft, testing each buy against a sample of the pass-1 field for that day.
  const benchCache = {};
  for (const b of bots) {
    const skill = SKILLS[b.skill];
    if (!smart || !skill.lookahead) continue;
    const bench = day => (benchCache[`${day}:${skill.lookahead}`] ||=
      makeRng(day * 7919 + skill.lookahead).shuffle(bots.map(o => o.snaps[day - 1])).slice(0, skill.lookahead).map(fromSnapshot));
    b.snaps = draftRun({ arch: ARCHETYPES[b.arch], skill, seed: b.seed, days, bench });
    onProgress(0, days);
  }
  const pool = { version: 1, generated: new Date().toISOString(), band: MATCH_BAND, days: {} };
  for (let day = 1; day <= days; day++) {
    const teams = bots.map(b => ({ id: `${b.id}-d${day}`, name: b.name, arch: b.arch, skill: b.skill, source: 'bot', items: b.snaps[day - 1] }));
    rateField(teams, day);
    pool.days[day] = teams;
    onProgress(day, days);
  }
  return pool;
}

// Round robin: every team fights every other team from both seats. Sets team.wr (0..1).
export function rateField(teams, day) {
  const hp = maxHp(day), boards = teams.map(t => fromSnapshot(t.items));
  const score = new Array(teams.length).fill(0);
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const s = duel(boards[i], boards[j], hp, teams[i].artifacts, teams[j].artifacts);
    score[i] += s; score[j] += 1 - s;
  }
  teams.forEach((t, i) => { t.wr = +(score[i] / Math.max(1, teams.length - 1)).toFixed(3); });
  return teams;
}

// Rate one new board (e.g. a player's) against an existing field without re-rating the field.
export function rateAgainst(items, field, day, artifacts = {}) {
  const hp = maxHp(day), me = fromSnapshot(items);
  let s = 0;
  for (const t of field) s += duel(me, fromSnapshot(t.items), hp, artifacts, t.artifacts);
  return +(s / Math.max(1, field.length)).toFixed(3);
}

// Pick an opponent whose rating is inside the band, widening it if too few teams qualify.
export function pickOpponent(field, { rng, band = MATCH_BAND, exclude = () => false }) {
  const usable = field.filter(t => !exclude(t));
  if (!usable.length) return null;
  let [lo, hi] = band;
  for (let i = 0; i < 6; i++) {
    const c = usable.filter(t => t.wr >= lo && t.wr <= hi);
    if (c.length >= 3 || (i === 5 && c.length)) return rng.pick(c);
    lo -= 0.05; hi += 0.05;
  }
  return rng.pick(usable);
}

// Summary used by the pool tool to check that the field is healthy.
export function poolReport(pool) {
  const lines = [];
  const byArch = {};
  for (const [day, teams] of Object.entries(pool.days)) {
    const wrs = teams.map(t => t.wr).sort((a, b) => a - b);
    const inBand = teams.filter(t => t.wr >= pool.band[0] && t.wr <= pool.band[1]).length;
    lines.push(`day ${String(day).padStart(2)}  teams ${teams.length}  in-band ${String(inBand).padStart(3)}  ` +
      `min ${wrs[0].toFixed(2)}  median ${wrs[wrs.length >> 1].toFixed(2)}  max ${wrs[wrs.length - 1].toFixed(2)}`);
    for (const t of teams) (byArch[`${t.arch}/${t.skill}`] ||= []).push(t.wr);
  }
  lines.push('', 'average win rate by archetype/skill across all days:');
  const rows = Object.entries(byArch).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of rows) lines.push(`  ${k.padEnd(20)} ${(v * 100).toFixed(1)}%`);
  return lines.join('\n');
}
