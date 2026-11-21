// Deterministic combat simulation. The game, the bots and the rating tool all run this exact code
// with a fixed timestep, so a matchup always has the same result everywhere.
import { ITEMS } from '../data/items.js';
import { COLS, def, statsOf, tagsOf, adjacent, uid } from './rules.js';

export const COL_TIME = 0.5;   // seconds for a bar to cross one column at speed ×1
export const BURN_TICK = 0.5;  // burn deals its stacks every 0.5s, then loses 1 stack
export const OVERTIME = 30;    // after this both sides take rising true damage
export const TIME_LIMIT = 120; // hard stop, counts as a draw
export const MAX_BARS = 3;
export const SIM_DT = 0.05;    // fixed simulation step (divides every tick interval evenly)
export const MAX_SPEED = 4;    // bar speed cap; stops haste/overclock feedback loops

export class Fighter {
  constructor(name, items, hp) {
    this.name = name; this.maxHp = hp; this.hp = hp;
    this.shield = 0; this.burn = 0; this.poison = 0; this.regen = 0;
    this.items = items.map(i => ({ ...i, bonus: {}, uses: 0 }));
    this.bars = [{ id: uid(), pos: -0.5, temp: false }];
    this.speedPerm = 1; this.hastes = [];
  }
  speed(t) {
    let s = this.speedPerm;
    for (const h of this.hastes) if (h.until > t) s *= 1 + h.v;
    return Math.min(MAX_SPEED, s);
  }
}

