// All item data lives here. Add or tune items without touching the engine.
// Every stat array has 4 entries, one per item level (I, II, III, IV).

export const RARITY = {
  common:    { name: 'Common',    price: 3 },
  rare:      { name: 'Rare',      price: 6 },
  epic:      { name: 'Epic',      price: 10 },
  legendary: { name: 'Legendary', price: 15 },
};

export const TAG_NAME = {
  weapon: 'Weapon', fire: 'Fire', poison: 'Poison', heal: 'Healing',
  shield: 'Shield', regen: 'Regen', time: 'Time', tool: 'Tool',
};

export const STAT_NAME = {
  damage: 'Damage', burn: 'Burn', poison: 'Poison', heal: 'Heal',
  shield: 'Shield', regen: 'Regen', cleanse: 'Cleanse',
};

// Text for each stat when an item activates. V is the formatted value (with level progression).
export const STAT_TEXT = {
  shield:  V => `Gain ${V} Shield`,
  heal:    V => `Heal ${V}`,
  regen:   V => `Gain ${V} Regen`,
  cleanse: V => `Remove ${V} Burn and Poison from yourself`,
  damage:  V => `Deal ${V} damage`,
  burn:    V => `Apply ${V} Burn`,
  poison:  V => `Apply ${V} Poison`,
};
export const STAT_ORDER = ['shield', 'heal', 'regen', 'cleanse', 'damage', 'burn', 'poison'];

// Special behaviours. `fmt` converts a raw value for display.
export const SPECIALS = {
  buffAdj:   { text: (s, V) => `Adjacent ${TAG_NAME[s.tag]} items gain +${V} ${STAT_NAME[s.stat]} for this fight` },
  buffAll:   { text: (s, V) => `All your ${TAG_NAME[s.tag]} items gain +${V} ${STAT_NAME[s.stat]} for this fight` },
  amplify:   { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `Passive. Adjacent items are ${V} stronger` },
  haste:     { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `Your bar moves ${V} faster for 3s. Triggering again refreshes it` },
  overclock: { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `Your bar is permanently ${V} faster this fight` },
  rewind:    { text: (s, V) => `Send this bar back to the start. ${V} use(s) per fight` },
  echo:      { text: (s, V) => `Launch an extra bar from the start. ${V} use(s) per fight` },
  grow:      { text: (s, V) => `This item gains +${V} ${STAT_NAME[s.stat]} each time it activates` },
  bash:      { fmt: v => Math.round(v * 100) + '%', text: (s, V) => `Then deal damage equal to ${V} of your Shield` },
  ignite:    { fmt: v => '×' + v, text: (s, V) => `Multiply the enemy's Burn by ${V}` },
};

// Infusions ("instilling" an item with another type). Adds a stat and the matching tag.
export const INFUSIONS = {
  fire:   { name: 'Ember Essence',  icon: '🔥', tag: 'fire',   stat: 'burn',   v: [2, 3, 4, 6], price: 4 },
  poison: { name: 'Venom Essence',  icon: '☠️', tag: 'poison', stat: 'poison', v: [1, 1, 2, 3], price: 4 },
  heal:   { name: 'Mending Essence',icon: '💗', tag: 'heal',   stat: 'heal',   v: [3, 5, 8, 12], price: 4 },
  shield: { name: 'Warding Essence',icon: '🔷', tag: 'shield', stat: 'shield', v: [4, 6, 9, 13], price: 4 },
  regen:  { name: 'Verdant Essence',icon: '🌱', tag: 'regen',  stat: 'regen',  v: [1, 1, 1, 2], price: 4 },
};

