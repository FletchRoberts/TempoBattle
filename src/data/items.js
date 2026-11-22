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
  activate: s => s.cat ? (s.scope === 'adjacent' ? `When an adjacent ${s.cat} item activates` : `When you use another ${s.cat} item`)
    : s.scope === 'adjacent' ? 'When an adjacent item activates' : 'When any of your other items activates',
  burn: () => 'When you apply Burn', poison: () => 'When you apply Poison',
  shield: () => 'When you gain Shield', heal: () => 'When you Heal', damage: () => 'When you deal weapon damage',
};
// Auras (`aura`): passive bonus to your other items with a tag (or any item, if no tag), optionally
// only under a condition, and optionally only for items sharing its row or column (`scope`).
// `multicast` instead of `stat` adds extra activations.
export const AURA_SCOPE = { row: 'in the same row', column: 'in the same column', adjacent: 'next to it' };
// Thematic categories, with a one-line description for the inspector and How to play.
export const CATEGORIES = {
  Melee: 'swords, daggers, axes, hammers', Ranged: 'bows, crossbows, thrown things', Armor: 'shields, mail, belts, gloves',
  Clockwork: 'gears, clocks, coils, engines', Alchemy: 'vials, flasks, potions, censers', Remedy: 'bandages and healing',
  Flora: 'herbs, seeds, trees', Beast: 'creatures and their parts', Hearth: 'torches, lamps, bellows, braziers',
  Frost: 'ice and cold steel', Relic: 'crowns, masks, idols, old magic', Treasure: 'coins, ledgers, maps, rings',
  Herald: 'horns, drums, bells, banners', Landmark: 'towers, altars, springs, forges',
};
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
  charge:    { text: (s, V) => s.scope === 'self' ? `Give this +${V} charge` : s.scope === 'adjacent' ? `Give adjacent${s.cat ? ' ' + s.cat : ''} items +${V} charge`
                 : s.scope === 'all' ? `Give your${s.cat ? ' ' + s.cat : ''} items +${V} charge` : `Give your${s.cat ? ' ' + s.cat : ''} items in the same ${s.scope} +${V} charge` },
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
// An infusion adds `pct` of the item's power (its per-fire numbers in damage terms, see STAT_WEIGHT)
// as its own stat, so it scales with the item: big items get big infusions.
export const INFUSIONS = {
  fire:   { name: 'Ember Essence',  icon: '🔥', tag: 'fire',   stat: 'burn',   pct: 0.3,  price: 4 },
  poison: { name: 'Venom Essence',  icon: '☠️', tag: 'poison', stat: 'poison', pct: 0.3,  price: 4 },
  heal:   { name: 'Mending Essence',icon: '💗', tag: 'heal',   stat: 'heal',   pct: 0.4,  price: 4 },
  shield: { name: 'Warding Essence',icon: '🔷', tag: 'shield', stat: 'shield', pct: 0.4,  price: 4 },
  regen:  { name: 'Verdant Essence',icon: '🌱', tag: 'regen',  stat: 'regen',  pct: 0.25, price: 4 },
};
// How much one point of each stat is worth in damage, read off how Common items balance:
// e.g. 1 Burn ~ 7 damage (it ticks and decays), 1 Regen ~ 8 (heals every second all fight).
export const STAT_WEIGHT = { damage: 1, shield: 1.15, heal: 1.15, burn: 7, poison: 3, regen: 8, maxhp: 0.6, cleanse: 1 };

