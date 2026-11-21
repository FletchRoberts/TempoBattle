// Browser UI: shop, drag and drop, PvP battle playback. All rules come from src/core.
import { RARITY, INFUSIONS, TAG_NAME, STAT_NAME, STAT_TEXT, STAT_ORDER, SPECIALS } from '../data/items.js';
import { makeRng } from '../core/rng.js';
import {
  COLS, BENCH_MAX, START_LIVES, WINS_TO_CLEAR, START_GOLD, LV, DAY_FLOW, ENCOUNTERS,
  def, priceOf, sellValue, upgradeCost, rerollCost, maxHp, income, starterBoard, rollShop,
  tagsOf, canPlace, itemAt, snapshot, fromSnapshot,
} from '../core/rules.js';
import { Fighter, Battle, COL_TIME, BURN_TICK, OVERTIME, STORM_BASE, STORM_GROWTH, SIM_DT } from '../core/sim.js';
import { ARCHETYPES } from '../bots/archetypes.js';
import { MATCH_BAND } from '../bots/pool.js';

const $ = (s, r = document) => r.querySelector(s);
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const pct = x => Math.round(x * 100) + '%';

let store, rng, S;

export function startApp(poolStore) {
  store = poolStore;
  window.addEventListener('resize', () => { if (S.phase === 'pvp') CELL = setCell(); else render(); });
  newRun();
}

// ===================== Run state =====================
function newRun() {
  rng = makeRng(Date.now());
  S = {
    runId: Date.now().toString(36) + rng.int(1e6).toString(36),
    phase: 'shop', day: 1, gold: START_GOLD, lives: START_LIVES, wins: 0, rerolls: 0,
    board: starterBoard(), bench: [], essences: [], shop: [], faced: new Set(), history: [],
    selected: null, pendingEssence: null, battle: null, opponent: null, over: false,
  };
  S.shop = rollShop(S.day, rng);
  render();
}

// Move through the day: shop -> encounter (placeholder) -> pvp -> next day.
function advancePhase() {
  const next = DAY_FLOW[DAY_FLOW.indexOf(S.phase) + 1];
  if (next === 'encounter') {
    S.phase = 'encounter';
    if (!ENCOUNTERS.some(e => e.enabled)) return advancePhase(); // nothing built yet, skip straight through
    return render();
  }
  if (next === 'pvp') return startBattle();
}
function nextDay(result) {
  S.history.push({ day: S.day, result, opponent: S.opponent.name, oppWr: S.opponent.wr });
  if (result === 'win') S.wins++;
  if (result === 'loss') S.lives--;
  if (S.lives <= 0 || S.wins >= WINS_TO_CLEAR) { S.over = true; S.phase = 'over'; return render(); }
  S.gold += income(S.day, result === 'win');
  S.day++; S.rerolls = 0; S.shop = rollShop(S.day, rng); S.phase = 'shop';
  render();
}

// ===================== Item text =====================
function prog(arr, L, fmt = v => v) {
  return arr.map((v, i) => `<span class="${i === L ? 'cur' : 'lv'}">${fmt(v)}</span>`).join('<span class="sep">›</span>');
}
function describe(inst) {
  const d = def(inst), L = inst.level - 1, lines = [];
  for (const k of STAT_ORDER) if (d.effects?.[k]) lines.push(`<li class="s-${k}">${STAT_TEXT[k](prog(d.effects[k], L))}</li>`);
  if (d.special) { const SP = SPECIALS[d.special.kind]; lines.push(`<li class="s-special">${SP.text(d.special, prog(d.special.v, L, SP.fmt))}</li>`); }
  if (inst.infusion) { const f = INFUSIONS[inst.infusion]; lines.push(`<li class="s-${f.stat} infused">${f.icon} Infused: ${STAT_TEXT[f.stat](prog(f.v, L))}</li>`); }
  return lines.join('');
}

// ===================== Shared rendering =====================
let CELL = 60;
function setCell() {
  const w = Math.min(document.documentElement.clientWidth, 1180) - 32;
  const main = w > 900 ? w - 304 : w;
  const cell = Math.max(30, Math.min(72, Math.floor((main - 58) / COLS)));
  document.documentElement.style.setProperty('--cell', cell + 'px');
  return cell;
}

