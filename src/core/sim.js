// Deterministic combat simulation. The game, the bots and the rating tool all run this exact code
// with a fixed timestep, so a matchup always has the same result everywhere.
import { ITEMS } from '../data/items.js';
import { artifactEffects } from '../data/artifacts.js';
import { COLS, def, statsOf, tagsOf, adjacent, inScope, uid } from './rules.js';

export const COL_TIME = 0.5;   // seconds for a bar to cross one column at speed ×1
export const BURN_TICK = 0.5;  // burn deals its stacks every 0.5s, then loses 1 stack
export const OVERTIME = 30;    // storm starts after this many seconds
export const STORM_BASE = 2;     // storm damage of the first hit
export const STORM_GROWTH = 1.25; // each storm hit is this much bigger than the last (ticks every BURN_TICK)
export const TIME_LIMIT = 120; // hard stop, counts as a draw
export const MAX_BARS = 3;
export const SIM_DT = 0.05;    // fixed simulation step (divides every tick interval evenly)
export const MAX_SPEED = 4;    // bar speed cap; stops haste/overclock feedback loops
export const MIN_SPEED = 0.3;  // slows can't push a bar below this
export const HEAL_CLEANSE = 0.2;    // each Heal also removes this share of your Poison (rounded up)
export const BURN_VS_SHIELD = 0.5;  // Burn deals only this much of its damage to Shield

export class Fighter {
  constructor(name, items, hp, artifacts = {}) {
    this.art = artifactEffects(artifacts);
    hp += this.art.maxHp || 0;
    this.name = name; this.maxHp = hp; this.hp = hp;
    this.shield = 0; this.burn = 0; this.poison = 0; this.regen = 0;
    this.items = items.map(i => ({ ...i, bonus: {}, uses: 0, goldEarned: 0, extraMc: 0 }));
    this.goldEarned = 0; // gold won during this fight (paid out afterwards)
    // Multicast auras (e.g. Conductor's Baton) are positional, so work them out once.
    for (const o of this.items) {
      const a = ITEMS[o.id].aura;
      if (a?.multicast) for (const t of this.items) if (t !== o && inScope(a.scope, o, t)) t.extraMc += a.multicast[o.level - 1];
    }
    this.bars = [{ id: uid(), pos: -0.5, temp: false }];
    this.speedPerm = 1 + (this.art.speed || 0); this.hastes = []; this.slows = [];
  }
  speed(t) {
    let s = this.speedPerm;
    for (const h of this.hastes) if (h.until > t) s *= 1 + h.v;
    for (const h of this.slows) if (h.until > t) s *= 1 - h.v;
    return Math.max(MIN_SPEED, Math.min(MAX_SPEED, s));
  }
  hasteNow(t) { return this.hastes.some(h => h.until > t); }
  slowNow(t) { return this.slows.some(h => h.until > t); }
}