// Modifiers: cheap shop buys that add a flat bonus to one item (and its tag).
// No limit per item. `weight` is how often it appears in the shop.
export const MODIFIERS = {
  whetted:  { name: 'Whetstone Oil', icon: '🔪', stat: 'damage', v: 30, tag: 'weapon', price: 3, weight: 3 },
  kindling: { name: 'Kindling',      icon: '🪵', stat: 'burn',   v: 5, tag: 'fire',   price: 4, weight: 3 },
  venom:    { name: 'Venom Coating', icon: '🦂', stat: 'poison', v: 5, tag: 'poison', price: 4, weight: 3 },
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
  dagger: { name: 'Rusty Dagger', icon: '🗡️', rarity: 'common', w: 1, h: 1, cats: ['Melee'], tags: ['weapon'], charge: 2,
      effects: { damage: [28, 41, 62, 97, 145] } },
  torch: { name: 'Tinder Torch', icon: '🔥', rarity: 'common', w: 1, h: 1, cats: ['Hearth'], tags: ['fire'], charge: 3,
      effects: { burn: [5, 7, 10, 12, 17] } },
  vial: { name: 'Toxic Vial', icon: '🧪', rarity: 'common', w: 1, h: 1, cats: ['Alchemy'], tags: ['poison'], charge: 3,
      effects: { poison: [9, 9, 14, 14, 18] } },
  bandage: { name: 'Bandage', icon: '🩹', rarity: 'common', w: 1, h: 1, cats: ['Remedy'], tags: ['heal'],
      effects: { heal: [50, 72, 101, 144, 187] } },
  buckler: { name: 'Wooden Buckler', icon: '🛡️', rarity: 'common', w: 1, h: 2, cats: ['Armor'], tags: ['shield'],
      effects: { shield: [42, 60, 84, 120, 156] } },
  herbs: { name: 'Herb Pouch', icon: '🌿', rarity: 'common', w: 1, h: 1, cats: ['Flora', 'Remedy'], tags: ['regen'], charge: 6,
      effects: { regen: [14, 22, 36, 43, 58] } },
  sword: { name: 'Short Sword', icon: '⚔️', rarity: 'common', w: 2, h: 1, cats: ['Melee'], tags: ['weapon'], charge: 5,
      effects: { damage: [110, 173, 269, 414, 642] } },
  quicksilver: { name: 'Quicksilver', icon: '🌀', rarity: 'common', w: 1, h: 1, cats: ['Alchemy'], tags: ['time'],
      special: { kind: 'haste', v: [0.1, 0.15, 0.2, 0.25, 0.3], dur: 2 } },
  flask: { name: 'Ember Flask', icon: '🍶', rarity: 'common', w: 1, h: 1, cats: ['Alchemy', 'Hearth'], tags: ['fire'], charge: 3,
      effects: { burn: [2, 2, 5, 5, 7] }, start: { effects: { burn: [7, 12, 17, 22, 29] } } },
  totem: { name: 'Ward Totem', icon: '🗿', rarity: 'common', w: 1, h: 2, cats: ['Relic'], tags: ['shield'],
      effects: { shield: [18, 24, 36, 48, 60] }, start: { effects: { shield: [60, 90, 126, 180, 234] } } },
  purse: { name: 'Coin Purse', icon: '👛', rarity: 'common', w: 1, h: 1, cats: ['Treasure'], tags: ['tool'],
      gold: { when: 'fight', v: [1, 2, 3, 4, 5] } },
  clover: { name: 'Lucky Clover', icon: '🍀', rarity: 'common', w: 1, h: 1, cats: ['Flora', 'Treasure'], tags: ['regen'],
      effects: { regen: [7, 7, 7, 14, 22] }, gold: { when: 'fight', v: [1, 1, 2, 2, 2] } },
  // ---------- Uncommon (4 tiers) ----------
  frost: { name: 'Frost Shard', icon: '❄️', rarity: 'uncommon', w: 1, h: 1, cats: ['Frost', 'Ranged'], tags: ['time', 'weapon'], charge: 3,
      effects: { damage: [14, 21, 28, 48] }, special: { kind: 'slow', v: [0.08, 0.12, 0.16, 0.2], dur: 2 } },
  axe: { name: 'Ember Axe', icon: '🪓', rarity: 'uncommon', w: 2, h: 1, cats: ['Melee', 'Hearth'], tags: ['weapon', 'fire'], charge: [5, 5, 4, 3],
      effects: { damage: [62, 97, 152, 235], burn: [5, 5, 7, 12] } },
  fang: { name: 'Serpent Fang', icon: '🐍', rarity: 'uncommon', w: 1, h: 1, cats: ['Beast'], tags: ['weapon', 'poison'], charge: 3,
      effects: { damage: [21, 35, 55, 83], poison: [5, 9, 9, 9] } },
  whetstone: { name: 'Whetstone', icon: '🪨', rarity: 'uncommon', w: 1, h: 1, cats: ['Melee'], tags: ['tool'],
      special: { kind: 'buffAdj', tag: 'weapon', stat: 'damage', v: [35, 41, 62, 97] } },
  hourglass: { name: 'Hourglass', icon: '⏳', rarity: 'uncommon', w: 1, h: 1, cats: ['Clockwork'], tags: ['time'], charge: [4, 3, 3, 2],
      special: { kind: 'haste', v: [0.12, 0.16, 0.2, 0.25] } },
  censer: { name: 'Plague Censer', icon: '🏮', rarity: 'uncommon', w: 1, h: 2, cats: ['Alchemy', 'Relic'], tags: ['poison'], charge: 5,
      effects: { poison: [18, 23, 27, 41] } },
  tar: { name: 'Tar Pot', icon: '🛢️', rarity: 'uncommon', w: 1, h: 1, cats: ['Alchemy'], tags: ['poison', 'time'],
      effects: { poison: [5, 9, 9, 14] }, special: { kind: 'slow', v: [0.12, 0.16, 0.2, 0.25], dur: 2 } },
  piggy: { name: 'Piggy Bank', icon: '🐷', rarity: 'uncommon', w: 1, h: 2, cats: ['Treasure'], tags: ['tool'],
      gold: { when: 'fight', grow: true, v: [3, 5, 7, 10] } },
  taxman: { name: 'Tax Collector', icon: '💼', rarity: 'uncommon', w: 1, h: 1, cats: ['Treasure'], tags: ['weapon', 'tool'],
      effects: { damage: [41, 62, 97, 152] }, gold: { when: 'fight', v: [1, 1, 2, 3] } },
  glove: { name: 'Pickpocket Glove', icon: '🧤', rarity: 'uncommon', w: 1, h: 1, cats: ['Armor', 'Treasure'], tags: ['weapon'],
      effects: { damage: [35, 55, 83, 131], gold: [1, 1, 1, 1] } },
  lamp: { name: 'Oil Lamp', icon: '🪔', rarity: 'uncommon', w: 1, h: 1, cats: ['Hearth'], tags: ['fire', 'tool'],
      aura: { scope: 'row', stat: 'burn', v: [2, 5, 7, 10] } },
  locket: { name: 'Heart Locket', icon: '💖', rarity: 'uncommon', w: 1, h: 1, cats: ['Relic'], tags: ['heal'],
      effects: { heal: [14, 22, 29, 43] }, start: { effects: { maxhp: [48, 72, 108, 156] } } },
  leech: { name: 'Leech Jar', icon: '🪱', rarity: 'uncommon', w: 1, h: 1, cats: ['Beast', 'Remedy'], tags: ['poison', 'heal'],
      on: { event: 'poison', effects: { heal: [14, 22, 29, 43] } } },
  twinblades: { name: 'Twin Blades', icon: '✂️', rarity: 'uncommon', w: 2, h: 1, cats: ['Melee'], tags: ['weapon'], multicast: 2, charge: 3,
      effects: { damage: [28, 41, 62, 97] } },
  sparks: { name: 'Ember Sparks', icon: '✨', rarity: 'uncommon', w: 1, h: 1, cats: ['Hearth'], tags: ['fire'], multicast: 2, charge: 4,
      effects: { burn: [2, 2, 5, 5] } },
  capacitor: { name: 'Capacitor', icon: '🔋', rarity: 'uncommon', w: 1, h: 1, cats: ['Clockwork'], tags: ['tool'],
      start: { special: { kind: 'charge', scope: 'adjacent', v: [2, 2, 3, 3] } } },
  bugle: { name: 'War Bugle', icon: '🎺', rarity: 'uncommon', w: 1, h: 1, cats: ['Herald'], tags: ['tool'],
      aura: { cat: 'Melee', stat: 'damage', v: [12, 18, 27, 42] } },
  whistle: { name: 'Bone Whistle', icon: '🦴', rarity: 'uncommon', w: 1, h: 1, cats: ['Herald', 'Beast'], tags: ['weapon'],
      on: { event: 'activate', cat: 'Beast', effects: { damage: [20, 30, 45, 70] } } },
  fletcher: { name: "Fletcher's Kit", icon: '🪃', rarity: 'uncommon', w: 1, h: 1, cats: ['Ranged'], tags: ['tool'],
      aura: { scope: 'adjacent', cat: 'Ranged', multicast: [1, 1, 1, 2] } },
  // ---------- Rare (3 tiers) ----------
  bellows: { name: 'Bellows', icon: '🌬️', rarity: 'rare', w: 1, h: 1, cats: ['Hearth'], tags: ['tool', 'fire'],
      special: { kind: 'buffAdj', tag: 'fire', stat: 'burn', v: [5, 7, 10] } },
  spring: { name: 'Healing Spring', icon: '⛲', rarity: 'rare', w: 2, h: 2, cats: ['Landmark', 'Remedy'], tags: ['heal', 'regen'], charge: 5,
      effects: { heal: [79, 115, 166], regen: [7, 7, 22] } },
  tower: { name: 'Tower Shield', icon: '🧱', rarity: 'rare', w: 1, h: 3, cats: ['Armor'], tags: ['shield'], charge: 6,
      effects: { shield: [144, 210, 288] } },
  quickdraw: { name: 'Quick Draw', icon: '🏹', rarity: 'rare', w: 1, h: 1, cats: ['Ranged'], tags: ['weapon', 'time'], charge: 2,
      effects: { damage: [21, 35, 55] }, special: { kind: 'haste', v: [0.2, 0.25, 0.3], dur: 2 } },
  seed: { name: 'Ancient Seed', icon: '🌰', rarity: 'rare', w: 1, h: 1, cats: ['Flora'], tags: ['regen', 'heal'],
      effects: { heal: [22, 29, 43] }, start: { effects: { regen: [14, 22, 29] } } },
  ledger: { name: "Merchant's Ledger", icon: '📒', rarity: 'rare', w: 1, h: 1, cats: ['Treasure'], tags: ['tool'],
      gold: { when: 'win', v: [3, 4, 6] } },
  map: { name: 'Treasure Map', icon: '🗺️', rarity: 'rare', w: 1, h: 1, cats: ['Treasure'], tags: ['tool'],
      map: { v: [2, 2, 1] } },
  caravan: { name: 'Trade Caravan', icon: '🐫', rarity: 'rare', w: 2, h: 1, cats: ['Treasure', 'Beast'], tags: ['heal', 'tool'],
      effects: { heal: [43, 58, 79] }, gold: { when: 'fight', v: [2, 3, 4] } },
  midas: { name: 'Midas Hammer', icon: '🔨', rarity: 'rare', w: 2, h: 1, cats: ['Melee', 'Treasure'], tags: ['weapon'], charge: 5,
      effects: { damage: [103, 166, 248], gold: [1, 1, 2] } },
  drum: { name: 'War Drum', icon: '🥁', rarity: 'rare', w: 1, h: 1, cats: ['Herald'], tags: ['tool'],
      aura: { scope: 'row', stat: 'damage', v: [35, 41, 62] } },
  watchtower: { name: 'Watchtower', icon: '🗼', rarity: 'rare', w: 1, h: 1, cats: ['Landmark'], tags: ['shield'],
      effects: { shield: [18, 24, 36] }, aura: { scope: 'row', stat: 'shield', v: [18, 24, 36] } },
  rat: { name: 'Plague Rat', icon: '🐀', rarity: 'rare', w: 1, h: 1, cats: ['Beast'], tags: ['poison'],
      effects: { poison: [5, 5, 9] }, special: { kind: 'buffRow', stat: 'poison', v: [5, 5, 5] } },
  trollblood: { name: 'Troll Blood', icon: '🩸', rarity: 'rare', w: 1, h: 1, cats: ['Beast', 'Alchemy'], tags: ['regen'],
      effects: { maxhp: [30, 42, 60], heal: [14, 22, 29] } },
  sparkplug: { name: 'Spark Plug', icon: '🔌', rarity: 'rare', w: 1, h: 1, cats: ['Clockwork'], tags: ['fire', 'tool'],
      on: { event: 'activate', scope: 'adjacent', effects: { burn: [2, 2, 5] } } },
  crossbow: { name: 'Repeater Crossbow', icon: '🎯', rarity: 'rare', w: 1, h: 1, cats: ['Ranged', 'Clockwork'], tags: ['weapon'], multicast: 3, charge: [4, 3, 3],
      effects: { damage: [14, 28, 41] } },
  standard: { name: 'Battle Standard', icon: '🏳️', rarity: 'rare', w: 1, h: 1, cats: ['Herald'], tags: ['tool'],
      aura: { tag: 'weapon', stat: 'damage', v: [21, 35, 41] } },
  coldsteel: { name: 'Cold Steel', icon: '🥶', rarity: 'rare', w: 1, h: 1, cats: ['Frost', 'Melee'], tags: ['weapon', 'time'],
      effects: { damage: [35, 55, 83] }, aura: { tag: 'weapon', stat: 'damage', v: [35, 41, 62], cond: 'enemySlowed' } },
  lastlight: { name: 'Last Light', icon: '🔦', rarity: 'rare', w: 1, h: 1, cats: ['Relic'], tags: ['heal'],
      aura: { tag: 'heal', stat: 'heal', v: [14, 22, 29] }, effects: { heal: [22, 29, 43] } },
  relay: { name: 'Relay', icon: '🔁', rarity: 'rare', w: 1, h: 1, cats: ['Clockwork'], tags: ['tool', 'time'],
      on: { event: 'activate', scope: 'adjacent', special: { kind: 'charge', scope: 'adjacent', v: [1, 1, 2] } } },
  dynamo: { name: 'Dynamo', icon: '⚡', rarity: 'rare', w: 1, h: 1, cats: ['Clockwork'], tags: ['tool', 'time'], charge: 4,
      special: { kind: 'charge', scope: 'adjacent', v: [1, 1, 2] } },
  flywheel: { name: 'Flywheel', icon: '🛞', rarity: 'rare', w: 2, h: 1, cats: ['Clockwork', 'Melee'], tags: ['weapon'], charge: 7, accel: 2, minCharge: 2,
      effects: { damage: [207, 311, 469] } },
  gearbox: { name: 'Gearbox', icon: '🔧', rarity: 'rare', w: 1, h: 1, cats: ['Clockwork'], tags: ['weapon', 'time'], charge: 6,
      effects: { damage: [70, 105, 160] }, on: { event: 'activate', cat: 'Clockwork', special: { kind: 'charge', scope: 'self', v: [1, 1, 2] } } },
  signet: { name: 'Signet Ring', icon: '💍', rarity: 'rare', w: 1, h: 1, cats: ['Treasure', 'Relic'], tags: ['weapon'],
      effects: { damage: [30, 45, 70] }, per: { cat: 'Treasure', stat: 'damage', v: [12, 18, 27] } },
  greenhouse: { name: 'Greenhouse', icon: '🏡', rarity: 'rare', w: 2, h: 1, cats: ['Landmark', 'Flora'], tags: ['regen'], charge: 5,
      effects: { regen: [10, 15, 22] }, start: { special: { kind: 'charge', scope: 'all', cat: 'Flora', v: [2, 2, 3] } } },
  // ---------- Super Rare (2 tiers) ----------
  horn: { name: 'War Horn', icon: '📯', rarity: 'superrare', w: 1, h: 1, cats: ['Herald'], tags: ['time'],
      effects: { damage: [21, 35] }, start: { special: { kind: 'haste', v: [0.3, 0.38], dur: 3 } } },
  smoke: { name: 'Smoke Bomb', icon: '🌫️', rarity: 'superrare', w: 1, h: 1, cats: ['Alchemy'], tags: ['tool', 'time'],
      effects: { shield: [12, 18] }, start: { special: { kind: 'slow', v: [0.2, 0.3], dur: 3 } } },
  feather: { name: 'Phoenix Feather', icon: '🪶', rarity: 'superrare', w: 1, h: 1, cats: ['Beast', 'Hearth'], tags: ['fire', 'heal'],
      effects: { heal: [36, 50], burn: [7, 10] } },
  rewind: { name: 'Rewind Clock', icon: '🕰️', rarity: 'superrare', w: 1, h: 1, cats: ['Clockwork'], tags: ['time'], charge: [6, 5],
      special: { kind: 'rewind', v: [2, 2] } },
  alembic: { name: 'Alchemist Kit', icon: '⚗️', rarity: 'superrare', w: 2, h: 2, cats: ['Alchemy'], tags: ['poison', 'heal'], charge: 5,
      effects: { cleanse: [18, 24], poison: [18, 23] } },
  mirror: { name: 'Aegis Mirror', icon: '🪞', rarity: 'superrare', w: 1, h: 2, cats: ['Armor', 'Relic'], tags: ['shield', 'weapon'],
      effects: { shield: [60, 84] }, special: { kind: 'bash', v: [0.3, 0.4] } },
  crown: { name: 'Ember Crown', icon: '👑', rarity: 'superrare', w: 1, h: 1, cats: ['Relic', 'Hearth'], tags: ['fire'], charge: 5, accel: 1, minCharge: 2,
      effects: { burn: [5, 7] }, special: { kind: 'grow', stat: 'burn', v: [2, 2] } },
  glacier: { name: 'Glacier Bell', icon: '🧊', rarity: 'superrare', w: 1, h: 2, cats: ['Frost', 'Herald'], tags: ['shield', 'time'],
      effects: { shield: [42, 54] }, special: { kind: 'slow', v: [0.2, 0.25], dur: 2 } },
  idol: { name: 'Golden Idol', icon: '🏺', rarity: 'superrare', w: 1, h: 1, cats: ['Treasure', 'Relic'], tags: ['tool', 'shield'],
      effects: { shield: [18, 24] }, gold: { when: 'fight', v: [3, 4] } },
  slots: { name: 'Slot Machine', icon: '🎰', rarity: 'superrare', w: 1, h: 1, cats: ['Treasure', 'Clockwork'], tags: ['tool'], multicast: 2, charge: [3, 2],
      effects: { gold: [1, 1] } },
  forge: { name: 'Field Forge', icon: '⚒️', rarity: 'superrare', w: 1, h: 1, cats: ['Landmark', 'Hearth'], tags: ['tool', 'fire'],
      special: { kind: 'buffRow', stat: 'damage', v: [21, 35] } },
  belt: { name: "Giant's Belt", icon: '🎗️', rarity: 'superrare', w: 2, h: 1, cats: ['Armor'], tags: ['shield'],
      effects: { shield: [24, 36] }, start: { effects: { maxhp: [120, 180] } } },
  thorns: { name: 'Thorn Mail', icon: '🌵', rarity: 'superrare', w: 1, h: 2, cats: ['Armor', 'Flora'], tags: ['shield', 'weapon'],
      effects: { shield: [30, 42] }, on: { event: 'shield', effects: { damage: [35, 55] } } },
  cinderward: { name: 'Cinder Ward', icon: '🔶', rarity: 'superrare', w: 1, h: 1, cats: ['Hearth', 'Relic'], tags: ['fire', 'shield'],
      on: { event: 'burn', effects: { shield: [12, 18] } } },
  drip: { name: 'Venom Drip', icon: '💧', rarity: 'superrare', w: 1, h: 1, cats: ['Alchemy'], tags: ['poison'], multicast: 3,
      effects: { poison: [5, 9] } },
  brimstone: { name: 'Brimstone Altar', icon: '🌋', rarity: 'superrare', w: 1, h: 2, cats: ['Landmark', 'Hearth'], tags: ['fire'],
      effects: { burn: [5, 7] }, aura: { tag: 'fire', stat: 'burn', v: [2, 2] } },
  mask: { name: 'Plague Mask', icon: '🎭', rarity: 'superrare', w: 1, h: 1, cats: ['Relic', 'Alchemy'], tags: ['poison'],
      aura: { tag: 'poison', stat: 'poison', v: [5, 9] } },
  coil: { name: 'Tesla Coil', icon: '🌩️', rarity: 'superrare', w: 1, h: 2, cats: ['Clockwork'], tags: ['tool', 'time'], charge: 4,
      special: { kind: 'charge', scope: 'row', v: [1, 2] } },
  apothecary: { name: 'Apothecary Shelf', icon: '🧴', rarity: 'superrare', w: 1, h: 2, cats: ['Alchemy'], tags: ['poison'],
      effects: { poison: [9, 14] }, per: { cat: 'Alchemy', stat: 'poison', v: [4, 6] } },
  // ---------- Legendary (1 tier) ----------
  chime: { name: 'Echo Chime', icon: '🔔', rarity: 'legendary', w: 1, h: 1, cats: ['Herald'], tags: ['time'], charge: 8,
      special: { kind: 'echo', v: [1] } },
  banner: { name: 'Tailwind Banner', icon: '🚩', rarity: 'legendary', w: 1, h: 2, cats: ['Herald'], tags: ['time'],
      effects: { heal: [29] }, special: { kind: 'haste', v: [0.3], dur: 2 }, start: { special: { kind: 'haste', v: [0.4], dur: 3 } } },
  heart: { name: 'Inferno Heart', icon: '❤️‍🔥', rarity: 'legendary', w: 2, h: 2, cats: ['Relic', 'Hearth'], tags: ['fire'], charge: 8, accel: 2, minCharge: 2,
      effects: { burn: [20] }, special: { kind: 'buffAll', tag: 'fire', stat: 'burn', v: [2] } },
  stone: { name: "Philosopher's Stone", icon: '💎', rarity: 'legendary', w: 1, h: 1, cats: ['Relic', 'Alchemy'], tags: ['tool'],
      special: { kind: 'amplify', v: [0.4] } },
  core: { name: 'Overclock Core', icon: '⚙️', rarity: 'legendary', w: 2, h: 1, cats: ['Clockwork'], tags: ['time', 'shield'], charge: 5,
      effects: { shield: [24] }, special: { kind: 'overclock', v: [0.07] } },
  tree: { name: 'World Tree', icon: '🌳', rarity: 'legendary', w: 2, h: 3, cats: ['Flora', 'Landmark'], tags: ['regen', 'heal'], charge: 6,
      effects: { heal: [108], regen: [22] } },
  stasis: { name: 'Stasis Lantern', icon: '🕯️', rarity: 'legendary', w: 1, h: 1, cats: ['Relic', 'Clockwork'], tags: ['time', 'tool'],
      special: { kind: 'slow', v: [0.2], dur: 2 }, start: { special: { kind: 'slow', v: [0.3], dur: 3 } } },
  lens: { name: 'Inferno Lens', icon: '🔍', rarity: 'legendary', w: 1, h: 1, cats: ['Relic', 'Hearth'], tags: ['fire', 'tool'],
      special: { kind: 'ignite', v: [1.3] } },
  baton: { name: "Conductor's Baton", icon: '🪄', rarity: 'legendary', w: 1, h: 1, cats: ['Herald'], tags: ['time', 'tool'],
      aura: { scope: 'column', multicast: [1] } },
  metronome: { name: 'Metronome', icon: '🎼', rarity: 'legendary', w: 1, h: 1, cats: ['Herald', 'Clockwork'], tags: ['time', 'weapon'],
      on: { event: 'activate', effects: { damage: [21] } } },
  headsman: { name: "Headsman's Seal", icon: '⚖️', rarity: 'legendary', w: 1, h: 1, cats: ['Relic', 'Melee'], tags: ['weapon', 'tool'],
      aura: { tag: 'weapon', stat: 'damage', v: [0.2], pct: true } },
};