function itemEl(inst, scale = 'cell') {
  const d = def(inst);
  const e = el('div', `item r-${d.rarity} t-${d.tags[0]}`);
  e.dataset.uid = inst.uid;
  e.style.width = `calc(var(--${scale}) * ${inst.w})`;
  e.style.height = `calc(var(--${scale}) * ${inst.h})`;
  if (inst.x >= 0 && scale === 'cell') { e.style.left = `calc(var(--cell) * ${inst.x})`; e.style.top = `calc(var(--cell) * ${inst.y})`; }
  const pips = [0, 1, 2, 3].map(i => `<i class="${i < inst.level ? 'on' : ''}"></i>`).join('');
  e.innerHTML = `<span class="ico">${d.icon}</span><span class="pips">${pips}</span>` +
    (inst.infusion ? `<span class="inf">${INFUSIONS[inst.infusion].icon}</span>` : '') + `<span class="flash"></span>`;
  e.title = `${d.name} ${LV[inst.level - 1]}`;
  return e;
}

function timeline(items, opts = {}) {
  const wrap = el('div', 'timeline' + (opts.enemy ? ' enemy' : ''));
  const rulerRow = el('div', 'ruler-row', '<span class="tc">sec</span>');
  const ruler = el('div', 'ruler');
  for (let c = 0; c < COLS; c++) ruler.append(el('span', '', (c * COL_TIME).toFixed(1)));
  rulerRow.append(ruler);
  const body = el('div', 'tl-body');
  const labels = el('div', 'tracks');
  for (let r = 0; r < 3; r++) labels.append(el('span', '', 'T' + (r + 1)));
  const grid = el('div', 'grid');
  const ghost = el('div', 'drop-preview'); ghost.hidden = true; grid.append(ghost);
  for (const inst of items) grid.append(itemEl(inst));
  body.append(labels, grid);
  wrap.append(rulerRow, body);
  return { wrap, grid, ghost };
}

function renderHud() {
  const hearts = Array.from({ length: START_LIVES }, (_, i) => `<i class="${i < S.lives ? 'on' : ''}">♥</i>`).join('');
  const flowName = { shop: 'Shop', encounter: 'Encounter', pvp: 'PvP fight' };
  const flow = S.phase === 'over' ? '' : DAY_FLOW.map(p => {
    const soon = p === 'encounter' && !ENCOUNTERS.some(e => e.enabled);
    return `<li class="${p === S.phase ? 'now' : ''}${soon ? ' soon' : ''}">${flowName[p]}${soon ? ' <small>soon</small>' : ''}</li>`;
  }).join('');
  $('#hud').innerHTML = `
    <div class="brand">Tempo<span>Forge</span></div>
    <ol class="flow" aria-label="Today">${flow}</ol>
    <dl class="stats">
      <div><dt>Day</dt><dd>${S.day}</dd></div>
      <div><dt>Wins</dt><dd>${S.wins}<small>/${WINS_TO_CLEAR}</small></dd></div>
      <div><dt>Lives</dt><dd class="hearts">${hearts}</dd></div>
      <div><dt>Max HP</dt><dd>${maxHp(S.day)}</dd></div>
      <div class="gold"><dt>Gold</dt><dd>${S.gold}</dd></div>
    </dl>`;
}

function render() {
  CELL = setCell();
  renderHud();
  if (S.phase === 'shop') renderShop();
  else if (S.phase === 'encounter') renderEncounter();
  else if (S.phase === 'pvp') renderBattle();
  else renderOver();
}

