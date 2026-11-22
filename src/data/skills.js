// Skills: run-wide passives that level up like items.
//   - At the start of a run you pick 1 of 3 STARTER skills (only offered then; each points at a build).
//   - Every time you upgrade an item you pick 1 of 3 skills of the item's rarity BEFORE the upgrade
//     (Common -> Uncommon gives a Common pick). Treasure Maps and the Relic Hunter boon give picks too.
//   - Picking a skill you already own levels it up, one rarity tier, exactly like merging an item:
//     a Common skill at level 2 is Uncommon, and only an Uncommon pick can level it again.
//     Owning a skill twice = level 2, so a loadout is just a list of ids (repeats = levels).
//
// Values: `v` is either one number per level (array), or a single number that grows with level
// by LEVEL_MULT. Common skills are flat amounts ("+12 Damage"); rarer ones can be percentages.
//
// fx entries:
//   { k: 'flat', stat, v, cat? }          your items that already have <stat> (and are <cat>) get +v of it each time
//                                          they fire (scaled by charge cost like every flat bonus)
//   { k: 'pct', stat, v, cat?, tag? }     your matching items' <stat> is v higher ('*' = every stat they have)
//   { k: 'multicast', v, cat }            your <cat> items get +v multicast
//   { k: 'startCharge', v, cat? }         battle start: your (cat) items begin with +v charge
//   { k: 'startShield', v }               battle start: gain Shield = v x your max HP
//   { k: 'startHaste', v }                battle start: your bar is 50% faster for v seconds
//   { k: 'maxHp', v }  (fraction)  { k: 'maxHpFlat', v }  { k: 'speed', v }  { k: 'stormWard', v }
//   { k: 'gold' | 'bounty' | 'interest' | 'goldTouch' | 'freeRerolls', v }   economy
// Any fx can also have `per`: the value is multiplied by something about your run (see PER).
export const SKILL_RARITIES = ['common', 'uncommon', 'rare', 'superrare', 'legendary'];
export const LEVEL_MULT = [1, 1.5, 2, 2.5, 3];

// What a `per` skill counts. ctx comes from the run: { day, wins, livesLost, lives, gold, streak, empty }.
export const PER = {
  win:      { text: 'for each win this run',             of: c => c.wins || 0 },
  lifeLost: { text: "for each life you've lost",         of: c => c.livesLost || 0 },
  day:      { text: 'for each day of the run',           of: c => c.day || 0 },
  gold:     { text: 'for each gold you hold at the fight', of: c => c.gold || 0 },
  streak:   { text: 'for each win in your current streak (up to 5)', of: c => Math.min(5, c.streak || 0) },
  empty:    { text: 'for each empty board cell',         of: c => c.empty || 0 },
  desperate:{ text: 'while you have 3 or fewer lives',   of: c => (c.lives != null && c.lives <= 3 ? 1 : 0) },
};

