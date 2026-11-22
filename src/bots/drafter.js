// A bot that plays a whole run through the real shop rules and records its board each day.
// Those daily boards seed the PvP opponent pool until real players fill it.
import { ITEMS } from '../data/items.js';
import { SKILLS, skillEffects, skillOffers, skillLevels, fxValue, PER } from '../data/skills.js';
import { makeRng } from '../core/rng.js';
import {
  START_GOLD, START_LIVES, MAX_DAYS, lifeLoss, SHOP_STYLES, baseTier, topTier, def, tagsOf, statsOf, adjacent, inScope, freeSpots, rollShop, rollShopChoices, rerollCost,
  canMerge, mergeInto, sellValue, starterBoard, snapshot, maxHp,
  afterFightGold, offerPrice, tierOf, isActive, chargeCost, CHARGE_DEFAULT, hasCat, perFireScale,
} from '../core/rules.js';
import { simulate } from '../core/sim.js';
import { tel, telShop } from '../balance/telemetry.js';

const STAT_TAG_V = { damage: 'weapon', shield: 'shield' };
// Can this item hurt the enemy? A board with none of these can only stall until the storm.
const OFFENSE = ['damage', 'burn', 'poison'];
export const isOffense = idOrInst => {
  const d = ITEMS[idOrInst.id || idOrInst];
  return OFFENSE.some(k => d.effects?.[k] || d.start?.effects?.[k] || d.on?.effects?.[k]) || !!d.scale?.some(x => OFFENSE.includes(x.stat));
};
const needsOffense = board => !board.some(isOffense);
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
  if (inst.extra) for (const [k, x] of Object.entries(inst.extra)) v += 0.6 * (arch.tags[STAT_TAG_V[k]] ?? 0.3) * x / perFireScale(inst) / (12 + 4 * curDay);
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
const freeRerolls = st => skillEffects(st.skills).freeRerolls || 0;
const botRerollCost = (st, n) => (n < freeRerolls(st) ? 0 : rerollCost(n - freeRerolls(st)));
// What this bot's "per win / per life lost / per gold" skills see right now.
const ctxOf = (st, day) => ({ day, wins: st.wins, livesLost: st.livesLost, lives: START_LIVES - st.livesLost, gold: st.gold, streak: st.streak });

// ---------- Skills ----------
const STAT_TAG = { damage: 'weapon', burn: 'fire', poison: 'poison', heal: 'heal', shield: 'shield', regen: 'regen' };
const ECON = ['gold', 'interest', 'bounty', 'goldTouch', 'freeRerolls'];
// Typical size of each stat on an item, to judge what a flat "+X <stat>" is worth.
const STAT_SIZE = { damage: 60, burn: 6, poison: 6, shield: 40, heal: 40, regen: 8 };
// Gut-feel value of picking skill `id` (new, or one more level) for this board.
function skillAppeal(id, st, arch, day) {
  const board = st.board, n = Math.max(1, board.length);
  const level = (skillLevels(st.skills)[id] || 0) + 1, ctx = ctxOf(st, day);
  // a `per` skill is judged on what it gives now plus a little for what it will grow into
  const growth = { win: 0.5 + 0.08 * (17 - day), lifeLost: 1 + 0.05 * (17 - day), day: day + 2, gold: 6, streak: 1.5, empty: 2, desperate: 0.3 };
  let v = 0;
  for (const f of SKILLS[id].fx) {
    let x = fxValue(f, level);
    if (f.per) x *= Math.max(PER[f.per].of(ctx), growth[f.per] ?? 1);
    if (f.k === 'pct' || f.k === 'flat') {
      const hit = board.filter(o => hasCat(o, f.cat) && (f.stat === '*' ? true : statsOf(o)[f.stat])).length;
      const size = f.k === 'flat' ? x / (STAT_SIZE[f.stat] * (1 + day / 4)) : x;
      v += size * 4 * (0.3 + hit / n) * (f.stat === '*' ? 1 : (arch.tags[STAT_TAG[f.stat]] ?? 0.6));
    } else if (f.k === 'multicast') v += 0.8 * x * board.filter(o => hasCat(o, f.cat) && isActive(def(o))).length;
    else if (f.k === 'startCharge') v += 0.3 * x * board.filter(o => hasCat(o, f.cat) && isActive(def(o))).length;
    else if (ECON.includes(f.k)) v += 0.2 + 1.2 * econWeight(day);
    else if (f.k === 'maxHpFlat') v += 4 * x / maxHp(day);
    else v += { speed: 5, maxHp: 4, startShield: 5, startHaste: 0.15, stormWard: 1.5 }[f.k] * x;
  }
  return v;
}
// Offered 3 of a rarity (or the starter pool), take 1. Smart bots also simulate them.
function chooseSkill(st, rarity, day, arch, skill, rng, bench) {
  const choices = rng.shuffle(skillOffers(rarity, st.skills)).slice(0, 3);
  for (const id of choices) tel('artOffered', id);
  let best = null;
  for (const id of choices) {
    let sc = skillAppeal(id, st, arch, day) + rng.next() * skill.noise + (id === arch.starter ? 3 : 0);
    if (bench?.length && skill.lookahead) {
      const hp = maxHp(day), sk = [...st.skills, id], ctx = ctxOf(st, day);
      const wins = bench.reduce((a, opp) => a + ({ win: 1, draw: 0.5, loss: 0 })[simulate(st.board, opp.items, hp, sk, opp.skills, ctx, opp.ctx)], 0);
      sc = sc * 0.3 + (wins / bench.length) * 3;
    }
    if (!best || sc > best.sc) best = { id, sc };
  }
  if (best) { st.skills.push(best.id); tel('artPicked', best.id); }
}

