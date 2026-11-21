// A bot that plays a whole run through the real shop rules and records its board each day.
// Those daily boards seed the PvP opponent pool until real players fill it.
import { MODIFIERS } from '../data/items.js';
import { makeRng } from '../core/rng.js';
import {
  START_GOLD, MAX_DAYS, def, tagsOf, statsOf, adjacent, freeSpots, rollShop, rerollCost,
  canMerge, mergeInto, sellValue, income, starterBoard, snapshot, maxHp, canApplyMod, applyMod, rollInfusion,
} from '../core/rules.js';
import { simulate } from '../core/sim.js';

const POWER = { common: 1, rare: 1.7, epic: 2.4, legendary: 3.2 };
const isSupport = inst => ['buffAdj', 'amplify'].includes(def(inst).special?.kind);

// How much this bot values an item on this board (no randomness).
export function itemValue(inst, board, arch) {
  const d = def(inst);
  let aff = 0;
  for (const t of tagsOf(inst)) aff = Math.max(aff, arch.tags[t] ?? 0.3);
  let v = (POWER[d.rarity] * (1 + 0.6 * (inst.level - 1)) * aff + 0.4 * (inst.mods?.length || 0)) * (inst.multicast || 1);
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
  const twin = st.board.find(o => canMerge(o, inst));
  if (twin) {
    mergeInto(twin, inst);
    for (let o; (o = st.board.find(x => canMerge(x, twin)));) { mergeInto(twin, o); st.board.splice(st.board.indexOf(o), 1); }
    return true;
  }
  if (placeAnywhere(st.board, inst)) return true;
  const ranked = [...st.board].sort((a, b) => itemValue(a, st.board, arch) - itemValue(b, st.board, arch));
  for (const weak of ranked.slice(0, 3)) {
    if (value < itemValue(weak, st.board, arch) * 1.3) break;
    const rest = st.board.filter(o => o !== weak);
    if (placeAnywhere(rest, inst)) { st.gold += sellValue(weak); st.board = rest; return true; }
  }
  return false;
}

const copyItem = o => ({ ...o, mods: [...(o.mods || [])] });
const byValue = (board, arch) => (a, b) => itemValue(b, board, arch) - itemValue(a, board, arch);

// Items a modifier could go on, best first (prefers items that already use that stat).
function modTargets(board, modId, arch) {
  const m = MODIFIERS[modId];
  return board.filter(b => !canApplyMod(b, modId))
    .sort((a, b) => ((m.stat && statsOf(b)[m.stat] ? 1 : 0) - (m.stat && statsOf(a)[m.stat] ? 1 : 0)) || byValue(board, arch)(a, b));
}
const modAppeal = (modId, arch) => MODIFIERS[modId].multicast ? 3 : (arch.tags[MODIFIERS[modId].tag] ?? 0.3) * 1.2;
// Wild Essence: the outcome is random, so bots decide on gut feel and only then see the roll.
function useWildEssence(board, arch, rng) {
  const target = board.filter(b => !b.infusion && !def(b).special).sort(byValue(board, arch))[0];
  if (target) target.infusion = rollInfusion(rng);
  return !!target;
}

// Smart shopping: try each possible purchase, simulate the resulting board against a
// benchmark sample of that day's teams, and take the best improvement until nothing helps.
function shopDaySimulated(st, day, arch, skill, rng, bench) {
  const hp = maxHp(day);
  const pts = { win: 1, draw: 0.5, loss: 0 };
  const evalBoard = board => bench.reduce((s, opp) => s + pts[simulate(board, opp, hp)], 0) / bench.length;
  const clone = () => ({ gold: st.gold, board: st.board.map(copyItem) });
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
        if (o.kind === 'essence') continue; // random outcome: handled after the simulated buys
        if (o.kind === 'mod') {
          for (const target of modTargets(trial.board, o.id, arch).slice(0, 2)) {
            const t2 = { gold: trial.gold, board: trial.board.map(copyItem) };
            applyMod(t2.board[trial.board.indexOf(target)], o.id);
            consider(t2, () => { o.sold = true; });
          }
        } else if (acquire(trial, copyItem(o.inst), Infinity, arch)) consider(trial, () => { o.sold = true; });
      }
      if (!best || best.sc <= cur + 0.005) break;
      st.gold = best.trial.gold; st.board = best.trial.board; cur = best.sc; best.apply();
    }
    const wild = offers.find(o => o.kind === 'essence' && !o.sold);
    if (wild && st.gold >= wild.price + 3 && rng.chance(0.6) && useWildEssence(st.board, arch, rng)) {
      st.gold -= wild.price; wild.sold = true; cur = evalBoard(st.board);
    }
    if (rerolls >= skill.rerolls || st.gold < rerollCost(rerolls) + 3) break;
    st.gold -= rerollCost(rerolls);
  }
}

function shopDay(st, day, arch, skill, rng) {
  for (let rerolls = 0; ; rerolls++) {
    const offers = rollShop(day, rng).map(o => {
      if (o.kind === 'essence') return { o, s: 1 + rng.next() * skill.noise };
      if (o.kind === 'mod') return { o, s: modAppeal(o.id, arch) + rng.next() * skill.noise };
      const twin = st.board.some(b => canMerge(b, o.inst));
      return { o, s: itemValue(o.inst, st.board, arch) + (twin ? 1.5 : 0) + rng.next() * skill.noise };
    }).sort((a, b) => b.s - a.s);

    for (const { o, s } of offers) {
      if (o.price > st.gold || s < 0.8) continue;
      if (o.kind === 'essence') { if (useWildEssence(st.board, arch, rng)) st.gold -= o.price; continue; }
      if (o.kind === 'mod') {
        const target = modTargets(st.board, o.id, arch)[0];
        if (target) { applyMod(target, o.id); st.gold -= o.price; }
        continue;
      }
      if (acquire(st, o.inst, s, arch)) st.gold -= o.price;
    }
    if (rerolls >= skill.rerolls || st.gold < rerollCost(rerolls) + 3) break;
    st.gold -= rerollCost(rerolls);
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
