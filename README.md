# Tempo Forge

An async-PvP auto-battler. You place items on a 3 × 10 grid. During a fight a bar sweeps the grid
column by column like a video-editor playhead, and each item activates when the bar reaches its
left edge. Between fights you shop, merge items to level them up, and infuse them with other types.

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
| Burn | Deals its stacks every 0.5s, then loses 1. Against Shield it only does half damage (`BURN_VS_SHIELD`). |
| Poison | Deals its stacks every 1s, ignores Shield, never fades. Each Heal removes 20% of it, rounded up (`HEAL_CLEANSE`). |
| Regen | Heals its stacks every 1s. |
| Haste / Slow | Haste speeds up your bar, Slow slows the enemy's, for a few seconds. The same item refreshes instead of stacking. Speed stays between ×0.3 and ×4. |
| Battle start | Items with a `start` block fire it once when the fight begins (e.g. Ward Totem's Shield, Smoke Bomb's Slow). |
| Storm | After 30s both sides take a weapon-like hit every 0.5s (the Burn tick); Shield absorbs it first. It starts at 2 and each hit is 25% bigger (`OVERTIME`, `STORM_BASE`, `STORM_GROWTH`). Hard draw at 120s. |
| Levels | I–IV. The only way up is merging: two identical items of the same level make one item a level higher. |
| Multicast | An item fires `multicast` times per bar hit (default 1). Items can set `multicast` in `items.js`. |
| Modifiers | Shop buys (1 per shop, 2 from Day 3) that add a flat stat and its tag to one item, e.g. Kindling +2 Burn. An item holds level + 1. Echo Rune (rare) adds +1 multicast. |
| Infusions | Rare. A shop item is pre-infused 8% of the time, and a Wild Essence (random infusion) shows up in 20% of shops. |
| Shiny | A shop item rolls shiny 2.5–8% of the time (more on later days): +1 multicast on top of its own, double price. Merging keeps it. Some items have built-in `multicast`. |
| Freeze | Freeze the shop to keep its unsold offers for the next day. Sold slots refill; rerolling unfreezes. |
| Infusion | An essence adds a second stat and its tag to an item. |
| Start | Empty board, 12 gold. Buy your first items on Day 1. |
| Shop rank | Rank = day + bonuses (Guild Charter). Rarity odds per rank in `RANK_ODDS`: 100% Common at rank 1, capping at 10/35/35/20 from rank 10. |
| Sales / discounts | 8% of item offers are half price (`SALE_CHANCE`). Coupon Book takes a flat amount off item offers (min 1). |
| Run | 10 lives, 10 wins to clear. A loss costs 1 life on Days 1–3, 2 on Days 4–7, 3 after (`lifeLoss`). At most 17 days. |
| Last Stand | The first time you hit 0 lives, pick 1 of 3 rare boons (`BOONS` in `src/ui/app.js`) and continue on 1 life. |
| HP curve | Base max HP grows 12% a day: 40, 45, 50, 56 … 111 on Day 10, 156 on Day 13 (`HP_BASE`, `HP_GROWTH`). |
| Artifacts | Run-wide passives in `src/data/artifacts.js`. Choose 1 of 3 on Days 3, 6, 9 … (and from a Treasure Map); picking one again levels it up to IV. They're saved with your board so opponents carry theirs. |
| Gold items | `gold: { when, v, grow? }` pays out after fights while on your board, alone (Coin Purse, Piggy Bank) or alongside a fight effect (Tax Collector, Lucky Clover, Trade Caravan). `map` grants an artifact choice after N fights. |
| Gold on trigger | A `gold` effect earns gold each time the item fires, capped per fight by `goldCap` (Pickpocket Glove, Midas Hammer, Slot Machine). Paid out after the fight. |
| Income artifacts | Tithe (flat), Compound Interest (10% of your gold, capped), Bounty Hunter (per win), Golden Touch (+N per gold-paying item). |
| Rows / columns | `aura.scope: 'row' \| 'column'` limits an aura to items sharing a row or column; `aura.multicast` adds activations (War Drum, Oil Lamp, Watchtower, Conductor's Baton). Specials `buffRow` / `buffCol` buff on trigger (Plague Rat, Field Forge). |
| Max HP | `maxhp` stat: raises max HP and current HP (Heart Locket, Troll Blood, Giant's Belt). |
| Triggers | `on: { event, scope, effects }`: an item reacts when your other items activate, apply Burn/Poison, gain Shield, Heal or deal damage. Triggered effects don't chain. |
| Auras | `aura: { tag, stat, v, pct?, cond? }`: passive bonus to your other items of a tag, optionally only under a condition (e.g. enemy below half HP). |

## Opponents: the bot pool and matchmaking

You always fight a snapshot of another board from the same day. Until real players fill the
pool, bots supply those boards.

1. **Bots play real runs** (`src/bots/drafter.js`). Each bot has an archetype (which tags it wants)
   and a skill level, and plays through the same shop, gold and level rules as you, saving its
   board every day.
   - **Novice and casual bots** buy on heuristics with a lot of randomness, so they make plausible but weaker boards.
   - **Solid and expert bots** test every buy and essence by simulating the result against
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