export const SKILLS = {
  // ---------- Starters: picked at the start of a run, never offered later ----------
  bladeOath:    { name: 'Way of the Blade', icon: '🗡️', rarity: 'starter', text: 'Your Melee items deal +{0} damage and start each fight with +{1} charge.',
                  fx: [{ k: 'flat', stat: 'damage', v: [15], cat: 'Melee' }, { k: 'startCharge', v: [1], cat: 'Melee' }] },
  pyreOath:     { name: "Pyromancer's Oath", icon: '🔥', rarity: 'starter', text: 'Your Burn items burn +{0} more, and your Hearth items start each fight with +{1} charge.',
                  fx: [{ k: 'flat', stat: 'burn', v: [3] }, { k: 'startCharge', v: [1], cat: 'Hearth' }] },
  plagueOath:   { name: 'Plague Doctor', icon: '🧪', rarity: 'starter', text: 'Your Poison items poison +{0} more, and your Alchemy items start each fight with +{1} charge.',
                  fx: [{ k: 'flat', stat: 'poison', v: [3] }, { k: 'startCharge', v: [1], cat: 'Alchemy' }] },
  tinkerOath:   { name: 'Master Tinker', icon: '⚙️', rarity: 'starter', text: 'Your Clockwork items start each fight with +{0} charge, and your bar is {1} faster.',
                  fx: [{ k: 'startCharge', v: [2], cat: 'Clockwork' }, { k: 'speed', v: [0.05] }] },
  merchantOath: { name: 'Merchant Prince', icon: '💰', rarity: 'starter', text: 'Gain {0} extra gold after every fight, and get {1} free reroll each day.',
                  fx: [{ k: 'gold', v: [3] }, { k: 'freeRerolls', v: [1] }] },
  wardenOath:   { name: 'Iron Warden', icon: '🛡️', rarity: 'starter', text: 'Battle start: gain Shield equal to {0} of your max HP. Your Shield items give +{1} Shield.',
                  fx: [{ k: 'startShield', v: [0.15] }, { k: 'flat', stat: 'shield', v: [12] }] },
  groveOath:    { name: 'Grove Keeper', icon: '🌳', rarity: 'starter', text: 'Your Heal items heal +{0} more, your Regen items give +{1} more, and your Flora items start each fight with +{2} charge.',
                  fx: [{ k: 'flat', stat: 'heal', v: [15] }, { k: 'flat', stat: 'regen', v: [2] }, { k: 'startCharge', v: [1], cat: 'Flora' }] },
  hunterOath:   { name: "Hunter's Eye", icon: '🏹', rarity: 'starter', text: 'Your Ranged items have +{0} multicast.',
                  fx: [{ k: 'multicast', v: [1], cat: 'Ranged' }] },

  // ---------- Common: flat amounts ----------
  edges:    { name: 'Whetted Edges', icon: '🔪', rarity: 'common', text: 'Your Melee items deal +{0} damage.', fx: [{ k: 'flat', stat: 'damage', v: [12, 22, 36, 55, 80], cat: 'Melee' }] },
  sharpshot:{ name: 'Sharpshooter', icon: '🎯', rarity: 'common', text: 'Your items that deal damage deal +{0} damage.', fx: [{ k: 'flat', stat: 'damage', v: [8, 15, 25, 38, 55] }] },
  kindling: { name: 'Kindling', icon: '🪵', rarity: 'common', text: 'Your Burn items burn +{0} more.', fx: [{ k: 'flat', stat: 'burn', v: [2, 3, 5, 7, 10] }] },
  venom:    { name: 'Venom Tips', icon: '🦂', rarity: 'common', text: 'Your Poison items poison +{0} more.', fx: [{ k: 'flat', stat: 'poison', v: [2, 3, 5, 7, 10] }] },
  plating:  { name: 'Plating', icon: '🔩', rarity: 'common', text: 'Your Shield items give +{0} Shield.', fx: [{ k: 'flat', stat: 'shield', v: [12, 22, 36, 55, 80] }] },
  salves:   { name: 'Salves', icon: '🫙', rarity: 'common', text: 'Your Heal items heal +{0} more.', fx: [{ k: 'flat', stat: 'heal', v: [15, 26, 42, 64, 92] }] },
  sap:      { name: 'Living Sap', icon: '🍯', rarity: 'common', text: 'Your Regen items give +{0} more Regen.', fx: [{ k: 'flat', stat: 'regen', v: [2, 3, 5, 8, 12] }] },
  toughness:{ name: 'Thick Skin', icon: '🦏', rarity: 'common', text: '+{0} max HP.', fx: [{ k: 'maxHpFlat', v: [50, 110, 200, 330, 500] }] },
  tithe:    { name: 'Tithe', icon: '🪙', rarity: 'common', text: 'Gain {0} extra gold after every fight.', fx: [{ k: 'gold', v: [2, 3, 4, 6, 8] }] },
  haggler:  { name: 'Haggler', icon: '🤝', rarity: 'common', text: 'Get {0} free reroll(s) each day.', fx: [{ k: 'freeRerolls', v: [1, 1, 2, 2, 3] }] },
  // scaling off the run
  veteran:  { name: 'Veteran', icon: '🎖️', rarity: 'common', text: 'Your items that deal damage deal +{0} damage {per}.', fx: [{ k: 'flat', stat: 'damage', per: 'win', v: [3, 5, 8, 12, 17] }] },
  grudge:   { name: 'Grudge', icon: '😤', rarity: 'common', text: 'Your items that deal damage deal +{0} damage {per}.', fx: [{ k: 'flat', stat: 'damage', per: 'lifeLost', v: [4, 7, 11, 16, 22] }] },
  wayfarer: { name: 'Wayfarer', icon: '🥾', rarity: 'common', text: 'Your Shield items give +{0} Shield {per}.', fx: [{ k: 'flat', stat: 'shield', per: 'day', v: [3, 5, 8, 12, 17] }] },

  // ---------- Uncommon ----------
  fletching:  { name: 'Fletching', icon: '🪶', rarity: 'uncommon', text: 'Your Ranged items deal {0} more damage.', fx: [{ k: 'pct', stat: 'damage', v: 0.25, cat: 'Ranged' }] },
  hearthfire: { name: 'Hearthfire', icon: '🏮', rarity: 'uncommon', text: 'Your Hearth items are {0} stronger.', fx: [{ k: 'pct', stat: '*', v: 0.2, cat: 'Hearth' }] },
  distill:    { name: 'Distillation', icon: '⚗️', rarity: 'uncommon', text: 'Your Alchemy items are {0} stronger.', fx: [{ k: 'pct', stat: '*', v: 0.2, cat: 'Alchemy' }] },
  riveted:    { name: 'Riveted', icon: '🛠️', rarity: 'uncommon', text: 'Your Armor items are {0} stronger.', fx: [{ k: 'pct', stat: '*', v: 0.25, cat: 'Armor' }] },
  medic:      { name: 'Field Medic', icon: '🩺', rarity: 'uncommon', text: 'Your Remedy items are {0} stronger.', fx: [{ k: 'pct', stat: '*', v: 0.25, cat: 'Remedy' }] },
  gears:      { name: 'Oiled Gears', icon: '🛢️', rarity: 'uncommon', text: 'Your Clockwork items start each fight with +{0} charge.', fx: [{ k: 'startCharge', v: [1, 1, 2, 2], cat: 'Clockwork' }] },
  ironskin:   { name: 'Iron Skin', icon: '🪖', rarity: 'uncommon', text: 'Battle start: gain Shield equal to {0} of your max HP.', fx: [{ k: 'startShield', v: 0.1 }] },
  bounty:     { name: 'Bounty Hunter', icon: '💰', rarity: 'uncommon', text: 'Gain {0} extra gold after every win.', fx: [{ k: 'bounty', v: [4, 6, 8, 11] }] },
  quickstart: { name: 'Quick Start', icon: '🚀', rarity: 'uncommon', text: 'Battle start: your bar moves 50% faster for {0}s.', fx: [{ k: 'startHaste', v: [3, 4, 5, 6] }] },
  // scaling off the run
  scartissue: { name: 'Scar Tissue', icon: '🩹', rarity: 'uncommon', text: '+{0} max HP {per}.', fx: [{ k: 'maxHpFlat', per: 'lifeLost', v: [30, 55, 90, 135] }] },
  underdog:   { name: 'Underdog', icon: '🐕', rarity: 'uncommon', text: 'Battle start: gain Shield equal to {0} of your max HP {per}.', fx: [{ k: 'startShield', per: 'lifeLost', v: [0.02, 0.03, 0.045, 0.06] }] },
  hoarder:    { name: 'Hoarder', icon: '🐉', rarity: 'uncommon', text: 'Your items that deal damage deal +{0} damage {per}.', fx: [{ k: 'flat', stat: 'damage', per: 'gold', v: [1, 1.5, 2.2, 3] }] },
  momentum:   { name: 'Momentum', icon: '🌊', rarity: 'uncommon', text: 'Your items are {0} stronger {per}.', fx: [{ k: 'pct', stat: '*', per: 'streak', v: [0.04, 0.06, 0.08, 0.1] }] },

  // ---------- Rare ----------
  fury:       { name: 'Battle Fury', icon: '💢', rarity: 'rare', text: 'All your damage is {0} higher.', fx: [{ k: 'pct', stat: 'damage', v: 0.15 }] },
  packbond:   { name: 'Pack Bond', icon: '🐺', rarity: 'rare', text: 'Your Beast items are {0} stronger.', fx: [{ k: 'pct', stat: '*', v: 0.3, cat: 'Beast' }] },
  rally:      { name: 'Rallying Cry', icon: '📣', rarity: 'rare', text: 'Your Herald items are {0} stronger.', fx: [{ k: 'pct', stat: '*', v: 0.3, cat: 'Herald' }] },
  oldmagic:   { name: 'Old Magic', icon: '🔮', rarity: 'rare', text: 'Your Relic items are {0} stronger.', fx: [{ k: 'pct', stat: '*', v: 0.25, cat: 'Relic' }] },
  foundations:{ name: 'Foundations', icon: '🧱', rarity: 'rare', text: 'Your Landmark items are {0} stronger.', fx: [{ k: 'pct', stat: '*', v: 0.3, cat: 'Landmark' }] },
  overgrowth: { name: 'Overgrowth', icon: '🌿', rarity: 'rare', text: 'Your Flora items start each fight with +{0} charge.', fx: [{ k: 'startCharge', v: [2, 2, 3], cat: 'Flora' }] },
  clockwork:  { name: 'Clockwork Heart', icon: '⌚', rarity: 'rare', text: 'Your bar moves {0} faster.', fx: [{ k: 'speed', v: 0.1 }] },
  stormward:  { name: 'Storm Ward', icon: '⛈️', rarity: 'rare', text: 'You take {0} less storm damage.', fx: [{ k: 'stormWard', v: [0.3, 0.45, 0.6] }] },
  interest:   { name: 'Compound Interest', icon: '🏦', rarity: 'rare', text: 'After every fight, gain 10% of your gold as interest (up to {0}).', fx: [{ k: 'interest', v: [6, 9, 12] }] },
  // scaling off the run
  seasoned:   { name: 'Seasoned', icon: '🏅', rarity: 'rare', text: 'Your items are {0} stronger {per}.', fx: [{ k: 'pct', stat: '*', per: 'win', v: [0.025, 0.035, 0.05] }] },
  minimalist: { name: 'Minimalist', icon: '◻️', rarity: 'rare', text: 'Your items are {0} stronger {per}.', fx: [{ k: 'pct', stat: '*', per: 'empty', v: [0.04, 0.06, 0.08] }] },

  // ---------- Super Rare ----------
  echosteel:  { name: 'Echoing Steel', icon: '⚔️', rarity: 'superrare', text: 'Your Melee items have +{0} multicast.', fx: [{ k: 'multicast', v: [1, 2], cat: 'Melee' }] },
  static:     { name: 'Static Charge', icon: '🔌', rarity: 'superrare', text: 'Your items start each fight with +{0} charge.', fx: [{ k: 'startCharge', v: [2, 3] }] },
  inferno:    { name: 'Kindled Soul', icon: '☄️', rarity: 'superrare', text: 'Your Burn is {0} stronger.', fx: [{ k: 'pct', stat: 'burn', v: 0.3 }] },
  blight:     { name: 'Blight', icon: '🧫', rarity: 'superrare', text: 'Your Poison is {0} stronger.', fx: [{ k: 'pct', stat: 'poison', v: 0.3 }] },
  goldtouch:  { name: 'Golden Touch', icon: '✋', rarity: 'superrare', text: 'Each of your gold-paying items pays {0} more after fights.', fx: [{ k: 'goldTouch', v: [2, 3] }] },
  vital:      { name: 'Vital Core', icon: '❤️‍🩹', rarity: 'superrare', text: '{0} max HP.', fx: [{ k: 'maxHp', v: 0.15 }] },
  shell:      { name: 'Thick Shell', icon: '🐢', rarity: 'superrare', text: 'Your Shield items give {0} more Shield.', fx: [{ k: 'pct', stat: 'shield', v: 0.3 }] },
  desperation:{ name: 'Desperation', icon: '🔥', rarity: 'superrare', text: 'Your items are {0} stronger {per}.', fx: [{ k: 'pct', stat: '*', per: 'desperate', v: [0.3, 0.45] }] },

  // ---------- Legendary ----------
  timeheart:  { name: 'Heart of the Clock', icon: '🕰️', rarity: 'legendary', text: 'Your bar moves {0} faster.', fx: [{ k: 'speed', v: 0.2 }] },
  alchgift:   { name: "Philosopher's Gift", icon: '💎', rarity: 'legendary', text: 'Your Alchemy items have +{0} multicast.', fx: [{ k: 'multicast', v: [1], cat: 'Alchemy' }] },
  beastlord:  { name: 'Beastlord', icon: '🦁', rarity: 'legendary', text: 'Your Beast items have +{0} multicast.', fx: [{ k: 'multicast', v: [1], cat: 'Beast' }] },
  mending:    { name: 'Mending Aura', icon: '💞', rarity: 'legendary', text: 'Your Heal and Regen are {0} stronger.', fx: [{ k: 'pct', stat: 'heal', v: 0.5 }, { k: 'pct', stat: 'regen', v: 0.5 }] },
  executioner:{ name: 'Executioner', icon: '🪓', rarity: 'legendary', text: 'All your damage is {0} higher.', fx: [{ k: 'pct', stat: 'damage', v: 0.3 }] },
  legend:     { name: 'Living Legend', icon: '🌟', rarity: 'legendary', text: 'Your items are {0} stronger {per}.', fx: [{ k: 'pct', stat: '*', per: 'win', v: [0.06] }] },
};