export class Battle {
  constructor(a, b, fx) {
    this.f = [a, b]; this.t = 0; this.fx = fx || (() => {});
    this.burnAcc = 0; this.secAcc = 0; this.done = false; this.result = null;
  }
  step(dt = SIM_DT) {
    if (this.done) return;
    this.t += dt;
    for (let i = 0; i < 2; i++) this.advance(i, dt);
    this.burnAcc += dt;
    while (this.burnAcc >= BURN_TICK - 1e-9) { this.burnAcc -= BURN_TICK; for (let i = 0; i < 2; i++) this.burnTick(i); }
    this.secAcc += dt;
    while (this.secAcc >= 1 - 1e-9) { this.secAcc -= 1; for (let i = 0; i < 2; i++) this.secTick(i); }
    this.checkEnd();
  }
  advance(i, dt) {
    const me = this.f[i];
    if (me.hastes.length) me.hastes = me.hastes.filter(h => h.until > this.t);
    const d = dt / COL_TIME * me.speed(this.t);
    for (const bar of [...me.bars]) {
      let rem = d; bar.jump = false;
      while (rem > 0) {
        const next = Math.floor(bar.pos) + 1;
        if (bar.pos + rem < next) { bar.pos += rem; break; }
        rem -= next - bar.pos; bar.pos = next;
        if (bar.pos >= COLS) { if (bar.temp) { bar.dead = true; break; } bar.pos = 0; }
        const hits = me.items.filter(o => o.x === bar.pos).sort((a, b) => a.y - b.y);
        for (const inst of hits) this.activate(i, inst, bar);
        if (bar.jump) break;
      }
    }
    me.bars = me.bars.filter(b => !b.dead);
  }
  activate(i, inst, bar) {
    const me = this.f[i], foe = this.f[1 - i], d = def(inst), L = inst.level - 1, sp = d.special;
    this.fx('activate', i, inst);
    if (sp && sp.kind === 'amplify') return; // passive

    let mult = 1;
    for (const o of me.items) if (o !== inst && ITEMS[o.id].special?.kind === 'amplify' && adjacent(o, inst)) mult += ITEMS[o.id].special.v[o.level - 1];
    const st = statsOf(inst);
    for (const k in inst.bonus) st[k] = (st[k] || 0) + inst.bonus[k];
    const val = k => Math.round((st[k] || 0) * mult);

    let v;
    if ((v = val('shield')) > 0) { me.shield += v; this.fx('float', i, `+${v}`, 'shield'); }
    if ((v = val('heal')) > 0) { me.hp += Math.min(v, me.maxHp - me.hp); this.fx('float', i, `+${v}`, 'heal'); }
    if ((v = val('regen')) > 0) { me.regen += v; this.fx('float', i, `+${v} regen`, 'regen'); }
    if ((v = val('cleanse')) > 0) { me.poison = Math.max(0, me.poison - v); me.burn = Math.max(0, me.burn - v); this.fx('float', i, `cleanse ${v}`, 'heal'); }
    if ((v = val('damage')) > 0) this.hit(1 - i, v, 'damage');
    if ((v = val('burn')) > 0) { foe.burn += v; this.fx('float', 1 - i, `+${v} burn`, 'burn'); }
    if ((v = val('poison')) > 0) { foe.poison += v; this.fx('float', 1 - i, `+${v} poison`, 'poison'); }

    if (!sp) return;
    const sv = sp.v[L];
    switch (sp.kind) {
      case 'buffAdj':
        for (const o of me.items) if (o !== inst && adjacent(o, inst) && tagsOf(o).has(sp.tag)) { o.bonus[sp.stat] = (o.bonus[sp.stat] || 0) + sv; this.fx('buff', i, o); }
        break;
      case 'buffAll':
        for (const o of me.items) if (tagsOf(o).has(sp.tag)) { o.bonus[sp.stat] = (o.bonus[sp.stat] || 0) + sv; this.fx('buff', i, o); }
        break;
      case 'grow': inst.bonus[sp.stat] = (inst.bonus[sp.stat] || 0) + sv; this.fx('buff', i, inst); break;
      case 'haste': { // the same item refreshes its haste instead of stacking it
        const h = me.hastes.find(x => x.src === inst.uid);
        if (h) { h.v = sv; h.until = this.t + 3; } else me.hastes.push({ src: inst.uid, v: sv, until: this.t + 3 });
        this.fx('float', i, 'haste', 'time'); break;
      }
      case 'overclock': me.speedPerm += sv; this.fx('float', i, 'overclock', 'time'); break;
      case 'rewind':
        if (inst.uses < sv) { inst.uses++; bar.pos = -0.5; bar.jump = true; this.fx('float', i, 'rewind', 'time'); }
        break;
      case 'echo':
        if (inst.uses < sv && me.bars.length < MAX_BARS) { inst.uses++; me.bars.push({ id: uid(), pos: -0.5, temp: true }); this.fx('float', i, 'echo', 'time'); }
        break;
      case 'bash': { const dmg = Math.round(me.shield * sv); if (dmg > 0) this.hit(1 - i, dmg, 'damage'); break; }
      case 'ignite': if (foe.burn > 0) { foe.burn = Math.round(foe.burn * sv); this.fx('float', 1 - i, `ignite → ${foe.burn}`, 'burn'); } break;
    }
  }
  hit(target, amt, cls) {
    const t = this.f[target], blocked = Math.min(t.shield, amt);
    t.shield -= blocked; t.hp -= amt - blocked;
    this.fx('float', target, `−${amt}`, blocked === amt ? 'shield' : cls);
  }
  burnTick(i) {
    const me = this.f[i]; if (me.burn <= 0) return;
    const blocked = Math.min(me.shield, me.burn);
    me.shield -= blocked; me.hp -= me.burn - blocked;
    this.fx('float', i, `−${me.burn}`, 'burn'); me.burn--;
  }
  secTick(i) {
    const me = this.f[i];
    if (me.poison > 0) { me.hp -= me.poison; this.fx('float', i, `−${me.poison}`, 'poison'); }
    if (me.regen > 0) { me.hp = Math.min(me.maxHp, me.hp + me.regen); this.fx('float', i, `+${me.regen}`, 'regen'); }
    if (this.t > OVERTIME) { const dmg = Math.ceil(this.t - OVERTIME - 1e-9) * 2; me.hp -= dmg; this.fx('float', i, `−${dmg}`, 'storm'); }
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
export function simulate(itemsA, itemsB, hp) {
  const B = new Battle(new Fighter('A', itemsA, hp), new Fighter('B', itemsB, hp));
  while (!B.done) B.step(SIM_DT);
  return B.result;
}

// Score A vs B from both seats (side 0 acts first within a tick), 0..1 for A.
export function duel(itemsA, itemsB, hp) {
  const pts = { win: 1, draw: 0.5, loss: 0 };
  return (pts[simulate(itemsA, itemsB, hp)] + (1 - pts[simulate(itemsB, itemsA, hp)])) / 2;
}
