// Browser UI: shop, drag and drop, PvP battle playback. All rules come from src/core.
import { ITEMS, RARITY, INFUSIONS, MODIFIERS, WILD_ESSENCE, TAG_NAME, STAT_NAME, STAT_TEXT, STAT_ORDER, SPECIALS, ON_EVENT, AURA_COND } from '../data/items.js';
import { makeRng } from '../core/rng.js';
import {
  COLS, BENCH_MAX, START_LIVES, WINS_TO_CLEAR, START_GOLD, LV, DAY_FLOW, ENCOUNTERS, SHINY_BONUS, lifeLoss, newInst,
  def, priceOf, sellValue, canMerge, mergeInto, isShiny, rerollCost, modSlots, canApplyMod, applyMod, rollInfusion, maxHp, income, starterBoard, rollShop,
  tagsOf, canPlace, itemAt, snapshot, fromSnapshot,
} from '../core/rules.js';
import { Fighter, Battle, COL_TIME, BURN_TICK, OVERTIME, STORM_BASE, STORM_GROWTH, SIM_DT, HEAL_CLEANSE } from '../core/sim.js';
import { ARCHETYPES } from '../bots/archetypes.js';
import { MATCH_BAND } from '../bots/pool.js';

const $ = (s, r = document) => r.querySelector(s);
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const pct = x => Math.round(x * 100) + '%';

let store, rng, S;