// ---------- Levels ----------
const tierIdx = id => SKILL_RARITIES.indexOf(SKILLS[id].rarity); // -1 for starters
export const maxSkillLevel = id => (tierIdx(id) < 0 ? 1 : SKILL_RARITIES.length - tierIdx(id));
// A loadout is a list of ids; owning one twice means level 2.
export function skillLevels(ids = []) {
  const lv = {};
  for (const id of ids) if (SKILLS[id]) lv[id] = Math.min(maxSkillLevel(id), (lv[id] || 0) + 1);
  return lv;
}
// The rarity a skill counts as at a level ('starter' stays starter).
export const skillTier = (id, level = 1) => (tierIdx(id) < 0 ? 'starter' : SKILL_RARITIES[Math.min(SKILL_RARITIES.length - 1, tierIdx(id) + level - 1)]);
const INT_KINDS = new Set(['multicast', 'startCharge', 'freeRerolls', 'gold', 'bounty', 'interest', 'goldTouch', 'maxHpFlat']);
// The value of one fx at a level (before any `per`).
export function fxValue(f, level) {
  const v = Array.isArray(f.v) ? f.v[Math.min(level, f.v.length) - 1] : f.v * LEVEL_MULT[level - 1];
  return INT_KINDS.has(f.k) && !f.per ? Math.round(v) : v;
}

