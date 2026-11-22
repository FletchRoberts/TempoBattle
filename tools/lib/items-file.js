// Shared writer for src/data/items.js: re-serialises the ITEMS section in its usual format
// (grouped by starting rarity) and keeps everything above it untouched.
import { readFileSync, writeFileSync } from 'node:fs';

const TIERS = ['common', 'uncommon', 'rare', 'superrare', 'legendary'];
const NAMES = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', superrare: 'Super Rare', legendary: 'Legendary' };
const HEAD = ['name', 'icon', 'rarity', 'w', 'h', 'cats', 'tags', 'multicast', 'charge', 'accel', 'minCharge'];
const q = s => (s.includes("'") ? `"${s}"` : `'${s}'`);
const key = k => (/^[a-z_$][\w$]*$/i.test(k) ? k : q(k));
const ser = v => Array.isArray(v) ? `[${v.map(ser).join(', ')}]`
  : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${key(k)}: ${ser(x)}`).join(', ')} }`
  : typeof v === 'string' ? q(v) : String(v);

export function writeItems(ITEMS, file = new URL('../../src/data/items.js', import.meta.url)) {
  const src = readFileSync(file, 'utf8');
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
  writeFileSync(file, src.slice(0, src.indexOf('export const ITEMS = {')) + out.join('\n'));
}
