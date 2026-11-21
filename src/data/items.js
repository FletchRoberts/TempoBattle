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
  charge:    { text: (s, V) => s.scope === 'adjacent' ? `Give adjacent items +${V} charge` : `Give your items in the same ${s.scope} +${V} charge` },
  grow:      { text: (s, V) => `This item gains +${V} ${STAT_NAME[s.stat]} each time it activates` },
  buffRow:   { text: (s, V) => `Your items in the same row that have ${STAT_NAME[s.stat]} gain +${V} ${STAT_NAME[s.stat]} for this fight` },
  buffCol:   { text: (s, V) => `Your items in the same column that have ${STAT_NAME[s.stat]} gain +${V} ${STAT_NAME[s.stat]} for this fight` },
  bash:      { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `Then deal damage equal to ${V} of your Shield` },
  ignite:    { fmt: v => '×' + v, text: (s, V) => `Multiply the enemy's Burn by ${V}` },
};

// Infusions ("instilling" an item with another type). Adds a stat that scales with the item's tier, plus the tag.
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
  fire:   { name: 'Ember Essence',  icon: '🔥', tag: 'fire',   stat: 'burn',   v: [5, 7, 10, 15, 20], price: 4 },
  poison: { name: 'Venom Essence',  icon: '☠️', tag: 'poison', stat: 'poison', v: [6, 6, 12, 18, 24], price: 4 },
  heal:   { name: 'Mending Essence',icon: '💗', tag: 'heal',   stat: 'heal',   v: [18, 30, 48, 72, 96], price: 4 },
  shield: { name: 'Warding Essence',icon: '🔷', tag: 'shield', stat: 'shield', v: [24, 36, 54, 78, 108], price: 4 },
  regen:  { name: 'Verdant Essence',icon: '🌱', tag: 'regen',  stat: 'regen',  v: [6, 6, 6, 12, 18], price: 4 },
};

// Modifiers: cheap shop buys that add a flat bonus to one item (and its tag).
// No limit per item. `weight` is how often it appears in the shop.
export const MODIFIERS = {
  whetted:  { name: 'Whetstone Oil', icon: '🔪', stat: 'damage', v: 30, tag: 'weapon', price: 3, weight: 3 },
  kindling: { name: 'Kindling',      icon: '🪵', stat: 'burn',   v: 5, tag: 'fire',   price: 4, weight: 3 },
  venom:    { name: 'Venom Coating', icon: '🦂', stat: 'poison', v: 6, tag: 'poison', price: 4, weight: 3 },
  plating:  { name: 'Iron Plating',  icon: '🔩', stat: 'shield', v: 24, tag: 'shield', price: 3, weight: 3 },
  salve:    { name: 'Healing Salve', icon: '🫙', stat: 'heal',   v: 24, tag: 'heal',   price: 3, weight: 3 },
  sap:      { name: 'Living Sap',    icon: '🍯', stat: 'regen',  v: 6, tag: 'regen',  price: 4, weight: 2 },
  echoRune: { name: 'Echo Rune',     icon: '🔁', multicast: 1, price: 12, weight: 0.4 },
};

