// Run rules, economy and board helpers. No DOM here: shared by the game, the bots and the Node tools.
import { ITEMS, RARITY, INFUSIONS, MODIFIERS, WILD_ESSENCE, SHOP_TOKENS } from '../data/items.js';
import { ARTIFACTS, artifactEffects } from '../data/artifacts.js';

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
// Augments are rare: pre-infused shop items and the occasional Wild Essence (random infusion).
export const PREINFUSED_CHANCE = 0.08, PREINFUSED_SURCHARGE = 3;
export const WILD_ESSENCE_CHANCE = 0.2;
export const modOffers = day => (day >= 3 ? 2 : 1);   // modifier offers per shop
export const LV = ['I', 'II', 'III', 'IV']; // artifact levels

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
export const isActive = d => !!(d.effects && Object.keys(d.effects).length) || !!(d.special && d.special.kind !== 'amplify');
// Flat bonuses (infusions, modifiers, flat auras, buffs, artifact adds) land every time an item fires,
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
  return { uid: uid(), id, level, infusion: null, mods: [], multicast: d.multicast || 1, w: d.w, h: d.h, x: -1, y: -1 };
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
function rollMod(rng) {
  const entries = Object.entries(MODIFIERS);
  let t = rng.next() * entries.reduce((a, [, m]) => a + m.weight, 0);
  for (const [k, m] of entries) if ((t -= m.weight) < 0) return k;
  return entries[0][0];
}
export const rerollCost = n => 1 + n;
// Max HP grows on a curve: each day is HP_GROWTH times the last (40, 45, 50, 56, ... 156 on Day 13).
export const HP_BASE = 40, HP_GROWTH = 1.12;
export const maxHp = day => Math.round(HP_BASE * HP_GROWTH ** (day - 1));
export const income = (day, won) => 6 + day + (won ? 3 : 0); // gold gained after the day-`day` fight

// Everyone starts with an empty board and buys their first items on Day 1.
export function starterBoard() { return []; }

// ---------- Gold after a fight (shared by the game and the bots) ----------
// Daily income + gold items on the board + gold earned during the fight + artifacts.
// With commit, also advances item counters (Piggy Bank, Treasure Map) and removes finished maps.
export function afterFightGold({ board, artifacts = {}, day, won, gold = 0, battleGold = 0 }, commit = false) {
  const lines = [['Daily income', income(day, won)]];
  let artifactPicks = 0, keep = board;
  for (const inst of board) {
    const d = def(inst), L = inst.level - 1;
    if (d.gold && !(d.gold.when === 'win' && !won)) {
      const amt = d.gold.grow ? Math.min((inst.charge || 0) + 1, d.gold.v[L]) : d.gold.v[L];
      if (commit && d.gold.grow) inst.charge = amt;
      lines.push([d.name, amt]);
    }
    if (d.map && commit) {
      inst.charge = (inst.charge || 0) + 1;
      if (inst.charge >= d.map.v[L]) { keep = keep.filter(o => o !== inst); artifactPicks++; }
    }
  }
  if (battleGold) lines.push(['Earned during the fight', battleGold]);
  const A = artifactEffects(artifacts);
  if (A.goldTouch) {
    const n = board.filter(o => def(o).gold && !(def(o).gold.when === 'win' && !won)).length;
    if (n) lines.push([ARTIFACTS.goldtouch.name, n * A.goldTouch]);
  }
  if (A.gold) lines.push([ARTIFACTS.tithe.name, A.gold]);
  if (A.bounty && won) lines.push([ARTIFACTS.bounty.name, A.bounty]);
  if (A.interest) { const i = Math.min(A.interest, Math.floor(gold * 0.1)); if (i) lines.push([ARTIFACTS.interest.name, i]); }
  return { total: lines.reduce((a, [, g]) => a + g, 0), lines, board: keep, artifactPicks };
}

