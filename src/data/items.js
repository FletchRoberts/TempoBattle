// All item data lives here. Add or tune items without touching the engine.
// Every stat array has 4 entries, one per item level (I, II, III, IV).

export const RARITY = {
  common:    { name: 'Common',     price: 3 },
  uncommon:  { name: 'Uncommon',   price: 5 },
  rare:      { name: 'Rare',       price: 7 },
  superrare: { name: 'Super Rare', price: 10 },
  legendary: { name: 'Legendary',  price: 15 },
};

export const TAG_NAME = {
  weapon: 'Weapon', fire: 'Fire', poison: 'Poison', heal: 'Healing',
  shield: 'Shield', regen: 'Regen', time: 'Time', tool: 'Tool',
};

export const STAT_NAME = {
  damage: 'Damage', burn: 'Burn', poison: 'Poison', heal: 'Heal',
  shield: 'Shield', regen: 'Regen', cleanse: 'Cleanse', maxhp: 'Max HP', gold: 'Gold',
};

// Text for each stat when an item activates. V is the formatted value (with level progression).
export const STAT_TEXT = {
  gold:    V => `Gain ${V} gold`,
  maxhp:   V => `Gain ${V} max HP`,
  shield:  V => `Gain ${V} Shield`,
  heal:    V => `Heal ${V}`,
  regen:   V => `Gain ${V} Regen`,
  cleanse: V => `Remove ${V} Burn and Poison from yourself`,
  damage:  V => `Deal ${V} damage`,
  burn:    V => `Apply ${V} Burn`,
  poison:  V => `Apply ${V} Poison`,
};
export const STAT_ORDER = ['maxhp', 'shield', 'heal', 'regen', 'cleanse', 'damage', 'burn', 'poison', 'gold'];

// Triggers (`on`): an item reacts to your other items. scope 'adjacent' = only items touching it.
// Triggered effects don't set off further triggers.
export const ON_EVENT = {
  activate: s => s.scope === 'adjacent' ? 'When an adjacent item activates' : 'When any of your other items activates',
  burn: () => 'When you apply Burn', poison: () => 'When you apply Poison',
  shield: () => 'When you gain Shield', heal: () => 'When you Heal', damage: () => 'When you deal weapon damage',
};
// Auras (`aura`): passive bonus to your other items with a tag (or any item, if no tag), optionally
// only under a condition, and optionally only for items sharing its row or column (`scope`).
// `multicast` instead of `stat` adds extra activations.
export const AURA_SCOPE = { row: 'in the same row', column: 'in the same column' };
export const AURA_COND = {
  enemyBelowHalf: 'while the enemy is below half HP',
  selfBelowHalf: 'while you are below half HP',
  enemySlowed: 'while the enemy is slowed',
  enemyBurning: 'while the enemy is burning',
  selfShielded: 'while you have Shield',
};

// Special behaviours. `fmt` converts a raw value for display.
export const SPECIALS = {
  buffAdj:   { text: (s, V) => `Adjacent ${TAG_NAME[s.tag]} items gain +${V} ${STAT_NAME[s.stat]} for this fight` },
  buffAll:   { text: (s, V) => `All your ${TAG_NAME[s.tag]} items gain +${V} ${STAT_NAME[s.stat]} for this fight` },
  amplify:   { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `Passive. Adjacent items are ${V} stronger` },
  haste:     { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `Your bar moves ${V} faster for ${s.dur ?? 3}s. Triggering again refreshes it` },
  slow:      { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `The enemy's bar moves ${V} slower for ${s.dur ?? 3}s. Triggering again refreshes it` },
  overclock: { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `Your bar is permanently ${V} faster this fight` },
  rewind:    { text: (s, V) => `Send this bar back to the start. ${V} use(s) per fight` },
  echo:      { text: (s, V) => `Launch an extra bar from the start. ${V} use(s) per fight` },
  grow:      { text: (s, V) => `This item gains +${V} ${STAT_NAME[s.stat]} each time it activates` },
  buffRow:   { text: (s, V) => `Your items in the same row that have ${STAT_NAME[s.stat]} gain +${V} ${STAT_NAME[s.stat]} for this fight` },
  buffCol:   { text: (s, V) => `Your items in the same column that have ${STAT_NAME[s.stat]} gain +${V} ${STAT_NAME[s.stat]} for this fight` },
  bash:      { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `Then deal damage equal to ${V} of your Shield` },
  ignite:    { fmt: v => '×' + v, text: (s, V) => `Multiply the enemy's Burn by ${V}` },
};

