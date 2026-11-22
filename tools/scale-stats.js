// Scale one stat across every item (effects, start/on effects, buffs and flat auras that use it).
// Usage: node tools/scale-stats.js poison=0.75 damage=1.15 heal=1.2 regen=1.2
//        node tools/scale-stats.js --cat Clockwork damage=0.9      (only items in that category)
// Rewrites the ITEMS section of src/data/items.js in its usual format.
import { ITEMS } from '../src/data/items.js';
import { writeItems } from './lib/items-file.js';

const argv = process.argv.slice(2), ci = argv.indexOf('--cat'), onlyCat = ci >= 0 ? argv.splice(ci, 2)[1] : null;
const factors = Object.fromEntries(argv.map(a => { const [k, v] = a.split('='); return [k, Number(v)]; }));
if (!Object.keys(factors).length) { console.log('Usage: node tools/scale-stats.js poison=0.75 damage=1.15'); process.exit(1); }
const f = stat => factors[stat] ?? 1;
const sc = (v, x) => (v > 0 && x !== 1 ? Math.max(1, Math.round(v * x)) : v);
const scObj = o => { if (o) for (const k of Object.keys(o)) o[k] = o[k].map(v => sc(v, f(k))); };
for (const d of Object.values(ITEMS)) {
  if (onlyCat && !(d.cats || []).includes(onlyCat)) continue;
  scObj(d.effects); scObj(d.start?.effects); scObj(d.on?.effects);
  if (d.special?.stat && d.special.v) d.special.v = d.special.v.map(v => sc(v, f(d.special.stat)));
  if (d.aura?.stat && !d.aura.pct && d.aura.v) d.aura.v = d.aura.v.map(v => sc(v, f(d.aura.stat)));
}

writeItems(ITEMS);
console.log('scaled', factors, onlyCat ? `(only ${onlyCat})` : '');
