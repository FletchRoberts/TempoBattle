// Bot "personalities". `tags` weights how much the bot wants items with that tag (default 0.3).
// Add an archetype here and the pool builder picks it up automatically.
export const ARCHETYPES = {
  pyro:     { name: 'Pyromancer', tags: { fire: 2, tool: 0.8, heal: 0.5, shield: 0.5 } },
  plague:   { name: 'Plaguebearer', tags: { poison: 2, heal: 0.7, shield: 0.6, regen: 0.5 } },
  blade:    { name: 'Duelist', tags: { weapon: 2, tool: 0.9, time: 0.7, shield: 0.4 } },
  fortress: { name: 'Bulwark', tags: { shield: 2, weapon: 1.2, heal: 0.8, regen: 0.7 } },
  grove:    { name: 'Druid', tags: { regen: 2, heal: 1.5, poison: 0.7, shield: 0.6 } },
  tempo:    { name: 'Clockmaker', tags: { time: 2, weapon: 1.2, fire: 0.7, tool: 0.6 } },
  magpie:   { name: 'Magpie', tags: { weapon: 1, fire: 1, poison: 1, heal: 1, shield: 1, regen: 1, time: 1, tool: 1 } },
};

// How well a bot plays. noise = randomness in its judgement, rerolls = shop rerolls per day,
// lookahead = how many sample opponents it simulates against when choosing buys (0 = gut feel only).
export const SKILLS = {
  novice: { noise: 2.2, rerolls: 0, upgrades: false, lookahead: 0 },
  casual: { noise: 1.2, rerolls: 1, upgrades: true, lookahead: 0 },
  solid:  { noise: 0.5, rerolls: 2, upgrades: true, lookahead: 3 },
  expert: { noise: 0.15, rerolls: 3, upgrades: true, lookahead: 6 },
};

const FIRST = ['Ash', 'Bog', 'Brass', 'Cinder', 'Dusk', 'Ember', 'Fen', 'Gilt', 'Grave', 'Iron', 'Lantern', 'Marsh',
  'Moss', 'Rust', 'Salt', 'Soot', 'Thorn', 'Tin', 'Velvet', 'Wick'];
const LAST = ['Bandit', 'Witch', 'Squire', 'Monk', 'Knight', 'Hag', 'Alchemist', 'Wyrm', 'Warden', 'Tinker',
  'Thief', 'Golem', 'Piper', 'Baron', 'Smith', 'Oracle', 'Rook', 'Herald'];
export const botName = rng => `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
