// Run rules, economy and board helpers. No DOM here: shared by the game, the bots and the Node tools.
import { ITEMS, RARITY, INFUSIONS, MODIFIERS, WILD_ESSENCE } from '../data/items.js';

export const COLS = 10, ROWS = 3;
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
export const modSlots = inst => inst.level + 1;        // modifiers an item can hold
export const LV = ['I', 'II', 'III', 'IV'];

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
export const priceOf = inst => RARITY[def(inst).rarity].price * inst.level * (isShiny(inst) ? SHINY_PRICE_MULT : 1)
  + (inst.infusion ? PREINFUSED_SURCHARGE : 0);
export const sellValue = inst => Math.max(1, Math.floor(priceOf(inst) / 2));
// Levels only go up by merging: two copies of the same item at the same level make one at the next.
export const canMerge = (a, b) => a !== b && a.id === b.id && a.level === b.level && a.level < 4;
export function mergeInto(target, src) {
  target.level++;
  target.multicast = Math.max(target.multicast, src.multicast); // shiny survives the merge
  if (!target.infusion && src.infusion) target.infusion = src.infusion;
  target.mods = [...(target.mods || []), ...(src.mods || [])].slice(0, modSlots(target));
  return target;
}

// ---------- Augments and modifiers ----------
export function rollInfusion(rng, except = null) {
  return rng.pick(Object.keys(INFUSIONS).filter(k => k !== except));
}
export function canApplyMod(inst, modId) {
  const m = MODIFIERS[modId];
  if ((inst.mods || []).length >= modSlots(inst)) return 'No free modifier slots. Merge it up a level for more.';
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

export function starterBoard() {
  const d = newInst('dagger'); d.x = 0; d.y = 1;
  const b = newInst('buckler'); b.x = 2; b.y = 0;
  return [d, b];
}

// ---------- Shop ----------
export function rarityWeights(day) {
  return {
    common: Math.max(20, 80 - day * 7), rare: 20 + day * 2,
    epic: day >= 3 ? (day - 2) * 5 : 0, legendary: day >= 5 ? (day - 4) * 3 : 0,
  };
}
export function rollRarity(day, rng) {
  const w = rarityWeights(day);
  let t = rng.next() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) if ((t -= v) < 0) return k;
  return 'common';
}
export function rollItemId(day, rng) {
  const r = rollRarity(day, rng);
  return rng.pick(Object.keys(ITEMS).filter(k => ITEMS[k].rarity === r));
}
export function rollShop(day, rng) {
  const offers = [];
  for (let i = 0; i < SHOP_ITEMS; i++) {
    const level = day > 3 && rng.chance(Math.min(0.35, (day - 3) * 0.06)) ? 2 : 1;
    const inst = newInst(rollItemId(day, rng), level);
    if (rng.chance(shinyChance(day))) inst.multicast += SHINY_BONUS;
    if (rng.chance(PREINFUSED_CHANCE)) inst.infusion = rollInfusion(rng);
    offers.push({ kind: 'item', inst, price: priceOf(inst), sold: false });
  }
  for (let i = 0; i < modOffers(day); i++) {
    const id = rollMod(rng);
    offers.push({ kind: 'mod', id, price: MODIFIERS[id].price, sold: false });
  }
  if (rng.chance(WILD_ESSENCE_CHANCE)) offers.push({ kind: 'essence', price: WILD_ESSENCE.price, sold: false });
  return offers;
}

// ---------- Item maths ----------
export function statsOf(inst) {
  const d = def(inst), L = inst.level - 1, out = {};
  for (const [k, arr] of Object.entries(d.effects || {})) out[k] = (out[k] || 0) + arr[L];
  if (inst.infusion) { const f = INFUSIONS[inst.infusion]; out[f.stat] = (out[f.stat] || 0) + f.v[L]; }
  for (const id of inst.mods || []) { const m = MODIFIERS[id]; if (m.stat) out[m.stat] = (out[m.stat] || 0) + m.v; }
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
  ({ uid: uid(), id, level, x, y, w, h, infusion: inf || null, multicast: mc || ITEMS[id].multicast || 1, mods: mods || [] }));
