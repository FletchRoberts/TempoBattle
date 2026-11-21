// A bot that plays a whole run through the real shop rules and records its board each day.
// Those daily boards seed the PvP opponent pool until real players fill it.
import { INFUSIONS } from '../data/items.js';
import { makeRng } from '../core/rng.js';
import {
  START_GOLD, MAX_DAYS, def, tagsOf, statsOf, adjacent, freeSpots, rollShop, rerollCost,
  upgradeCost, sellValue, income, starterBoard, snapshot, maxHp,
} from '../core/rules.js';
import { simulate } from '../core/sim.js';

const POWER = { common: 1, rare: 1.7, epic: 2.4, legendary: 3.2 };
const isSupport = inst => ['buffAdj', 'amplify'].includes(def(inst).special?.kind);

// How much this bot values an item on this board (no randomness).
export function itemValue(inst, board, arch) {
  const d = def(inst);
  let aff = 0;
  for (const t of tagsOf(inst)) aff = Math.max(aff, arch.tags[t] ?? 0.3);
  let v = POWER[d.rarity] * (1 + 0.6 * (inst.level - 1)) * aff;
  const sp = d.special, others = board.filter(o => o !== inst);
  if (sp?.kind === 'buffAdj' || sp?.kind === 'buffAll') {
    const n = others.filter(o => tagsOf(o).has(sp.tag)).length;
    v *= n ? 0.6 + 0.4 * Math.min(n, 3) : 0.3;
  }
  if (sp?.kind === 'amplify') v *= others.length >= 3 ? 1 : 0.5;
  if (sp?.kind === 'ignite') v *= others.some(o => statsOf(o).burn) ? 1 : 0.2;
  return v;
}

function placementScore(inst, x, y, w, h, placed, arch, rng) {
  const c = { ...inst, x, y, w, h }, sp = def(inst).special;
  let s = -x * 0.05 + rng.next() * 0.3; // slight preference for firing early
  for (const o of placed) {
    if (!adjacent(c, o)) continue;
    const osp = def(o).special;
    if (sp?.kind === 'buffAdj' && tagsOf(o).has(sp.tag)) s += 3 + (o.x > x ? 0.5 : 0); // buff before the target fires
    if (osp?.kind === 'buffAdj' && tagsOf(inst).has(osp.tag)) s += 3;
    if (sp?.kind === 'amplify') s += itemValue(o, placed, arch);
    if (osp?.kind === 'amplify') s += itemValue(inst, placed, arch);
  }
  if (['haste', 'overclock', 'echo'].includes(sp?.kind)) s -= x * 0.5;
  if (sp?.kind === 'rewind') s += x * 0.5;
  return s;
}

// Repack the whole board greedily: big items first, support items last so they can sit next to targets.
export function arrange(board, arch, rng) {
  const order = [...board].sort((a, b) => (isSupport(a) - isSupport(b)) || (b.w * b.h - a.w * a.h));
  const placed = [];
  for (const inst of order) {
    let best = null;
    for (const [w, h] of inst.w === inst.h ? [[inst.w, inst.h]] : [[inst.w, inst.h], [inst.h, inst.w]]) {
      for (const [x, y] of freeSpots(placed, w, h)) {
        const s = placementScore(inst, x, y, w, h, placed, arch, rng);
        if (!best || s > best.s) best = { s, x, y, w, h };
      }
    }
    if (!best) return false; // greedy repack failed, keep the old layout
    placed.push({ ...inst, x: best.x, y: best.y, w: best.w, h: best.h });
  }
  for (const p of placed) Object.assign(board.find(o => o.uid === p.uid), { x: p.x, y: p.y, w: p.w, h: p.h });
  return true;
}

function placeAnywhere(board, inst) {
  for (const [w, h] of [[inst.w, inst.h], [inst.h, inst.w]]) {
    const spot = freeSpots(board, w, h)[0];
    if (spot) { Object.assign(inst, { x: spot[0], y: spot[1], w, h }); board.push(inst); return true; }
  }
  return false;
}

// Try to add a bought item: merge into a twin, place it, or swap out the weakest item.
function acquire(st, inst, value, arch) {
  const twin = st.board.find(o => o.id === inst.id && o.level === inst.level && o.level < 4);
  if (twin) { twin.level++; if (!twin.infusion) twin.infusion = inst.infusion; return true; }
  if (placeAnywhere(st.board, inst)) return true;
  const ranked = [...st.board].sort((a, b) => itemValue(a, st.board, arch) - itemValue(b, st.board, arch));
  for (const weak of ranked.slice(0, 3)) {
    if (value < itemValue(weak, st.board, arch) * 1.3) break;
    const rest = st.board.filter(o => o !== weak);
    if (placeAnywhere(rest, inst)) { st.gold += sellValue(weak); st.board = rest; return true; }
  }
  return false;
}

