// Run rules, economy and board helpers. No DOM here: shared by the game, the bots and the Node tools.
import { ITEMS, RARITY, INFUSIONS, MODIFIERS, STAT_WEIGHT, CATEGORIES } from '../data/items.js';
import { SKILLS, skillEffects } from '../data/skills.js';

// 3 x 5 board: little spare space, so weak items have to be swapped out rather than kept around.
export const COLS = 5, ROWS = 3;
export const BENCH_MAX = 8, START_LIVES = 10, WINS_TO_CLEAR = 10, START_GOLD = 12;
// Losing costs more lives as the run goes on.
export const lifeLoss = day => (day <= 3 ? 1 : day <= 7 ? 2 : 3);
// Longest possible run (cheapest losses first, plus one Last Stand life), used for the bot pool.
export const MAX_DAYS = 17;
export const SHOP_ITEMS = 5;
// Shiny items roll in the shop now and then: +1 multicast on top of the item's own.
export const SHINY_BONUS = 1;
export const shinyChance = day => Math.min(0.08, 0.02 + day * 0.005);
export const SHINY_PRICE_MULT = 2;
// Augments are rare: some shop items come pre-infused (the Essence Bazaar shop infuses all of them).
export const PREINFUSED_CHANCE = 0.08, PREINFUSED_SURCHARGE = 3;

// Rarity tiers. An item's level is how many tiers it has climbed from its starting rarity:
// a Common at level 3 is Rare. Legendary is the top, so Legendaries can't be upgraded.
export const RARITIES = ['common', 'uncommon', 'rare', 'superrare', 'legendary'];
export const baseTier = id => RARITIES.indexOf(ITEMS[id].rarity);
export const maxLevel = inst => RARITIES.length - baseTier(inst.id);
export const tierIndex = inst => Math.min(RARITIES.length - 1, baseTier(inst.id) + inst.level - 1);
export const tierOf = inst => RARITIES[tierIndex(inst)];

// Charge: the bar gives an item 1 charge each time it hits it; at its cost the item fires.
// Passive items (only triggers, auras, gold, start effects or amplify) never charge.
export const CHARGE_DEFAULT = 4;
export const isActive = d => !!(d.effects && Object.keys(d.effects).length) || !!d.scale?.length || !!(d.special && d.special.kind !== 'amplify');
// Flat bonuses (infusions, modifiers, flat auras, buffs) land every time an item fires,
// so they're scaled by how often it fires: a 2-charge item gets half, an 8-charge item double.
// That keeps a +5 modifier worth the same per second on any item.
export const perFireScale = inst => (isActive(ITEMS[inst.id]) ? chargeCost(inst) / CHARGE_DEFAULT : 1);
export const scaledBonus = (v, f) => (v > 0 ? Math.max(1, Math.round(v * f)) : v);
export function chargeCost(inst) {
  const c = ITEMS[inst.id].charge;
  return Array.isArray(c) ? c[Math.min(c.length, inst.level) - 1] : (c ?? CHARGE_DEFAULT);
}

// What happens on each day, in order. 'encounter' is a placeholder slot for events / PvE.
export const DAY_FLOW = ['shop', 'encounter', 'pvp'];
export const ENCOUNTERS = [
  { id: 'merchant', name: 'Wandering Merchant', enabled: false },
  { id: 'monster', name: 'PvE Monster', enabled: false },
  { id: 'shrine', name: 'Mystery Shrine', enabled: false },
];

let uidSeq = 1;
export const uid = () => uidSeq++;

export const def = inst => ITEMS[inst.id];
export function newInst(id, level = 1) {
  const d = ITEMS[id];
  return { uid: uid(), id, level, infusion: null, mods: [], extra: null, multicast: d.multicast || 1, w: d.w, h: d.h, x: -1, y: -1 };
}
export const isShiny = inst => inst.multicast > (def(inst).multicast || 1);
export const priceOf = inst => RARITY[tierOf(inst)].price * (isShiny(inst) ? SHINY_PRICE_MULT : 1)
  + (inst.infusion ? PREINFUSED_SURCHARGE : 0);
