// Scale one stat across every item (effects, start/on effects, buffs and flat auras that use it).
// Usage: node tools/scale-stats.js poison=0.75 damage=1.15 heal=1.2 regen=1.2
// Rewrites the ITEMS section of src/data/items.js in its usual format.
import { readFileSync, writeFileSync } from 'node:fs';
import { ITEMS } from '../src/data/items.js';

const factors = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.split('='); return [k, Number(v)]; }));
if (!Object.keys(factors).length) { console.log('Usage: node tools/scale-stats.js poison=0.75 damage=1.15'); process.exit(1); }
const f = stat => factors[stat] ?? 1;
const sc = (v, x) => (v > 0 && x !== 1 ? Math.max(1, Math.round(v * x)) : v);
const scObj = o => { if (o) for (const k of Object.keys(o)) o[k] = o[k].map(v => sc(v, f(k))); };
for (const d of Object.values(ITEMS)) {
  scObj(d.effects); scObj(d.start?.effects); scObj(d.on?.effects);
  if (d.special?.stat && d.special.v) d.special.v = d.special.v.map(v => sc(v, f(d.special.stat)));
  if (d.aura?.stat && !d.aura.pct && d.aura.v) d.aura.v = d.aura.v.map(v => sc(v, f(d.aura.stat)));
}

const TIERS = ['common', 'uncommon', 'rare', 'superrare', 'legendary'];
const q = s => (s.includes("'") ? `"${s}"` : `'${s}'`);
const key = k => (/^[a-z_$][\w$]*$/i.test(k) ? k : q(k));
const ser = v => Array.isArray(v) ? `[${v.map(ser).join(', ')}]`
  : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${key(k)}: ${ser(x)}`).join(', ')} }`
  : typeof v === 'string' ? q(v) : String(v);
const HEAD = ['name', 'icon', 'rarity', 'w', 'h', 'tags', 'multicast', 'charge', 'accel', 'minCharge'];
const NAMES = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', superrare: 'Super Rare', legendary: 'Legendary' };
const FILE = new URL('../src/data/items.js', import.meta.url);
const src = readFileSync(FILE, 'utf8');
const out = ['export const ITEMS = {'];
for (const t of TIERS) {
  out.push(`  // ---------- ${NAMES[t]} (${5 - TIERS.indexOf(t)} tier${t === 'legendary' ? '' : 's'}) ----------`);
  for (const [id, d] of Object.entries(ITEMS).filter(([, d]) => d.rarity === t)) {
    const head = HEAD.filter(k => d[k] !== undefined).map(k => `${k}: ${ser(d[k])}`).join(', ');
    const rest = Object.keys(d).filter(k => !HEAD.includes(k)).map(k => `${key(k)}: ${ser(d[k])}`).join(', ');
    out.push(`  ${key(id)}: { ${head},${rest ? `\n      ${rest}` : ''} },`);
  }
}
out.push('};', '');
writeFileSync(FILE, src.slice(0, src.indexOf('export const ITEMS = {')) + out.join('\n'));
console.log('scaled', factors);