// w = columns wide, h = rows tall. The bar triggers an item when it reaches the item's leftmost column.
export const ITEMS = {
  // ---------- Common ----------
  dagger:   { name: 'Rusty Dagger',  icon: '🗡️', rarity: 'common', w: 1, h: 1, tags: ['weapon'],
              effects: { damage: [6, 9, 13, 19] } },
  torch:    { name: 'Tinder Torch',  icon: '🔥', rarity: 'common', w: 1, h: 1, tags: ['fire'],
              effects: { burn: [3, 4, 6, 8] } },
  vial:     { name: 'Toxic Vial',    icon: '🧪', rarity: 'common', w: 1, h: 1, tags: ['poison'],
              effects: { poison: [1, 2, 3, 4] } },
  bandage:  { name: 'Bandage',       icon: '🩹', rarity: 'common', w: 1, h: 1, tags: ['heal'],
              effects: { heal: [7, 10, 14, 20] } },
  buckler:  { name: 'Wooden Buckler',icon: '🛡️', rarity: 'common', w: 1, h: 2, tags: ['shield'],
              effects: { shield: [8, 12, 17, 24] } },
  herbs:    { name: 'Herb Pouch',    icon: '🌿', rarity: 'common', w: 1, h: 1, tags: ['regen'],
              effects: { regen: [1, 1, 2, 3] } },
  sword:    { name: 'Short Sword',   icon: '⚔️', rarity: 'common', w: 2, h: 1, tags: ['weapon'],
              effects: { damage: [12, 18, 26, 38] } },

  // ---------- Rare ----------
  axe:      { name: 'Ember Axe',     icon: '🪓', rarity: 'rare', w: 2, h: 1, tags: ['weapon', 'fire'],
              effects: { damage: [7, 10, 14, 20], burn: [2, 3, 4, 6] } },
  fang:     { name: 'Serpent Fang',  icon: '🐍', rarity: 'rare', w: 1, h: 1, tags: ['weapon', 'poison'],
              effects: { damage: [3, 5, 7, 10], poison: [1, 2, 2, 3] } },
  bellows:  { name: 'Bellows',       icon: '🌬️', rarity: 'rare', w: 1, h: 1, tags: ['tool', 'fire'],
              special: { kind: 'buffAdj', tag: 'fire', stat: 'burn', v: [1, 2, 3, 4] } },
  whetstone:{ name: 'Whetstone',     icon: '🪨', rarity: 'rare', w: 1, h: 1, tags: ['tool'],
              special: { kind: 'buffAdj', tag: 'weapon', stat: 'damage', v: [3, 4, 6, 9] } },
  spring:   { name: 'Healing Spring',icon: '⛲', rarity: 'rare', w: 2, h: 2, tags: ['heal', 'regen'],
              effects: { heal: [9, 13, 18, 26], regen: [1, 1, 2, 3] } },
  tower:    { name: 'Tower Shield',  icon: '🧱', rarity: 'rare', w: 1, h: 3, tags: ['shield'],
              effects: { shield: [16, 23, 32, 45] } },
  hourglass:{ name: 'Hourglass',     icon: '⏳', rarity: 'rare', w: 1, h: 1, tags: ['time'],
              special: { kind: 'haste', v: [0.3, 0.45, 0.6, 0.8] } },
  censer:   { name: 'Plague Censer', icon: '🏮', rarity: 'rare', w: 1, h: 2, tags: ['poison'],
              effects: { poison: [2, 3, 4, 6] } },

  // ---------- Epic ----------
  feather:  { name: 'Phoenix Feather',icon: '🪶', rarity: 'epic', w: 1, h: 1, tags: ['fire', 'heal'],
              effects: { heal: [5, 7, 10, 14], burn: [3, 4, 6, 8] } },
  rewind:   { name: 'Rewind Clock',  icon: '🕰️', rarity: 'epic', w: 1, h: 1, tags: ['time'],
              special: { kind: 'rewind', v: [1, 1, 2, 3] } },
  chime:    { name: 'Echo Chime',    icon: '🔔', rarity: 'epic', w: 1, h: 1, tags: ['time'],
              special: { kind: 'echo', v: [1, 2, 2, 3] } },
  alembic:  { name: 'Alchemist Kit', icon: '⚗️', rarity: 'epic', w: 2, h: 2, tags: ['poison', 'heal'],
              effects: { cleanse: [2, 3, 4, 6], poison: [3, 4, 6, 8] } },
  mirror:   { name: 'Aegis Mirror',  icon: '🪞', rarity: 'epic', w: 1, h: 2, tags: ['shield', 'weapon'],
              effects: { shield: [10, 14, 20, 28] }, special: { kind: 'bash', v: [0.3, 0.4, 0.5, 0.65] } },
  crown:    { name: 'Ember Crown',   icon: '👑', rarity: 'epic', w: 1, h: 1, tags: ['fire'],
              effects: { burn: [2, 3, 4, 5] }, special: { kind: 'grow', stat: 'burn', v: [1, 1, 2, 3] } },

  // ---------- Legendary ----------
  heart:    { name: 'Inferno Heart', icon: '❤️‍🔥', rarity: 'legendary', w: 2, h: 2, tags: ['fire'],
              effects: { burn: [5, 7, 10, 14] }, special: { kind: 'buffAll', tag: 'fire', stat: 'burn', v: [1, 1, 2, 3] } },
  stone:    { name: "Philosopher's Stone", icon: '💎', rarity: 'legendary', w: 1, h: 1, tags: ['tool'],
              special: { kind: 'amplify', v: [0.25, 0.35, 0.5, 0.7] } },
  core:     { name: 'Overclock Core',icon: '⚙️', rarity: 'legendary', w: 2, h: 1, tags: ['time', 'shield'],
              effects: { shield: [4, 6, 8, 11] }, special: { kind: 'overclock', v: [0.08, 0.11, 0.14, 0.18] } },
  tree:     { name: 'World Tree',    icon: '🌳', rarity: 'legendary', w: 2, h: 3, tags: ['regen', 'heal'],
              effects: { heal: [10, 14, 20, 28], regen: [2, 3, 4, 6] } },
  lens:     { name: 'Inferno Lens',  icon: '🔍', rarity: 'legendary', w: 1, h: 1, tags: ['fire', 'tool'],
              special: { kind: 'ignite', v: [1.3, 1.4, 1.55, 1.75] } },
};

export const ENEMY_NAMES = ['Ash Bandit', 'Bog Witch', 'Clockwork Squire', 'Ember Monk', 'Rust Knight',
  'Marsh Hag', 'Tin Alchemist', 'Cinder Wyrm', 'Grave Warden', 'The Metronome', 'Lantern Thief', 'Salt Golem'];