export const sellValue = inst => Math.max(1, Math.floor(priceOf(inst) / 2));
// Upgrading = merging: two copies of the same item at the same tier make one item a tier higher.
export const canMerge = (a, b) => a !== b && a.id === b.id && a.level === b.level && a.level < maxLevel(a);
export function mergeInto(target, src) {
  target.level++;
  target.multicast = Math.max(target.multicast, src.multicast); // shiny survives the merge
  if (!target.infusion && src.infusion) target.infusion = src.infusion;
  target.mods = [...(target.mods || []), ...(src.mods || [])]; // no limit on modifiers
  // shop bonuses don't stack on a merge: the bigger one stays
  if (src.extra) { target.extra = { ...(target.extra || {}) }; for (const [k, v] of Object.entries(src.extra)) target.extra[k] = Math.max(target.extra[k] || 0, v); }
  return target;
}

// ---------- Augments and modifiers ----------
export function rollInfusion(rng, except = null) {
  return rng.pick(Object.keys(INFUSIONS).filter(k => k !== except));
}
export function canApplyMod(inst, modId) {
  const m = MODIFIERS[modId];
  if (m.multicast && inst.multicast >= 4) return 'That item already multicasts as much as it can.';
  return null;
}
export function applyMod(inst, modId) {
  inst.mods = [...(inst.mods || []), modId];
  if (MODIFIERS[modId].multicast) inst.multicast += MODIFIERS[modId].multicast;
}
export const rerollCost = n => 1 + n;
// Max HP per day, calibrated by tools/calibrate-hp.js so a typical fight lasts ~18s on every day
// (items scale up fast, so HP has to as well), then smoothed. Days past the end use the last value.
export const HP_BY_DAY = [280, 390, 600, 920, 1530, 1960, 2420, 3060, 4630, 6950, 10810, 15610, 26680, 43780, 91230, 137890, 240000];
export const maxHp = day => HP_BY_DAY[Math.min(day, HP_BY_DAY.length) - 1];
export const income = (day, won) => 6 + day + (won ? 3 : 0); // gold gained after the day-`day` fight

// Everyone starts with an empty board and buys their first items on Day 1.
export function starterBoard() { return []; }

// ---------- Gold after a fight (shared by the game and the bots) ----------
// Daily income + gold items on the board + gold earned during the fight + skills.
// With commit, also advances item counters (Piggy Bank, Treasure Map) and removes finished maps.
export function afterFightGold({ board, skills = [], day, won, gold = 0, battleGold = 0 }, commit = false) {
  const lines = [['Daily income', income(day, won)]];
  const skillPicks = [], keep0 = board; let keep = keep0; // skillPicks: rarities of skill choices earned
  for (const inst of board) {
    const d = def(inst), L = inst.level - 1;
    if (d.gold && !(d.gold.when === 'win' && !won)) {
      const amt = d.gold.grow ? Math.min((inst.charge || 0) + 1, d.gold.v[L]) : d.gold.v[L];
      if (commit && d.gold.grow) inst.charge = amt;
      lines.push([d.name, amt]);
    }
    if (d.map && commit) {
      inst.charge = (inst.charge || 0) + 1;
      if (inst.charge >= d.map.v[L]) { keep = keep.filter(o => o !== inst); skillPicks.push(tierOf(inst)); }
    }
  }
  if (battleGold) lines.push(['Earned during the fight', battleGold]);
  const A = skillEffects(skills);
  if (A.goldTouch) {
    const n = board.filter(o => def(o).gold && !(def(o).gold.when === 'win' && !won)).length;
    if (n) lines.push([SKILLS.goldtouch.name, n * A.goldTouch]);
  }
  if (A.gold) lines.push(['Skills', A.gold]);
  if (A.bounty && won) lines.push([SKILLS.bounty.name, A.bounty]);
  if (A.interest) { const i = Math.min(A.interest, Math.floor(gold * 0.1)); if (i) lines.push([SKILLS.interest.name, i]); }
  return { total: lines.reduce((a, [, g]) => a + g, 0), lines, board: keep, skillPicks };
}

