// Artifacts: run-wide passives. You pick one of three every third day (and from a Treasure Map).
// Picking one you already own levels it up (max IV). `v` has one value per level.
const pct = v => Math.round(v * 100) + '%';

export const ARTIFACT_DAYS = 3; // a choice on days 3, 6, 9, ...

export const ARTIFACTS = {
  clockwork: { name: 'Clockwork Heart', icon: '⌚', effect: 'speed', v: [0.08, 0.12, 0.16, 0.22], fmt: pct,
               text: V => `Your bar moves ${V} faster in every fight` },
  fury:      { name: 'Battle Fury', icon: '💢', effect: 'dmgPct', v: [0.1, 0.15, 0.2, 0.3], fmt: pct,
               text: V => `All your weapon damage is ${V} higher` },
  kindled:   { name: 'Kindled Soul', icon: '☄️', effect: 'burnAdd', v: [1, 1, 2, 3],
               text: V => `Whenever you apply Burn, apply ${V} more` },
  gland:     { name: 'Venom Gland', icon: '🧫', effect: 'poisonAdd', v: [1, 1, 1, 2],
               text: V => `Whenever you apply Poison, apply ${V} more` },
  ironskin:  { name: 'Iron Skin', icon: '🪖', effect: 'startShield', v: [15, 25, 35, 50],
               text: V => `Battle start: gain ${V} Shield` },
  vital:     { name: 'Vital Core', icon: '❤️‍🩹', effect: 'maxHp', v: [15, 25, 35, 50],
               text: V => `+${V} max HP in every fight` },
  mending:   { name: 'Mending Aura', icon: '💞', effect: 'healPct', v: [0.2, 0.3, 0.4, 0.6], fmt: pct,
               text: V => `Your Heals are ${V} stronger` },
  shell:     { name: 'Thick Shell', icon: '🐢', effect: 'shieldPct', v: [0.15, 0.25, 0.35, 0.5], fmt: pct,
               text: V => `Shield you gain is ${V} higher` },
  stormward: { name: 'Storm Ward', icon: '⛈️', effect: 'stormWard', v: [0.2, 0.3, 0.4, 0.5], fmt: pct,
               text: V => `You take ${V} less storm damage` },
  quickstart:{ name: 'Quick Start', icon: '🚀', effect: 'startHaste', v: [2, 3, 4, 5],
               text: V => `Battle start: your bar moves 50% faster for ${V}s` },
  tithe:     { name: 'Tithe', icon: '🪙', effect: 'gold', v: [2, 3, 4, 6],
               text: V => `Gain ${V} gold after every fight` },
  interest:  { name: 'Compound Interest', icon: '🏦', effect: 'interest', v: [3, 4, 6, 8],
               text: V => `After every fight, gain 10% of your gold as interest (up to ${V})` },
  bounty:    { name: 'Bounty Hunter', icon: '🎯', effect: 'bounty', v: [3, 4, 6, 9],
               text: V => `Gain ${V} extra gold after every win` },
  goldtouch: { name: 'Golden Touch', icon: '✋', effect: 'goldTouch', v: [1, 1, 2, 3],
               text: V => `Each of your gold-paying items pays ${V} more after fights` },
  haggler:   { name: 'Haggler', icon: '🤝', effect: 'freeRerolls', v: [1, 2, 3, 4],
               text: V => `Your first ${V} shop reroll(s) each day are free` },
};

// { artifactId: level } -> { effect: value }
export function artifactEffects(arts = {}) {
  const out = {};
  for (const [id, lvl] of Object.entries(arts)) {
    const a = ARTIFACTS[id];
    if (a) out[a.effect] = (out[a.effect] || 0) + a.v[Math.min(4, lvl) - 1];
  }
  return out;
}
