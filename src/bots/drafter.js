// A bot that plays a whole run through the real shop rules and records its board each day.
// Those daily boards seed the PvP opponent pool until real players fill it.
import { MODIFIERS, SHOP_TOKENS } from '../data/items.js';
import { SKILLS, skillEffects, skillsOfRarity } from '../data/skills.js';
import { makeRng } from '../core/rng.js';
import {
  START_GOLD, MAX_DAYS, def, tagsOf, statsOf, adjacent, inScope, freeSpots, rollShop, rerollCost,
  canMerge, mergeInto, sellValue, starterBoard, snapshot, maxHp, canApplyMod, applyMod, rollInfusion,
  afterFightGold, shopRank, offerPrice, couponTargets, tierOf, isActive, chargeCost, CHARGE_DEFAULT, hasCat,
} from '../core/rules.js';
import { simulate } from '../core/sim.js';
import { tel, telShop } from '../balance/telemetry.js';

const POWER = { common: 1, uncommon: 1.35, rare: 1.75, superrare: 2.4, legendary: 3.2 };
// Items whose value depends on what sits next to / in line with them get placed last.
const isSupport = inst => {
  const d = def(inst);
  return ['buffAdj', 'amplify', 'buffRow', 'buffCol', 'charge'].includes(d.special?.kind) || d.start?.special?.kind === 'charge'
    || !!d.aura?.scope || d.on?.scope === 'adjacent';
};

// ---------- Economy ----------
let curDay = 1; // set by draftRun each day; used for how much money matters
const econWeight = day => Math.max(0, (9 - day) / 9); // gold matters early, barely at the end
// Rough gold an item makes per fight (trigger gold assumes ~3 activations).
export function goldPerFight(inst) {
  const d = def(inst), L = inst.level - 1;
  let g = 0;
  if (d.gold) g += d.gold.grow ? d.gold.v[L] / 2 : d.gold.v[L] * (d.gold.when === 'win' ? 0.5 : 1);
  const tg = statsOf(inst).gold; if (tg) g += tg * (inst.multicast || 1) * 3;
  return g;
}
const boardGold = board => board.reduce((a, o) => a + goldPerFight(o), 0);
const estBattleGold = board => board.reduce((a, o) => a + (statsOf(o).gold || 0) * (o.multicast || 1) * 3, 0);

// Does `src`'s row/column aura or buff reach `tgt` usefully?
function scopeHelps(src, tgt) {
  const d = def(src), a = d.aura, sp = d.special;
  if (a?.scope && inScope(a.scope, src, tgt)) {
    if (a.multicast) return true;
    if ((!a.tag || tagsOf(tgt).has(a.tag)) && statsOf(tgt)[a.stat]) return true;
  }
  if (sp && (sp.kind === 'buffRow' || sp.kind === 'buffCol') && inScope(sp.kind === 'buffRow' ? 'row' : 'column', src, tgt) && statsOf(tgt)[sp.stat]) return true;
  // charge givers help any item that charges
  for (const c of [sp, d.start?.special]) if (c?.kind === 'charge' && isActive(def(tgt))
    && (c.scope === 'adjacent' ? adjacent(src, tgt) : inScope(c.scope, src, tgt))) return true;
  return false;
}

// How much this bot values an item on this board (no randomness).
export function itemValue(inst, board, arch) {
  const d = def(inst);
  let aff = 0;
  for (const t of tagsOf(inst)) aff = Math.max(aff, arch.tags[t] ?? 0.3);
  let v = (POWER[tierOf(inst)] * aff + 0.4 * (inst.mods?.length || 0)) * (inst.multicast || 1);
  const sp = d.special, others = board.filter(o => o !== inst);
  if (sp?.kind === 'buffAdj' || sp?.kind === 'buffAll') {
    const n = others.filter(o => tagsOf(o).has(sp.tag)).length;
    v *= n ? 0.6 + 0.4 * Math.min(n, 3) : 0.3;
  }
  if (sp?.kind === 'amplify') v *= others.length >= 3 ? 1 : 0.5;
  // category synergies ("for each X", "your X items", "when you use another X") need X items around
  const cat = d.per?.cat || d.aura?.cat || d.on?.cat || d.start?.special?.cat || sp?.cat;
  if (cat) { const n = others.filter(o => hasCat(o, cat)).length; v *= n ? 0.6 + 0.4 * Math.min(n, 3) : 0.35; }
  if (sp?.kind === 'ignite') v *= others.some(o => statsOf(o).burn) ? 1 : 0.2;
  // faster items fire more often (roughly; speeding-up items count at their average)
  if (isActive(d)) v *= CHARGE_DEFAULT / Math.max(1, d.accel ? (chargeCost(inst) + (d.minCharge ?? 1)) / 2 : chargeCost(inst));
  v += goldPerFight(inst) * 0.5 * econWeight(curDay);
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
    if (def(inst).on?.scope === 'adjacent') s += 1;
    if (def(o).on?.scope === 'adjacent') s += 1;
  }
  for (const o of placed) { if (scopeHelps(c, o)) s += 1.5; if (scopeHelps(o, c)) s += 1.5; }
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
    (st.picks ||= []).push(tierOf(twin)); mergeInto(twin, inst); // every upgrade earns a skill pick
    for (let o; (o = st.board.find(x => canMerge(x, twin)));) { st.picks.push(tierOf(twin)); mergeInto(twin, o); st.board.splice(st.board.indexOf(o), 1); }
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
// Shop tokens (Coupon, Guild Charter): bots use their one Coupon a day and buy Charters early on.
function wantToken(o, st, day, rng) {
  if (o.id === 'coupon') return !st.couponUsed;
  return day <= 8 && st.gold >= o.price + 4 && rng.chance(0.6);
}
// `offers` is the current shop, `worth(o)` how much the bot wants an item offer (for the Coupon).
function buyToken(o, st, offers, worth) {
  const t = SHOP_TOKENS[o.id];
  if (t.halfOff) {
    const pick = couponTargets(offers).sort((a, b) => worth(b) - worth(a))[0];
    if (!pick) return;
    pick.sale = true; st.couponUsed = true;
  }
  st.gold -= o.price; o.sold = true;
  if (t.rank) st.rankBonus += t.rank;
}
const freeRerolls = st => skillEffects(st.skills).freeRerolls || 0;
const botRerollCost = (st, n) => (n < freeRerolls(st) ? 0 : rerollCost(n - freeRerolls(st)));