// ---------- Shop rarity by day ----------
// Days 1-2 sell only Commons, Uncommons join on day 3, Rares on day 5, Super Rares on day 7 and
// Legendaries on day 9. Percent per rarity: common uncommon rare superrare legendary.
export const DAY_ODDS = [
  [1, [100, 0, 0, 0, 0]],
  [3, [75, 25, 0, 0, 0]],
  [5, [50, 35, 15, 0, 0]],
  [7, [35, 35, 22, 8, 0]],
  [9, [25, 32, 26, 13, 4]],
  [11, [18, 28, 29, 18, 7]],
];
export const oddsBracket = (day, boost = 0) => Math.min(DAY_ODDS.length - 1, DAY_ODDS.findLastIndex(([d]) => day >= d) + boost);
export function rarityWeights(day, boost = 0) {
  const row = DAY_ODDS[oddsBracket(day, boost)][1];
  return Object.fromEntries(RARITIES.map((r, i) => [r, row[i]]));
}
// Highest tier a shop can roll on a day.
export const topTier = (day, boost = 0) => DAY_ODDS[oddsBracket(day, boost)][1].findLastIndex(p => p > 0);

// ---------- Prices ----------
export const SALE_CHANCE = 0.08; // an item offer is sometimes half price
export function offerPrice(o) {
  return o.sale ? Math.ceil(o.price / 2) : o.price;
}

export function rollRarity(day, rng, boost = 0) {
  const w = rarityWeights(day, boost);
  let t = rng.next() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) if ((t -= v) < 0) return k;
  return 'common';
}
// Roll an offer: usually an item that starts at the rolled tier, sometimes an upgraded lower-tier
// item already at that tier. `filter(id)` limits which items can appear (shop styles); if nothing
// fits at the rolled tier, it tries lower tiers.
export const UPGRADED_OFFER_CHANCE = 0.25;
export function rollOffer(day, rng, filter = () => true, boost = 0) {
  const ids = Object.keys(ITEMS).filter(filter);
  for (let r = RARITIES.indexOf(rollRarity(day, rng, boost)); r >= 0; r--) {
    const native = ids.filter(k => baseTier(k) === r), lower = ids.filter(k => baseTier(k) < r);
    if (!native.length && !lower.length) continue;
    const id = (lower.length && (rng.chance(UPGRADED_OFFER_CHANCE) || !native.length)) ? rng.pick(lower) : rng.pick(native);
    return newInst(id, r - baseTier(id) + 1);
  }
  const low = Math.min(...ids.map(baseTier));
  return newInst(rng.pick(ids.filter(k => baseTier(k) === low)), 1);
}

