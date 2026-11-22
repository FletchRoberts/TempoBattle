// Deterministic combat simulation. The game, the bots and the rating tool all run this exact code
// with a fixed timestep, so a matchup always has the same result everywhere.
import { ITEMS } from '../data/items.js';
import { skillEffects } from '../data/skills.js';
import { COLS, def, statsOf, tagsOf, adjacent, inScope, hasCat, uid, isActive, chargeCost, perFireScale, scaledBonus } from './rules.js';

export const COL_TIME = 0.25;  // seconds for a bar to cross one column at speed ×1 (a 5-column pass = 1.25s)
// Charge loops are allowed: fires set off by charge happen on the next tick, so a loop runs at a
// steady pace instead of all at once. RUNAWAY_LIMIT only guards the browser against a runaway step.
export const RUNAWAY_LIMIT = 400; // activations per side per tick
export const BURN_TICK = 0.5;  // burn deals its stacks every 0.5s, then loses 1 stack
export const OVERTIME = 30;    // storm starts after this many seconds
export const STORM_BASE = 12;    // storm damage of the first hit
export const STORM_GROWTH = 1.25; // each storm hit is this much bigger than the last (ticks every BURN_TICK)
export const TIME_LIMIT = 120; // hard stop, counts as a draw
export const MAX_BARS = 3;
export const SIM_DT = 0.05;    // fixed simulation step (divides every tick interval evenly)
export const MAX_SPEED = 4;    // bar speed cap; stops haste/overclock feedback loops
export const MIN_SPEED = 0.3;  // slows can't push a bar below this
export const BURN_VS_SHIELD = 0.8;  // Burn deals only this much of its damage to Shield (1 = no reduction)