// ---------- Skills ----------
const STAT_TAG = { damage: 'weapon', burn: 'fire', poison: 'poison', heal: 'heal', shield: 'shield', regen: 'regen' };
const ECON = ['gold', 'interest', 'bounty', 'goldTouch', 'freeRerolls'];
// Gut-feel value of a skill for this board: how many of its items it would touch.
function skillAppeal(id, st, arch, day) {
  const board = st.board, n = Math.max(1, board.length);
  let v = 0;
  for (const f of SKILLS[id].fx) {
    if (f.k === 'pct') {
      const hit = board.filter(o => hasCat(o, f.cat) && (f.stat === '*' ? true : statsOf(o)[f.stat])).length;
      v += f.v * 4 * (0.3 + hit / n) * (f.stat === '*' ? 1 : (arch.tags[STAT_TAG[f.stat]] ?? 0.6));
    } else if (f.k === 'multicast') v += 0.8 * board.filter(o => hasCat(o, f.cat) && isActive(def(o))).length;
    else if (f.k === 'startCharge') v += 0.3 * f.v * board.filter(o => hasCat(o, f.cat) && isActive(def(o))).length;
    else if (ECON.includes(f.k)) v += 0.2 + 1.2 * econWeight(day);
    else v += { speed: 5, maxHp: 4, startShield: 5, startHaste: 0.15, stormWard: 1.5 }[f.k] * f.v;
  }
  return v;
}
// Offered 3 of a rarity (or the starter pool), take 1. Smart bots also simulate them.
function chooseSkill(st, rarity, day, arch, skill, rng, bench) {
  const choices = rng.shuffle(skillsOfRarity(rarity, st.skills)).slice(0, 3);
  for (const id of choices) tel('artOffered', id);
  let best = null;
  for (const id of choices) {
    let sc = skillAppeal(id, st, arch, day) + rng.next() * skill.noise + (id === arch.starter ? 3 : 0);
    if (bench?.length && skill.lookahead) {
      const hp = maxHp(day), sk = [...st.skills, id];
      const wins = bench.reduce((a, opp) => a + ({ win: 1, draw: 0.5, loss: 0 })[simulate(st.board, opp.items, hp, sk, opp.skills)], 0);
      sc = sc * 0.3 + (wins / bench.length) * 3;
    }
    if (!best || sc > best.sc) best = { id, sc };
  }
  if (best) { st.skills.push(best.id); tel('artPicked', best.id); }
}
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
  const evalBoard = board => bench.reduce((s, opp) => s + pts[simulate(board, opp.items, hp, st.skills, opp.skills)], 0) / bench.length
    + econWeight(day) * 0.03 * boardGold(board);
  const clone = () => ({ gold: st.gold, board: st.board.map(copyItem), picks: [] });
  let cur = evalBoard(st.board);
  for (let rerolls = 0; ; rerolls++) {
    const offers = rollShop(day, rng, shopRank(day, st.rankBonus));
    telShop(offers);
    const worth = o => itemValue(o.inst, st.board, arch) * o.price;
    for (const o of offers) if (o.kind === 'token' && wantToken(o, st, day, rng)) buyToken(o, st, offers, worth);
    for (;;) {
      let best = null;
      const consider = (trial, apply) => {
        arrange(trial.board, arch, rng);
        const sc = evalBoard(trial.board) + rng.next() * skill.noise * 0.05;
        if (!best || sc > best.sc) best = { sc, trial, apply };
      };
      for (const o of offers) {
        if (o.sold || offerPrice(o) > st.gold) continue;
        const trial = clone(); trial.gold -= offerPrice(o);
        if (o.kind === 'essence' || o.kind === 'token') continue; // handled outside the simulated buys
        if (o.kind === 'mod') {
          for (const target of modTargets(trial.board, o.id, arch).slice(0, 2)) {
            const t2 = { gold: trial.gold, board: trial.board.map(copyItem) };
            applyMod(t2.board[trial.board.indexOf(target)], o.id);
            consider(t2, () => { o.sold = true; tel('modBought', o.id); });
          }
        } else if (acquire(trial, copyItem(o.inst), Infinity, arch)) consider(trial, () => { o.sold = true; tel('bought', o.inst.id); });
      }
      if (!best || best.sc <= cur + 0.005) break;
      st.gold = best.trial.gold; st.board = best.trial.board; (st.picks ||= []).push(...(best.trial.picks || [])); cur = best.sc; best.apply();
    }
    const wild = offers.find(o => o.kind === 'essence' && !o.sold);
    if (wild && st.gold >= offerPrice(wild) + 3 && rng.chance(0.6) && useWildEssence(st.board, arch, rng)) {
      st.gold -= offerPrice(wild); wild.sold = true; cur = evalBoard(st.board);
    }
    if (rerolls >= skill.rerolls + freeRerolls(st) || st.gold < botRerollCost(st, rerolls) + 3) break;
    st.gold -= botRerollCost(st, rerolls);
  }
}