// ---------- Shop styles ----------
// Each day you choose which shop to visit from 3 options. The shop's style holds for that day's
// rerolls too. The better styles only turn up later in the run (`from` = first day).
export const shopBonus = day => Math.round(10 + 4 * day + 0.5 * day * day); // Armory / Bastion built-in bonus
const hasStat = (id, k) => !!(ITEMS[id].effects?.[k] || ITEMS[id].scale?.some(x => x.stat === k));
export const SHOP_STYLES = {
  general:  { name: 'General Store', icon: '🏪', from: 1, text: 'A bit of everything.' },
  category: { name: '{cat} Specialist', icon: '🏷️', from: 1, text: 'Only {cat} items.', filter: st => id => (ITEMS[id].cats || []).includes(st.cat) },
  small:    { name: 'Trinket Stall', icon: '🧿', from: 1, text: 'Only 1-cell items.', filter: () => id => ITEMS[id].w * ITEMS[id].h === 1 },
  large:    { name: 'Heavy Goods', icon: '🏗️', from: 2, text: 'Only items 2 cells or bigger.', filter: () => id => ITEMS[id].w * ITEMS[id].h >= 2 },
  twins:    { name: 'Twin Peddler', icon: '👯', from: 3, text: 'Mostly copies of items you own, so merges come easy.' },
  clearance:{ name: 'Clearance Sale', icon: '💸', from: 3, text: 'Everything costs a third less.' },
  armory:   { name: 'Armory', icon: '⚔️', from: 4, bonus: 'damage', text: 'Only items that deal damage, each with +{bonus} Damage built in for good (more on slow items).', filter: () => id => hasStat(id, 'damage') },
  bastion:  { name: 'Bastion Outfitter', icon: '🛡️', from: 4, bonus: 'shield', text: 'Only Shield items, each with +{bonus} Shield built in for good (more on slow items).', filter: () => id => hasStat(id, 'shield') },
  curio:    { name: 'Curio Dealer', icon: '🔮', from: 5, boost: 1, text: "Rarity odds of the next stage of the run." },
  infuser:  { name: 'Essence Bazaar', icon: '🧪', from: 5, text: 'Every item comes infused with a random essence.' },
  gilded:   { name: 'Gilded Hall', icon: '✨', from: 8, text: 'Every item is shiny: +1 multicast.' },
};
export const styleName = st => SHOP_STYLES[st.id].name.replace('{cat}', st.cat);
export const styleText = (st, day) => SHOP_STYLES[st.id].text.replace('{cat}', st.cat).replace('{bonus}', shopBonus(day));
const styleFilter = st => SHOP_STYLES[st.id].filter?.(st) || (() => true);
// Categories with at least 2 items a shop can sell today, so a category shop is never empty.
function shopCats(day) {
  return Object.keys(CATEGORIES).filter(c => Object.keys(ITEMS).filter(id => (ITEMS[id].cats || []).includes(c) && baseTier(id) <= topTier(day)).length >= 2);
}
// The 3 shops to choose from today. `owned`: your items (Twin Peddler needs something to copy).
export function rollShopChoices(day, rng, owned = []) {
  const ids = Object.keys(SHOP_STYLES).filter(k => SHOP_STYLES[k].from <= day && (k !== 'twins' || owned.length));
  const cats = rng.shuffle(shopCats(day));
  const picks = [];
  // categories are several shops in one, so they get two tickets
  const pool = rng.shuffle([...ids, ...(cats.length > 1 ? ['category'] : [])]);
  for (const id of pool) {
    if (picks.length >= 3) break;
    if (id === 'category') { const cat = cats.shift(); if (cat) picks.push({ id, cat }); continue; }
    if (!picks.some(p => p.id === id)) picks.push({ id });
  }
  return picks;
}
export function rollShop(day, rng, style = { id: 'general' }, owned = []) {
  const S = SHOP_STYLES[style.id], filter = styleFilter(style);
  const copyable = owned.filter(o => o.level < maxLevel(o));
  const offers = [];
  for (let i = 0; i < SHOP_ITEMS; i++) {
    const inst = style.id === 'twins' && copyable.length && rng.chance(0.4)
      ? (o => newInst(o.id, o.level))(rng.pick(copyable)) : rollOffer(day, rng, filter, S.boost || 0);
    if (style.id === 'gilded' || rng.chance(shinyChance(day))) inst.multicast += SHINY_BONUS;
    if (style.id === 'infuser' || rng.chance(PREINFUSED_CHANCE)) inst.infusion = rollInfusion(rng);
    if (S.bonus) inst.extra = { [S.bonus]: scaledBonus(shopBonus(day), perFireScale(inst)) };
    let price = priceOf(inst);
    if (style.id === 'clearance') price = Math.max(1, Math.round(price * 2 / 3));
    offers.push({ kind: 'item', inst, price, sale: rng.chance(SALE_CHANCE), sold: false });
  }
  return offers;
}