// ---------- Which shop to visit ----------
// Gut feel: rarer odds, discounts, shiny and bonus shops are good; a category shop is as good as
// the bot's taste for that category; Twin Peddler is good when it has things worth merging.
function styleAppeal(style, st, arch, day) {
  if (needsOffense(st.board)) {
    const f = SHOP_STYLES[style.id].filter?.(style);
    const ids = Object.keys(ITEMS).filter(k => (!f || f(k)) && baseTier(k) <= topTier(day, SHOP_STYLES[style.id].boost || 0));
    const share = ids.filter(isOffense).length / Math.max(1, ids.length);
    if (share < 0.3) return 0.2 + share;
  }
  switch (style.id) {
    case 'category': {
      const ids = Object.keys(ITEMS).filter(k => (ITEMS[k].cats || []).includes(style.cat) && baseTier(k) <= topTier(day));
      const aff = ids.reduce((a, k) => a + Math.max(...ITEMS[k].tags.map(t => arch.tags[t] ?? 0.3)), 0) / Math.max(1, ids.length);
      return 0.4 + aff;
    }
    case 'twins': return 0.6 + 0.35 * Math.min(4, st.board.filter(o => o.level < 3).length);
    case 'armory': return 0.9 + (arch.tags.weapon ?? 0.3) * 0.6;
    case 'bastion': return 0.9 + (arch.tags.shield ?? 0.3) * 0.6;
    default: return { general: 1, small: 0.8, large: 0.8, clearance: 1.5, curio: 1.7, infuser: 1.3, gilded: 1.5 }[style.id] ?? 1;
  }
}
function chooseStyle(st, day, arch, skill, rng) {
  const choices = rollShopChoices(day, rng, st.board);
  let best = null;
  for (const c of choices) {
    const sc = styleAppeal(c, st, arch, day) + rng.next() * skill.noise * 0.5;
    if (!best || sc > best.sc) best = { c, sc };
  }
  tel('shopStyle', best.c.id);
  return best.c;
}