export class Fighter {
  constructor(name, items, hp, skills = []) {
    this.sk = skillEffects(skills);
    hp = Math.round(hp * (1 + this.sk.maxHp));
    this.name = name; this.maxHp = hp; this.hp = hp;
    this.shield = 0; this.burn = 0; this.poison = 0; this.regen = 0;
    this.items = items.map(i => ({ ...i, bonus: {}, uses: 0, goldEarned: 0, extraMc: 0,
      charge: 0, cost: isActive(ITEMS[i.id]) ? chargeCost(i) : 0 }));
    this.goldEarned = 0; // gold won during this fight (paid out afterwards)
    // Multicast auras (e.g. Conductor's Baton) are positional, so work them out once.
    for (const o of this.items) {
      const a = ITEMS[o.id].aura;
      if (a?.multicast) for (const t of this.items) if (t !== o && inScope(a.scope, o, t) && hasCat(t, a.cat)) t.extraMc += a.multicast[o.level - 1];
    }
    this.bars = [{ id: uid(), pos: -0.5, temp: false }];
    for (const m of this.sk.multicast) for (const t of this.items) if (hasCat(t, m.cat)) t.extraMc += m.v; // skills like Echoing Steel
    this.speedPerm = 1 + this.sk.speed; this.hastes = []; this.slows = [];
    this.ready = []; this.fired = 0;
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
    for (let i = 0; i < 2; i++) { this.f[i].fired = 0; this.fireReady(i); }
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
        for (const inst of hits) this.addCharge(i, inst, 1, bar);
        if (bar.jump) break;
      }
    }
    me.bars = me.bars.filter(b => !b.dead);
  }
  // Give an item charge; when it reaches its cost it fires (multicast = several times) and spends it.
  // From the bar: fire now. From another item (deferred): fire at the start of the next tick.
  addCharge(i, inst, n, bar, deferred = false) {
    if (!inst.cost) return; // passive items don't charge
    inst.charge += n;
    this.fx('charge', i, inst);
    if (inst.charge < inst.cost) return;
    if (deferred) { const me = this.f[i]; if (!me.ready.includes(inst)) me.ready.push(inst); return; }
    this.fire(i, inst, bar);
  }
  fireReady(i) {
    const me = this.f[i], queue = me.ready; me.ready = [];
    for (const inst of queue) if (inst.charge >= inst.cost) this.fire(i, inst, null);
  }
  fire(i, inst, bar) {
    const me = this.f[i];
    if (me.fired >= RUNAWAY_LIMIT) return; // safety valve; the charge stays for the next tick
    inst.charge -= inst.cost;
    const d = def(inst);
    if (d.accel) inst.cost = Math.max(d.minCharge ?? 1, inst.cost - d.accel); // speeds up each time it fires
    for (let k = 0; k < (inst.multicast || 1) + inst.extraMc; k++) {
      if (k > 0 && bar?.jump) break; // a rewind already sent this bar back
      me.fired++;
      this.activate(i, inst, bar);
    }
  }
  activate(i, inst, bar) {
    const me = this.f[i], d = def(inst), L = inst.level - 1, sp = d.special;
    this.fx('activate', i, inst);
    if (sp && sp.kind === 'amplify') return; // passive

    let mult = 1;
    for (const o of me.items) if (o !== inst && ITEMS[o.id].special?.kind === 'amplify' && adjacent(o, inst)) mult += ITEMS[o.id].special.v[o.level - 1];
    const st = statsOf(inst);
    for (const k in inst.bonus) st[k] = (st[k] || 0) + inst.bonus[k];
    // "+N for each other <category> item you have"
    if (d.per) { const n = me.items.filter(o => o !== inst && hasCat(o, d.per.cat)).length; st[d.per.stat] = (st[d.per.stat] || 0) + d.per.v[L] * n; }
    // Auras from your other items: boost stats this item already has, by tag and condition.
    for (const o of me.items) {
      const a = ITEMS[o.id].aura;
      if (!a || !a.stat || o === inst || !st[a.stat] || (a.tag && !tagsOf(inst).has(a.tag)) || !hasCat(inst, a.cat)
        || !inScope(a.scope, o, inst) || !this.condOk(i, a.cond)) continue;
      const av = a.v[o.level - 1];
      st[a.stat] = a.pct ? st[a.stat] * (1 + av) : st[a.stat] + scaledBonus(av, perFireScale(inst));
    }
    // Skills: "+X% <stat>" for matching items (by category / tag), on the stats this item has.
    for (const p of me.sk.pct) {
      if (!hasCat(inst, p.cat) || (p.tag && !tagsOf(inst).has(p.tag))) continue;
      for (const k of Object.keys(st)) if (k !== 'gold' && st[k] > 0 && (p.stat === '*' || p.stat === k)) st[k] *= 1 + p.v;
    }
    if (st.gold) { // gold on trigger, capped per item per fight
      const give = Math.max(0, Math.min(st.gold, (d.goldCap?.[L] ?? Infinity) - inst.goldEarned));
      if (give) { inst.goldEarned += give; me.goldEarned += give; this.fx('float', i, `+${give}g`, 'gold'); }
      delete st.gold;
    }
    const events = this.applyStats(i, st, mult, perFireScale(inst));
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
      if (!on || o === src || !events.has(on.event) || (on.scope === 'adjacent' && !adjacent(o, src)) || !hasCat(src, on.cat)) continue;
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
    if (me.sk.startShield) this.applyStats(i, { shield: Math.round(me.maxHp * me.sk.startShield) }, 1);
    if (me.sk.startHaste) me.hastes.push({ src: 'skill', v: 0.5, until: me.sk.startHaste });
    for (const c of me.sk.startCharge) for (const o of me.items) if (o.cost && hasCat(o, c.cat)) o.charge = Math.min(o.cost - 1, o.charge + c.v);
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
  applyStats(i, st, mult, perFire = 1) {
    const me = this.f[i], foe = this.f[1 - i], events = new Set();
    const val = k => {
      const base = (st[k] || 0) * mult;
      const x = base > 0 ? Math.round(base) : 0;
      if (x > 0) events.add(k);
      return x;
    };
    let v;
    if ((v = val('maxhp')) > 0) { me.maxHp += v; me.hp += v; this.fx('float', i, `+${v} max`, 'heal'); }
    if ((v = val('shield')) > 0) { me.shield += v; this.fx('float', i, `+${v}`, 'shield'); }
    if ((v = val('heal')) > 0) {
      me.hp += Math.min(v, me.maxHp - me.hp); this.fx('float', i, `+${v}`, 'heal');
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
        for (const o of me.items) if (o !== inst && adjacent(o, inst) && tagsOf(o).has(sp.tag)) { o.bonus[sp.stat] = (o.bonus[sp.stat] || 0) + scaledBonus(sv, perFireScale(o)); this.fx('buff', i, o); }
        break;
      case 'buffAll':
        for (const o of me.items) if ((!sp.tag || tagsOf(o).has(sp.tag)) && hasCat(o, sp.cat)) { o.bonus[sp.stat] = (o.bonus[sp.stat] || 0) + scaledBonus(sv, perFireScale(o)); this.fx('buff', i, o); }
        break;
      case 'charge': { // give items charge; full ones fire next tick. Charge-givers don't charge each other.
        if (sp.scope === 'self') { this.addCharge(i, inst, sv, null, true); break; }
        for (const o of me.items) {
          if (o === inst || !o.cost || (sp.tag && !tagsOf(o).has(sp.tag)) || !hasCat(o, sp.cat) || ITEMS[o.id].special?.kind === 'charge') continue;
          if (!inScope(sp.scope, inst, o)) continue;
          this.fx('buff', i, o); this.addCharge(i, o, sv, null, true);
        }
        break;
      }
      case 'buffRow': case 'buffCol': {
        const scope = sp.kind === 'buffRow' ? 'row' : 'column';
        for (const o of me.items) if (o !== inst && inScope(scope, inst, o) && statsOf(o)[sp.stat]) {
          o.bonus[sp.stat] = (o.bonus[sp.stat] || 0) + scaledBonus(sv, perFireScale(o)); this.fx('buff', i, o);
        }
        break;
      }
      case 'grow': inst.bonus[sp.stat] = (inst.bonus[sp.stat] || 0) + scaledBonus(sv, perFireScale(inst)); this.fx('buff', i, inst); break;
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
    // Shield soaks Burn at a reduced rate: each point of Shield blocks 1 / BURN_VS_SHIELD Burn damage.
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
    for (let i = 0; i < 2; i++) this.hit(i, Math.round(this.storm * (1 - Math.min(0.9, this.f[i].sk.stormWard))), 'storm');
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
export function simulate(itemsA, itemsB, hp, skillsA = [], skillsB = []) {
  const B = new Battle(new Fighter('A', itemsA, hp, skillsA), new Fighter('B', itemsB, hp, skillsB));
  while (!B.done) B.step(SIM_DT);
  return B.result;
}

// Score A vs B from both seats (side 0 acts first within a tick), 0..1 for A.
export function duel(itemsA, itemsB, hp, skillsA = [], skillsB = []) {
  const pts = { win: 1, draw: 0.5, loss: 0 };
  return (pts[simulate(itemsA, itemsB, hp, skillsA, skillsB)] + (1 - pts[simulate(itemsB, itemsA, hp, skillsB, skillsA)])) / 2;
}