// ---------- Item maths ----------
export function statsOf(inst) {
  const d = def(inst), L = inst.level - 1, out = {};
  for (const [k, arr] of Object.entries(d.effects || {})) out[k] = (out[k] || 0) + arr[L];
  const pf = perFireScale(inst);
  if (inst.infusion) { const f = INFUSIONS[inst.infusion]; out[f.stat] = (out[f.stat] || 0) + infusionAmount(inst); }
  for (const id of inst.mods || []) { const m = MODIFIERS[id]; if (m.stat) out[m.stat] = (out[m.stat] || 0) + scaledBonus(m.v, pf); }
  for (const [k, v] of Object.entries(inst.extra || {})) out[k] = (out[k] || 0) + v; // built in by an Armory / Bastion shop
  return out;
}
// An item's power: its own per-fire numbers in damage terms. Items with no numbers of their own
// (pure specials) count as a typical item of their tier and speed.
export function itemPower(inst) {
  const d = def(inst), L = inst.level - 1;
  let p = 0;
  for (const [k, arr] of Object.entries(d.effects || {})) if (STAT_WEIGHT[k]) p += arr[L] * STAT_WEIGHT[k];
  return p || 24 * 1.55 ** tierIndex(inst) * perFireScale(inst);
}
export function infusionAmount(inst) {
  const f = INFUSIONS[inst.infusion];
  return f ? Math.max(1, Math.round(itemPower(inst) * f.pct / STAT_WEIGHT[f.stat])) : 0;
}
export function tagsOf(inst) {
  const t = new Set(def(inst).tags);
  if (inst.infusion) t.add(INFUSIONS[inst.infusion].tag);
  for (const id of inst.mods || []) if (MODIFIERS[id].tag) t.add(MODIFIERS[id].tag);
  return t;
}

// ---------- Grid geometry ----------
export function adjacent(a, b) {
  const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h;
  const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
  return (yOverlap && (a.x + a.w === b.x || b.x + b.w === a.x)) ||
         (xOverlap && (a.y + a.h === b.y || b.y + b.h === a.y));
}
// Share at least one row / one column (items can span several).
export const sameRow = (a, b) => a.y < b.y + b.h && b.y < a.y + a.h;
export const sameCol = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w;
export function inScope(scope, a, b) {
  return scope === 'row' ? sameRow(a, b) : scope === 'column' ? sameCol(a, b) : scope === 'adjacent' ? adjacent(a, b) : true;
}
// Categories: what an item IS (Melee, Clockwork, Treasure...). Items reference them in auras,
// triggers, charge and "for each X you have" effects; `cat` on those filters by category.
export const catsOf = inst => ITEMS[inst.id].cats || [];
export const hasCat = (inst, cat) => !cat || catsOf(inst).includes(cat);
export function canPlace(board, x, y, w, h, ignoreUid) {
  if (x < 0 || y < 0 || x + w > COLS || y + h > ROWS) return false;
  return !board.some(o => o.uid !== ignoreUid && x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h);
}
export function itemAt(board, cx, cy) {
  return board.find(o => cx >= o.x && cx < o.x + o.w && cy >= o.y && cy < o.y + o.h);
}
export function freeSpots(board, w, h) {
  const out = [];
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) if (canPlace(board, x, y, w, h)) out.push([x, y]);
  return out;
}

// ---------- Snapshots (what gets stored in the opponent pool) ----------
// Compact form: [id, level, x, y, w, h, infusion|0, multicast, mods|0, extra|0]
export const snapshot = board => board.map(o =>
  [o.id, o.level, o.x, o.y, o.w, o.h, o.infusion || 0, o.multicast || 1, o.mods?.length ? o.mods : 0, o.extra || 0]);
export const fromSnapshot = snap => snap.map(([id, level, x, y, w, h, inf, mc, mods, extra]) =>
  ({ uid: uid(), id, level: Math.min(level, RARITIES.length - baseTier(id)), x, y, w, h, infusion: inf || null,
     multicast: mc || ITEMS[id].multicast || 1, mods: (mods || []).filter(m => MODIFIERS[m]), extra: extra || null }));

// ---------- Run context (what "per win / per life lost" skills count) ----------
export const emptyCells = board => COLS * ROWS - board.reduce((a, o) => a + o.w * o.h, 0);
