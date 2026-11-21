# Tempo Forge

An async-PvP auto-battler. You place items on a 3 × 10 grid. During a fight a bar sweeps the grid
column by column like a video-editor playhead, and each item activates when the bar reaches its
left edge. Between fights you shop, merge and upgrade items, and infuse them with other types.

## Run it

```bash
npm run dev     # http://localhost:8080 (ES modules need a server; file:// won't work)
```

```bash
npm run pool    # rebuild and re-rate data/pool.json, prints a balance report
```

No dependencies. Node 18+.

## How a day works

`DAY_FLOW` in `src/core/rules.js` is `shop → encounter → pvp`. The encounter slot is a
placeholder for events and PvE fights. Its entries in `ENCOUNTERS` are all disabled, so the
game skips straight to the fight for now.

## Core rules

| | |
|---|---|
| Grid | 3 rows × 10 columns. Items are 1×1 up to 2×3 and can be rotated. |
| Bar | 0.5s per column (`COL_TIME`). Items in the same column fire together, top to bottom. |
| Burn | Deals its stacks every 0.5s, then loses 1. Shield blocks it. |
| Poison | Deals its stacks every 1s, ignores Shield, never fades. |
| Regen | Heals its stacks every 1s. |
| Storm | After 30s both sides take a weapon-like hit every 0.5s (the Burn tick); Shield absorbs it first. It starts at 2 and each hit is 25% bigger (`OVERTIME`, `STORM_BASE`, `STORM_GROWTH`). Hard draw at 120s. |
| Levels | I–IV. Merge two identical items of the same level, or pay to upgrade. |
| Infusion | An essence adds a second stat and its tag to an item. |
| Run | 4 lives, 10 wins to clear, so at most 13 days. |

## Opponents: the bot pool and matchmaking

You always fight a snapshot of another board from the same day. Until real players fill the
pool, bots supply those boards.

1. **Bots play real runs** (`src/bots/drafter.js`). Each bot has an archetype (which tags it wants)
   and a skill level, and plays through the same shop, gold and level rules as you, saving its
   board every day.
   - **Novice and casual bots** buy on heuristics with a lot of randomness, so they make plausible but weaker boards.
   - **Solid and expert bots** test every buy, upgrade and essence by simulating the result against
     a sample of that day's boards, and keep whatever wins most.
2. **Every day is rated by round robin** (`src/bots/pool.js`). Each team fights every other team from
   both seats (side 0 acts first in a tick), and its win rate against the field becomes `wr`.
   The sim uses a fixed timestep, so results match the in-game fight exactly.
3. **Matchmaking** picks a random opponent whose `wr` is within 40–60% (`MATCH_BAND`). If fewer than
   3 teams qualify, the band widens by 5% at a time. Your own boards and teams you already
   fought this run are excluded.
4. **Player boards join the pool.** After each fight your board is rated against that day's field
   and saved (`src/ui/pool-store.js`). For now this is stored in the browser. `PoolStore` is the
   seam for a server: keep `field / pick / submit`, and back them with an API.

### When there's a server

- Store submitted snapshots per day, keyed by run.
- Run a daily job that re-rates each day's field. A full round robin is fine for a few hundred
  teams per day. Beyond that, rate each team against a fixed random sample, or use Elo/Glicko updated from real
  fight results.
- Lower the share of bots as real boards arrive. Keep some bots for days with thin data.

## Code map

```
src/data/items.js      all items, rarities, infusions, specials (edit here to add content)
src/core/rules.js      economy, shop rolls, grid helpers, snapshots, day flow
src/core/sim.js        deterministic battle simulation (shared by game, bots, tools)
src/core/rng.js        seeded RNG
src/bots/archetypes.js bot personalities and skill levels
src/bots/drafter.js    bot that plays a run
src/bots/pool.js       pool building, round-robin rating, matchmaking, report
src/ui/                browser game (app.js) and opponent storage (pool-store.js)
tools/                 build-pool.js, serve.js
data/pool.json         generated opponent pool
```
