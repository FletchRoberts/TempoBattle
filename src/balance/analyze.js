// Balance analysis: how often items are picked, how much they actually add, and what to change.
//
// Two separate questions per item:
//   pick rate  = bought / offered. Corrects for rarity: a Legendary isn't "unused" just because
//                it's rarely offered.
//   impact     = ablation. Take real boards that contain the item, remove that one copy, re-fight
//                the same opponents. The drop in win rate is what the item contributes.
//   value/gold = impact / gold cost (price of the item's current rarity tier), relative to the average item on the same
//                day (1.0 = average), so early-game and late-game items compare fairly.
//
// Suggestions move outliers toward their rarity tier's MEDIAN value per gold, never above it,
// so balancing lifts the bottom and trims the top without power creep.
import { ITEMS, RARITY } from '../data/items.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { maxHp, fromSnapshot, RARITIES } from '../core/rules.js';
import { duel, Battle, Fighter, OVERTIME } from '../core/sim.js';
import { makeRng } from '../core/rng.js';
import { goldPerFight } from '../bots/drafter.js';
import { newInst } from '../core/rules.js';

const median = xs => { const a = xs.filter(Number.isFinite).sort((p, q) => p - q); return a.length ? a[a.length >> 1] : NaN; };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
// Standard error of the mean: how much the average would wobble if we re-sampled.
const stderr = xs => { if (xs.length < 2) return NaN; const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) / xs.length); };

// Ablation impact for every item that appears in the pool.
export function itemImpact(pool, { samples = 24, opps = 10, seed = 1, onProgress = () => {} } = {}) {
  const rng = makeRng(seed);
  const days = Object.keys(pool.days).map(Number);
  const oppsByDay = {};
  for (const d of days) oppsByDay[d] = rng.shuffle([...pool.days[d]]).slice(0, opps)
    .map(t => ({ id: t.id, items: fromSnapshot(t.items), artifacts: t.artifacts || {} }));
  const rate = (team, snap, day) => {
    const hp = maxHp(day), me = fromSnapshot(snap);
    let s = 0, n = 0;
    for (const o of oppsByDay[day]) { if (o.id === team.id) continue; s += duel(me, o.items, hp, team.artifacts || {}, o.artifacts); n++; }
    return n ? s / n : 0.5;
  };
  const baseCache = new Map();
  const base = (team, day) => { if (!baseCache.has(team.id)) baseCache.set(team.id, rate(team, team.items, day)); return baseCache.get(team.id); };

  const occ = {};
  for (const d of days) for (const t of pool.days[d]) t.items.forEach((it, idx) => (occ[it[0]] ||= []).push({ d, t, idx }));
  const raw = {};
  const ids = Object.keys(occ);
  ids.forEach((id, n) => {
    raw[id] = rng.shuffle([...occ[id]]).slice(0, samples).map(({ d, t, idx }) => {
      const delta = base(t, d) - rate(t, t.items.filter((_, j) => j !== idx), d);
      const it = t.items[idx];
      return { d, delta, gold: RARITY[RARITIES[Math.min(4, RARITIES.indexOf(ITEMS[id].rarity) + it[1] - 1)]].price, cells: it[4] * it[5] };
    });
    onProgress(n + 1, ids.length);
  });
  // Normalise by day: an item on a 3-item Day 1 board matters more than one on a full Day 15 board.
  // rel* = this sample / the average sample on the same day, so 1.0 = an average item for that day.
  const dayAvg = {};
  for (const smp of Object.values(raw).flat()) {
    const a = (dayAvg[smp.d] ||= { g: [], c: [] }); a.g.push(smp.delta / smp.gold); a.c.push(smp.delta / smp.cells);
  }
  for (const a of Object.values(dayAvg)) { a.g = Math.max(1e-4, mean(a.g)); a.c = Math.max(1e-4, mean(a.c)); }
  const out = {};
  for (const [id, smps] of Object.entries(raw)) out[id] = {
    samples: smps.length, impact: mean(smps.map(x => x.delta)),
    vpg: mean(smps.map(x => x.delta / x.gold / dayAvg[x.d].g)),   // relative value per gold
    se: stderr(smps.map(x => x.delta / x.gold / dayAvg[x.d].g)),
    vpc: mean(smps.map(x => x.delta / x.cells / dayAvg[x.d].c)),  // relative value per grid cell
  };
  return out;
}

