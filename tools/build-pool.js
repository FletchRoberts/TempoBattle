// Builds data/pool.json: bot teams for every day, each rated by a round robin within its day.
// Usage: node tools/build-pool.js [--seeds N] [--seed S]
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildPool, poolReport } from '../src/bots/pool.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
const seedsPerCombo = arg('--seeds', 2), baseSeed = arg('--seed', 1);

const t0 = Date.now();
const pool = buildPool({ seedsPerCombo, baseSeed, onProgress: (d, n) => process.stdout.write(`\rrating day ${d}/${n}`) });
process.stdout.write(`\rbuilt in ${((Date.now() - t0) / 1000).toFixed(1)}s            \n\n`);

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
const out = new URL('../data/pool.json', import.meta.url);
// One team per line keeps diffs readable.
const body = Object.entries(pool.days).map(([d, teams]) =>
  `    "${d}": [\n${teams.map(t => '      ' + JSON.stringify(t)).join(',\n')}\n    ]`).join(',\n');
writeFileSync(out, `{\n  "version": ${pool.version},\n  "generated": "${pool.generated}",\n  "band": ${JSON.stringify(pool.band)},\n  "days": {\n${body}\n  }\n}\n`);
console.log(poolReport(pool));
console.log(`\nwrote ${out.pathname}`);