function shopDay(st, day, arch, skill, rng) {
  for (let rerolls = 0; ; rerolls++) {
    const rolled = rollShop(day, rng, shopRank(day, st.rankBonus));
    telShop(rolled);
    const offers = rolled.map(o => {
      if (o.kind === 'token') return { o, s: o.id === 'coupon' ? 100 : 1.5 * econWeight(day) + rng.next() * skill.noise };
      if (o.kind === 'essence') return { o, s: 1 + rng.next() * skill.noise };
      if (o.kind === 'mod') return { o, s: modAppeal(o.id, arch) + rng.next() * skill.noise };
      const twin = st.board.some(b => canMerge(b, o.inst));
      return { o, s: itemValue(o.inst, st.board, arch) + (twin ? 1.5 : 0) + rng.next() * skill.noise };
    }).sort((a, b) => b.s - a.s);

    for (const { o, s } of offers) {
      if (o.kind === 'token') {
        if (wantToken(o, st, day, rng)) buyToken(o, st, offers.map(x => x.o), x => (offers.find(y => y.o === x)?.s || 0) * x.price);
        continue;
      }
      if (offerPrice(o) > st.gold || s < 0.8) continue;
      if (o.kind === 'essence') { if (useWildEssence(st.board, arch, rng)) st.gold -= offerPrice(o); continue; }
      if (o.kind === 'mod') {
        const target = modTargets(st.board, o.id, arch)[0];
        if (target) { applyMod(target, o.id); st.gold -= offerPrice(o); tel('modBought', o.id); }
        continue;
      }
      const price = offerPrice(o);
      if (acquire(st, o.inst, s, arch)) { st.gold -= price; tel('bought', o.inst.id); }
    }
    if (rerolls >= skill.rerolls + freeRerolls(st) || st.gold < botRerollCost(st, rerolls) + 3) break;
    st.gold -= botRerollCost(st, rerolls);
  }
}

// Play a full run. Returns one { items, skills } snapshot per day (index 0 = day 1).
// `bench(day)` (optional) returns opponent boards for simulated shopping; used when skill.lookahead > 0.
export function draftRun({ arch, skill, seed, days = MAX_DAYS, bench = null }) {
  const rng = makeRng(seed);
  const st = { gold: START_GOLD, board: starterBoard(), skills: [], picks: [], rankBonus: 0, couponUsed: false };
  const snaps = [];
  for (let day = 1; day <= days; day++) {
    curDay = day; st.couponUsed = false;
    if (day > 1) { // bots don't really fight while drafting: assume a coin-flip result
      const p = afterFightGold({ board: st.board, skills: st.skills, day: day - 1, won: rng.chance(0.5),
        gold: st.gold, battleGold: estBattleGold(st.board) }, true);
      st.gold += p.total; st.board = p.board; st.picks.push(...p.skillPicks);
    }
    const b = skill.lookahead && bench ? bench(day) : null;
    if (day === 1) chooseSkill(st, 'starter', day, arch, skill, rng, null); // starter skills shape the build
    if (b && b.length) shopDaySimulated(st, day, arch, skill, rng, b);
    else shopDay(st, day, arch, skill, rng);
    while (st.picks.length) chooseSkill(st, st.picks.shift(), day, arch, skill, rng, b);
    arrange(st.board, arch, rng);
    snaps.push({ items: snapshot(st.board), skills: [...st.skills] });
  }
  return snaps;
}