// Full report: usage, impact, flags, suggestions, power index, bot diversity.
export function analyze(pool, telemetry, impact) {
  const teams = Object.values(pool.days).flat();
  const presence = {}, wrWith = {};
  for (const t of teams) for (const id of new Set(t.items.map(i => i[0]))) {
    presence[id] = (presence[id] || 0) + 1; (wrWith[id] ||= []).push(t.wr);
  }
  const rows = Object.entries(ITEMS).map(([id, d]) => {
    const offered = telemetry.offered[id] || 0, bought = telemetry.bought[id] || 0, im = impact[id] || {};
    const econ = !!(d.gold || d.effects?.gold || d.map); // value comes from gold / artifacts, not fights
    const cats = d.cats || [];
    const positional = !!(d.aura?.scope || ['buffAdj', 'buffRow', 'buffCol', 'amplify'].includes(d.special?.kind) || d.on?.scope === 'adjacent');
    const gpf = econ ? goldPerFight(newInst(id)) : 0; // level I estimate
    return { id, name: d.name, rarity: d.rarity, offered, bought, pickRate: offered ? bought / offered : NaN,
      presence: (presence[id] || 0) / teams.length, wrWith: mean(wrWith[id] || []),
      samples: im.samples || 0, impact: im.impact ?? NaN, vpg: im.vpg ?? NaN, se: im.se ?? NaN, vpc: im.vpc ?? NaN,
      econ, positional, cats, goldPerFight: gpf, payback: econ && gpf > 0 ? RARITY[d.rarity].price / gpf : NaN };
  });

  // Tier benchmarks (only items with enough data count).
  const tiers = {};
  for (const r of RARITIES) {
    const inTier = rows.filter(x => x.rarity === r);
    tiers[r] = {
      medVpg: median(inTier.filter(x => x.samples >= 5 && !x.econ).map(x => x.vpg)),
      medVpc: median(inTier.filter(x => x.samples >= 5 && !x.econ).map(x => x.vpc)),
      medPick: median(inTier.filter(x => x.offered >= 30).map(x => x.pickRate)),
      // power index: presence-weighted average value per gold of the tier
      power: (() => { const w = inTier.filter(x => x.samples >= 5 && !x.econ); const tot = w.reduce((a, x) => a + x.presence, 0);
        return tot ? w.reduce((a, x) => a + x.vpg * x.presence, 0) / tot : NaN; })(),
    };
  }
  for (const x of rows) {
    const t = tiers[x.rarity], flags = [];
    if (x.econ) { // gold items: judge by how fast they pay for themselves, not by fight impact
      if (x.payback > 6) flags.push('slow-payback'); else if (x.payback < 2.5) flags.push('fast-payback');
    } else if (x.samples < 5) flags.push('few-samples');
    // Flag only when clearly outside the tier's middle even allowing for noise (2 standard errors).
    else if (x.vpg > 1.5 * t.medVpg && x.vpg - 2 * x.se > t.medVpg) flags.push('strong');
    else if (x.vpg < 0.6 * t.medVpg && x.vpg + 2 * x.se < t.medVpg) flags.push('weak');
    if (x.offered >= 30 && x.pickRate < 0.5 * t.medPick) flags.push('underused');
    if (x.offered >= 30 && x.pickRate > 1.8 * t.medPick) flags.push('overpicked');
    x.flags = flags;
    // Suggested multiplier on the item's numbers: toward the tier median, clamped, rounded to 5%.
    let scale = 1, note = '';
    if (flags.includes('strong') || flags.includes('weak')) {
      scale = Math.round(Math.min(1.35, Math.max(0.75, t.medVpg / x.vpg)) * 20) / 20;
      if (!Number.isFinite(scale) || x.vpg <= 0) scale = 1.35;
    }
    if (flags.includes('slow-payback') || flags.includes('fast-payback'))
      scale = Math.round(Math.min(1.35, Math.max(0.75, x.payback / 4)) * 20) / 20; // aim for ~4 fights to pay back
    if (flags.includes('underused') && !flags.includes('weak') && !flags.includes('strong'))
      note = 'Performs fine when used but bots skip it: make its value easier to get (simpler condition, cheaper, or a rework) rather than bigger numbers.';
    else if (flags.includes('weak') && flags.includes('underused')) note = 'Weak and skipped: buff its numbers, or rework how it works.';
    else if (flags.includes('weak') && x.positional) note = 'Depends on placement: check how bots place it before buffing numbers.';
    else if (flags.includes('weak')) note = 'Gets picked but adds little: buff its numbers.';
    else if (x.econ && !Number.isFinite(x.payback)) note = 'Pays off in artifacts, not gold or fight power.';
    else if (flags.includes('slow-payback')) note = `Takes ~${x.payback.toFixed(1)} fights to earn its price back: raise its gold.`;
    else if (flags.includes('fast-payback')) note = `Pays for itself in ~${x.payback.toFixed(1)} fights: trim its gold.`;
    else if (flags.includes('strong')) note = 'Adds more than its price: trim its numbers.';
    x.suggestScale = scale; x.note = note;
  }
  const overall = (() => { const w = rows.filter(x => x.samples >= 5 && !x.econ); const tot = w.reduce((a, x) => a + x.presence, 0);
    return tot ? w.reduce((a, x) => a + x.vpg * x.presence, 0) / tot : NaN; })();

  // Bot diversity: are some skills converging on a few items (over-optimised)?
  const bySkill = {};
  for (const t of teams) {
    const s = (bySkill[t.skill] ||= { teams: 0, counts: {} });
    s.teams++; for (const it of t.items) s.counts[it[0]] = (s.counts[it[0]] || 0) + 1;
  }
  const diversity = Object.fromEntries(Object.entries(bySkill).map(([skill, s]) => {
    const sorted = Object.values(s.counts).sort((a, b) => b - a), total = sorted.reduce((a, b) => a + b, 0);
    let acc = 0, n80 = 0; for (const c of sorted) { if (acc >= 0.8 * total) break; acc += c; n80++; }
    return [skill, { distinct: sorted.length, itemsFor80pct: n80, top5Share: sorted.slice(0, 5).reduce((a, b) => a + b, 0) / total }];
  }));

  const artifacts = Object.entries(ARTIFACTS).map(([id, a]) => {
    const off = telemetry.artOffered[id] || 0, got = telemetry.artPicked[id] || 0;
    return { id, name: a.name, offered: off, picked: got, pickRate: off ? got / off : NaN };
  });
  // By category: average value per gold of the (non-economy) items in each, so whole families can be tuned.
  const byCat = {};
  for (const x of rows) if (x.samples >= 5 && !x.econ) for (const c of x.cats) (byCat[c] ||= []).push(x);
  const categories = Object.fromEntries(Object.entries(byCat).map(([c, xs]) => [c, {
    items: xs.length, vpg: xs.reduce((a, x) => a + x.vpg, 0) / xs.length,
    pick: xs.reduce((a, x) => a + (Number.isFinite(x.pickRate) ? x.pickRate : 0), 0) / xs.length,
    strong: xs.filter(x => x.flags.includes('strong')).length, weak: xs.filter(x => x.flags.includes('weak')).length }]));
  return { generated: new Date().toISOString(), teams: teams.length, rows, tiers, powerIndex: overall, diversity, artifacts, categories };
}