// Infusions ("instilling" an item with another type). Adds a stat that scales with level, plus the tag.
// They're rare: an item sometimes rolls in the shop already infused, or a Wild Essence (random type) shows up.
export const WILD_ESSENCE = { name: 'Wild Essence', icon: '🔮', price: 5 };
// Shop tokens: like essences, they sometimes show up as shop offers and take effect when bought.
export const SHOP_TOKENS = {
  charter: { name: 'Guild Charter', icon: '📜', price: 6, chance: 0.12, rank: 1,
             text: 'Shop rank +1 for the rest of the run' },
  coupon:  { name: 'Coupon', icon: '🏷️', price: 2, chance: 0.15, discount: 2,
             text: 'Item offers cost 2 gold less for the rest of today (min 1)' },
};
export const INFUSIONS = {
  fire:   { name: 'Ember Essence',  icon: '🔥', tag: 'fire',   stat: 'burn',   v: [2, 3, 4, 6], price: 4 },
  poison: { name: 'Venom Essence',  icon: '☠️', tag: 'poison', stat: 'poison', v: [1, 1, 2, 3], price: 4 },
  heal:   { name: 'Mending Essence',icon: '💗', tag: 'heal',   stat: 'heal',   v: [3, 5, 8, 12], price: 4 },
  shield: { name: 'Warding Essence',icon: '🔷', tag: 'shield', stat: 'shield', v: [4, 6, 9, 13], price: 4 },
  regen:  { name: 'Verdant Essence',icon: '🌱', tag: 'regen',  stat: 'regen',  v: [1, 1, 1, 2], price: 4 },
};

// Modifiers: cheap shop buys that add a flat bonus to one item (and its tag).
// An item has (level + 1) modifier slots. `weight` is how often it appears in the shop.
export const MODIFIERS = {
  whetted:  { name: 'Whetstone Oil', icon: '🔪', stat: 'damage', v: 3, tag: 'weapon', price: 3, weight: 3 },
  kindling: { name: 'Kindling',      icon: '🪵', stat: 'burn',   v: 2, tag: 'fire',   price: 4, weight: 3 },
  venom:    { name: 'Venom Coating', icon: '🦂', stat: 'poison', v: 1, tag: 'poison', price: 4, weight: 3 },
  plating:  { name: 'Iron Plating',  icon: '🔩', stat: 'shield', v: 4, tag: 'shield', price: 3, weight: 3 },
  salve:    { name: 'Healing Salve', icon: '🫙', stat: 'heal',   v: 4, tag: 'heal',   price: 3, weight: 3 },
  sap:      { name: 'Living Sap',    icon: '🍯', stat: 'regen',  v: 1, tag: 'regen',  price: 4, weight: 2 },
  echoRune: { name: 'Echo Rune',     icon: '🔁', multicast: 1, price: 12, weight: 0.4 },
};