// ===================== Shop =====================
let boardTarget = null;
function renderShop() {
  const v = $('#view'); v.innerHTML = ''; v.className = 'shop';
  const left = el('div', 'col-main'), right = el('aside', 'col-side');

  const offers = el('section', 'panel offers');
  offers.append(el('header', 'panel-h', `<h2>Shop</h2><span class="hint">Click to buy. Drop a duplicate on its twin to level it up.</span>`));
  const row = el('div', 'offer-row');
  S.shop.forEach((o, idx) => {
    const c = el('button', 'offer' + (o.sold ? ' sold' : '') + (o.price > S.gold && !o.sold ? ' poor' : ''));
    c.type = 'button';
    if (o.kind === 'item') {
      const d = def(o.inst);
      c.classList.add('r-' + d.rarity);
      c.innerHTML = `<span class="o-ico">${d.icon}</span><span class="o-name">${d.name}</span><span class="o-meta"><b class="rar">${RARITY[d.rarity].name}</b> ${LV[o.inst.level - 1]}</span>`;
      const shape = el('span', 'shape');
      shape.style.gridTemplateColumns = `repeat(${o.inst.w}, 8px)`;
      for (let k = 0; k < o.inst.w * o.inst.h; k++) shape.append(el('i'));
      c.append(shape);
      c.onmouseenter = c.onfocus = () => showInspector({ inst: o.inst, from: 'shop' });
    } else {
      const f = INFUSIONS[o.type];
      c.classList.add('essence');
      c.innerHTML = `<span class="o-ico">${f.icon}</span><span class="o-name">${f.name}</span><span class="o-meta">Infuse: +${STAT_NAME[f.stat]}</span>`;
      c.onmouseenter = c.onfocus = () => showInspector({ essence: o.type });
    }
    c.append(el('span', 'price', o.sold ? 'Sold' : `${o.price}g`));
    c.onclick = () => buy(idx);
    row.append(c);
  });
  offers.append(row);
  const reroll = el('button', 'btn ghost', `Reroll · ${rerollCost(S.rerolls)}g`); reroll.type = 'button';
  reroll.disabled = S.gold < rerollCost(S.rerolls);
  reroll.onclick = () => { const c = rerollCost(S.rerolls); if (S.gold < c) return; S.gold -= c; S.rerolls++; S.shop = rollShop(S.day, rng); render(); };
  const acts = el('div', 'offer-actions'); acts.append(reroll); offers.append(acts);

  const boardP = el('section', 'panel board');
  boardP.append(el('header', 'panel-h', `<h2>Your loadout</h2><span class="hint">Drag to place. Press R while dragging to rotate. The bar triggers an item at its left edge.</span>`));
  const tl = timeline(S.board);
  boardP.append(tl.wrap);
  boardTarget = tl;

  const stash = el('section', 'panel stash');
  stash.append(el('header', 'panel-h', `<h2>Bench</h2><span class="hint">${S.bench.length}/${BENCH_MAX}. Benched items don't fight.</span>`));
  const benchRow = el('div', 'bench-row');
  const bench = el('div', 'bench'); bench.id = 'bench';
  if (!S.bench.length) bench.append(el('p', 'empty', 'Bought items land here.'));
  for (const inst of S.bench) bench.append(itemEl(inst, 'bcell'));
  const sell = el('div', 'sell-zone', 'Drop here to sell'); sell.id = 'sell';
  benchRow.append(bench, sell);
  stash.append(benchRow);
  if (S.essences.length) {
    const er = el('div', 'essences');
    er.append(el('span', 'hint', 'Essences: click one, then click an item.'));
    S.essences.forEach((t, i) => {
      const b = el('button', 'ess-chip' + (S.pendingEssence === i ? ' active' : ''), `${INFUSIONS[t].icon} ${INFUSIONS[t].name}`);
      b.type = 'button';
      b.onclick = () => { S.pendingEssence = S.pendingEssence === i ? null : i; render(); };
      er.append(b);
    });
    stash.append(er);
  }

  const fight = el('button', 'btn fight', `Find opponent <span>→</span>`); fight.type = 'button';
  fight.disabled = !S.board.length;
  fight.onclick = advancePhase;

  left.append(offers, boardP, stash);
  right.append(el('section', 'panel inspector'), fight, historyPanel(), el('section', 'panel rules', rulesHtml()));
  v.append(left, right);

  bindDrag(v);
  showInspector(S.selected ? { inst: findOwned(S.selected), from: 'owned' } : null);
}

function historyPanel() {
  const p = el('section', 'panel history');
  p.append(el('h3', '', 'This run'));
  if (!S.history.length) {
    p.append(el('p', 'muted', `Each day you face another player's board from the same day. You're matched with boards that win ${pct(MATCH_BAND[0])}–${pct(MATCH_BAND[1])} of their fights against that day's field.`));
    return p;
  }
  const ol = el('ol', 'hist');
  for (const h of S.history) ol.append(el('li', 'h-' + h.result, `<span>Day ${h.day}</span><b>${h.result}</b><span class="muted">vs ${h.opponent} · rated ${pct(h.oppWr)}</span>`));
  p.append(ol);
  return p;
}