// How long fights last on each day: median and spread, and how often they reach the storm.
export function fightLengths(pool, { pairs = 40, seed = 5 } = {}) {
  const rng = makeRng(seed), out = {};
  for (const [day, teams] of Object.entries(pool.days)) {
    const ts = [];
    for (let k = 0; k < pairs; k++) {
      const a = rng.pick(teams), b = rng.pick(teams); if (a === b) continue;
      const B = new Battle(new Fighter('a', fromSnapshot(a.items), maxHp(+day), a.artifacts || {}), new Fighter('b', fromSnapshot(b.items), maxHp(+day), b.artifacts || {}));
      while (!B.done) B.step();
      ts.push(B.t);
    }
    ts.sort((x, y) => x - y);
    out[day] = { median: ts[ts.length >> 1], p10: ts[Math.floor(ts.length * 0.1)], p90: ts[Math.floor(ts.length * 0.9)],
      storm: ts.filter(t => t > OVERTIME).length / ts.length, hp: maxHp(+day) };
  }
  return out;
}

// Compare two reports (e.g. after a change against the saved baseline).
export function diffReports(cur, base) {
  if (!base) return null;
  const b = Object.fromEntries(base.rows.map(r => [r.id, r]));
  const items = cur.rows.map(r => ({ id: r.id, dVpg: r.vpg - (b[r.id]?.vpg ?? NaN), dPick: r.pickRate - (b[r.id]?.pickRate ?? NaN) }));
  const tiers = Object.fromEntries(Object.keys(cur.tiers).map(t => [t, (cur.tiers[t].power - base.tiers[t]?.power) / Math.abs(base.tiers[t]?.power || NaN)]));
  return { powerChange: (cur.powerIndex - base.powerIndex) / Math.abs(base.powerIndex), tiers, items };
}

// ---------- Trying changes without editing files ----------
// --set crossbow.effects.damage=3,4,6,8   or   --set artifact:fury.v=0.1,0.15,0.2,0.25
export function applySet(expr) {
  const [path, raw] = expr.split('=');
  const isArt = path.startsWith('artifact:');
  const parts = (isArt ? path.slice(9) : path).split('.');
  let obj = isArt ? ARTIFACTS : ITEMS;
  for (const k of parts.slice(0, -1)) { obj[k] ??= {}; obj = obj[k]; }
  const val = raw.includes(',') ? raw.split(',').map(Number) : Number.isNaN(Number(raw)) ? raw : Number(raw);
  obj[parts.at(-1)] = val;
}
// --scale crossbow=1.2 multiplies every per-level number the item has (effects, start, on, special, aura, gold).
export function scaleItem(id, f) {
  const d = ITEMS[id]; if (!d) throw new Error(`Unknown item ${id}`);
  const isInt = arr => arr.every(Number.isInteger);
  const sc = arr => isInt(arr) ? arr.map(v => Math.max(1, Math.round(v * f))) : arr.map(v => Math.round(v * f * 100) / 100);
  const each = o => { if (o) for (const k of Object.keys(o)) if (Array.isArray(o[k]) && o[k].length === 4) o[k] = sc(o[k]); };
  each(d.effects); each(d.start?.effects); each(d.on?.effects);
  if (d.special?.v) d.special.v = sc(d.special.v);
  if (d.start?.special?.v) d.start.special.v = sc(d.start.special.v);
  if (d.aura?.v) d.aura.v = sc(d.aura.v);
  if (d.gold?.v) d.gold.v = sc(d.gold.v);
}