// Picks a rarity offers: skills of that rarity you don't have, plus ones you own whose current
// tier is that rarity (picking those levels them up).
export function skillOffers(rarity, owned = []) {
  const lv = skillLevels(owned);
  return Object.keys(SKILLS).filter(id => {
    if (rarity === 'starter') return SKILLS[id].rarity === 'starter' && !lv[id];
    if (!lv[id]) return SKILLS[id].rarity === rarity;
    return lv[id] < maxSkillLevel(id) && skillTier(id, lv[id]) === rarity;
  });
}
export const skillsOfRarity = skillOffers; // old name

// [skillId, ...] + run context -> combined effects for the engine and economy.
export function skillEffects(ids = [], ctx = {}) {
  const out = { speed: 0, maxHp: 0, maxHpFlat: 0, stormWard: 0, startShield: 0, startHaste: 0, gold: 0, bounty: 0, interest: 0,
    goldTouch: 0, freeRerolls: 0, pct: [], flat: [], multicast: [], startCharge: [] };
  for (const [id, level] of Object.entries(skillLevels(ids))) for (const f of SKILLS[id].fx) {
    let v = fxValue(f, level);
    if (f.per) v *= PER[f.per].of(ctx);
    if (!v) continue;
    if (Array.isArray(out[f.k])) out[f.k].push({ ...f, v });
    else out[f.k] += v;
  }
  return out;
}

// ---------- Text ----------
const PCT_KINDS = new Set(['pct', 'startShield', 'speed', 'maxHp', 'stormWard']);
const fmt = (f, v) => (PCT_KINDS.has(f.k) ? `${+(v * 100).toFixed(1)}%` : String(+v.toFixed(1)));
// "Your Melee items deal +22 damage." for a level; with ctx, `per` skills add what they give right now.
export function skillText(id, level = 1, ctx = null) {
  const s = SKILLS[id];
  let t = s.text.replace(/\{(\d)\}/g, (_, i) => fmt(s.fx[i], fxValue(s.fx[i], level)));
  const per = s.fx.find(f => f.per);
  if (per) {
    t = t.replace('{per}', PER[per.per].text);
    if (ctx) t = t.replace(/\.?$/, ` (now ${PCT_KINDS.has(per.k) ? '' : '+'}${fmt(per, fxValue(per, level) * PER[per.per].of(ctx))}).`);
  }
  return t;
}