// Items, grouped by starting rarity. Upgrading (merging two copies) moves an item up one tier,
// so every per-level array has one value per tier it can reach: Common 5, Uncommon 4, Rare 3,
// Super Rare 2, Legendary 1 (Legendaries can't be upgraded).
// Charge: each time the bar hits an item it gains 1 charge; at `charge` charges (default 4, or one
// value per tier) it fires and spends them. `accel` = charges saved each time it fires, down to
// `minCharge`. Items with only on / aura / gold / map / start (or amplify) are passive and don't charge.
// Other optional fields: effects, special, start { effects, special }, on { event, scope, effects },
// aura { tag, stat|multicast, v, pct, cond, scope }, gold { when, v, grow }, map { v }, goldCap.
export const ITEMS = {
  // ---------- Common (5 tiers) ----------
  dagger: { name: 'Rusty Dagger', icon: '🗡️', rarity: 'common', w: 1, h: 1, tags: ['weapon'], charge: 2,
      effects: { damage: [24, 36, 54, 84, 126] } },
  torch: { name: 'Tinder Torch', icon: '🔥', rarity: 'common', w: 1, h: 1, tags: ['fire'], charge: 3,
      effects: { burn: [5, 7, 10, 12, 17] } },
  vial: { name: 'Toxic Vial', icon: '🧪', rarity: 'common', w: 1, h: 1, tags: ['poison'], charge: 3,
      effects: { poison: [12, 12, 18, 18, 24] } },
  bandage: { name: 'Bandage', icon: '🩹', rarity: 'common', w: 1, h: 1, tags: ['heal'],
      effects: { heal: [42, 60, 84, 120, 156] } },
  buckler: { name: 'Wooden Buckler', icon: '🛡️', rarity: 'common', w: 1, h: 2, tags: ['shield'],
      effects: { shield: [42, 60, 84, 120, 156] } },
  herbs: { name: 'Herb Pouch', icon: '🌿', rarity: 'common', w: 1, h: 1, tags: ['regen'], charge: 6,
      effects: { regen: [12, 18, 30, 36, 48] } },
  sword: { name: 'Short Sword', icon: '⚔️', rarity: 'common', w: 2, h: 1, tags: ['weapon'], charge: 5,
      effects: { damage: [96, 150, 234, 360, 558] } },
  quicksilver: { name: 'Quicksilver', icon: '🌀', rarity: 'common', w: 1, h: 1, tags: ['time'],
      special: { kind: 'haste', v: [0.1, 0.15, 0.2, 0.25, 0.3], dur: 2 } },
  flask: { name: 'Ember Flask', icon: '🍶', rarity: 'common', w: 1, h: 1, tags: ['fire'], charge: 3,
      effects: { burn: [2, 2, 5, 5, 7] }, start: { effects: { burn: [7, 12, 17, 22, 29] } } },
  totem: { name: 'Ward Totem', icon: '🗿', rarity: 'common', w: 1, h: 2, tags: ['shield'],
      effects: { shield: [18, 24, 36, 48, 60] }, start: { effects: { shield: [60, 90, 126, 180, 234] } } },
  purse: { name: 'Coin Purse', icon: '👛', rarity: 'common', w: 1, h: 1, tags: ['tool'],
      gold: { when: 'fight', v: [1, 2, 3, 4, 5] } },
  clover: { name: 'Lucky Clover', icon: '🍀', rarity: 'common', w: 1, h: 1, tags: ['regen'],
      effects: { regen: [6, 6, 6, 12, 18] }, gold: { when: 'fight', v: [1, 1, 2, 2, 2] } },
  // ---------- Uncommon (4 tiers) ----------
  frost: { name: 'Frost Shard', icon: '❄️', rarity: 'uncommon', w: 1, h: 1, tags: ['time', 'weapon'], charge: 3,
      effects: { damage: [12, 18, 24, 42] }, special: { kind: 'slow', v: [0.08, 0.12, 0.16, 0.2], dur: 2 } },
  axe: { name: 'Ember Axe', icon: '🪓', rarity: 'uncommon', w: 2, h: 1, tags: ['weapon', 'fire'], charge: [5, 5, 4, 3],
      effects: { damage: [54, 84, 132, 204], burn: [5, 5, 7, 12] } },
  fang: { name: 'Serpent Fang', icon: '🐍', rarity: 'uncommon', w: 1, h: 1, tags: ['weapon', 'poison'], charge: 3,
      effects: { damage: [18, 30, 48, 72], poison: [6, 12, 12, 12] } },
  whetstone: { name: 'Whetstone', icon: '🪨', rarity: 'uncommon', w: 1, h: 1, tags: ['tool'],
      special: { kind: 'buffAdj', tag: 'weapon', stat: 'damage', v: [30, 36, 54, 84] } },
  hourglass: { name: 'Hourglass', icon: '⏳', rarity: 'uncommon', w: 1, h: 1, tags: ['time'], charge: [4, 3, 3, 2],
      special: { kind: 'haste', v: [0.12, 0.16, 0.2, 0.25] } },
  censer: { name: 'Plague Censer', icon: '🏮', rarity: 'uncommon', w: 1, h: 2, tags: ['poison'], charge: 5,
      effects: { poison: [24, 30, 36, 54] } },
  tar: { name: 'Tar Pot', icon: '🛢️', rarity: 'uncommon', w: 1, h: 1, tags: ['poison', 'time'],
      effects: { poison: [6, 12, 12, 18] }, special: { kind: 'slow', v: [0.12, 0.16, 0.2, 0.25], dur: 2 } },
  piggy: { name: 'Piggy Bank', icon: '🐷', rarity: 'uncommon', w: 1, h: 2, tags: ['tool'],
      gold: { when: 'fight', grow: true, v: [3, 5, 7, 10] } },
  taxman: { name: 'Tax Collector', icon: '💼', rarity: 'uncommon', w: 1, h: 1, tags: ['weapon', 'tool'],
      effects: { damage: [36, 54, 84, 132] }, gold: { when: 'fight', v: [1, 1, 2, 3] } },
  glove: { name: 'Pickpocket Glove', icon: '🧤', rarity: 'uncommon', w: 1, h: 1, tags: ['weapon'],
      effects: { damage: [30, 48, 72, 114], gold: [1, 1, 1, 1] } },
  lamp: { name: 'Oil Lamp', icon: '🪔', rarity: 'uncommon', w: 1, h: 1, tags: ['fire', 'tool'],
      aura: { scope: 'row', stat: 'burn', v: [2, 5, 7, 10] } },
  locket: { name: 'Heart Locket', icon: '💖', rarity: 'uncommon', w: 1, h: 1, tags: ['heal'],
      effects: { heal: [12, 18, 24, 36] }, start: { effects: { maxhp: [48, 72, 108, 156] } } },
  leech: { name: 'Leech Jar', icon: '🪱', rarity: 'uncommon', w: 1, h: 1, tags: ['poison', 'heal'],
      on: { event: 'poison', effects: { heal: [12, 18, 24, 36] } } },
  twinblades: { name: 'Twin Blades', icon: '✂️', rarity: 'uncommon', w: 2, h: 1, tags: ['weapon'], multicast: 2, charge: 3,
      effects: { damage: [24, 36, 54, 84] } },
  sparks: { name: 'Ember Sparks', icon: '✨', rarity: 'uncommon', w: 1, h: 1, tags: ['fire'], multicast: 2, charge: 4,
      effects: { burn: [2, 2, 5, 5] } },
  capacitor: { name: 'Capacitor', icon: '🔋', rarity: 'uncommon', w: 1, h: 1, tags: ['tool'],
      start: { special: { kind: 'charge', scope: 'adjacent', v: [2, 2, 3, 3] } } },
  // ---------- Rare (3 tiers) ----------
  bellows: { name: 'Bellows', icon: '🌬️', rarity: 'rare', w: 1, h: 1, tags: ['tool', 'fire'],
      special: { kind: 'buffAdj', tag: 'fire', stat: 'burn', v: [5, 7, 10] } },
  spring: { name: 'Healing Spring', icon: '⛲', rarity: 'rare', w: 2, h: 2, tags: ['heal', 'regen'], charge: 5,
      effects: { heal: [66, 96, 138], regen: [6, 6, 18] } },
  tower: { name: 'Tower Shield', icon: '🧱', rarity: 'rare', w: 1, h: 3, tags: ['shield'], charge: 6,
      effects: { shield: [144, 210, 288] } },
  quickdraw: { name: 'Quick Draw', icon: '🏹', rarity: 'rare', w: 1, h: 1, tags: ['weapon', 'time'], charge: 2,
      effects: { damage: [18, 30, 48] }, special: { kind: 'haste', v: [0.2, 0.25, 0.3], dur: 2 } },
  seed: { name: 'Ancient Seed', icon: '🌰', rarity: 'rare', w: 1, h: 1, tags: ['regen', 'heal'],
      effects: { heal: [18, 24, 36] }, start: { effects: { regen: [12, 18, 24] } } },
  ledger: { name: "Merchant's Ledger", icon: '📒', rarity: 'rare', w: 1, h: 1, tags: ['tool'],
      gold: { when: 'win', v: [3, 4, 6] } },
  map: { name: 'Treasure Map', icon: '🗺️', rarity: 'rare', w: 1, h: 1, tags: ['tool'],
      map: { v: [2, 2, 1] } },
  caravan: { name: 'Trade Caravan', icon: '🐫', rarity: 'rare', w: 2, h: 1, tags: ['heal', 'tool'],
      effects: { heal: [36, 48, 66] }, gold: { when: 'fight', v: [2, 3, 4] } },
  midas: { name: 'Midas Hammer', icon: '🔨', rarity: 'rare', w: 2, h: 1, tags: ['weapon'], charge: 5,
      effects: { damage: [90, 144, 216], gold: [1, 1, 2] } },
  drum: { name: 'War Drum', icon: '🥁', rarity: 'rare', w: 1, h: 1, tags: ['tool'],
      aura: { scope: 'row', stat: 'damage', v: [30, 36, 54] } },
  watchtower: { name: 'Watchtower', icon: '🗼', rarity: 'rare', w: 1, h: 1, tags: ['shield'],
      effects: { shield: [18, 24, 36] }, aura: { scope: 'row', stat: 'shield', v: [18, 24, 36] } },
  rat: { name: 'Plague Rat', icon: '🐀', rarity: 'rare', w: 1, h: 1, tags: ['poison'],
      effects: { poison: [6, 6, 12] }, special: { kind: 'buffRow', stat: 'poison', v: [6, 6, 6] } },
  trollblood: { name: 'Troll Blood', icon: '🩸', rarity: 'rare', w: 1, h: 1, tags: ['regen'],
      effects: { maxhp: [30, 42, 60], heal: [12, 18, 24] } },
  sparkplug: { name: 'Spark Plug', icon: '🔌', rarity: 'rare', w: 1, h: 1, tags: ['fire', 'tool'],
      on: { event: 'activate', scope: 'adjacent', effects: { burn: [2, 2, 5] } } },
  crossbow: { name: 'Repeater Crossbow', icon: '🎯', rarity: 'rare', w: 1, h: 1, tags: ['weapon'], multicast: 3, charge: [4, 3, 3],
      effects: { damage: [12, 24, 36] } },
  standard: { name: 'Battle Standard', icon: '🏳️', rarity: 'rare', w: 1, h: 1, tags: ['tool'],
      aura: { tag: 'weapon', stat: 'damage', v: [18, 30, 36] } },
  coldsteel: { name: 'Cold Steel', icon: '🥶', rarity: 'rare', w: 1, h: 1, tags: ['weapon', 'time'],
      effects: { damage: [30, 48, 72] }, aura: { tag: 'weapon', stat: 'damage', v: [30, 36, 54], cond: 'enemySlowed' } },
  lastlight: { name: 'Last Light', icon: '🔦', rarity: 'rare', w: 1, h: 1, tags: ['heal'],
      aura: { tag: 'heal', stat: 'heal', v: [12, 18, 24] }, effects: { heal: [18, 24, 36] } },
  relay: { name: 'Relay', icon: '🔁', rarity: 'rare', w: 1, h: 1, tags: ['tool', 'time'],
      on: { event: 'activate', scope: 'adjacent', special: { kind: 'charge', scope: 'adjacent', v: [1, 1, 2] } } },
  dynamo: { name: 'Dynamo', icon: '⚡', rarity: 'rare', w: 1, h: 1, tags: ['tool', 'time'], charge: 4,
      special: { kind: 'charge', scope: 'adjacent', v: [1, 1, 2] } },
  flywheel: { name: 'Flywheel', icon: '🛞', rarity: 'rare', w: 2, h: 1, tags: ['weapon'], charge: 7, accel: 2, minCharge: 2,
      effects: { damage: [180, 270, 408] } },
  // ---------- Super Rare (2 tiers) ----------
  horn: { name: 'War Horn', icon: '📯', rarity: 'superrare', w: 1, h: 1, tags: ['time'],
      effects: { damage: [18, 30] }, start: { special: { kind: 'haste', v: [0.3, 0.38], dur: 3 } } },
  smoke: { name: 'Smoke Bomb', icon: '🌫️', rarity: 'superrare', w: 1, h: 1, tags: ['tool', 'time'],
      effects: { shield: [12, 18] }, start: { special: { kind: 'slow', v: [0.2, 0.3], dur: 3 } } },
  feather: { name: 'Phoenix Feather', icon: '🪶', rarity: 'superrare', w: 1, h: 1, tags: ['fire', 'heal'],
      effects: { heal: [30, 42], burn: [7, 10] } },
  rewind: { name: 'Rewind Clock', icon: '🕰️', rarity: 'superrare', w: 1, h: 1, tags: ['time'], charge: [6, 5],
      special: { kind: 'rewind', v: [2, 2] } },
  alembic: { name: 'Alchemist Kit', icon: '⚗️', rarity: 'superrare', w: 2, h: 2, tags: ['poison', 'heal'], charge: 5,
      effects: { cleanse: [18, 24], poison: [24, 30] } },
  mirror: { name: 'Aegis Mirror', icon: '🪞', rarity: 'superrare', w: 1, h: 2, tags: ['shield', 'weapon'],
      effects: { shield: [60, 84] }, special: { kind: 'bash', v: [0.3, 0.4] } },
  crown: { name: 'Ember Crown', icon: '👑', rarity: 'superrare', w: 1, h: 1, tags: ['fire'], charge: 5, accel: 1, minCharge: 2,
      effects: { burn: [5, 7] }, special: { kind: 'grow', stat: 'burn', v: [2, 2] } },
  glacier: { name: 'Glacier Bell', icon: '🧊', rarity: 'superrare', w: 1, h: 2, tags: ['shield', 'time'],
      effects: { shield: [42, 54] }, special: { kind: 'slow', v: [0.2, 0.25], dur: 2 } },
  idol: { name: 'Golden Idol', icon: '🏺', rarity: 'superrare', w: 1, h: 1, tags: ['tool', 'shield'],
      effects: { shield: [18, 24] }, gold: { when: 'fight', v: [3, 4] } },
  slots: { name: 'Slot Machine', icon: '🎰', rarity: 'superrare', w: 1, h: 1, tags: ['tool'], multicast: 2, charge: [3, 2],
      effects: { gold: [1, 1] } },
  forge: { name: 'Field Forge', icon: '⚒️', rarity: 'superrare', w: 1, h: 1, tags: ['tool', 'fire'],
      special: { kind: 'buffRow', stat: 'damage', v: [18, 30] } },
  belt: { name: "Giant's Belt", icon: '🎗️', rarity: 'superrare', w: 2, h: 1, tags: ['shield'],
      effects: { shield: [24, 36] }, start: { effects: { maxhp: [120, 180] } } },
  thorns: { name: 'Thorn Mail', icon: '🌵', rarity: 'superrare', w: 1, h: 2, tags: ['shield', 'weapon'],
      effects: { shield: [30, 42] }, on: { event: 'shield', effects: { damage: [30, 48] } } },
  cinderward: { name: 'Cinder Ward', icon: '🔶', rarity: 'superrare', w: 1, h: 1, tags: ['fire', 'shield'],
      on: { event: 'burn', effects: { shield: [12, 18] } } },
  drip: { name: 'Venom Drip', icon: '💧', rarity: 'superrare', w: 1, h: 1, tags: ['poison'], multicast: 3,
      effects: { poison: [6, 12] } },
  brimstone: { name: 'Brimstone Altar', icon: '🌋', rarity: 'superrare', w: 1, h: 2, tags: ['fire'],
      effects: { burn: [5, 7] }, aura: { tag: 'fire', stat: 'burn', v: [2, 2] } },
  mask: { name: 'Plague Mask', icon: '🎭', rarity: 'superrare', w: 1, h: 1, tags: ['poison'],
      aura: { tag: 'poison', stat: 'poison', v: [6, 12] } },
  coil: { name: 'Tesla Coil', icon: '🌩️', rarity: 'superrare', w: 1, h: 2, tags: ['tool', 'time'], charge: 4,
      special: { kind: 'charge', scope: 'row', v: [1, 2] } },
  // ---------- Legendary (1 tier) ----------
  chime: { name: 'Echo Chime', icon: '🔔', rarity: 'legendary', w: 1, h: 1, tags: ['time'], charge: 8,
      special: { kind: 'echo', v: [1] } },
  banner: { name: 'Tailwind Banner', icon: '🚩', rarity: 'legendary', w: 1, h: 2, tags: ['time'],
      effects: { heal: [24] }, special: { kind: 'haste', v: [0.3], dur: 2 }, start: { special: { kind: 'haste', v: [0.4], dur: 3 } } },
  heart: { name: 'Inferno Heart', icon: '❤️‍🔥', rarity: 'legendary', w: 2, h: 2, tags: ['fire'], charge: 8, accel: 2, minCharge: 2,
      effects: { burn: [20] }, special: { kind: 'buffAll', tag: 'fire', stat: 'burn', v: [2] } },
  stone: { name: "Philosopher's Stone", icon: '💎', rarity: 'legendary', w: 1, h: 1, tags: ['tool'],
      special: { kind: 'amplify', v: [0.4] } },
  core: { name: 'Overclock Core', icon: '⚙️', rarity: 'legendary', w: 2, h: 1, tags: ['time', 'shield'], charge: 5,
      effects: { shield: [24] }, special: { kind: 'overclock', v: [0.07] } },
  tree: { name: 'World Tree', icon: '🌳', rarity: 'legendary', w: 2, h: 3, tags: ['regen', 'heal'], charge: 6,
      effects: { heal: [90], regen: [18] } },
  stasis: { name: 'Stasis Lantern', icon: '🕯️', rarity: 'legendary', w: 1, h: 1, tags: ['time', 'tool'],
      special: { kind: 'slow', v: [0.2], dur: 2 }, start: { special: { kind: 'slow', v: [0.3], dur: 3 } } },
  lens: { name: 'Inferno Lens', icon: '🔍', rarity: 'legendary', w: 1, h: 1, tags: ['fire', 'tool'],
      special: { kind: 'ignite', v: [1.3] } },
  baton: { name: "Conductor's Baton", icon: '🪄', rarity: 'legendary', w: 1, h: 1, tags: ['time', 'tool'],
      aura: { scope: 'column', multicast: [1] } },
  metronome: { name: 'Metronome', icon: '🎼', rarity: 'legendary', w: 1, h: 1, tags: ['time', 'weapon'],
      on: { event: 'activate', effects: { damage: [18] } } },
  headsman: { name: "Headsman's Seal", icon: '⚖️', rarity: 'legendary', w: 1, h: 1, tags: ['weapon', 'tool'],
      aura: { tag: 'weapon', stat: 'damage', v: [0.2], pct: true } },
};