// Smart shopping: try each possible purchase/upgrade, simulate the resulting board against a
// benchmark sample of that day's teams, and take the best improvement until nothing helps.
function shopDaySimulated(st, day, arch, skill, rng, bench) {
  const hp = maxHp(day);
  const pts = { win: 1, draw: 0.5, loss: 0 };
  const evalBoard = board => bench.reduce((s, opp) => s + pts[simulate(board, opp, hp)], 0) / bench.length;
  const clone = () => ({ gold: st.gold, board: st.board.map(o => ({ ...o })) });
  let cur = evalBoard(st.board);
  for (let rerolls = 0; ; rerolls++) {
    const offers = rollShop(day, rng);
    for (;;) {
      let best = null;
      const consider = (trial, apply) => {
        arrange(trial.board, arch, rng);
        const sc = evalBoard(trial.board) + rng.next() * skill.noise * 0.05;
        if (!best || sc > best.sc) best = { sc, trial, apply };
      };
      for (const o of offers) {
        if (o.sold || o.price > st.gold) continue;
        const trial = clone(); trial.gold -= o.price;
        if (o.kind === 'essence') {
          const targets = trial.board.filter(b => !b.infusion && !def(b).special)
            .sort((a, b) => itemValue(b, trial.board, arch) - itemValue(a, trial.board, arch)).slice(0, 2);
          for (const target of targets) {
            const t2 = { gold: trial.gold, board: trial.board.map(b => b === target ? { ...b, infusion: o.type } : { ...b }) };
            consider(t2, () => { o.sold = true; });
          }
        } else if (acquire(trial, { ...o.inst }, Infinity, arch)) consider(trial, () => { o.sold = true; });
      }
      const upgradable = st.board.filter(it => it.level < 4 && upgradeCost(it) <= st.gold)
        .sort((a, b) => itemValue(b, st.board, arch) - itemValue(a, st.board, arch)).slice(0, 3);
      if (skill.upgrades) for (const it of upgradable) {
        const trial = clone(); const t = trial.board.find(b => b.uid === it.uid);
        trial.gold -= upgradeCost(it); t.level++;
        consider(trial, () => {});
      }
      if (!best || best.sc <= cur + 0.005) break;
      st.gold = best.trial.gold; st.board = best.trial.board; cur = best.sc; best.apply();
    }
    if (rerolls >= skill.rerolls || st.gold < rerollCost(rerolls) + 3) break;
    st.gold -= rerollCost(rerolls);
  }
}

function shopDay(st, day, arch, skill, rng) {
  for (let rerolls = 0; ; rerolls++) {
    const offers = rollShop(day, rng).map(o => {
      if (o.kind === 'essence') return { o, s: (arch.tags[INFUSIONS[o.type].tag] ?? 0.3) * 1.5 + rng.next() * skill.noise };
      const twin = st.board.some(b => b.id === o.inst.id && b.level === o.inst.level && b.level < 4);
      return { o, s: itemValue(o.inst, st.board, arch) + (twin ? 1.5 : 0) + rng.next() * skill.noise };
    }).sort((a, b) => b.s - a.s);

    for (const { o, s } of offers) {
      if (o.price > st.gold || s < 0.8) continue;
      if (o.kind === 'essence') {
        const target = st.board.filter(b => !b.infusion && !def(b).special)
          .sort((a, b) => itemValue(b, st.board, arch) - itemValue(a, st.board, arch))[0];
        if (target) { target.infusion = o.type; st.gold -= o.price; }
        continue;
      }
      if (acquire(st, o.inst, s, arch)) st.gold -= o.price;
    }
    if (rerolls >= skill.rerolls || st.gold < rerollCost(rerolls) + 3) break;
    st.gold -= rerollCost(rerolls);
  }
  if (skill.upgrades) {
    for (;;) {
      const options = st.board.filter(o => o.level < 4 && upgradeCost(o) <= st.gold)
        .sort((a, b) => itemValue(b, st.board, arch) - itemValue(a, st.board, arch));
      if (!options.length) break;
      st.gold -= upgradeCost(options[0]); options[0].level++;
    }
  }
}

// Play a full run. Returns one board snapshot per day (index 0 = day 1).
// `bench(day)` (optional) returns opponent boards for simulated shopping; used when skill.lookahead > 0.
export function draftRun({ arch, skill, seed, days = MAX_DAYS, bench = null }) {
  const rng = makeRng(seed);
  const st = { gold: START_GOLD, board: starterBoard() };
  const snaps = [];
  for (let day = 1; day <= days; day++) {
    if (day > 1) st.gold += income(day - 1, rng.chance(0.5));
    const b = skill.lookahead && bench ? bench(day) : null;
    if (b && b.length) shopDaySimulated(st, day, arch, skill, rng, b);
    else shopDay(st, day, arch, skill, rng);
    arrange(st.board, arch, rng);
    snaps.push(snapshot(st.board));
  }
  return snaps;
}