// Smart shopping: try each possible purchase, simulate the resulting board against a
// benchmark sample of that day's teams, and take the best improvement until nothing helps.
function shopDaySimulated(st, day, arch, skill, rng, bench, style) {
  const hp = maxHp(day);
  const pts = { win: 1, draw: 0.5, loss: 0 };
  const evalBoard = board => bench.reduce((s, opp) => s + pts[simulate(board, opp.items, hp, st.skills, opp.skills, ctxOf(st, day), opp.ctx)], 0) / bench.length
    + econWeight(day) * 0.03 * boardGold(board);
  const clone = () => ({ gold: st.gold, board: st.board.map(copyItem), picks: [] });
  let cur = evalBoard(st.board);
  for (let rerolls = 0; ; rerolls++) {
    const offers = rollShop(day, rng, style, st.board);
    telShop(offers);
    for (;;) {
      let best = null;
      for (const o of offers) {
        if (o.sold || offerPrice(o) > st.gold) continue;
        const trial = clone(); trial.gold -= offerPrice(o);
        if (!acquire(trial, copyItem(o.inst), Infinity, arch)) continue;
        arrange(trial.board, arch, rng);
        const sc = evalBoard(trial.board) + rng.next() * skill.noise * 0.05;
        if (!best || sc > best.sc) best = { sc, trial, o };
      }
      if (!best || best.sc <= cur + 0.005) break;
      st.gold = best.trial.gold; st.board = best.trial.board; (st.picks ||= []).push(...(best.trial.picks || [])); cur = best.sc;
      best.o.sold = true; tel('bought', best.o.inst.id);
    }
    if (rerolls >= skill.rerolls + freeRerolls(st) || st.gold < botRerollCost(st, rerolls) + 3) break;
    st.gold -= botRerollCost(st, rerolls);
  }
}

function shopDay(st, day, arch, skill, rng, style) {
  for (let rerolls = 0; ; rerolls++) {
    const rolled = rollShop(day, rng, style, st.board);
    telShop(rolled);
    const offers = rolled.map(o => {
      const twin = st.board.some(b => canMerge(b, o.inst));
      const first = needsOffense(st.board) && isOffense(o.inst) ? 3 : 0; // a board with no way to hurt anyone needs this first
      return { o, s: itemValue(o.inst, st.board, arch) + (twin ? 1.5 : 0) + first + rng.next() * skill.noise };
    }).sort((a, b) => b.s - a.s);
    for (const { o, s } of offers) {
      if (offerPrice(o) > st.gold || s < 0.8) continue;
      const price = offerPrice(o);
      if (acquire(st, o.inst, s, arch)) { st.gold -= price; tel('bought', o.inst.id); }
    }
    if (rerolls >= skill.rerolls + freeRerolls(st) || st.gold < botRerollCost(st, rerolls) + 3) break;
    st.gold -= botRerollCost(st, rerolls);
  }
}

// Play a full run. Returns one { items, skills, ctx } snapshot per day (index 0 = day 1).
// `bench(day)` (optional) returns opponent boards for simulated shopping; used when skill.lookahead > 0.
export function draftRun({ arch, skill, seed, days = MAX_DAYS, bench = null }) {
  const rng = makeRng(seed);
  const st = { gold: START_GOLD, board: starterBoard(), skills: [], picks: [], wins: 0, livesLost: 0, streak: 0 };
  const snaps = [];
  for (let day = 1; day <= days; day++) {
    curDay = day;
    if (day > 1) { // bots don't really fight while drafting: assume a coin-flip result
      const won = rng.chance(0.5);
      const p = afterFightGold({ board: st.board, skills: st.skills, day: day - 1, won,
        gold: st.gold, battleGold: estBattleGold(st.board) }, true);
      st.gold += p.total; st.board = p.board; st.picks.push(...p.skillPicks);
      // A real run that's still going late has lives left, so ghosts never drop below 4.
      if (won) { st.wins++; st.streak++; } else { st.livesLost = Math.min(START_LIVES - 4, st.livesLost + lifeLoss(day - 1)); st.streak = 0; }
    }
    const b = skill.lookahead && bench ? bench(day) : null;
    if (day === 1) chooseSkill(st, 'starter', day, arch, skill, rng, null); // starter skills shape the build
    const style = chooseStyle(st, day, arch, skill, rng);
    if (b && b.length) shopDaySimulated(st, day, arch, skill, rng, b, style);
    else shopDay(st, day, arch, skill, rng, style);
    while (st.picks.length) chooseSkill(st, st.picks.shift(), day, arch, skill, rng, b);
    arrange(st.board, arch, rng);
    snaps.push({ items: snapshot(st.board), skills: [...st.skills], ctx: ctxOf(st, day) });
  }
  return snaps;
}