// ---------- Shop ----------
// ---------- Shop rank ----------
// Rank = day + Guild Charters bought. Each rank has fixed rarity odds (percent): all Common at
// rank 1, shifting up until it caps at RANK_ODDS' last row.
export const RANK_ODDS = [
  // common uncommon rare superrare legendary
  [100, 0, 0, 0, 0],   // rank 1
  [80, 20, 0, 0, 0],   // 2
  [62, 30, 8, 0, 0],   // 3
  [48, 34, 15, 3, 0],  // 4
  [36, 34, 21, 8, 1],  // 5
  [27, 32, 25, 12, 4], // 6
  [20, 29, 28, 16, 7], // 7
  [14, 26, 30, 20, 10],// 8
  [10, 23, 31, 23, 13],// 9
  [8, 20, 32, 25, 15], // 10+ (cap)
];
export const MAX_RANK = RANK_ODDS.length;
export const shopRank = (day, bonus = 0) => day + bonus;
export function rarityWeights(rank) {
  const row = RANK_ODDS[Math.min(MAX_RANK, Math.max(1, rank)) - 1];
  return Object.fromEntries(RARITIES.map((r, i) => [r, row[i]]));
}

// ---------- Prices: sales and coupons ----------
export const SALE_CHANCE = 0.08; // an item offer is sometimes half price
// What an offer costs right now; `discount` (from Coupons) only affects item offers.
export function offerPrice(o, discount = 0) {
  if (o.kind !== 'item') return o.price;
  const base = o.sale ? Math.ceil(o.price / 2) : o.price;
  return Math.max(1, base - discount);
}

export function rollRarity(rank, rng) {
  const w = rarityWeights(rank);
  let t = rng.next() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) if ((t -= v) < 0) return k;
  return 'common';
}
// Roll an offer at a tier: usually an item that starts at that tier, sometimes an upgraded
// lower-tier item already at that tier.
export const UPGRADED_OFFER_CHANCE = 0.25;
export function rollOffer(rank, rng) {
  const r = RARITIES.indexOf(rollRarity(rank, rng));
  const native = Object.keys(ITEMS).filter(k => baseTier(k) === r);
  const lower = Object.keys(ITEMS).filter(k => baseTier(k) < r);
  const id = (lower.length && (rng.chance(UPGRADED_OFFER_CHANCE) || !native.length)) ? rng.pick(lower) : rng.pick(native);
  return newInst(id, r - baseTier(id) + 1);
}
export function rollShop(day, rng, rank = day) {
  const offers = [];
  for (let i = 0; i < SHOP_ITEMS; i++) {
    const inst = rollOffer(rank, rng);
    if (rng.chance(shinyChance(day))) inst.multicast += SHINY_BONUS;
    if (rng.chance(PREINFUSED_CHANCE)) inst.infusion = rollInfusion(rng);
    offers.push({ kind: 'item', inst, price: priceOf(inst), sale: rng.chance(SALE_CHANCE), sold: false });
  }
  for (let i = 0; i < modOffers(day); i++) {
    const id = rollMod(rng);
    offers.push({ kind: 'mod', id, price: MODIFIERS[id].price, sold: false });
  }
  if (rng.chance(WILD_ESSENCE_CHANCE)) offers.push({ kind: 'essence', price: WILD_ESSENCE.price, sold: false });
  for (const [id, t] of Object.entries(SHOP_TOKENS)) if (rng.chance(t.chance)) offers.push({ kind: 'token', id, price: t.price, sold: false });
  return offers;
}

// ---------- Item maths ----------
export function statsOf(inst) {
  const d = def(inst), L = inst.level - 1, out = {};
  for (const [k, arr] of Object.entries(d.effects || {})) out[k] = (out[k] || 0) + arr[L];
  const pf = perFireScale(inst);
  if (inst.infusion) { const f = INFUSIONS[inst.infusion]; out[f.stat] = (out[f.stat] || 0) + scaledBonus(f.v[tierIndex(inst)], pf); }
  for (const id of inst.mods || []) { const m = MODIFIERS[id]; if (m.stat) out[m.stat] = (out[m.stat] || 0) + scaledBonus(m.v, pf); }
  return out;
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
  return scope === 'row' ? sameRow(a, b) : scope === 'column' ? sameCol(a, b) : true;
}
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
// Compact form: [id, level, x, y, w, h, infusion|0, multicast, mods|0]
export const snapshot = board => board.map(o =>
  [o.id, o.level, o.x, o.y, o.w, o.h, o.infusion || 0, o.multicast || 1, o.mods?.length ? o.mods : 0]);
export const fromSnapshot = snap => snap.map(([id, level, x, y, w, h, inf, mc, mods]) =>
  ({ uid: uid(), id, level: Math.min(level, RARITIES.length - baseTier(id)), x, y, w, h, infusion: inf || null,
     multicast: mc || ITEMS[id].multicast || 1, mods: mods || [] }));