function rulesHtml() {
  return `<h3>How a fight works</h3>
  <ul>
    <li>A bar sweeps your 10 columns, ${COL_TIME}s per column. When it reaches an item's left edge, that item activates.</li>
    <li><b class="k-burn">Burn</b> hits every ${BURN_TICK}s, then drops by 1. Shield blocks it.</li>
    <li><b class="k-poison">Poison</b> hits every 1s, ignores Shield and never fades.</li>
    <li><b class="k-regen">Regen</b> heals every 1s. <b class="k-shield">Shield</b> absorbs damage first.</li>
    <li>After ${OVERTIME}s a <b class="k-storm">storm</b> hits both sides every ${BURN_TICK}s like a weapon, so Shield blocks it. It starts at ${STORM_BASE} and each hit is ${Math.round((STORM_GROWTH - 1) * 100)}% bigger.</li>
  </ul>`;
}

const findOwned = u => S.board.find(o => o.uid === u) || S.bench.find(o => o.uid === u) || null;

function showInspector(target) {
  const p = $('.inspector'); if (!p) return;
  if (!target || (!target.inst && !target.essence)) {
    const pend = S.pendingEssence != null ? `<p class="callout">Click an item on your board or bench to infuse it.</p>` : '';
    p.innerHTML = `<h3>Inspector</h3><p class="muted">Hover an item to see what it does. Click one of yours to upgrade or sell it.</p>${pend}`;
    return;
  }
  if (target.essence) {
    const f = INFUSIONS[target.essence];
    p.innerHTML = `<div class="ins-h"><span class="ins-ico">${f.icon}</span><div><h3>${f.name}</h3><span class="chip">Essence</span></div></div>
      <ul class="effects"><li class="s-${f.stat}">Infuse an item: ${STAT_TEXT[f.stat](prog(f.v, -1))}, by the item's level</li>
      <li>The item also gains the ${TAG_NAME[f.tag]} tag. Replaces any existing infusion.</li></ul>`;
    return;
  }
  const inst = target.inst, d = def(inst);
  const tags = [...tagsOf(inst)].map(t => `<span class="tag t-${t}">${TAG_NAME[t]}</span>`).join('');
  let actions = '';
  if (target.from === 'owned') {
    const up = inst.level < 4
      ? `<button type="button" class="btn" id="btn-up" ${S.gold < upgradeCost(inst) ? 'disabled' : ''}>Upgrade to ${LV[inst.level]} · ${upgradeCost(inst)}g</button>`
      : `<span class="chip">Max level</span>`;
    actions = `<div class="ins-actions">${up}<button type="button" class="btn ghost" id="btn-sell">Sell · ${sellValue(inst)}g</button></div>`;
  }
  p.innerHTML = `<div class="ins-h r-${d.rarity}"><span class="ins-ico">${d.icon}</span><div><h3>${d.name} <small>${LV[inst.level - 1]}</small></h3>
    <span class="chip rar">${RARITY[d.rarity].name}</span><span class="chip">${inst.w}×${inst.h}</span></div></div>
    <div class="tags">${tags}</div><ul class="effects">${describe(inst) || '<li class="muted">No active effect.</li>'}</ul>${actions}`;
  const up = $('#btn-up', p), sl = $('#btn-sell', p);
  if (up) up.onclick = () => { const c = upgradeCost(inst); if (S.gold < c) return; S.gold -= c; inst.level++; render(); };
  if (sl) sl.onclick = () => sellInst(inst);
}

function buy(idx) {
  const o = S.shop[idx]; if (o.sold || S.gold < o.price) return;
  if (o.kind === 'item') {
    if (S.bench.length >= BENCH_MAX) return toast('Bench is full. Place or sell something first.');
    S.bench.push(o.inst);
  } else S.essences.push(o.type);
  S.gold -= o.price; o.sold = true; render();
}
function sellInst(inst) {
  S.gold += sellValue(inst);
  S.board = S.board.filter(o => o !== inst); S.bench = S.bench.filter(o => o !== inst);
  if (S.selected === inst.uid) S.selected = null;
  render();
}
function toast(msg) { const t = el('div', 'toast', msg); document.body.append(t); setTimeout(() => t.remove(), 2200); }