export class Battle {
  constructor(a, b, fx) {
    this.f = [a, b]; this.t = 0; this.fx = fx || (() => {});
    this.burnAcc = 0; this.secAcc = 0; this.done = false; this.result = null;
    this.ticks = 0; this.stormHits = 0; this.storm = 0; // storm = damage of the latest hit (0 until it starts)
  }
  step(dt = SIM_DT) {
    if (this.done) return;
    if (!this.started) { this.started = true; for (let i = 0; i < 2; i++) this.battleStart(i); }
    this.t += dt;
    for (let i = 0; i < 2; i++) this.advance(i, dt);
    this.burnAcc += dt;
    while (this.burnAcc >= BURN_TICK - 1e-9) {
      this.burnAcc -= BURN_TICK; this.ticks++;
      for (let i = 0; i < 2; i++) this.burnTick(i);
      if (this.ticks * BURN_TICK > OVERTIME + 1e-9) this.stormTick();
    }
    this.secAcc += dt;
    while (this.secAcc >= 1 - 1e-9) { this.secAcc -= 1; for (let i = 0; i < 2; i++) this.secTick(i); }
    this.checkEnd();
  }
  advance(i, dt) {
    const me = this.f[i];
    if (me.hastes.length) me.hastes = me.hastes.filter(h => h.until > this.t);
    if (me.slows.length) me.slows = me.slows.filter(h => h.until > this.t);
    const d = dt / COL_TIME * me.speed(this.t);
    for (const bar of [...me.bars]) {
      let rem = d; bar.jump = false;
      while (rem > 0) {
        const next = Math.floor(bar.pos) + 1;
        if (bar.pos + rem < next) { bar.pos += rem; break; }
        rem -= next - bar.pos; bar.pos = next;
        if (bar.pos >= COLS) { if (bar.temp) { bar.dead = true; break; } bar.pos = 0; }
        const hits = me.items.filter(o => o.x === bar.pos).sort((a, b) => a.y - b.y);
        for (const inst of hits) {
          // Multicast: fire the item several times per hit (stops if it rewound this bar).
          for (let k = 0; k < (inst.multicast || 1) + inst.extraMc; k++) {
            if (k > 0 && bar.jump) break;
            this.activate(i, inst, bar);
          }
        }
        if (bar.jump) break;
      }
    }
    me.bars = me.bars.filter(b => !b.dead);
  }
  activate(i, inst, bar) {
    const me = this.f[i], d = def(inst), L = inst.level - 1, sp = d.special;
    this.fx('activate', i, inst);
    if (sp && sp.kind === 'amplify') return; // passive

    let mult = 1;
    for (const o of me.items) if (o !== inst && ITEMS[o.id].special?.kind === 'amplify' && adjacent(o, inst)) mult += ITEMS[o.id].special.v[o.level - 1];
    const st = statsOf(inst);
    for (const k in inst.bonus) st[k] = (st[k] || 0) + inst.bonus[k];
    // Auras from your other items: boost stats this item already has, by tag and condition.
    for (const o of me.items) {
      const a = ITEMS[o.id].aura;
      if (!a || !a.stat || o === inst || !st[a.stat] || (a.tag && !tagsOf(inst).has(a.tag))
        || !inScope(a.scope, o, inst) || !this.condOk(i, a.cond)) continue;
      const av = a.v[o.level - 1];
      st[a.stat] = a.pct ? st[a.stat] * (1 + av) : st[a.stat] + av;
    }
    if (st.gold) { // gold on trigger, capped per item per fight
      const give = Math.max(0, Math.min(st.gold, (d.goldCap?.[L] ?? Infinity) - inst.goldEarned));
      if (give) { inst.goldEarned += give; me.goldEarned += give; this.fx('float', i, `+${give}g`, 'gold'); }
      delete st.gold;
    }
    const events = this.applyStats(i, st, mult);
    if (sp) this.applySpecial(i, inst, sp, L, bar);
    events.add('activate');
    if (!this.depth) this.fireTriggers(i, inst, events);
  }
  condOk(i, cond) {
    const me = this.f[i], foe = this.f[1 - i];
    switch (cond) {
      case undefined: return true;
      case 'enemyBelowHalf': return foe.hp < foe.maxHp / 2;
      case 'selfBelowHalf': return me.hp < me.maxHp / 2;
      case 'enemySlowed': return foe.slowNow(this.t);
      case 'enemyBurning': return foe.burn > 0;
      case 'selfShielded': return me.shield > 0;
      default: return false;
    }
  }
  // Items with an `on` block react to what your other items just did. Triggered effects
  // don't set off more triggers (depth guard), so chains can't loop.
  fireTriggers(i, src, events) {
    this.depth = (this.depth || 0) + 1;
    for (const o of this.f[i].items) {
      const on = ITEMS[o.id].on;
      if (!on || o === src || !events.has(on.event) || (on.scope === 'adjacent' && !adjacent(o, src))) continue;
      const L = o.level - 1, st = {};
      for (const [k, arr] of Object.entries(on.effects || {})) st[k] = arr[L];
      this.fx('activate', i, o);
      this.applyStats(i, st, 1);
      if (on.special) this.applySpecial(i, o, on.special, L, null);
    }
    this.depth--;
  }
  // Battle start: items with a `start` block fire it once, before any bar moves.
  battleStart(i) {
    const me = this.f[i];
    if (me.art.startShield) this.applyStats(i, { shield: me.art.startShield }, 1);
    if (me.art.startHaste) me.hastes.push({ src: 'artifact', v: 0.5, until: me.art.startHaste });
    for (const inst of this.f[i].items) {
      const s0 = def(inst).start; if (!s0) continue;
      const L = inst.level - 1, st = {};
      for (const [k, arr] of Object.entries(s0.effects || {})) st[k] = arr[L];
      this.fx('activate', i, inst);
      this.applyStats(i, st, 1);
      if (s0.special) this.applySpecial(i, inst, s0.special, L, null);
    }
  }
  // Applies stats and returns which kinds of effect happened (for triggers).
  applyStats(i, st, mult) {
    const me = this.f[i], foe = this.f[1 - i], events = new Set(), A = me.art;
    // Artifacts scale or add to what you apply (only to effects the item actually has).
    const artMult = { damage: 1 + (A.dmgPct || 0), heal: 1 + (A.healPct || 0), shield: 1 + (A.shieldPct || 0) };
    const artAdd = { burn: A.burnAdd || 0, poison: A.poisonAdd || 0 };
    const val = k => {
      const base = (st[k] || 0) * mult;
      const x = base > 0 ? Math.round(base * (artMult[k] || 1) + (artAdd[k] || 0)) : 0;
      if (x > 0) events.add(k);
      return x;
    };
    let v;
    if ((v = val('maxhp')) > 0) { me.maxHp += v; me.hp += v; this.fx('float', i, `+${v} max`, 'heal'); }
    if ((v = val('shield')) > 0) { me.shield += v; this.fx('float', i, `+${v}`, 'shield'); }
    if ((v = val('heal')) > 0) {
      me.hp += Math.min(v, me.maxHp - me.hp); this.fx('float', i, `+${v}`, 'heal');
      if (me.poison > 0) me.poison -= Math.ceil(me.poison * HEAL_CLEANSE); // healing also eases poison
    }
    if ((v = val('regen')) > 0) { me.regen += v; this.fx('float', i, `+${v} regen`, 'regen'); }
    if ((v = val('cleanse')) > 0) { me.poison = Math.max(0, me.poison - v); me.burn = Math.max(0, me.burn - v); this.fx('float', i, `cleanse ${v}`, 'heal'); }
    if ((v = val('damage')) > 0) this.hit(1 - i, v, 'damage');
    if ((v = val('burn')) > 0) { foe.burn += v; this.fx('float', 1 - i, `+${v} burn`, 'burn'); }
    if ((v = val('poison')) > 0) { foe.poison += v; this.fx('float', 1 - i, `+${v} poison`, 'poison'); }
    return events;
  }
  applySpecial(i, inst, sp, L, bar) {
    const me = this.f[i], foe = this.f[1 - i], sv = sp.v[L];
    switch (sp.kind) {
      case 'buffAdj':
        for (const o of me.items) if (o !== inst && adjacent(o, inst) && tagsOf(o).has(sp.tag)) { o.bonus[sp.stat] = (o.bonus[sp.stat] || 0) + sv; this.fx('buff', i, o); }
        break;
      case 'buffAll':
        for (const o of me.items) if (tagsOf(o).has(sp.tag)) { o.bonus[sp.stat] = (o.bonus[sp.stat] || 0) + sv; this.fx('buff', i, o); }
        break;
      case 'buffRow': case 'buffCol': {
        const scope = sp.kind === 'buffRow' ? 'row' : 'column';
        for (const o of me.items) if (o !== inst && inScope(scope, inst, o) && statsOf(o)[sp.stat]) {
          o.bonus[sp.stat] = (o.bonus[sp.stat] || 0) + sv; this.fx('buff', i, o);
        }
        break;
      }
      case 'grow': inst.bonus[sp.stat] = (inst.bonus[sp.stat] || 0) + sv; this.fx('buff', i, inst); break;
      case 'haste': this.timed(me.hastes, inst, sv, sp.dur ?? 3); this.fx('float', i, 'haste', 'time'); break;
      case 'slow': this.timed(foe.slows, inst, sv, sp.dur ?? 3); this.fx('float', 1 - i, 'slowed', 'slow'); break;
      case 'overclock': me.speedPerm += sv; this.fx('float', i, 'overclock', 'time'); break;
      case 'rewind':
        if (bar && inst.uses < sv) { inst.uses++; bar.pos = -0.5; bar.jump = true; this.fx('float', i, 'rewind', 'time'); }
        break;
      case 'echo':
        if (inst.uses < sv && me.bars.length < MAX_BARS) { inst.uses++; me.bars.push({ id: uid(), pos: -0.5, temp: true }); this.fx('float', i, 'echo', 'time'); }
        break;
      case 'bash': { const dmg = Math.round(me.shield * sv); if (dmg > 0) this.hit(1 - i, dmg, 'damage'); break; }
      case 'ignite': if (foe.burn > 0) { foe.burn = Math.round(foe.burn * sv); this.fx('float', 1 - i, `ignite → ${foe.burn}`, 'burn'); } break;
    }
  }
  // Haste/slow from the same item refreshes instead of stacking.
  timed(list, inst, v, dur) {
    const h = list.find(x => x.src === inst.uid);
    if (h) { h.v = Math.max(h.v, v); h.until = this.t + dur; } else list.push({ src: inst.uid, v, until: this.t + dur });
  }
  hit(target, amt, cls) {
    const t = this.f[target], blocked = Math.min(t.shield, amt);
    t.shield -= blocked; t.hp -= amt - blocked;
    this.fx('float', target, `−${amt}`, blocked === amt ? 'shield' : cls);
  }
  burnTick(i) {
    const me = this.f[i]; if (me.burn <= 0) return;
    // Shield soaks Burn at half rate: each point of Shield blocks 2 Burn damage.
    const covered = Math.min(me.burn, Math.floor(me.shield / BURN_VS_SHIELD));
    me.shield -= Math.ceil(covered * BURN_VS_SHIELD);
    me.hp -= me.burn - covered;
    this.fx('float', i, `−${me.burn}`, covered === me.burn ? 'shield' : 'burn'); me.burn--;
  }
  secTick(i) {
    const me = this.f[i];
    if (me.poison > 0) { me.hp -= me.poison; this.fx('float', i, `−${me.poison}`, 'poison'); }
    if (me.regen > 0) { me.hp = Math.min(me.maxHp, me.hp + me.regen); this.fx('float', i, `+${me.regen}`, 'regen'); }
  }
  // Storm: same tick rate as Burn, hits both sides like a weapon (Shield absorbs it first),
  // and grows exponentially so stacked Shield can't stall forever.
  stormTick() {
    this.storm = Math.round(STORM_BASE * STORM_GROWTH ** this.stormHits++);
    for (let i = 0; i < 2; i++) this.hit(i, Math.round(this.storm * (1 - (this.f[i].art.stormWard || 0))), 'storm');
  }
  checkEnd() {
    const [a, b] = this.f;
    if (this.t >= TIME_LIMIT) { this.done = true; this.result = 'draw'; return; }
    if (a.hp > 0 && b.hp > 0) return;
    this.done = true;
    this.result = a.hp <= 0 && b.hp <= 0 ? 'draw' : a.hp <= 0 ? 'loss' : 'win'; // from side 0's view
  }
}

// Run a full fight without visuals. Returns 'win' | 'loss' | 'draw' for side A.
export function simulate(itemsA, itemsB, hp, artsA = {}, artsB = {}) {
  const B = new Battle(new Fighter('A', itemsA, hp, artsA), new Fighter('B', itemsB, hp, artsB));
  while (!B.done) B.step(SIM_DT);
  return B.result;
}

// Score A vs B from both seats (side 0 acts first within a tick), 0..1 for A.
export function duel(itemsA, itemsB, hp, artsA = {}, artsB = {}) {
  const pts = { win: 1, draw: 0.5, loss: 0 };
  return (pts[simulate(itemsA, itemsB, hp, artsA, artsB)] + (1 - pts[simulate(itemsB, itemsA, hp, artsB, artsA)])) / 2;
}