// Optional `start`: effects/special that fire once when the battle begins, e.g.
//   start: { effects: { shield: [..] }, special: { kind: 'haste', v: [..], dur: 4 } }
// Rarity tiers: common, uncommon, rare, superrare, legendary. Section headers below are historical;
// the `rarity` field on each item is what counts.
// w = columns wide, h = rows tall. The bar triggers an item when it reaches the item's leftmost column.
export const ITEMS = {
  // ---------- Common ----------
  dagger:   { name: 'Rusty Dagger',  icon: '🗡️', rarity: 'common', w: 1, h: 1, tags: ['weapon'],
              effects: { damage: [6, 9, 13, 19] } },
  torch:    { name: 'Tinder Torch',  icon: '🔥', rarity: 'common', w: 1, h: 1, tags: ['fire'],
              effects: { burn: [3, 4, 6, 8] } },
  vial:     { name: 'Toxic Vial',    icon: '🧪', rarity: 'common', w: 1, h: 1, tags: ['poison'],
              effects: { poison: [2, 3, 4, 5] } },
  bandage:  { name: 'Bandage',       icon: '🩹', rarity: 'common', w: 1, h: 1, tags: ['heal'],
              effects: { heal: [7, 10, 14, 20] } },
  buckler:  { name: 'Wooden Buckler',icon: '🛡️', rarity: 'common', w: 1, h: 2, tags: ['shield'],
              effects: { shield: [7, 10, 14, 20] } },
  herbs:    { name: 'Herb Pouch',    icon: '🌿', rarity: 'common', w: 1, h: 1, tags: ['regen'],
              effects: { regen: [1, 2, 3, 4] } },
  sword:    { name: 'Short Sword',   icon: '⚔️', rarity: 'common', w: 2, h: 1, tags: ['weapon'],
              effects: { damage: [10, 15, 22, 32] } },
  quicksilver:{ name: 'Quicksilver',  icon: '🌀', rarity: 'common', w: 1, h: 1, tags: ['time'],
              special: { kind: 'haste', v: [0.15, 0.2, 0.3, 0.4], dur: 2 } },
  frost:    { name: 'Frost Shard',   icon: '❄️', rarity: 'uncommon', w: 1, h: 1, tags: ['time', 'weapon'],
              effects: { damage: [2, 3, 4, 6] }, special: { kind: 'slow', v: [0.15, 0.2, 0.25, 0.35], dur: 2 } },
  flask:    { name: 'Ember Flask',   icon: '🍶', rarity: 'common', w: 1, h: 1, tags: ['fire'],
              effects: { burn: [1, 1, 2, 3] }, start: { effects: { burn: [4, 6, 8, 11] } } },
  totem:    { name: 'Ward Totem',    icon: '🗿', rarity: 'common', w: 1, h: 2, tags: ['shield'],
              effects: { shield: [3, 4, 6, 8] }, start: { effects: { shield: [10, 15, 21, 30] } } },

  // ---------- (formerly Rare) ----------
  axe:      { name: 'Ember Axe',     icon: '🪓', rarity: 'uncommon', w: 2, h: 1, tags: ['weapon', 'fire'],
              effects: { damage: [6, 8, 11, 16], burn: [2, 2, 3, 5] } },
  fang:     { name: 'Serpent Fang',  icon: '🐍', rarity: 'uncommon', w: 1, h: 1, tags: ['weapon', 'poison'],
              effects: { damage: [3, 5, 7, 10], poison: [1, 2, 2, 3] } },
  bellows:  { name: 'Bellows',       icon: '🌬️', rarity: 'rare', w: 1, h: 1, tags: ['tool', 'fire'],
              special: { kind: 'buffAdj', tag: 'fire', stat: 'burn', v: [2, 3, 4, 5] } },
  whetstone:{ name: 'Whetstone',     icon: '🪨', rarity: 'uncommon', w: 1, h: 1, tags: ['tool'],
              special: { kind: 'buffAdj', tag: 'weapon', stat: 'damage', v: [3, 4, 6, 9] } },
  spring:   { name: 'Healing Spring',icon: '⛲', rarity: 'rare', w: 2, h: 2, tags: ['heal', 'regen'],
              effects: { heal: [9, 13, 18, 26], regen: [1, 1, 2, 3] } },
  tower:    { name: 'Tower Shield',  icon: '🧱', rarity: 'rare', w: 1, h: 3, tags: ['shield'],
              effects: { shield: [16, 23, 32, 45] } },
  hourglass:{ name: 'Hourglass',     icon: '⏳', rarity: 'uncommon', w: 1, h: 1, tags: ['time'],
              special: { kind: 'haste', v: [0.25, 0.35, 0.5, 0.65] } },
  censer:   { name: 'Plague Censer', icon: '🏮', rarity: 'uncommon', w: 1, h: 2, tags: ['poison'],
              effects: { poison: [3, 4, 5, 7] } },

  quickdraw:{ name: 'Quick Draw',    icon: '🏹', rarity: 'rare', w: 1, h: 1, tags: ['weapon', 'time'],
              effects: { damage: [5, 7, 10, 14] }, special: { kind: 'haste', v: [0.2, 0.25, 0.3, 0.4], dur: 2 } },
  tar:      { name: 'Tar Pot',       icon: '🛢️', rarity: 'uncommon', w: 1, h: 1, tags: ['poison', 'time'],
              effects: { poison: [1, 2, 2, 3] }, special: { kind: 'slow', v: [0.2, 0.25, 0.3, 0.4], dur: 2 } },
  horn:     { name: 'War Horn',      icon: '📯', rarity: 'rare', w: 1, h: 1, tags: ['time'],
              effects: { damage: [2, 3, 4, 6] }, start: { special: { kind: 'haste', v: [0.2, 0.3, 0.4, 0.5], dur: 3 } } },
  smoke:    { name: 'Smoke Bomb',    icon: '🌫️', rarity: 'rare', w: 1, h: 1, tags: ['tool', 'time'],
              effects: { shield: [2, 3, 4, 6] }, start: { special: { kind: 'slow', v: [0.2, 0.25, 0.35, 0.45], dur: 3 } } },

  // ---------- (formerly Epic) ----------
  feather:  { name: 'Phoenix Feather',icon: '🪶', rarity: 'superrare', w: 1, h: 1, tags: ['fire', 'heal'],
              effects: { heal: [5, 7, 10, 14], burn: [3, 4, 6, 8] } },
  rewind:   { name: 'Rewind Clock',  icon: '🕰️', rarity: 'superrare', w: 1, h: 1, tags: ['time'],
              special: { kind: 'rewind', v: [2, 2, 3, 4] } },
  chime:    { name: 'Echo Chime',    icon: '🔔', rarity: 'superrare', w: 1, h: 1, tags: ['time'],
              special: { kind: 'echo', v: [1, 1, 1, 2] } },
  alembic:  { name: 'Alchemist Kit', icon: '⚗️', rarity: 'superrare', w: 2, h: 2, tags: ['poison', 'heal'],
              effects: { cleanse: [2, 3, 4, 6], poison: [3, 4, 6, 8] } },
  mirror:   { name: 'Aegis Mirror',  icon: '🪞', rarity: 'superrare', w: 1, h: 2, tags: ['shield', 'weapon'],
              effects: { shield: [10, 14, 20, 28] }, special: { kind: 'bash', v: [0.3, 0.4, 0.5, 0.65] } },
  crown:    { name: 'Ember Crown',   icon: '👑', rarity: 'superrare', w: 1, h: 1, tags: ['fire'],
              effects: { burn: [2, 3, 4, 5] }, special: { kind: 'grow', stat: 'burn', v: [1, 1, 2, 3] } },

  glacier:  { name: 'Glacier Bell',  icon: '🧊', rarity: 'superrare', w: 1, h: 2, tags: ['shield', 'time'],
              effects: { shield: [7, 9, 12, 17] }, special: { kind: 'slow', v: [0.25, 0.3, 0.35, 0.45], dur: 2 } },
  banner:   { name: 'Tailwind Banner',icon: '🚩', rarity: 'superrare', w: 1, h: 2, tags: ['time'],
              effects: { heal: [4, 6, 8, 12] }, special: { kind: 'haste', v: [0.25, 0.3, 0.4, 0.5], dur: 2 },
              start: { special: { kind: 'haste', v: [0.2, 0.3, 0.35, 0.45], dur: 3 } } },
  seed:     { name: 'Ancient Seed',  icon: '🌰', rarity: 'rare', w: 1, h: 1, tags: ['regen', 'heal'],
              effects: { heal: [3, 4, 6, 8] }, start: { effects: { regen: [2, 3, 4, 6] } } },

  // ---------- Legendary ----------
  heart:    { name: 'Inferno Heart', icon: '❤️‍🔥', rarity: 'legendary', w: 2, h: 2, tags: ['fire'],
              effects: { burn: [5, 7, 10, 14] }, special: { kind: 'buffAll', tag: 'fire', stat: 'burn', v: [1, 1, 2, 3] } },
  stone:    { name: "Philosopher's Stone", icon: '💎', rarity: 'legendary', w: 1, h: 1, tags: ['tool'],
              special: { kind: 'amplify', v: [0.4, 0.5, 0.65, 0.85] } },
  core:     { name: 'Overclock Core',icon: '⚙️', rarity: 'legendary', w: 2, h: 1, tags: ['time', 'shield'],
              effects: { shield: [4, 6, 8, 11] }, special: { kind: 'overclock', v: [0.07, 0.09, 0.12, 0.15] } },
  tree:     { name: 'World Tree',    icon: '🌳', rarity: 'legendary', w: 2, h: 3, tags: ['regen', 'heal'],
              effects: { heal: [10, 14, 20, 28], regen: [2, 3, 4, 6] } },
  stasis:   { name: 'Stasis Lantern',icon: '🕯️', rarity: 'legendary', w: 1, h: 1, tags: ['time', 'tool'],
              special: { kind: 'slow', v: [0.2, 0.25, 0.3, 0.4], dur: 2 },
              start: { special: { kind: 'slow', v: [0.4, 0.45, 0.55, 0.65], dur: 4 } } },
  lens:     { name: 'Inferno Lens',  icon: '🔍', rarity: 'legendary', w: 1, h: 1, tags: ['fire', 'tool'],
              special: { kind: 'ignite', v: [1.3, 1.4, 1.55, 1.75] } },

  // ---------- Economy: pay out after fights (only while on your board) ----------
  // gold: { when: 'fight' | 'win', v }   grow: payout starts at 1 and rises by 1 each fight, up to v
  purse:    { name: 'Coin Purse',    icon: '👛', rarity: 'common', w: 1, h: 1, tags: ['tool'],
              gold: { when: 'fight', v: [1, 2, 3, 4] } },
  ledger:   { name: "Merchant's Ledger", icon: '📒', rarity: 'rare', w: 1, h: 1, tags: ['tool'],
              gold: { when: 'win', v: [3, 4, 6, 8] } },
  piggy:    { name: 'Piggy Bank',    icon: '🐷', rarity: 'uncommon', w: 1, h: 2, tags: ['tool'],
              gold: { when: 'fight', grow: true, v: [3, 5, 7, 10] } },
  idol:     { name: 'Golden Idol',   icon: '🏺', rarity: 'superrare', w: 1, h: 1, tags: ['tool', 'shield'],
              effects: { shield: [3, 4, 6, 8] }, gold: { when: 'fight', v: [3, 4, 6, 8] } },
  // map: after this many fights on your board it's used up and you choose an artifact.
  map:      { name: 'Treasure Map',  icon: '🗺️', rarity: 'rare', w: 1, h: 1, tags: ['tool'],
              map: { v: [2, 2, 1, 1] } },

  // Hybrids: fight, and pay gold just for being on your board
  taxman:   { name: 'Tax Collector', icon: '💼', rarity: 'uncommon', w: 1, h: 1, tags: ['weapon', 'tool'],
              effects: { damage: [4, 6, 8, 11] }, gold: { when: 'fight', v: [1, 1, 2, 3] } },
  clover:   { name: 'Lucky Clover',  icon: '🍀', rarity: 'common', w: 1, h: 1, tags: ['regen'],
              effects: { regen: [1, 1, 1, 2] }, gold: { when: 'fight', v: [1, 1, 2, 2] } },
  caravan:  { name: 'Trade Caravan', icon: '🐫', rarity: 'rare', w: 2, h: 1, tags: ['heal', 'tool'],
              effects: { heal: [6, 8, 11, 15] }, gold: { when: 'fight', v: [2, 3, 4, 5] } },
  // Gold on trigger: `gold` effect, paid out after the fight (optional `goldCap` limits it per fight)
  glove:    { name: 'Pickpocket Glove', icon: '🧤', rarity: 'uncommon', w: 1, h: 1, tags: ['weapon'],
              effects: { damage: [3, 4, 6, 8], gold: [1, 1, 1, 1] } },
  midas:    { name: 'Midas Hammer',  icon: '🔨', rarity: 'rare', w: 2, h: 1, tags: ['weapon'],
              effects: { damage: [8, 11, 16, 22], gold: [1, 1, 2, 2] } },
  slots:    { name: 'Slot Machine',  icon: '🎰', rarity: 'superrare', w: 1, h: 1, tags: ['tool'], multicast: 2,
              effects: { gold: [1, 1, 2, 2] } },

  // ---------- Row / column ----------
  drum:     { name: 'War Drum',      icon: '🥁', rarity: 'rare', w: 1, h: 1, tags: ['tool'],
              aura: { scope: 'row', stat: 'damage', v: [3, 4, 6, 8] } },
  lamp:     { name: 'Oil Lamp',      icon: '🪔', rarity: 'uncommon', w: 1, h: 1, tags: ['fire', 'tool'],
              aura: { scope: 'row', stat: 'burn', v: [1, 2, 3, 4] } },
  watchtower:{ name: 'Watchtower',   icon: '🗼', rarity: 'rare', w: 1, h: 1, tags: ['shield'],
              effects: { shield: [3, 4, 6, 8] }, aura: { scope: 'row', stat: 'shield', v: [3, 4, 6, 8] } },
  rat:      { name: 'Plague Rat',    icon: '🐀', rarity: 'rare', w: 1, h: 1, tags: ['poison'],
              effects: { poison: [1, 1, 2, 2] }, special: { kind: 'buffRow', stat: 'poison', v: [1, 1, 1, 2] } },
  forge:    { name: 'Field Forge',   icon: '⚒️', rarity: 'superrare', w: 1, h: 1, tags: ['tool', 'fire'],
              special: { kind: 'buffRow', stat: 'damage', v: [2, 3, 4, 6] } },
  baton:    { name: "Conductor's Baton", icon: '🪄', rarity: 'legendary', w: 1, h: 1, tags: ['time', 'tool'],
              aura: { scope: 'column', multicast: [1, 1, 1, 2] } },

  // ---------- Max HP ----------
  locket:   { name: 'Heart Locket',  icon: '💖', rarity: 'uncommon', w: 1, h: 1, tags: ['heal'],
              effects: { heal: [2, 3, 4, 6] }, start: { effects: { maxhp: [8, 12, 18, 26] } } },
  trollblood:{ name: 'Troll Blood',  icon: '🩸', rarity: 'rare', w: 1, h: 1, tags: ['regen'],
              effects: { maxhp: [5, 7, 10, 14], heal: [2, 3, 4, 6] } },
  belt:     { name: "Giant's Belt",  icon: '🎗️', rarity: 'superrare', w: 2, h: 1, tags: ['shield'],
              effects: { shield: [4, 6, 8, 11] }, start: { effects: { maxhp: [20, 30, 42, 60] } } },

  // ---------- Triggers: react to your other items ----------
  sparkplug:{ name: 'Spark Plug',    icon: '🔌', rarity: 'rare', w: 1, h: 1, tags: ['fire', 'tool'],
              on: { event: 'activate', scope: 'adjacent', effects: { burn: [1, 1, 2, 3] } } },
  leech:    { name: 'Leech Jar',     icon: '🪱', rarity: 'uncommon', w: 1, h: 1, tags: ['poison', 'heal'],
              on: { event: 'poison', effects: { heal: [2, 3, 4, 6] } } },
  thorns:   { name: 'Thorn Mail',    icon: '🌵', rarity: 'superrare', w: 1, h: 2, tags: ['shield', 'weapon'],
              effects: { shield: [5, 7, 10, 14] }, on: { event: 'shield', effects: { damage: [3, 4, 6, 8] } } },
  cinderward:{ name: 'Cinder Ward',  icon: '🔶', rarity: 'superrare', w: 1, h: 1, tags: ['fire', 'shield'],
              on: { event: 'burn', effects: { shield: [2, 3, 4, 6] } } },
  metronome:{ name: 'Metronome',     icon: '🎼', rarity: 'legendary', w: 1, h: 1, tags: ['time', 'weapon'],
              on: { event: 'activate', effects: { damage: [2, 2, 3, 5] } } },

  // ---------- Built-in multicast ----------
  twinblades:{ name: 'Twin Blades',  icon: '✂️', rarity: 'uncommon', w: 2, h: 1, tags: ['weapon'], multicast: 2,
              effects: { damage: [4, 6, 9, 13] } },
  crossbow: { name: 'Repeater Crossbow', icon: '🎯', rarity: 'rare', w: 1, h: 1, tags: ['weapon'], multicast: 3,
              effects: { damage: [2, 3, 4, 6] } },
  sparks:   { name: 'Ember Sparks',  icon: '✨', rarity: 'uncommon', w: 1, h: 1, tags: ['fire'], multicast: 2,
              effects: { burn: [1, 1, 2, 3] } },
  drip:     { name: 'Venom Drip',    icon: '💧', rarity: 'superrare', w: 1, h: 1, tags: ['poison'], multicast: 3,
              effects: { poison: [1, 2, 2, 3] } },

  // ---------- Auras: boost your other items by type or condition ----------
  standard: { name: 'Battle Standard', icon: '🏳️', rarity: 'rare', w: 1, h: 1, tags: ['tool'],
              aura: { tag: 'weapon', stat: 'damage', v: [2, 3, 4, 6] } },
  coldsteel:{ name: 'Cold Steel',    icon: '🥶', rarity: 'rare', w: 1, h: 1, tags: ['weapon', 'time'],
              effects: { damage: [3, 4, 6, 8] }, aura: { tag: 'weapon', stat: 'damage', v: [3, 4, 6, 8], cond: 'enemySlowed' } },
  lastlight:{ name: 'Last Light',    icon: '🔦', rarity: 'rare', w: 1, h: 1, tags: ['heal'],
              aura: { tag: 'heal', stat: 'heal', v: [2, 3, 4, 6] },
              effects: { heal: [3, 4, 6, 8] } },
  brimstone:{ name: 'Brimstone Altar', icon: '🌋', rarity: 'superrare', w: 1, h: 2, tags: ['fire'],
              effects: { burn: [2, 3, 4, 5] }, aura: { tag: 'fire', stat: 'burn', v: [1, 1, 2, 3] } },
  mask:     { name: 'Plague Mask',   icon: '🎭', rarity: 'superrare', w: 1, h: 1, tags: ['poison'],
              aura: { tag: 'poison', stat: 'poison', v: [1, 2, 2, 3] } },
  headsman: { name: "Headsman's Seal", icon: '⚖️', rarity: 'legendary', w: 1, h: 1, tags: ['weapon', 'tool'],
              aura: { tag: 'weapon', stat: 'damage', v: [0.2, 0.25, 0.35, 0.5], pct: true } },
};

