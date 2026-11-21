// Balance Lab: build a fresh bot pool, measure every item, flag outliers, suggest changes.
//
//   npm run balance                         full run (~2 min), compares against the saved baseline
//   (± is the standard error; items are only flagged when clearly outside their tier even allowing for it)
//   npm run balance -- --quick              faster, noisier (~1 min)
//   npm run balance -- --save-baseline      store this run as the baseline future runs compare to
//   npm run balance -- --scale crossbow=1.2 try a change in memory, without editing items.js
//   npm run balance -- --set crossbow.effects.damage=3,4,6,8
//   npm run balance -- --set artifact:fury.v=0.1,0.15,0.2,0.25
//   npm run balance -- --only underused     print only rows with that flag (weak, strong, underused, ...)
//
// Writes data/balance-report.json; open /balance.html (npm run dev) for the sortable view.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildPool } from '../src/bots/pool.js';
import { T, resetTelemetry } from '../src/balance/telemetry.js';
import { itemImpact, analyze, diffReports, applySet, scaleItem } from '../src/balance/analyze.js';
import { RARITIES } from '../src/core/rules.js';

const args = process.argv.slice(2);
const all = name => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const has = name => args.includes(name);
const quick = has('--quick');

const changes = [];
for (const e of all('--set')) { applySet(e); changes.push(`set ${e}`); }
for (const e of all('--scale')) { const [id, f] = e.split('='); scaleItem(id, Number(f)); changes.push(`scale ${id} ×${f}`); }

const t0 = Date.now();
const step = s => process.stdout.write(`\r${s.padEnd(60)}`);
resetTelemetry(true);
const pool = buildPool({ seedsPerCombo: quick ? 1 : 2, baseSeed: 7, onProgress: (d, n) => step(`building bot pool: day ${d}/${n}`) });
const telemetry = JSON.parse(JSON.stringify(T)); resetTelemetry(false);
const impact = itemImpact(pool, { samples: quick ? 16 : 36, opps: quick ? 8 : 10, onProgress: (i, n) => step(`measuring item impact ${i}/${n}`) });
const report = analyze(pool, telemetry, impact);
report.changes = changes;
step(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`); process.stdout.write('\n\n');

const basePath = new URL('../data/balance-baseline.json', import.meta.url);
const base = existsSync(basePath) ? JSON.parse(readFileSync(basePath)) : null;
report.diff = diffReports(report, base);
writeFileSync(new URL('../data/balance-report.json', import.meta.url), JSON.stringify(report));
if (has('--save-baseline')) writeFileSync(basePath, JSON.stringify(report));

// ---------- Console summary ----------
const pct = x => (Number.isFinite(x) ? (x * 100).toFixed(0) + '%' : '  –');
const num = (x, d = 2) => (Number.isFinite(x) ? (x >= 0 ? ' ' : '') + x.toFixed(d) : '   –');
const only = all('--only')[0];
if (changes.length) console.log('Changes tried this run:', changes.join('; '), '\n');
console.log('item'.padEnd(20), 'rarity'.padEnd(10), 'pick'.padStart(5), 'on'.padStart(5), 'impact'.padStart(7), 'val/g'.padStart(7), '±'.padStart(5), base ? 'Δval/g'.padStart(7) : '', ' flags / suggestion');
const dItem = Object.fromEntries((report.diff?.items || []).map(d => [d.id, d]));
for (const r of RARITIES) {
  const rows = report.rows.filter(x => x.rarity === r && (!only || x.flags.includes(only))).sort((a, b) => (a.vpg || 0) - (b.vpg || 0));
  if (!rows.length) continue;
  console.log(`-- ${r} (median val/g ${num(report.tiers[r].medVpg)}, median pick ${pct(report.tiers[r].medPick)})`);
  for (const x of rows) {
    const sug = (x.suggestScale !== 1 ? ` → try --scale ${x.id}=${x.suggestScale}` : '') + (x.econ ? (Number.isFinite(x.payback) ? `  [gold: pays back in ${x.payback.toFixed(1)} fights]` : '  [pays off in artifacts]') : '') + (x.positional && x.flags.includes('weak') ? '  [placement-dependent]' : '');
    console.log(x.name.slice(0, 19).padEnd(20), x.rarity.padEnd(10), pct(x.pickRate).padStart(5), pct(x.presence).padStart(5),
      num(x.impact).padStart(7), num(x.vpg).padStart(7), (Number.isFinite(x.se) ? x.se.toFixed(2) : '–').padStart(5), base ? num(dItem[x.id]?.dVpg).padStart(7) : '', ' ', x.flags.join(',') + sug);
  }
}
console.log('\nBy tier, median value per gold / per grid cell:', RARITIES.map(r => `${r} ${num(report.tiers[r].medVpg)} / ${num(report.tiers[r].medVpc)}`).join('  '));
console.log('\nPower index (presence-weighted value per gold):', num(report.powerIndex, 4),
  base ? `| vs baseline ${(report.diff.powerChange * 100).toFixed(1)}%${report.diff.powerChange > 0.05 ? '  ⚠ POWER CREEP: the game got stronger overall' : ''}` : '| no baseline yet (run with --save-baseline)');
console.log('Bot diversity (items making up 80% of picks / top-5 share):',
  Object.entries(report.diversity).map(([s, d]) => `${s} ${d.itemsFor80pct} / ${pct(d.top5Share)}`).join('  '));
console.log('Artifacts picked when offered:', report.artifacts.sort((a, b) => a.pickRate - b.pickRate)
  .map(a => `${a.name} ${pct(a.pickRate)}`).join(', '));
console.log('\nWrote data/balance-report.json. Open /balance.html with `npm run dev` for the sortable view.');
