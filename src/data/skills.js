// Skills: run-wide passives. You pick 1 of 3:
//   - at the start of a run, from the STARTER pool (only available then; each points at a build)
//   - every time you upgrade an item, from skills of the item's rarity BEFORE the upgrade
//     (Common -> Uncommon gives a Common skill)
//   - from a Treasure Map or the Relic Hunter boon
// Skills don't stack: you can own each one once.
//
// fx entries:
//   { k: 'pct', stat, v, cat?, tag? }  your matching items' <stat> is v higher ('*' = every stat they have)
//   { k: 'multicast', v, cat }          your <cat> items get +v multicast
//   { k: 'startCharge', v, cat? }       battle start: your (cat) items begin with +v charge
//   { k: 'startShield', v }             battle start: gain Shield = v x your max HP
//   { k: 'startHaste', v }              battle start: your bar is 50% faster for v seconds
//   { k: 'maxHp', v } { k: 'speed', v } { k: 'stormWard', v }
//   { k: 'gold' | 'bounty' | 'interest' | 'goldTouch' | 'freeRerolls', v }   economy
export const SKILL_RARITIES = ['common', 'uncommon', 'rare', 'superrare', 'legendary'];

export const SKILLS = {
  // ---------- Starters: picked at the start of a run, never offered later ----------
  bladeOath:    { name: 'Way of the Blade', icon: '🗡️', rarity: 'starter', text: 'Your Melee items deal +20% damage and start each fight with +1 charge.',
                  fx: [{ k: 'pct', stat: 'damage', v: 0.2, cat: 'Melee' }, { k: 'startCharge', v: 1, cat: 'Melee' }] },
  pyreOath:     { name: "Pyromancer's Oath", icon: '🔥', rarity: 'starter', text: 'Your Burn is 25% stronger and your Hearth items start each fight with +1 charge.',
                  fx: [{ k: 'pct', stat: 'burn', v: 0.25 }, { k: 'startCharge', v: 1, cat: 'Hearth' }] },
  plagueOath:   { name: 'Plague Doctor', icon: '🧪', rarity: 'starter', text: 'Your Poison is 25% stronger and your Alchemy items start each fight with +1 charge.',
                  fx: [{ k: 'pct', stat: 'poison', v: 0.25 }, { k: 'startCharge', v: 1, cat: 'Alchemy' }] },
  tinkerOath:   { name: 'Master Tinker', icon: '⚙️', rarity: 'starter', text: 'Your Clockwork items start each fight with +2 charge, and your bar is 5% faster.',
                  fx: [{ k: 'startCharge', v: 2, cat: 'Clockwork' }, { k: 'speed', v: 0.05 }] },
  merchantOath: { name: 'Merchant Prince', icon: '💰', rarity: 'starter', text: 'Gain 3 extra gold after every fight, and your first reroll each day is free.',
                  fx: [{ k: 'gold', v: 3 }, { k: 'freeRerolls', v: 1 }] },
  wardenOath:   { name: 'Iron Warden', icon: '🛡️', rarity: 'starter', text: 'Battle start: gain Shield equal to 15% of your max HP. Your Armor items are 25% stronger.',
                  fx: [{ k: 'startShield', v: 0.15 }, { k: 'pct', stat: '*', v: 0.25, cat: 'Armor' }] },
  groveOath:    { name: 'Grove Keeper', icon: '🌳', rarity: 'starter', text: 'Your Heal and Regen are 25% stronger, and your Flora items start each fight with +1 charge.',
                  fx: [{ k: 'pct', stat: 'heal', v: 0.25 }, { k: 'pct', stat: 'regen', v: 0.25 }, { k: 'startCharge', v: 1, cat: 'Flora' }] },
  hunterOath:   { name: "Hunter's Eye", icon: '🏹', rarity: 'starter', text: 'Your Ranged items have +1 multicast.',
                  fx: [{ k: 'multicast', v: 1, cat: 'Ranged' }] },

  // ---------- Common ----------
  edges:    { name: 'Whetted Edges', icon: '🔪', rarity: 'common', text: 'Your Melee items deal +15% damage.', fx: [{ k: 'pct', stat: 'damage', v: 0.15, cat: 'Melee' }] },
  kindling: { name: 'Kindling', icon: '🪵', rarity: 'common', text: 'Your Burn is 15% stronger.', fx: [{ k: 'pct', stat: 'burn', v: 0.15 }] },
  venom:    { name: 'Venom Tips', icon: '🦂', rarity: 'common', text: 'Your Poison is 15% stronger.', fx: [{ k: 'pct', stat: 'poison', v: 0.15 }] },
  plating:  { name: 'Plating', icon: '🔩', rarity: 'common', text: 'Your Shield items give 15% more Shield.', fx: [{ k: 'pct', stat: 'shield', v: 0.15 }] },
  salves:   { name: 'Salves', icon: '🫙', rarity: 'common', text: 'Your Heals are 15% stronger.', fx: [{ k: 'pct', stat: 'heal', v: 0.15 }] },
  sap:      { name: 'Living Sap', icon: '🍯', rarity: 'common', text: 'Your Regen is 15% stronger.', fx: [{ k: 'pct', stat: 'regen', v: 0.15 }] },
  tithe:    { name: 'Tithe', icon: '🪙', rarity: 'common', text: 'Gain 2 extra gold after every fight.', fx: [{ k: 'gold', v: 2 }] },
  haggler:  { name: 'Haggler', icon: '🤝', rarity: 'common', text: 'Your first reroll each day is free.', fx: [{ k: 'freeRerolls', v: 1 }] },
  toughness:{ name: 'Thick Skin', icon: '🦏', rarity: 'common', text: '+5% max HP.', fx: [{ k: 'maxHp', v: 0.05 }] },

  // ---------- Uncommon ----------
  fletching:  { name: 'Fletching', icon: '🪶', rarity: 'uncommon', text: 'Your Ranged items deal +25% damage.', fx: [{ k: 'pct', stat: 'damage', v: 0.25, cat: 'Ranged' }] },
  hearthfire: { name: 'Hearthfire', icon: '🏮', rarity: 'uncommon', text: 'Your Hearth items are 20% stronger.', fx: [{ k: 'pct', stat: '*', v: 0.2, cat: 'Hearth' }] },
  distill:    { name: 'Distillation', icon: '⚗️', rarity: 'uncommon', text: 'Your Alchemy items are 20% stronger.', fx: [{ k: 'pct', stat: '*', v: 0.2, cat: 'Alchemy' }] },
  riveted:    { name: 'Riveted', icon: '🛠️', rarity: 'uncommon', text: 'Your Armor items are 25% stronger.', fx: [{ k: 'pct', stat: '*', v: 0.25, cat: 'Armor' }] },
  medic:      { name: 'Field Medic', icon: '🩺', rarity: 'uncommon', text: 'Your Remedy items are 25% stronger.', fx: [{ k: 'pct', stat: '*', v: 0.25, cat: 'Remedy' }] },
  gears:      { name: 'Oiled Gears', icon: '🛢️', rarity: 'uncommon', text: 'Your Clockwork items start each fight with +1 charge.', fx: [{ k: 'startCharge', v: 1, cat: 'Clockwork' }] },
  ironskin:   { name: 'Iron Skin', icon: '🪖', rarity: 'uncommon', text: 'Battle start: gain Shield equal to 10% of your max HP.', fx: [{ k: 'startShield', v: 0.1 }] },
  bounty:     { name: 'Bounty Hunter', icon: '🎯', rarity: 'uncommon', text: 'Gain 4 extra gold after every win.', fx: [{ k: 'bounty', v: 4 }] },
  quickstart: { name: 'Quick Start', icon: '🚀', rarity: 'uncommon', text: 'Battle start: your bar moves 50% faster for 3s.', fx: [{ k: 'startHaste', v: 3 }] },

  // ---------- Rare ----------
  fury:       { name: 'Battle Fury', icon: '💢', rarity: 'rare', text: 'All your damage is 15% higher.', fx: [{ k: 'pct', stat: 'damage', v: 0.15 }] },
  packbond:   { name: 'Pack Bond', icon: '🐺', rarity: 'rare', text: 'Your Beast items are 30% stronger.', fx: [{ k: 'pct', stat: '*', v: 0.3, cat: 'Beast' }] },
  rally:      { name: 'Rallying Cry', icon: '📣', rarity: 'rare', text: 'Your Herald items are 30% stronger.', fx: [{ k: 'pct', stat: '*', v: 0.3, cat: 'Herald' }] },
  oldmagic:   { name: 'Old Magic', icon: '🔮', rarity: 'rare', text: 'Your Relic items are 25% stronger.', fx: [{ k: 'pct', stat: '*', v: 0.25, cat: 'Relic' }] },
  foundations:{ name: 'Foundations', icon: '🧱', rarity: 'rare', text: 'Your Landmark items are 30% stronger.', fx: [{ k: 'pct', stat: '*', v: 0.3, cat: 'Landmark' }] },
  overgrowth: { name: 'Overgrowth', icon: '🌿', rarity: 'rare', text: 'Your Flora items start each fight with +2 charge.', fx: [{ k: 'startCharge', v: 2, cat: 'Flora' }] },
  clockwork:  { name: 'Clockwork Heart', icon: '⌚', rarity: 'rare', text: 'Your bar moves 10% faster.', fx: [{ k: 'speed', v: 0.1 }] },
  stormward:  { name: 'Storm Ward', icon: '⛈️', rarity: 'rare', text: 'You take 30% less storm damage.', fx: [{ k: 'stormWard', v: 0.3 }] },
  interest:   { name: 'Compound Interest', icon: '🏦', rarity: 'rare', text: 'After every fight, gain 10% of your gold as interest (up to 6).', fx: [{ k: 'interest', v: 6 }] },

  // ---------- Super Rare ----------
  echosteel:  { name: 'Echoing Steel', icon: '⚔️', rarity: 'superrare', text: 'Your Melee items have +1 multicast.', fx: [{ k: 'multicast', v: 1, cat: 'Melee' }] },
  static:     { name: 'Static Charge', icon: '🔌', rarity: 'superrare', text: 'Your items start each fight with +2 charge.', fx: [{ k: 'startCharge', v: 2 }] },
  inferno:    { name: 'Kindled Soul', icon: '☄️', rarity: 'superrare', text: 'Your Burn is 30% stronger.', fx: [{ k: 'pct', stat: 'burn', v: 0.3 }] },
  blight:     { name: 'Blight', icon: '🧫', rarity: 'superrare', text: 'Your Poison is 30% stronger.', fx: [{ k: 'pct', stat: 'poison', v: 0.3 }] },
  goldtouch:  { name: 'Golden Touch', icon: '✋', rarity: 'superrare', text: 'Each of your gold-paying items pays 2 more after fights.', fx: [{ k: 'goldTouch', v: 2 }] },
  vital:      { name: 'Vital Core', icon: '❤️‍🩹', rarity: 'superrare', text: '+15% max HP.', fx: [{ k: 'maxHp', v: 0.15 }] },
  shell:      { name: 'Thick Shell', icon: '🐢', rarity: 'superrare', text: 'Your Shield items give 30% more Shield.', fx: [{ k: 'pct', stat: 'shield', v: 0.3 }] },

  // ---------- Legendary ----------
  timeheart:  { name: 'Heart of the Clock', icon: '🕰️', rarity: 'legendary', text: 'Your bar moves 20% faster.', fx: [{ k: 'speed', v: 0.2 }] },
  alchgift:   { name: "Philosopher's Gift", icon: '💎', rarity: 'legendary', text: 'Your Alchemy items have +1 multicast.', fx: [{ k: 'multicast', v: 1, cat: 'Alchemy' }] },
  beastlord:  { name: 'Beastlord', icon: '🦁', rarity: 'legendary', text: 'Your Beast items have +1 multicast.', fx: [{ k: 'multicast', v: 1, cat: 'Beast' }] },
  mending:    { name: 'Mending Aura', icon: '💞', rarity: 'legendary', text: 'Your Heal and Regen are 50% stronger.', fx: [{ k: 'pct', stat: 'heal', v: 0.5 }, { k: 'pct', stat: 'regen', v: 0.5 }] },
  executioner:{ name: 'Executioner', icon: '🪓', rarity: 'legendary', text: 'All your damage is 30% higher.', fx: [{ k: 'pct', stat: 'damage', v: 0.3 }] },
};

// Skill ids of a rarity (or 'starter') that `owned` doesn't have yet.
export const skillsOfRarity = (rarity, owned = []) =>
  Object.keys(SKILLS).filter(id => SKILLS[id].rarity === rarity && !owned.includes(id));

// [skillId, ...] -> combined effects for the engine and economy.
export function skillEffects(ids = []) {
  const out = { speed: 0, maxHp: 0, stormWard: 0, startShield: 0, startHaste: 0, gold: 0, bounty: 0, interest: 0,
    goldTouch: 0, freeRerolls: 0, pct: [], multicast: [], startCharge: [] };
  for (const id of ids) for (const f of SKILLS[id]?.fx || []) {
    if (f.k === 'pct' || f.k === 'multicast' || f.k === 'startCharge') out[f.k].push(f);
    else out[f.k] += f.v;
  }
  return out;
}
