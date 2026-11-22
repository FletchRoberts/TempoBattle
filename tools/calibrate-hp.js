// Calibrate max HP per day so fights last about TARGET seconds (median), using the current bot pool.
// Usage: node tools/calibrate-hp.js [--target 18]   then paste the printed table into src/core/rules.js
// (or run with --write to update it in place), rebuild the pool and run it again once to settle.
import { readFileSync, writeFileSync } from 'node:fs';
import { Battle, Fighter } from '../src/core/sim.js';
import { fromSnapshot } from '../src/core/rules.js';
import { makeRng } from '../src/core/rng.js';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const TARGET = arg('--target', 18), PAIRS = 50;
const pool = JSON.parse(readFileSync(new URL('../data/pool.json', import.meta.url)));

function medianLength(teams, hp, seed) {
  const rng = makeRng(seed), ts = [];
  for (let k = 0; k < PAIRS; k++) {
    const a = rng.pick(teams), b = rng.pick(teams); if (a === b) continue;
    const B = new Battle(new Fighter('a', fromSnapshot(a.items), hp, a.skills || []), new Fighter('b', fromSnapshot(b.items), hp, b.skills || []));
    while (!B.done) B.step();
    ts.push(B.t);
  }
  ts.sort((x, y) => x - y);
  return ts[ts.length >> 1];
}

const table = [];
for (const [day, teams] of Object.entries(pool.days)) {
  let lo = 50, hi = 200000;
  for (let it = 0; it < 18; it++) { // HP and fight length rise together, so bisect (in log space)
    const mid = Math.sqrt(lo * hi);
    if (medianLength(teams, Math.round(mid), +day) < TARGET) lo = mid; else hi = mid;
  }
  table.push(Math.round(Math.sqrt(lo * hi) / 10) * 10);
  process.stdout.write(`\rday ${day}: ${table.at(-1)}      `);
}
// Smooth: average each day with its neighbours (in log space), never grow less than 8% a day.
const L = table.map(Math.log);
const S = L.map((v, i) => i === 0 ? v : i === L.length - 1 ? L[i - 1] + Math.log(1.2) : (L[i - 1] + v + L[i + 1]) / 3);
for (let i = 1; i < S.length; i++) S[i] = Math.max(S[i], S[i - 1] + Math.log(1.08));
table.splice(0, table.length, ...S.map(v => Math.round(Math.exp(v) / 10) * 10));
console.log(`\n\nexport const HP_BY_DAY = [${table.join(', ')}];`);
if (process.argv.includes('--write')) {
  const f = new URL('../src/core/rules.js', import.meta.url);
  const s = readFileSync(f, 'utf8').replace(/export const HP_BY_DAY = \[[^\]]*\];/, `export const HP_BY_DAY = [${table.join(', ')}];`);
  writeFileSync(f, s);
  console.log('updated src/core/rules.js');
}