// ===================== Drag & drop =====================
let drag = null;
function bindDrag(root) {
  root.querySelectorAll('.grid .item, .bench .item').forEach(node => {
    node.addEventListener('pointerdown', ev => startDrag(ev, node));
    node.addEventListener('mouseenter', () => { const i = findOwned(+node.dataset.uid); if (i && !drag) showInspector({ inst: i, from: 'owned' }); });
  });
}
function startDrag(ev, node) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  const inst = findOwned(+node.dataset.uid); if (!inst) return;
  const r = node.getBoundingClientRect();
  const unit = S.board.includes(inst) ? CELL : r.width / inst.w;
  drag = { inst, node, sx: ev.clientX, sy: ev.clientY, moved: false, w: inst.w, h: inst.h, drop: null,
    gx: Math.min(inst.w - 1, Math.floor((ev.clientX - r.left) / unit)),
    gy: Math.min(inst.h - 1, Math.floor((ev.clientY - r.top) / unit)) };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
  window.addEventListener('keydown', onDragKey);
}
function makeGhost() {
  const g = itemEl({ ...drag.inst, w: drag.w, h: drag.h, x: -1 });
  g.classList.add('ghost'); $('#drag-layer').replaceChildren(g); drag.ghost = g;
}
function onDragKey(ev) {
  if (!drag || ev.key.toLowerCase() !== 'r') return;
  [drag.w, drag.h] = [drag.h, drag.w];
  [drag.gx, drag.gy] = [Math.min(drag.gy, drag.w - 1), Math.min(drag.gx, drag.h - 1)];
  if (drag.moved) { makeGhost(); updateDrop(drag.lx, drag.ly); }
}
function onDragMove(ev) {
  if (!drag) return;
  if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 6) return;
  if (!drag.moved) { drag.moved = true; drag.node.classList.add('dragging'); makeGhost(); }
  drag.lx = ev.clientX; drag.ly = ev.clientY;
  updateDrop(ev.clientX, ev.clientY);
}
function updateDrop(px, py) {
  drag.ghost.style.left = (px - (drag.gx + 0.5) * CELL) + 'px';
  drag.ghost.style.top = (py - (drag.gy + 0.5) * CELL) + 'px';
  const prev = boardTarget.ghost; prev.hidden = true; drag.drop = null;
  const hovered = document.elementsFromPoint(px, py);
  if (hovered.some(n => n.id === 'sell')) { drag.drop = { kind: 'sell' }; return; }
  if (hovered.some(n => n.id === 'bench')) { drag.drop = { kind: 'bench' }; return; }
  const gr = boardTarget.grid.getBoundingClientRect();
  if (px < gr.left || px > gr.right || py < gr.top || py > gr.bottom) return;
  const cx = Math.floor((px - gr.left) / CELL), cy = Math.floor((py - gr.top) / CELL);
  const box = (x, y, w, h, cls) => {
    Object.assign(prev.style, { left: `calc(var(--cell)*${x})`, top: `calc(var(--cell)*${y})`, width: `calc(var(--cell)*${w})`, height: `calc(var(--cell)*${h})` });
    prev.className = 'drop-preview ' + cls; prev.hidden = false;
  };
  const under = itemAt(S.board, cx, cy);
  if (under && under !== drag.inst && under.id === drag.inst.id && under.level === drag.inst.level && under.level < 4) {
    drag.drop = { kind: 'merge', target: under };
    return box(under.x, under.y, under.w, under.h, 'merge');
  }
  const x = cx - drag.gx, y = cy - drag.gy;
  const ok = canPlace(S.board, x, y, drag.w, drag.h, drag.inst.uid);
  box(x, y, drag.w, drag.h, ok ? 'ok' : 'bad');
  if (ok) drag.drop = { kind: 'place', x, y };
}
function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('keydown', onDragKey);
  const d = drag; drag = null; $('#drag-layer').replaceChildren();
  if (!d) return;
  if (!d.moved) return clickItem(d.inst);
  const inst = d.inst, onBoard = S.board.includes(inst), drop = d.drop;
  const remove = () => { S.board = S.board.filter(o => o !== inst); S.bench = S.bench.filter(o => o !== inst); };
  if (!drop) return render();
  if (drop.kind === 'sell') return sellInst(inst);
  if (drop.kind === 'bench') {
    if (onBoard) {
      if (S.bench.length >= BENCH_MAX) { toast('Bench is full.'); return render(); }
      remove(); inst.x = inst.y = -1; S.bench.push(inst);
    }
    return render();
  }
  if (drop.kind === 'merge') {
    remove(); drop.target.level++;
    if (!drop.target.infusion && inst.infusion) drop.target.infusion = inst.infusion;
    S.selected = drop.target.uid; toast(`${def(inst).name} merged to level ${LV[drop.target.level - 1]}`);
    return render();
  }
  remove(); Object.assign(inst, { x: drop.x, y: drop.y, w: d.w, h: d.h }); S.board.push(inst);
  render();
}
function clickItem(inst) {
  if (S.pendingEssence != null) {
    inst.infusion = S.essences[S.pendingEssence];
    S.essences.splice(S.pendingEssence, 1); S.pendingEssence = null;
    toast(`${def(inst).name} infused with ${INFUSIONS[inst.infusion].name}`);
  }
  S.selected = inst.uid; render();
}