export function startApp(poolStore) {
  store = poolStore;
  window.addEventListener('resize', () => { if (S.phase === 'pvp') CELL = setCell(); else render(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  S = { phase: 'title' };
  render();
}

// ===================== Run state =====================
function newRun() {
  rng = makeRng(Date.now());
  S = {
    runId: Date.now().toString(36) + rng.int(1e6).toString(36),
    phase: 'shop', day: 1, gold: START_GOLD, lives: START_LIVES, wins: 0, rerolls: 0, frozen: false, bonusHp: 0, lastStandUsed: false,
    board: starterBoard(), bench: [], consumables: [], shop: [], faced: new Set(), history: [],
    selected: null, pending: null, battle: null, opponent: null, over: false,
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
  if (result === 'loss') S.lives = Math.max(0, S.lives - lifeLoss(S.day));
  if (S.wins >= WINS_TO_CLEAR) { S.phase = 'over'; return render(); }
  if (S.lives <= 0) {
    if (S.lastStandUsed) { S.phase = 'over'; return render(); }
    S.phase = 'laststand'; S.boons = rng.shuffle([...BOONS]).slice(0, 3); return render();
  }
  advanceDay(result);
}
function advanceDay(result) {
  S.gold += income(S.day, result === 'win');
  S.day++; S.rerolls = 0; S.phase = 'shop';
  // A frozen shop keeps its unsold offers into the next day; sold slots are refilled.
  const kept = S.frozen ? S.shop.filter(o => !o.sold) : [];
  const fresh = rollShop(S.day, rng);
  S.shop = [];
  for (const kind of ['item', 'mod', 'essence']) {
    const k = kept.filter(o => o.kind === kind), f = fresh.filter(o => o.kind === kind);
    S.shop.push(...k.map(o => ({ ...o, frozen: true })), ...f.slice(k.length));
  }
  S.frozen = false;
  render();
}

const myMaxHp = () => maxHp(S.day) + (S.bonusHp || 0);

// ===================== Last Stand =====================
// The first time you run out of lives you pick one rare boon and keep going on 1 life.
const BOONS = [
  { id: 'legend', icon: '👑', name: 'Legend Reborn', text: 'Take a random Legendary item.',
    apply() { const ids = Object.keys(ITEMS).filter(k => ITEMS[k].rarity === 'legendary'); S.bench.push(newInst(rng.pick(ids))); } },
  { id: 'shine', icon: '✨', name: 'Polished', text: 'Your most valuable board item becomes shiny: +1 multicast.',
    apply() { const best = [...S.board].sort((a, b) => priceOf(b) - priceOf(a))[0]; if (best) best.multicast += SHINY_BONUS; } },
  { id: 'vigor', icon: '❤️', name: 'Second Wind', text: '+25 max HP for the rest of the run.', apply() { S.bonusHp += 25; } },
  { id: 'hoard', icon: '💰', name: 'Hidden Hoard', text: 'Gain 30 gold.', apply() { S.gold += 30; } },
  { id: 'mastery', icon: '⬆️', name: 'Mastery', text: 'Your best item below level III goes up one level.',
    apply() { const it = [...S.board, ...S.bench].filter(o => o.level < 3).sort((a, b) => b.level - a.level || priceOf(b) - priceOf(a))[0]; if (it) it.level++; } },
  { id: 'arcana', icon: '🔮', name: 'Arcana', text: 'Take an Echo Rune and two Wild Essences.',
    apply() { S.consumables.push({ kind: 'mod', id: 'echoRune' }, { kind: 'essence' }, { kind: 'essence' }); } },
];
function renderLastStand() {
  const v = $('#view'); v.className = 'over'; v.innerHTML = '';
  const card = el('section', 'panel over-card last-stand');
  card.innerHTML = `<p class="eyebrow">Out of lives</p><h2>Last Stand</h2>
    <p class="muted">Pick one boon. You fight on with 1 life, and the next loss ends the run. This happens once per run.</p>`;
  const row = el('div', 'boons');
  for (const b of S.boons) {
    const btn = el('button', 'boon', `<span class="b-ico">${b.icon}</span><b>${b.name}</b><span>${b.text}</span>`);
    btn.type = 'button';
    btn.onclick = () => { b.apply(); S.lastStandUsed = true; S.lives = 1; toast(`${b.name}: ${b.text}`); advanceDay('loss'); };
    row.append(btn);
  }
  card.append(row);
  v.append(card);
  row.querySelector('button').focus();
}

// ===================== Item text =====================
function prog(arr, L, fmt = v => v) {
  return arr.map((v, i) => `<span class="${i === L ? 'cur' : 'lv'}">${fmt(v)}</span>`).join('<span class="sep">›</span>');
}
export function describe(inst) {
  const d = def(inst), L = inst.level - 1, lines = [];
  for (const k of STAT_ORDER) if (d.effects?.[k]) lines.push(`<li class="s-${k}">${STAT_TEXT[k](prog(d.effects[k], L))}</li>`);
  if (d.special) { const SP = SPECIALS[d.special.kind]; lines.push(`<li class="s-special">${SP.text(d.special, prog(d.special.v, L, SP.fmt))}</li>`); }
  if (inst.infusion) { const f = INFUSIONS[inst.infusion]; lines.push(`<li class="s-${f.stat} infused">${f.icon} Infused: ${STAT_TEXT[f.stat](prog(f.v, L))}</li>`); }
  if (d.start) {
    const parts = [];
    for (const k of STAT_ORDER) if (d.start.effects?.[k]) parts.push(STAT_TEXT[k](prog(d.start.effects[k], L)));
    if (d.start.special) { const SP = SPECIALS[d.start.special.kind]; parts.push(SP.text(d.start.special, prog(d.start.special.v, L, SP.fmt)).replace(/\. Triggering again refreshes it$/, '')); }
    lines.unshift(`<li class="s-start"><b>Battle start:</b> ${parts.join('. ')}</li>`);
  }
  if (d.on) {
    const parts = Object.entries(d.on.effects || {}).map(([k, arr]) => STAT_TEXT[k](prog(arr, L)).replace(/^./, c => c.toLowerCase()));
    lines.push(`<li class="s-trigger"><b>${ON_EVENT[d.on.event](d.on)}:</b> ${parts.join(', ')}</li>`);
  }
  if (d.aura) {
    const a = d.aura, V = prog(a.v, L, a.pct ? x => Math.round(x * 100) + '%' : x => x);
    lines.push(`<li class="s-aura"><b>Passive:</b> your other ${TAG_NAME[a.tag]} items get +${V} ${STAT_NAME[a.stat]}${a.cond ? ' ' + AURA_COND[a.cond] : ''}</li>`);
  }
  for (const id of inst.mods || []) {
    const m = MODIFIERS[id];
    lines.push(`<li class="s-${m.stat || 'multicast'} modded">${m.icon} ${m.name}: ${m.stat ? `+<span class="cur">${m.v}</span> ${STAT_NAME[m.stat]}` : `+${m.multicast} multicast`}</li>`);
  }
  if (inst.multicast > 1) {
    const src = [(d.multicast || 1) > 1 && 'built in', isShiny(inst) && 'shiny'].filter(Boolean).join(' + ');
    lines.push(`<li class="s-multicast">Multicast <span class="cur">×${inst.multicast}</span>${src ? ` (${src})` : ''}: fires ${inst.multicast} times each time the bar hits it</li>`);
  }
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
  const e = el('div', `item r-${d.rarity} t-${d.tags[0]}${isShiny(inst) ? ' shiny' : ''}`);
  e.dataset.uid = inst.uid;
  e.style.width = `calc(var(--${scale}) * ${inst.w})`;
  e.style.height = `calc(var(--${scale}) * ${inst.h})`;
  if (inst.x >= 0 && scale === 'cell') { e.style.left = `calc(var(--cell) * ${inst.x})`; e.style.top = `calc(var(--cell) * ${inst.y})`; }
  const pips = [0, 1, 2, 3].map(i => `<i class="${i < inst.level ? 'on' : ''}"></i>`).join('');
  e.innerHTML = `<span class="ico">${d.icon}</span><span class="pips">${pips}</span>` +
    (inst.infusion ? `<span class="inf">${INFUSIONS[inst.infusion].icon}</span>` : '') +
    `<span class="badges">${inst.multicast > 1 ? `<i class="mc">×${inst.multicast}</i>` : ''}${inst.mods?.length ? `<i class="modc" title="Modifiers">+${inst.mods.length}</i>` : ''}</span>` +
    `<span class="flash"></span>`;
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
  const lives = `<span class="hearts"><i class="on">♥</i></span> ${S.lives}<small>/${START_LIVES}</small>`;
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
      <div title="Lives lost on a defeat today"><dt>Lives · loss −${lifeLoss(S.day)}</dt><dd>${lives}</dd></div>
      <div><dt>Max HP</dt><dd>${myMaxHp()}</dd></div>
      <div class="gold"><dt>Gold</dt><dd>${S.gold}</dd></div>
    </dl>
    <div class="hud-btns"><button type="button" class="btn ghost sm" id="help-btn">How to play</button>
      <button type="button" class="btn ghost sm" id="menu-btn">Menu</button></div>`;
  $('#help-btn').onclick = showHelp;
  $('#menu-btn').onclick = confirmLeave;
}

// ===================== Title, help, menu =====================
const DEMO = [['dagger', 2, 0, 1, 1, 1, 0], ['buckler', 1, 1, 0, 1, 2, 0], ['torch', 1, 3, 2, 1, 1, 0], ['bellows', 1, 4, 2, 1, 1, 0],
  ['spring', 1, 5, 0, 2, 2, 0], ['hourglass', 1, 7, 2, 1, 1, 0], ['sword', 3, 8, 1, 2, 1, 'fire']];
function renderTitle() {
  const v = $('#view'); v.innerHTML = ''; v.className = 'title';
  const hero = el('section', 'title-hero');
  hero.innerHTML = `<p class="eyebrow">Async PvP auto-battler</p>
    <h1>Tempo<span>Forge</span></h1>
    <p class="pitch">Arrange items on a timeline. A bar sweeps across and fires each one it reaches. Build in the shop, then fight another player's board from the same day.</p>`;
  const demo = el('div', 'title-demo');
  const tl = timeline(fromSnapshot(DEMO));
  tl.grid.append(el('div', 'playhead demo-head'));
  demo.append(tl.wrap);
  const btns = el('div', 'title-btns');
  const start = el('button', 'btn fight', 'Start run <span>→</span>'); start.type = 'button'; start.onclick = newRun;
  const how = el('button', 'btn ghost', 'How to play'); how.type = 'button'; how.onclick = showHelp;
  btns.append(start, how);
  const facts = el('dl', 'title-facts', `<div><dt>Lives</dt><dd>${START_LIVES}</dd></div><div><dt>Wins to clear</dt><dd>${WINS_TO_CLEAR}</dd></div>
    <div><dt>Opponents</dt><dd>Rated ${pct(MATCH_BAND[0])}–${pct(MATCH_BAND[1])}</dd></div>`);
  hero.append(btns, facts);
  v.append(hero, demo);
  start.focus();
}
function closeModal() { const m = $('.modal.dismissable'); if (m) m.remove(); }
function modal(html, cls = '') {
  closeModal();
  const m = el('div', 'modal dismissable');
  m.innerHTML = `<div class="modal-card ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  document.body.append(m);
  return m;
}
function showHelp() {
  const m = modal(`<h2>How to play</h2>
    <ol class="steps">
      <li><b>Shop.</b> Click an item to buy it. It goes to your bench.</li>
      <li><b>Place it.</b> Drag it onto the 3 × 10 grid. Press R while dragging, or use Rotate in the inspector, to turn it.</li>
      <li><b>Mind the timing.</b> In a fight a bar sweeps left to right, ${COL_TIME}s per column, and fires each item when it reaches the item's left edge. Then it loops.</li>
      <li><b>Level up by merging.</b> Drop an item on an identical one of the same level, on the board or bench, to make one item a level higher (max IV). Items like Bellows and Whetstone boost the items touching them.</li>
      <li><b>Freeze.</b> Like what's in the shop but can't afford it? Freeze the shop and the unsold offers will still be there after the fight.</li>
      <li><b>Shiny items.</b> Rarely an item rolls shiny: +${SHINY_BONUS} multicast, so it fires an extra time every time the bar hits it. Some items multicast on their own. Merging keeps the shine.</li>
      <li><b>Modify.</b> Buy a modifier (like +3 Damage), click it below your bench, then click an item. Items hold level + 1 modifiers.</li>
      <li><b>Infuse.</b> Rarely a Wild Essence appears: it gives an item a random extra effect that scales with its level. Some shop items come already infused.</li>
      <li><b>Fight.</b> Press Find opponent. You face another board from the same day. Win to score, lose and you drop a life.</li>
      <li><b>Win the run.</b> Reach ${WINS_TO_CLEAR} wins before your ${START_LIVES} lives run out. A loss costs ${lifeLoss(1)} life on Days 1–3, ${lifeLoss(4)} on Days 4–7 and ${lifeLoss(8)} after that. The first time you run out, you get a Last Stand: pick a rare boon and fight on with 1 life.</li>
    </ol>
    <h3>Effects</h3>
    <ul class="effects-key">
      <li><b class="k-burn">Burn</b> hits every ${BURN_TICK}s, then drops by 1. It only does half damage to Shield.</li>
      <li><b class="k-poison">Poison</b> hits every 1s, ignores Shield and never fades. Each Heal removes ${Math.round(HEAL_CLEANSE * 100)}% of it.</li>
      <li><b class="k-time">Haste</b> speeds up your bar and <b class="k-slow">Slow</b> slows the enemy's. Items marked Battle start act the moment the fight begins.</li>
      <li><b class="k-regen">Regen</b> heals every 1s. <b class="k-shield">Shield</b> absorbs damage first.</li>
      <li><b class="k-storm">Storm</b> starts at ${OVERTIME}s and hits both sides harder and harder.</li>
    </ul>
    <button type="button" class="btn" id="help-close">Got it</button>`, 'help');
  $('#help-close', m).onclick = closeModal;
  $('#help-close', m).focus();
}
function confirmLeave() {
  const m = modal(`<h2>Leave this run?</h2><p>Your progress in this run will be lost.</p>
    <div class="modal-actions"><button type="button" class="btn ghost" id="stay">Keep playing</button>
    <button type="button" class="btn" id="leave">Leave run</button></div>`);
  $('#stay', m).onclick = closeModal;
  $('#leave', m).onclick = () => { closeModal(); cancelAnimationFrame(raf); document.querySelector('.modal')?.remove(); S = { phase: 'title' }; render(); };
  $('#stay', m).focus();
}

function render() {
  CELL = setCell();
  $('#hud').hidden = S.phase === 'title';
  if (S.phase === 'title') return renderTitle();
  renderHud();
  if (S.phase === 'shop') renderShop();
  else if (S.phase === 'encounter') renderEncounter();
  else if (S.phase === 'pvp') renderBattle();
  else if (S.phase === 'laststand') renderLastStand();
  else renderOver();
}

// ===================== Shop =====================
let boardTarget = null;
function renderShop() {
  const v = $('#view'); v.innerHTML = ''; v.className = 'shop';
  const left = el('div', 'col-main'), right = el('aside', 'col-side');

  const offers = el('section', 'panel offers');
  offers.append(el('header', 'panel-h', `<h2>Shop</h2><span class="hint">Click to buy. Drop an item on its twin to level it up.</span>`));
  const row = el('div', 'offer-row');
  S.shop.forEach((o, idx) => {
    const c = el('button', 'offer' + (o.sold ? ' sold' : '') + (o.price > S.gold && !o.sold ? ' poor' : ''));
    c.type = 'button';
    if (o.kind === 'item') {
      const d = def(o.inst);
      c.classList.add('r-' + d.rarity);
      if (isShiny(o.inst)) c.classList.add('shiny');
      c.innerHTML = `<span class="o-ico">${d.icon}</span><span class="o-name">${d.name}</span><span class="o-meta"><b class="rar">${RARITY[d.rarity].name}</b> ${LV[o.inst.level - 1]}` +
        `${isShiny(o.inst) ? ` <b class="shiny-tag">Shiny ×${o.inst.multicast}</b>` : ''}</span>`;
      const shape = el('span', 'shape');
      shape.style.gridTemplateColumns = `repeat(${o.inst.w}, 8px)`;
      for (let k = 0; k < o.inst.w * o.inst.h; k++) shape.append(el('i'));
      c.append(shape);
      c.onmouseenter = c.onfocus = () => showInspector({ inst: o.inst, from: 'shop' });
    } else if (o.kind === 'mod') {
      const m = MODIFIERS[o.id];
      c.classList.add('mod');
      c.innerHTML = `<span class="o-ico">${m.icon}</span><span class="o-name">${m.name}</span><span class="o-meta">Modifier: ${m.stat ? `+${m.v} ${STAT_NAME[m.stat]}` : `+${m.multicast} multicast`}</span>`;
      c.onmouseenter = c.onfocus = () => showInspector({ mod: o.id });
    } else {
      c.classList.add('essence');
      c.innerHTML = `<span class="o-ico">${WILD_ESSENCE.icon}</span><span class="o-name">${WILD_ESSENCE.name}</span><span class="o-meta">Random infusion</span>`;
      c.onmouseenter = c.onfocus = () => showInspector({ essence: true });
    }
    if (o.frozen && !o.sold) c.classList.add('was-frozen');
    if (S.frozen && !o.sold) c.classList.add('frozen');
    c.append(el('span', 'price', o.sold ? 'Sold' : `${o.price}g`));
    c.onclick = () => buy(idx);
    row.append(c);
  });
  offers.append(row);
  const reroll = el('button', 'btn ghost', `Reroll · ${rerollCost(S.rerolls)}g`); reroll.type = 'button';
  reroll.disabled = S.gold < rerollCost(S.rerolls);
  reroll.onclick = () => { const c = rerollCost(S.rerolls); if (S.gold < c) return; S.gold -= c; S.rerolls++; S.frozen = false; S.shop = rollShop(S.day, rng); render(); };
  const freeze = el('button', 'btn ghost freeze' + (S.frozen ? ' on' : ''), S.frozen ? '❄ Frozen' : 'Freeze shop'); freeze.type = 'button';
  freeze.setAttribute('aria-pressed', S.frozen);
  freeze.title = 'Keep the unsold offers for the next shop';
  freeze.onclick = () => { S.frozen = !S.frozen; render(); };
  const acts = el('div', 'offer-actions');
  acts.append(el('span', 'hint', S.frozen ? 'Unsold offers stay for the next shop. Rerolling unfreezes.' : ''), freeze, reroll);
  offers.append(acts);

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
  if (S.consumables.length) {
    const er = el('div', 'essences');
    er.append(el('span', 'hint', 'To use: click one, then click an item.'));
    S.consumables.forEach((c, i) => {
      const label = c.kind === 'mod' ? `${MODIFIERS[c.id].icon} ${MODIFIERS[c.id].name}` : `${WILD_ESSENCE.icon} ${WILD_ESSENCE.name}`;
      const b = el('button', 'ess-chip' + (S.pending === i ? ' active' : ''), label);
      b.type = 'button';
      b.onclick = () => { S.pending = S.pending === i ? null : i; render(); };
      b.onmouseenter = () => showInspector(c.kind === 'mod' ? { mod: c.id } : { essence: true });
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
    <li><b class="k-burn">Burn</b> hits every ${BURN_TICK}s, then drops by 1. It only does half damage to Shield.</li>
    <li><b class="k-poison">Poison</b> hits every 1s, ignores Shield and never fades. Each Heal removes ${Math.round(HEAL_CLEANSE * 100)}% of it.</li>
    <li><b class="k-regen">Regen</b> heals every 1s. <b class="k-shield">Shield</b> absorbs damage first.</li>
    <li><b class="k-time">Haste</b> speeds up your bar, <b class="k-slow">Slow</b> slows the enemy's. Some items act at battle start.</li>
    <li>After ${OVERTIME}s a <b class="k-storm">storm</b> hits both sides every ${BURN_TICK}s like a weapon, so Shield blocks it. It starts at ${STORM_BASE} and each hit is ${Math.round((STORM_GROWTH - 1) * 100)}% bigger.</li>
  </ul>`;
}

const findOwned = u => S.board.find(o => o.uid === u) || S.bench.find(o => o.uid === u) || null;

function showInspector(target) {
  const p = $('.inspector'); if (!p) return;
  if (!target || (!target.inst && !target.essence && !target.mod)) {
    const pend = S.pending != null ? `<p class="callout">Click an item on your board or bench to use it on.</p>` : '';
    p.innerHTML = `<h3>Inspector</h3><p class="muted">Hover an item to see what it does. Click one of yours to rotate or sell it.</p>${pend}`;
    return;
  }
  if (target.essence) {
    const outcomes = Object.values(INFUSIONS).map(f => `<li class="s-${f.stat}">${f.icon} ${STAT_TEXT[f.stat](prog(f.v, -1))}</li>`).join('');
    p.innerHTML = `<div class="ins-h"><span class="ins-ico">${WILD_ESSENCE.icon}</span><div><h3>${WILD_ESSENCE.name}</h3><span class="chip">Essence</span></div></div>
      <p class="muted">Gives an item one random infusion (by its level), plus that tag. Replaces any infusion it has.</p>
      <ul class="effects">${outcomes}</ul>`;
    return;
  }
  if (target.mod) {
    const m = MODIFIERS[target.mod];
    p.innerHTML = `<div class="ins-h"><span class="ins-ico">${m.icon}</span><div><h3>${m.name}</h3><span class="chip">Modifier</span></div></div>
      <ul class="effects"><li class="s-${m.stat || 'multicast'}">${m.stat ? `Add <span class="cur">+${m.v}</span> ${STAT_NAME[m.stat]} to an item, and the ${TAG_NAME[m.tag]} tag` : `Add +${m.multicast} multicast to an item`}</li>
      <li>Permanent. An item holds level + 1 modifiers, and they carry over when you merge.</li></ul>`;
    return;
  }
  const inst = target.inst, d = def(inst);
  const tags = [...tagsOf(inst)].map(t => `<span class="tag t-${t}">${TAG_NAME[t]}</span>`).join('');
  let actions = '', mergeHint = '';
  if (target.from === 'owned') {
    const twins = [...S.board, ...S.bench].filter(o => canMerge(o, inst)).length;
    const up = inst.level >= 4 ? `<span class="chip">Max level</span>` : '';
    mergeHint = inst.level >= 4 ? '' : `<p class="merge-hint">${twins
      ? `You own another ${d.name} ${LV[inst.level - 1]}. Drag one onto the other to make it ${LV[inst.level]}.`
      : `Merge with another ${d.name} ${LV[inst.level - 1]} to reach ${LV[inst.level]}.`}</p>`;
    const rot = inst.w !== inst.h ? `<button type="button" class="btn ghost" id="btn-rot">Rotate</button>` : '';
    actions = `<div class="ins-actions">${up}${rot}<button type="button" class="btn ghost" id="btn-sell">Sell · ${sellValue(inst)}g</button></div>`;
  }
  p.innerHTML = `<div class="ins-h r-${d.rarity}"><span class="ins-ico">${d.icon}</span><div><h3>${d.name} <small>${LV[inst.level - 1]}</small></h3>
    <span class="chip rar">${RARITY[d.rarity].name}</span><span class="chip">${inst.w}×${inst.h}</span><span class="chip">Mods ${inst.mods?.length || 0}/${modSlots(inst)}</span>${isShiny(inst) ? '<span class="chip shiny-tag">Shiny</span>' : ''}</div></div>
    <div class="tags">${tags}</div><ul class="effects">${describe(inst) || '<li class="muted">No active effect.</li>'}</ul>${mergeHint}${actions}`;
  const sl = $('#btn-sell', p);
  if (sl) sl.onclick = () => sellInst(inst);
  const rt = $('#btn-rot', p);
  if (rt) rt.onclick = () => {
    if (S.board.includes(inst) && !canPlace(S.board, inst.x, inst.y, inst.h, inst.w, inst.uid)) return toast('No room to rotate it here. Drag it somewhere with space first.');
    [inst.w, inst.h] = [inst.h, inst.w]; render();
  };
}

function buy(idx) {
  const o = S.shop[idx]; if (o.sold || S.gold < o.price) return;
  if (o.kind === 'item') {
    if (S.bench.length >= BENCH_MAX) return toast('Bench is full. Place or sell something first.');
    S.bench.push(o.inst);
  } else S.consumables.push(o.kind === 'mod' ? { kind: 'mod', id: o.id } : { kind: 'essence' });
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
  document.querySelectorAll('.merge-target').forEach(n => n.classList.remove('merge-target'));
  const hovered = document.elementsFromPoint(px, py);
  if (hovered.some(n => n.id === 'sell')) { drag.drop = { kind: 'sell' }; return; }
  const benchNode = hovered.find(n => n.classList?.contains('item') && n.closest('#bench'));
  const benchTwin = benchNode && S.bench.find(o => o.uid === +benchNode.dataset.uid);
  if (benchTwin && canMerge(benchTwin, drag.inst)) { benchNode.classList.add('merge-target'); drag.drop = { kind: 'merge', target: benchTwin }; return; }
  if (hovered.some(n => n.id === 'bench')) { drag.drop = { kind: 'bench' }; return; }
  const gr = boardTarget.grid.getBoundingClientRect();
  if (px < gr.left || px > gr.right || py < gr.top || py > gr.bottom) return;
  const cx = Math.floor((px - gr.left) / CELL), cy = Math.floor((py - gr.top) / CELL);
  const box = (x, y, w, h, cls) => {
    Object.assign(prev.style, { left: `calc(var(--cell)*${x})`, top: `calc(var(--cell)*${y})`, width: `calc(var(--cell)*${w})`, height: `calc(var(--cell)*${h})` });
    prev.className = 'drop-preview ' + cls; prev.hidden = false;
  };
  const under = itemAt(S.board, cx, cy);
  if (under && canMerge(under, drag.inst)) {
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
    remove(); mergeInto(drop.target, inst);
    S.selected = drop.target.uid; toast(`${def(inst).name} merged to level ${LV[drop.target.level - 1]}`);
    return render();
  }
  remove(); Object.assign(inst, { x: drop.x, y: drop.y, w: d.w, h: d.h }); S.board.push(inst);
  render();
}
function clickItem(inst) {
  if (S.pending != null) {
    const c = S.consumables[S.pending];
    if (c.kind === 'mod') {
      const why = canApplyMod(inst, c.id);
      if (why) { toast(why); S.selected = inst.uid; return render(); }
      applyMod(inst, c.id);
      toast(`${MODIFIERS[c.id].name} added to ${def(inst).name}`);
    } else {
      inst.infusion = rollInfusion(rng, inst.infusion);
      toast(`${def(inst).name} rolled ${INFUSIONS[inst.infusion].name}!`);
    }
    S.consumables.splice(S.pending, 1); S.pending = null;
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
  S.battle = new Battle(new Fighter('You', S.board, myMaxHp()), new Fighter(opp.name, fromSnapshot(opp.items), hp), onFx);
  S.selected = null; S.pending = null;
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
    if (F.hasteNow(B.t)) st.push(`<span class="st haste">⏩ hasted</span>`);
    if (F.slowNow(B.t)) st.push(`<span class="st slow">🐌 slowed</span>`);
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
  const cost = lifeLoss(S.day);
  const last = res === 'loss' && S.lives - cost <= 0;
  const sub = { win: 'You win the day.', draw: 'Both fell. Nobody scores.',
    loss: last ? (S.lastStandUsed ? 'That was your last life.' : `You lose ${cost} ${cost > 1 ? 'lives' : 'life'} and you're out. Time for a Last Stand.`)
               : `You lose ${cost} ${cost > 1 ? 'lives' : 'life'}.` }[res];
  const m = el('div', 'modal');
  m.innerHTML = `<div class="modal-card ${res}"><h2>${title}</h2><p>${sub}</p>
    <p class="rating">Rating your board against Day ${S.day}'s field…</p>
    ${last && S.lastStandUsed ? '' : `<p class="income">+${gain} gold next shop</p>`}
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
    <p>${S.wins} wins across ${S.day} days.</p><button type="button" class="btn fight" id="again">New run <span>→</span></button>
    <button type="button" class="btn ghost" id="to-title">Back to title</button></section>`;
  $('#to-title').onclick = () => { S = { phase: 'title' }; render(); };
  v.querySelector('.over-card').append(historyPanel());
  $('#again').onclick = newRun;
}