// ===================== Encounter placeholder =====================
function renderEncounter() {
  const v = $('#view'); v.className = 'over';
  v.innerHTML = `<section class="panel over-card"><h2>Encounter</h2><p class="muted">Events and PvE fights will appear here between the shop and the PvP fight.</p>
    <button type="button" class="btn fight" id="enc-next">Continue <span>→</span></button></section>`;
  $('#enc-next').onclick = advancePhase;
}

// ===================== PvP battle =====================
let ui = null, raf = 0, battleSpeed = 1;
function startBattle() {
  const opp = store.pick(S.day, rng, { runId: S.runId, faced: S.faced });
  S.opponent = opp; S.faced.add(opp.id);
  S.mySnapshot = snapshot(S.board);
  const hp = maxHp(S.day);
  S.battle = new Battle(new Fighter('You', S.board, hp), new Fighter(opp.name, fromSnapshot(opp.items), hp), onFx);
  S.selected = null; S.pendingEssence = null;
  S.phase = 'pvp'; render();
}
function oppLabel(o) {
  if (o.source === 'player') return 'Player board';
  return `${ARCHETYPES[o.arch]?.name ?? 'Bot'} · ${o.skill}`;
}
function renderBattle() {
  const v = $('#view'); v.innerHTML = ''; v.className = 'battle';
  const B = S.battle, o = S.opponent;
  const main = el('div', 'col-main'), side = el('aside', 'col-side');
  ui = { sides: [] };
  for (const i of [1, 0]) { // opponent on top
    const F = B.f[i];
    const panel = el('section', 'panel fighter' + (i ? ' is-enemy' : ''));
    const head = el('header', 'f-head');
    const sub = i ? `<span class="opp-meta">${oppLabel(o)} · rated <b>${pct(o.wr)}</b></span>` : '';
    head.innerHTML = `<div class="f-name"><h2>${i ? F.name : 'You'}</h2>${sub}<span class="speed"></span></div>
      <div class="hp"><div class="hp-fill"></div><div class="hp-shield"></div><span class="hp-text"></span></div>
      <div class="status"></div><div class="floats"></div>`;
    const tl = timeline(F.items, { enemy: !!i });
    const bars = el('div', 'bars'); tl.grid.append(bars);
    panel.append(head, tl.wrap);
    main.append(panel);
    const items = new Map(); tl.grid.querySelectorAll('.item').forEach(n => items.set(+n.dataset.uid, n));
    ui.sides[i] = { head, items, bars, barEls: new Map() };
  }
  const ctr = el('section', 'panel controls');
  ctr.innerHTML = `<h3>Playback</h3><div class="seg">${[1, 2, 4].map(s => `<button type="button" data-s="${s}" class="${s === battleSpeed ? 'on' : ''}">×${s}</button>`).join('')}</div>
    <button type="button" class="btn ghost" id="skip">Skip to result</button><div class="clock"></div>`;
  ctr.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    battleSpeed = +b.dataset.s; ctr.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#skip', ctr).onclick = () => { const fx = B.fx; B.fx = () => {}; while (!B.done) B.step(SIM_DT); B.fx = fx; };
  side.append(ctr, el('section', 'panel rules', rulesHtml()));
  ui.clock = $('.clock', ctr);
  v.append(main, side);

  // Fixed-step simulation (identical to the rating model), rendering interpolates between steps.
  cancelAnimationFrame(raf);
  let last = performance.now(), acc = 0;
  const frame = now => {
    acc += Math.min(0.1, (now - last) / 1000) * battleSpeed; last = now;
    while (acc >= SIM_DT && !B.done) { B.step(SIM_DT); acc -= SIM_DT; }
    updateBattle(B.done ? 0 : acc);
    if (B.done) { setTimeout(() => showResult(B.result), 500); return; }
    raf = requestAnimationFrame(frame);
  };
  updateBattle(0);
  raf = requestAnimationFrame(frame);
}
function updateBattle(acc) {
  const B = S.battle; if (!ui) return;
  for (let i = 0; i < 2; i++) {
    const F = B.f[i], U = ui.sides[i], hp = Math.max(0, F.hp), speed = F.speed(B.t);
    $('.hp-fill', U.head).style.width = (hp / F.maxHp * 100) + '%';
    $('.hp-shield', U.head).style.width = Math.min(100, F.shield / F.maxHp * 100) + '%';
    $('.hp-text', U.head).textContent = `${Math.ceil(hp)} / ${F.maxHp}` + (F.shield ? `  ·  🛡 ${F.shield}` : '');
    $('.speed', U.head).textContent = `bar ×${speed.toFixed(2)}` + (F.bars.length > 1 ? ` · ${F.bars.length} bars` : '');
    const st = [];
    if (F.burn) st.push(`<span class="st burn">🔥 ${F.burn}</span>`);
    if (F.poison) st.push(`<span class="st poison">☠️ ${F.poison}</span>`);
    if (F.regen) st.push(`<span class="st regen">🌱 ${F.regen}</span>`);
    $('.status', U.head).innerHTML = st.join('');
    const alive = new Set();
    for (const bar of F.bars) {
      alive.add(bar.id);
      let n = U.barEls.get(bar.id);
      if (!n) { n = el('div', 'playhead' + (bar.temp ? ' echo' : '')); U.bars.append(n); U.barEls.set(bar.id, n); }
      const pos = Math.min(COLS, bar.pos + acc / COL_TIME * speed);
      n.style.transform = `translateX(${Math.max(0, pos) * CELL}px)`;
    }
    for (const [id, n] of U.barEls) if (!alive.has(id)) { n.remove(); U.barEls.delete(id); }
  }
  ui.clock.innerHTML = `<span>${B.t.toFixed(1)}s</span>` + (B.storm ? `<b>Storm ${B.storm}/hit</b>` : `<small>storm at ${OVERTIME}s</small>`);
}
function onFx(type, i, a, b) {
  if (!ui) return;
  const U = ui.sides[i];
  if (type === 'activate' || type === 'buff') {
    const n = U.items.get(a.uid); if (!n) return;
    const c = type === 'activate' ? 'pulse' : 'buffed';
    n.classList.remove(c); void n.offsetWidth; n.classList.add(c);
  } else if (type === 'float') {
    const box = $('.floats', U.head);
    if (box.childElementCount > 14) box.firstChild.remove();
    const f = el('span', 'float f-' + b, a);
    f.style.left = (8 + Math.random() * 70) + '%';
    box.append(f); setTimeout(() => f.remove(), 1100);
  }
}
function showResult(res) {
  if (S.phase !== 'pvp' || $('.modal')) return;
  const gain = income(S.day, res === 'win');
  const title = { win: 'Victory', loss: 'Defeat', draw: 'Draw' }[res];
  const sub = { win: 'You win the day.', loss: 'You lose a life.', draw: 'Both fell. Nobody scores.' }[res];
  const m = el('div', 'modal');
  m.innerHTML = `<div class="modal-card ${res}"><h2>${title}</h2><p>${sub}</p>
    <p class="rating">Rating your board against Day ${S.day}'s field…</p>
    <p class="income">+${gain} gold next shop</p>
    <button type="button" class="btn fight" id="cont">Continue <span>→</span></button></div>`;
  document.body.append(m);
  const cont = $('#cont', m);
  cont.onclick = () => { m.remove(); nextDay(res); };
  cont.focus();
  // Rate and save the player's board so it can be matched against future runs.
  setTimeout(() => {
    const team = store.submit({ runId: S.runId, day: S.day, name: 'Player', items: S.mySnapshot });
    $('.rating', m).innerHTML = `Your board wins <b>${pct(team.wr)}</b> against Day ${S.day}'s field. It's now in the opponent pool.`;
  }, 30);
}

// ===================== Game over =====================
function renderOver() {
  const v = $('#view'); v.className = 'over';
  const won = S.wins >= WINS_TO_CLEAR;
  v.innerHTML = `<section class="panel over-card"><h2>${won ? 'Run cleared' : 'Run over'}</h2>
    <p>${S.wins} wins across ${S.day} days.</p><button type="button" class="btn fight" id="again">New run <span>→</span></button></section>`;
  v.querySelector('.over-card').append(historyPanel());
  $('#again').onclick = newRun;
}

