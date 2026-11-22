// Browser UI: shop, drag and drop, PvP battle playback. All rules come from src/core.
import { ITEMS, RARITY, INFUSIONS, MODIFIERS, WILD_ESSENCE, TAG_NAME, STAT_NAME, STAT_TEXT, STAT_ORDER, SPECIALS, ON_EVENT, AURA_COND, AURA_SCOPE, CATEGORIES } from '../data/items.js';
import { makeRng } from '../core/rng.js';
import {
  COLS, BENCH_MAX, START_LIVES, WINS_TO_CLEAR, START_GOLD, DAY_FLOW, ENCOUNTERS, SHINY_BONUS, lifeLoss, newInst,
  def, priceOf, sellValue, canMerge, mergeInto, isShiny, rerollCost, canApplyMod, infusionAmount, perFireScale, scaledBonus, isActive, chargeCost, CHARGE_DEFAULT, maxLevel, tierOf, tierIndex, baseTier, RARITIES, applyMod, rollInfusion, maxHp, income, starterBoard, rollShop, rollShopChoices, styleName, styleText, SHOP_STYLES, topTier,
  tagsOf, statsOf, canPlace, itemAt, snapshot, fromSnapshot, afterFightGold, rarityWeights, offerPrice, oddsBracket, DAY_ODDS,
} from '../core/rules.js';
import { Fighter, Battle, previewStats, COL_TIME, BURN_TICK, OVERTIME, STORM_BASE, STORM_GROWTH, SIM_DT, BURN_VS_SHIELD } from '../core/sim.js';
import { ARCHETYPES } from '../bots/archetypes.js';
import { MATCH_BAND } from '../bots/pool.js';
import { SKILLS, skillEffects, skillOffers, skillLevels, skillTier, maxSkillLevel, skillText } from '../data/skills.js';

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
    phase: 'shop', day: 1, gold: START_GOLD, lives: START_LIVES, wins: 0, rerolls: 0, frozen: false, bonusHp: 0, lastStandUsed: false, skills: [], skillPicks: ['starter'], livesLost: 0, streak: 0, style: null, styleChoices: null, kept: [], hand: null,
    board: starterBoard(), bench: [], consumables: [], shop: [], faced: new Set(), history: [],
    selected: null, pending: null, battle: null, opponent: null, over: false,
  };
  render();
}
// What "per win / per life lost / per gold" skills see right now.
const myCtx = () => ({ day: S.day, wins: S.wins, livesLost: S.livesLost, lives: S.lives, gold: S.gold, streak: S.streak });
// Today's shop choice: 3 shop styles; picking one stocks the shop (keeping frozen offers).
function renderStylePick() {
  if (!S.styleChoices) S.styleChoices = rollShopChoices(S.day, rng, [...S.board, ...S.bench]);
  const v = $('#view'); v.className = 'over'; v.innerHTML = '';
  const card = el('section', 'panel over-card style-pick');
  const odds = Object.entries(rarityWeights(S.day)).filter(([, p]) => p).map(([r, p]) => `${p}% ${RARITY[r].name}`).join(' · ');
  card.innerHTML = `<p class="eyebrow">Day ${S.day}</p><h2>Choose today's shop</h2>
    <p class="muted">The shop you pick holds for all of today's rerolls. Today's odds: ${odds}.</p>`;
  const row = el('div', 'boons');
  for (const st of S.styleChoices) {
    const late = SHOP_STYLES[st.id].from > 1;
    const btn = el('button', 'boon shop-style' + (late ? ' late' : ''), `<span class="b-ico">${SHOP_STYLES[st.id].icon}</span><b>${styleName(st)}</b><span>${styleText(st, S.day)}</span>`);
    btn.type = 'button';
    btn.onclick = () => {
      S.style = st; S.styleChoices = null;
      const fresh = rollShop(S.day, rng, st, [...S.board, ...S.bench]);
      S.shop = [...S.kept.map(o => ({ ...o, frozen: true })), ...fresh.slice(S.kept.length)];
      S.kept = []; render();
    };
    row.append(btn);
  }
  card.append(row);
  v.append(card);
  row.querySelector('button').focus();
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
  if (S.myWr == null) rateMyBoard(); // in case Continue was clicked before the rating finished
  S.history.push({ day: S.day, result, opponent: S.opponent.name, oppWr: S.opponent.wr, myWr: S.myWr });
  S.myWr = null;
  if (result === 'win') { S.wins++; S.streak++; }
  if (result === 'loss') { S.lives = Math.max(0, S.lives - lifeLoss(S.day)); S.livesLost += lifeLoss(S.day); S.streak = 0; }
  if (S.wins >= WINS_TO_CLEAR) { S.phase = 'over'; return render(); }
  if (S.lives <= 0) {
    if (S.lastStandUsed) { S.phase = 'over'; return render(); }
    S.phase = 'laststand'; S.boons = rng.shuffle([...BOONS]).slice(0, 3); return render();
  }
  advanceDay(result);
}
// Gold after a fight (rules live in afterFightGold). With commit, item counters advance and
// finished Treasure Maps turn into skill picks.
function fightPayout(result, commit) {
  const p = afterFightGold({ board: S.board, skills: S.skills, day: S.day, won: result === 'win',
    gold: S.gold, battleGold: S.battle?.f[0].goldEarned || 0 }, commit);
  if (commit && p.skillPicks.length) { S.board = p.board; S.skillPicks.push(...p.skillPicks); toast('Your Treasure Map led to a new skill!'); }
  return p;
}
function advanceDay(result) {
  S.gold += fightPayout(result, true).total;
  S.day++; S.rerolls = 0;
  S.phase = 'shop';
  // A frozen shop keeps its unsold offers into the next day; the shop you pick fills the rest.
  S.kept = S.frozen ? S.shop.filter(o => !o.sold) : [];
  S.style = null; S.styleChoices = null; S.shop = [];
  S.frozen = false;
  render();
}

const myMaxHp = () => Math.round(maxHp(S.day) * (1 + (S.bonusHpPct || 0)));
const freeRerolls = () => skillEffects(S.skills, myCtx()).freeRerolls || 0;
const currentRerollCost = () => (S.rerolls < freeRerolls() ? 0 : rerollCost(S.rerolls - freeRerolls()));

// ===================== Artifacts =====================
// ===================== Skills =====================
const RARITY_NAME = { starter: 'Starter', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', superrare: 'Super Rare', legendary: 'Legendary' };
// Picks waiting to be made (S.skillPicks holds their rarities). Shown before the shop.
function renderSkillPick() {
  const rarity = S.skillPicks[0];
  if (!S.skillChoices) S.skillChoices = rng.shuffle(skillOffers(rarity, S.skills)).slice(0, 3);
  if (!S.skillChoices.length) { S.skillPicks.shift(); S.skillChoices = null; return render(); } // none left of that rarity
  const v = $('#view'); v.className = 'over'; v.innerHTML = '';
  const starter = rarity === 'starter';
  const card = el('section', `panel over-card last-stand skill-pick r-${rarity}`);
  card.innerHTML = `<p class="eyebrow">${starter ? 'Start of run' : `${RARITY_NAME[rarity]} skill${S.skillPicks.length > 1 ? ` · ${S.skillPicks.length} to choose` : ''}`}</p>
    <h2>${starter ? 'Choose your starting skill' : 'Choose a skill'}</h2>
    <p class="muted">${starter ? "Starting skills can't be found later. Each points at a build." : 'You earned this by upgrading an item. Picking a skill you already have levels it up a rarity tier.'}</p>`;
  const row = el('div', 'boons');
  const lv = skillLevels(S.skills);
  for (const id of S.skillChoices) {
    const a = SKILLS[id], next = (lv[id] || 0) + 1, tier = skillTier(id, next);
    const tag = lv[id] ? `<span class="chip lvup">Level ${lv[id]} → ${next}</span>` : '';
    const btn = el('button', `boon skill r-${tier}`, `<span class="b-ico">${a.icon}</span><b>${a.name}</b><span class="chip rar">${RARITY_NAME[tier]}</span>${tag}<span class="a-text">${skillText(id, next, myCtx())}</span>`);
    btn.type = 'button';
    btn.onclick = () => { S.skills.push(id); S.skillPicks.shift(); S.skillChoices = null; toast(lv[id] ? `${a.name} is now level ${next}` : `${a.name} learned`); render(); };
    row.append(btn);
  }
  card.append(row);
  v.append(card);
  row.querySelector('button').focus();
}
function skillsPanel() {
  const p = el('section', 'panel artifacts-panel');
  p.append(el('h3', '', 'Skills'));
  if (!S.skills.length) { p.append(el('p', 'muted', 'Upgrade an item (merge two copies) to choose a skill of its rarity.')); return p; }
  const ul = el('ul', 'art-list');
  for (const [id, lvl] of Object.entries(skillLevels(S.skills))) {
    const a = SKILLS[id], tier = skillTier(id, lvl), max = maxSkillLevel(id);
    const pips = max > 1 ? `<span class="pips sk-pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>` : '';
    ul.append(el('li', `r-${tier}`, `<span class="a-ico">${a.icon}</span><div><b>${a.name} <small>${RARITY_NAME[tier]}${max > 1 ? ` · Lv ${lvl}` : ''}</small>${pips}</b><span class="a-text">${skillText(id, lvl, myCtx())}</span></div>`));
  }
  p.append(ul);
  return p;
}
const skillIcons = (ids, ctx) => Object.entries(skillLevels(ids || [])).map(([id, lvl]) =>
  `<span class="sk-ico" title="${SKILLS[id].name}${lvl > 1 ? ` (Lv ${lvl})` : ''}: ${skillText(id, lvl, ctx)}">${SKILLS[id].icon}${lvl > 1 ? `<sup>${lvl}</sup>` : ''}</span>`).join('');

// ===================== Last Stand =====================
// The first time you run out of lives you pick one rare boon and keep going on 1 life.
const BOONS = [
  { id: 'legend', icon: '👑', name: 'Legend Reborn', text: 'Take a random Legendary item.',
    apply() { const ids = Object.keys(ITEMS).filter(k => ITEMS[k].rarity === 'legendary'); S.bench.push(newInst(rng.pick(ids))); } },
  { id: 'shine', icon: '✨', name: 'Polished', text: 'Your most valuable board item becomes shiny: +1 multicast.',
    apply() { const best = [...S.board].sort((a, b) => priceOf(b) - priceOf(a))[0]; if (best) best.multicast += SHINY_BONUS; } },
  { id: 'vigor', icon: '❤️', name: 'Second Wind', text: '+15% max HP for the rest of the run.', apply() { S.bonusHpPct = (S.bonusHpPct || 0) + 0.15; } },
  { id: 'hoard', icon: '💰', name: 'Hidden Hoard', text: 'Gain 30 gold.', apply() { S.gold += 30; } },
  { id: 'mastery', icon: '⬆️', name: 'Mastery', text: 'Your best item below Super Rare goes up one rarity tier.',
    apply() { const it = [...S.board, ...S.bench].filter(o => o.level < maxLevel(o) && tierIndex(o) < 3).sort((a, b) => priceOf(b) - priceOf(a))[0]; if (it) { S.skillPicks.push(tierOf(it)); it.level++; } } },
  { id: 'relic', icon: '🏆', name: 'Relic Hunter', text: 'Choose a Rare skill right away.', apply() { S.skillPicks.push('rare'); } },
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
// Values per level. While describing an item, each value is colored by the rarity tier it belongs to.
let progBase = null;
function prog(arr, L, fmt = v => v) {
  return arr.map((v, i) => `<span class="${i === L ? 'cur' : 'lv'}${progBase != null ? ` tc-${RARITIES[progBase + i]}` : ''}">${fmt(v)}</span>`).join('<span class="sep">›</span>');
}
export function describe(inst) {
  progBase = baseTier(inst.id);
  try { return describeLines(inst); } finally { progBase = null; }
}
const SCALE_FROM = { myShield: 'your Shield', myRegen: 'your Regen', enemyBurn: "the enemy's Burn", enemyPoison: "the enemy's Poison" };
function describeLines(inst) {
  const d = def(inst), L = inst.level - 1, lines = [];
  const fin = FINALS.get(inst.uid) || statsOf(inst);
  // Final numbers first (what it will actually do), base value alongside when something changed it.
  for (const k of STAT_ORDER) {
    const base = d.effects?.[k]?.[L] || 0, now = Math.round(fin[k] || 0);
    if (!base && !now) continue;
    if (!base && d.scale?.some(x => x.stat === k)) continue; // pure scaling items explain themselves below
    lines.push(`<li class="s-${k}">${STAT_TEXT[k](`<span class="cur fin">${now}</span>`)}${now !== base ? ` <small class="base">base ${base}</small>` : ''}</li>`);
  }
  for (const sc of d.scale || []) {
    const verb = { damage: 'Deal damage', heal: 'Heal', shield: 'Gain Shield', burn: 'Apply Burn', poison: 'Apply Poison' }[sc.stat] || STAT_NAME[sc.stat];
    lines.push(`<li class="s-${sc.stat} s-scale">${verb} equal to ${prog(sc.v, L)}× ${SCALE_FROM[sc.from]} <small class="base">(counted when it fires)</small></li>`);
  }
  if (d.special) { const SP = SPECIALS[d.special.kind]; lines.push(`<li class="s-special">${SP.text(d.special, prog(d.special.v, L, SP.fmt))}</li>`); }
  if (inst.infusion) { const f = INFUSIONS[inst.infusion]; lines.push(`<li class="s-${f.stat} infused">${f.icon} Infused: ${STAT_TEXT[f.stat](`<span class="cur">${infusionAmount(inst)}</span>`)} (${Math.round(f.pct * 100)}% of this item's power)</li>`); }
  if (d.start) {
    const parts = [];
    for (const k of STAT_ORDER) if (d.start.effects?.[k]) parts.push(STAT_TEXT[k](prog(d.start.effects[k], L)));
    if (d.start.special) { const SP = SPECIALS[d.start.special.kind]; parts.push(SP.text(d.start.special, prog(d.start.special.v, L, SP.fmt)).replace(/\. Triggering again refreshes it$/, '')); }
    lines.unshift(`<li class="s-start"><b>Battle start:</b> ${parts.join('. ')}</li>`);
  }
  if (isActive(d)) {
    const c = d.charge, cost = Array.isArray(c) ? prog(c, L) : `<span class="cur">${c ?? CHARGE_DEFAULT}</span>`;
    lines.unshift(`<li class="s-charge">⚡ Fires every ${cost} charges (+1 each time the bar passes)` +
      (d.accel ? `, then needs ${d.accel} fewer each time it fires (down to ${d.minCharge ?? 1})` : '') + '</li>');
  } else lines.unshift(`<li class="s-charge passive">No charge needed: ${d.on ? 'it reacts to your other items' : d.start && !d.aura ? 'it acts at battle start' : d.gold || d.map ? 'it pays out after fights' : 'always on'}</li>`);
  if (d.gold) {
    const when = d.gold.when === 'win' ? 'After you win a fight' : 'After each fight';
    lines.push(`<li class="s-gold"><b>${when}:</b> ${d.gold.grow
      ? `gain 1 gold, then 1 more each fight, up to ${prog(d.gold.v, L)}${inst.charge ? ` (paying ${inst.charge} now)` : ''}`
      : `gain ${prog(d.gold.v, L)} gold`}</li>`);
  }
  if (d.map) lines.push(`<li class="s-gold"><b>After ${prog(d.map.v, L)} fights on your board:</b> it's used up and you choose a skill of its rarity${inst.charge ? ` (${inst.charge} done)` : ''}</li>`);
  if (d.on) {
    const parts = Object.entries(d.on.effects || {}).map(([k, arr]) => STAT_TEXT[k](prog(arr, L)).replace(/^./, c => c.toLowerCase()));
    if (d.on.special) { const SP = SPECIALS[d.on.special.kind]; parts.push(SP.text(d.on.special, prog(d.on.special.v, L, SP.fmt)).replace(/^./, c => c.toLowerCase())); }
    lines.push(`<li class="s-trigger"><b>${ON_EVENT[d.on.event](d.on)}:</b> ${parts.join(', ')}</li>`);
  }
  if (d.aura) {
    const a = d.aura;
    const who = `your other ${a.cat ? a.cat + ' ' : a.tag ? TAG_NAME[a.tag] + ' ' : ''}items${a.scope ? ' ' + AURA_SCOPE[a.scope] : ''}`;
    const what = a.multicast ? `+${prog(a.multicast, L)} multicast`
      : `+${prog(a.v, L, a.pct ? x => Math.round(x * 100) + '%' : x => x)} ${STAT_NAME[a.stat]}`;
    lines.push(`<li class="s-aura"><b>Passive:</b> ${who} get ${what}${a.cond ? ' ' + AURA_COND[a.cond] : ''}${a.stat && !a.pct ? ` (if they have ${STAT_NAME[a.stat]})` : ''}</li>`);
  }
  if (d.per) lines.push(`<li class="s-${d.per.stat}">+${prog(d.per.v, L)} ${STAT_NAME[d.per.stat]} for each other ${d.per.cat} item you have</li>`);
  for (const [k, v] of Object.entries(inst.extra || {})) lines.push(`<li class="s-${k} modded">🔨 Built in by the shop: +<span class="cur">${v}</span> ${STAT_NAME[k]} (included above)</li>`);
  if (d.goldCap) lines.push(`<li class="s-gold">Earns up to ${prog(d.goldCap, L)} gold per fight</li>`);
  for (const id of inst.mods || []) {
    const m = MODIFIERS[id];
    lines.push(`<li class="s-${m.stat || 'multicast'} modded">${m.icon} ${m.name}: ${m.stat ? `+<span class="cur">${scaledBonus(m.v, perFireScale(inst))}</span> ${STAT_NAME[m.stat]}` : `+${m.multicast} multicast`}</li>`);
  }
  const tiersLine = STAT_ORDER.filter(k => d.effects?.[k] && d.effects[k].length > 1).map(k => `${STAT_NAME[k]} ${prog(d.effects[k], L)}`);
  if (tiersLine.length) lines.push(`<li class="s-tiers"><small>Base by tier: ${tiersLine.join(' · ')}</small></li>`);
  const mc = fin.mc ?? inst.multicast;
  if (mc > 1) {
    const src = [(d.multicast || 1) > 1 && 'built in', isShiny(inst) && 'shiny', mc > inst.multicast && `+${mc - inst.multicast} from your items and skills`].filter(Boolean).join(' + ');
    lines.push(`<li class="s-multicast">Multicast <span class="cur fin">×${mc}</span>${src ? ` (${src})` : ''}: fires ${mc} times each time its charge fills</li>`);
  }
  return lines.join('');
}

// ===================== Shared rendering =====================
let CELL = 60;
function setCell() {
  const w = Math.min(document.documentElement.clientWidth, 1180) - 32;
  const main = w > 900 ? w - 304 : w;
  const cell = Math.max(30, Math.min(84, Math.floor((main - 58) / COLS)));
  document.documentElement.style.setProperty('--cols', COLS);
  document.documentElement.style.setProperty('--cell', cell + 'px');
  return cell;
}

// ===================== Final numbers =====================
// FINALS: uid -> the item's numbers right now (shop: as a fight would start; fight: live).
let FINALS = new Map();
const CHIP_STATS = ['damage', 'burn', 'poison', 'shield', 'heal', 'regen', 'maxhp'];
const STAT_ICON = { damage: '⚔', burn: '🔥', poison: '☠', shield: '🛡', heal: '✚', regen: '❋', maxhp: '♥' };
const compact = n => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
function statChips(st) {
  if (!st) return '';
  return CHIP_STATS.filter(k => st[k] > 0).slice(0, 2).map(k => `<i class="c-${k}" title="${STAT_NAME[k]}">${STAT_ICON[k]}${compact(st[k])}</i>`).join('');
}
function refreshFinals() { FINALS = S?.board ? previewStats(S.board, S.skills || [], myMaxHp(), myCtx(), S.bench) : new Map(); }

function itemEl(inst, scale = 'cell') {
  const d = def(inst);
  const e = el('div', `item r-${tierOf(inst)} t-${d.tags[0]}${isShiny(inst) ? ' shiny' : ''}`);
  e.dataset.uid = inst.uid;
  e.style.width = `calc(var(--${scale}) * ${inst.w})`;
  e.style.height = `calc(var(--${scale}) * ${inst.h})`;
  if (inst.x >= 0 && scale === 'cell') { e.style.left = `calc(var(--cell) * ${inst.x})`; e.style.top = `calc(var(--cell) * ${inst.y})`; }
  const pips = maxLevel(inst) > 1 ? Array.from({ length: maxLevel(inst) }, (_, i) => `<i class="${i < inst.level ? 'on' : ''}"></i>`).join('') : '';
  // Multicast as it will fight: its own + shiny + auras and skills (fights carry extraMc).
  const mc = inst.extraMc != null ? (inst.multicast || 1) + inst.extraMc : FINALS.get(inst.uid)?.mc ?? inst.multicast;
  e.innerHTML = `<span class="ico">${d.icon}</span><span class="pips">${pips}</span>` +
    (inst.infusion ? `<span class="inf">${INFUSIONS[inst.infusion].icon}</span>` : '') +
    `<span class="badges">${mc > 1 ? `<i class="mc${mc > inst.multicast ? ' boosted' : ''}" title="Multicast: fires ${mc} times each time it fires">×${mc}</i>` : ''}${inst.mods?.length ? `<i class="modc" title="Modifiers">+${inst.mods.length}</i>` : ''}</span>` +
    (isActive(d) ? `<span class="chg" title="Charge: fires at ${chargeCost(inst)}"><i></i></span>` : '') +
    `<span class="stc">${statChips(FINALS.get(inst.uid))}</span>` +
    `<span class="flash"></span>`;
  e.title = `${d.name} (${RARITY[tierOf(inst)].name})`;
  return e;
}

function timeline(items, opts = {}) {
  const wrap = el('div', 'timeline' + (opts.enemy ? ' enemy' : ''));
  const rulerRow = el('div', 'ruler-row', '<span class="tc">sec</span>');
  const ruler = el('div', 'ruler');
  for (let c = 0; c < COLS; c++) ruler.append(el('span', '', (c * COL_TIME).toFixed(2)));
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
  const steps = DAY_FLOW;
  const flow = ['over', 'laststand'].includes(S.phase) ? '' : steps.map(p => {
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
      <div><dt>Max HP</dt><dd>${(sk => Math.round(myMaxHp() * (1 + sk.maxHp)) + Math.round(sk.maxHpFlat))(skillEffects(S.skills, myCtx()))}</dd></div>
      <div class="gold"><dt>Gold</dt><dd>${S.gold}</dd></div>
    </dl>
    <div class="hud-btns"><button type="button" class="btn ghost sm" id="help-btn">How to play</button>
      <button type="button" class="btn ghost sm" id="menu-btn">Menu</button></div>`;
  $('#help-btn').onclick = showHelp;
  $('#menu-btn').onclick = confirmLeave;
}

// ===================== Title, help, menu =====================
const DEMO = [['dagger', 2, 0, 1, 1, 1, 0], ['buckler', 1, 1, 0, 1, 2, 0], ['torch', 1, 1, 2, 1, 1, 0], ['bellows', 1, 2, 2, 1, 1, 0],
  ['spring', 1, 2, 0, 2, 2, 0], ['hourglass', 1, 0, 0, 1, 1, 0], ['sword', 3, 3, 2, 2, 1, 'fire']];
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
      <li><b>Shop.</b> You start with an empty board and ${START_GOLD} gold. Each day you choose 1 of 3 shops to visit: a General Store, a shop for one category or one item size, and later on better ones like a Clearance Sale, an Armory whose weapons come with bonus Damage, a Curio Dealer with rarer odds or a Gilded Hall where everything is shiny. Click an item to buy it; it goes to your bench. Days 1–2 sell only Commons; Uncommons join on Day 3, Rares on Day 5, Super Rares on Day 7 and Legendaries on Day 9. Now and then an item is half price.</li>
      <li><b>Place it.</b> Click it to pick it up, then click a spot on the 3 × 5 grid (or drag it). Dropping it on another item swaps them. R or the Rotate button turns it; Esc puts it back.</li>
      <li><b>Charge.</b> In a fight a bar sweeps left to right (${COL_TIME}s per column) and loops. Each time it passes an item, the item gains 1 charge; when its yellow charge bar fills, it fires. Most items need ${CHARGE_DEFAULT} charges, quick ones fewer, heavy ones more; some need fewer as they're upgraded or every time they fire. Items like Dynamo give other items charge.</li>
      <li><b>Upgrade by merging.</b> Drop an item on an identical one of the same rarity, on the board or bench, to make one item a rarity tier higher: Common → Uncommon → Rare → Super Rare → Legendary. Legendaries are already at the top and can't be upgraded. Items like Bellows and Whetstone boost the items touching them.</li>
      <li><b>Freeze.</b> Like what's in the shop but can't afford it? Freeze the shop and the unsold offers will still be there after the fight.</li>
      <li><b>Shiny items.</b> Rarely an item rolls shiny: +${SHINY_BONUS} multicast, so it fires an extra time every time the bar hits it. Some items multicast on their own. Merging keeps the shine.</li>
      <li><b>Infused items.</b> Some shop items come infused with an essence: a random extra effect that scales with the item.</li>
      <li><b>Fight.</b> Press Find opponent. You face another board from the same day. Win to score, lose and you drop a life.</li>
      <li><b>Skills.</b> You start a run by choosing 1 of 3 starting skills, which can't be found later. Every time you upgrade an item you choose 1 of 3 skills of the item's rarity before the upgrade (Common → Uncommon gives a Common skill). Picking a skill you already have levels it up a rarity tier, like merging an item. Skills last the whole run: Common ones add flat amounts ("your Melee items deal +12 damage"), rarer ones percentages, and some grow with your run ("+3 damage for each win", "+4 damage for each life you've lost").</li>
      <li><b>Categories.</b> Every item is one or two kinds of thing (Melee, Clockwork, Treasure, Beast...). Many items care about them: "When you use another Clockwork item", "+Damage for each Treasure you have", "your Melee items get +Damage".</li>
      <li><b>Gold.</b> Some items pay out after fights just for being on your board, others earn gold each time they fire (up to a cap per fight). Artifacts like Tithe and Compound Interest add more.</li>
      <li><b>Rows and columns.</b> Some items boost the other items in their row or column, like War Drum (+Damage to its column) or Conductor's Baton (+1 multicast to its column).</li>
      <li><b>Win the run.</b> Reach ${WINS_TO_CLEAR} wins before your ${START_LIVES} lives run out. A loss costs ${lifeLoss(1)} life on Days 1–3, ${lifeLoss(4)} on Days 4–7 and ${lifeLoss(8)} after that. The first time you run out, you get a Last Stand: pick a rare boon and fight on with 1 life.</li>
    </ol>
    <h3>Effects</h3>
    <ul class="effects-key">
      <li><b class="k-burn">Burn</b> hits every ${BURN_TICK}s, then drops by 1. It only does ${Math.round(BURN_VS_SHIELD * 100)}% damage to Shield.</li>
      <li><b class="k-poison">Poison</b> hits every 1s, ignores Shield and never fades.</li>
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
  if (S.phase !== 'pvp') refreshFinals();
  $('#hud').hidden = S.phase === 'title';
  if (S.phase === 'title') return renderTitle();
  renderHud();
  if (S.phase === 'shop') { if (S.skillPicks?.length) return renderSkillPick(); if (!S.style) return renderStylePick(); renderShop(); }
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
  const boost = SHOP_STYLES[S.style.id].boost || 0, odds = rarityWeights(S.day, boost);
  const nextAt = DAY_ODDS[oddsBracket(S.day) + 1]?.[0];
  const oddsHtml = Object.entries(odds).map(([r, p]) => `<span class="odd r-${r}" title="${RARITY[r].name}"><i style="width:${p}%"></i><b>${p}%</b> ${RARITY[r].name}</span>`).join('');
  offers.append(el('header', 'panel-h', `<h2>${SHOP_STYLES[S.style.id].icon} ${styleName(S.style)}</h2><span class="rank-chip" title="${styleText(S.style, S.day)}">${styleText(S.style, S.day)}</span>
    <span class="hint">Click to buy. Drop an item on its twin to level it up.${nextAt ? ` Rarer items from Day ${nextAt}.` : ''}</span>
    <div class="odds" aria-label="Rarity odds today">${oddsHtml}</div>`));
  const row = el('div', 'offer-row');
  S.shop.forEach((o, idx) => {
    const price = offerPrice(o);
    const c = el('button', 'offer' + (o.sold ? ' sold' : '') + (price > S.gold && !o.sold ? ' poor' : '') + (o.sale && !o.sold ? ' on-sale' : ''));
    c.type = 'button';
    const d = def(o.inst);
    c.classList.add('r-' + tierOf(o.inst));
    if (isShiny(o.inst)) c.classList.add('shiny');
    const extra = Object.entries(o.inst.extra || {}).map(([k, x]) => ` <b class="bonus-tag">+${x} ${STAT_NAME[k]}</b>`).join('');
    c.innerHTML = `<span class="o-ico">${d.icon}</span><span class="o-name">${d.name}</span><span class="o-cats">${(d.cats || []).join(' · ')}</span><span class="o-meta"><b class="rar">${RARITY[tierOf(o.inst)].name}</b>${o.inst.level > 1 ? ' <span class="upg">upgraded</span>' : ''}` +
      `${isShiny(o.inst) ? ` <b class="shiny-tag">Shiny ×${o.inst.multicast}</b>` : ''}` +
      `${o.inst.infusion ? ` <b class="inf-tag" title="${INFUSIONS[o.inst.infusion].name}">${INFUSIONS[o.inst.infusion].icon} Infused</b>` : ''}${extra}</span>`;
    const shape = el('span', 'shape');
    shape.style.gridTemplateColumns = `repeat(${o.inst.w}, 8px)`;
    for (let k = 0; k < o.inst.w * o.inst.h; k++) shape.append(el('i'));
    c.append(shape);
    c.onmouseenter = c.onfocus = () => showInspector({ inst: o.inst, from: 'shop' });
    if (o.frozen && !o.sold) c.classList.add('was-frozen');
    if (S.frozen && !o.sold) c.classList.add('frozen');
    const list = priceOf(o.inst), full = price < list ? ` <s>${list}g</s>` : '';
    c.append(el('span', 'price', o.sold ? 'Sold' : `${price}g${full}${o.sale ? ' <b class="sale-tag">½ price</b>' : ''}`));
    c.onclick = () => buy(idx);
    row.append(c);
  });
  offers.append(row);
  const rc = currentRerollCost();
  const reroll = el('button', 'btn ghost', `Reroll · ${rc ? rc + 'g' : 'free'}`); reroll.type = 'button';
  reroll.disabled = S.gold < rc;
  reroll.onclick = () => { const c = currentRerollCost(); if (S.gold < c) return; S.gold -= c; S.rerolls++; S.frozen = false; S.shop = rollShop(S.day, rng, S.style, [...S.board, ...S.bench]); render(); };
  const freeze = el('button', 'btn ghost freeze' + (S.frozen ? ' on' : ''), S.frozen ? '❄ Frozen' : 'Freeze shop'); freeze.type = 'button';
  freeze.setAttribute('aria-pressed', S.frozen);
  freeze.title = 'Keep the unsold offers for the next shop';
  freeze.onclick = () => { S.frozen = !S.frozen; render(); };
  const acts = el('div', 'offer-actions');
  acts.append(el('span', 'hint', S.frozen ? 'Unsold offers stay for the next shop. Rerolling unfreezes.' : ''), freeze, reroll);
  offers.append(acts);

  const boardP = el('section', 'panel board');
  boardP.append(el('header', 'panel-h', `<h2>Your loadout</h2><span class="hint">Click an item to pick it up, click again to place it (or drag). Dropping it on another item swaps them. R rotates, Esc puts it back.</span>`));
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

  const fight = el('button', 'btn fight', S.board.length ? `Find opponent <span>→</span>` : 'Place an item to fight'); fight.type = 'button';
  fight.disabled = !S.board.length;
  fight.onclick = advancePhase;

  left.append(offers, boardP, stash);
  right.append(el('section', 'panel inspector'), fight, skillsPanel(), historyPanel(), el('section', 'panel rules', rulesHtml()));
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
  ol.append(el('li', 'hist-head', '<span></span><span></span><span>Opponent · their rating</span><span>You</span>'));
  for (const h of S.history) ol.append(el('li', 'h-' + h.result, `<span>Day ${h.day}</span><b>${h.result}</b><span class="muted">${h.opponent} · ${pct(h.oppWr)}</span><span class="me">${h.myWr != null ? pct(h.myWr) : '–'}</span>`));
  p.append(ol);
  return p;
}

function rulesHtml() {
  return `<h3>How a fight works</h3>
  <ul>
    <li>A bar sweeps your ${COLS} columns, ${COL_TIME}s per column. Each time it reaches an item's left edge, the item gains 1 charge (the yellow bar). When it's full the item fires. Most need ${CHARGE_DEFAULT}, fast items fewer, heavy items more. Some items speed up, some charge others, and passive ones never charge.</li>
    <li><b class="k-burn">Burn</b> hits every ${BURN_TICK}s, then drops by 1. It only does ${Math.round(BURN_VS_SHIELD * 100)}% damage to Shield.</li>
    <li><b class="k-poison">Poison</b> hits every 1s, ignores Shield and never fades.</li>
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
    const outcomes = Object.values(INFUSIONS).map(f => `<li class="s-${f.stat}">${f.icon} ${STAT_NAME[f.stat]} worth ${Math.round(f.pct * 100)}% of the item's power</li>`).join('');
    p.innerHTML = `<div class="ins-h"><span class="ins-ico">${WILD_ESSENCE.icon}</span><div><h3>${WILD_ESSENCE.name}</h3><span class="chip">Essence</span></div></div>
      <p class="muted">Gives an item one random infusion (by its level), plus that tag. Replaces any infusion it has.</p>
      <ul class="effects">${outcomes}</ul>`;
    return;
  }
  if (target.mod) {
    const m = MODIFIERS[target.mod];
    p.innerHTML = `<div class="ins-h"><span class="ins-ico">${m.icon}</span><div><h3>${m.name}</h3><span class="chip">Modifier</span></div></div>
      <ul class="effects"><li class="s-${m.stat || 'multicast'}">${m.stat ? `Add <span class="cur">+${m.v}</span> ${STAT_NAME[m.stat]} to an item, and the ${TAG_NAME[m.tag]} tag` : `Add +${m.multicast} multicast to an item`}</li>
      <li>Permanent and stackable, with no limit per item. They carry over when you merge.</li></ul>`;
    return;
  }
  const inst = target.inst, d = def(inst);
  if (target.from === 'shop') FINALS.set(inst.uid, previewStats(S.board, S.skills || [], myMaxHp(), myCtx(), [inst]).get(inst.uid));
  const tags = (d.cats || []).map(c => `<span class="tag cat" title="${CATEGORIES[c]}">${c}</span>`).join('') +
    [...tagsOf(inst)].map(t => `<span class="tag t-${t}">${TAG_NAME[t]}</span>`).join('');
  let actions = '', mergeHint = '';
  if (target.from === 'owned') {
    const twins = [...S.board, ...S.bench].filter(o => canMerge(o, inst)).length;
    const top = inst.level >= maxLevel(inst), cur = RARITY[tierOf(inst)].name, next = RARITY[RARITIES[tierIndex(inst) + 1]]?.name;
    const up = top ? `<span class="chip">${tierOf(inst) === 'legendary' ? 'Legendary: top tier' : 'Max tier'}</span>` : '';
    mergeHint = top ? '' : `<p class="merge-hint">${twins
      ? `You own another ${cur} ${d.name}. Drop one onto the other to make it ${next}.`
      : `Merge with another ${cur} ${d.name} to upgrade it to ${next}.`}</p>`;
    const rot = inst.w !== inst.h ? `<button type="button" class="btn ghost" id="btn-rot">Rotate</button>` : '';
    actions = `<div class="ins-actions">${up}${rot}<button type="button" class="btn ghost" id="btn-sell">Sell · ${sellValue(inst)}g</button></div>`;
  }
  p.innerHTML = `<div class="ins-h r-${tierOf(inst)}"><span class="ins-ico">${d.icon}</span><div><h3>${d.name}</h3>
    <span class="chip rar">${RARITY[tierOf(inst)].name}</span>${inst.level > 1 ? `<span class="chip">from ${RARITY[d.rarity].name}</span>` : ''}<span class="chip">${inst.w}×${inst.h}</span>${inst.mods?.length ? `<span class="chip">Mods ${inst.mods.length}</span>` : ''}${isShiny(inst) ? '<span class="chip shiny-tag">Shiny</span>' : ''}</div></div>
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
  const o = S.shop[idx], price = offerPrice(o);
  if (o.sold || S.gold < price) return;
  if (S.bench.length >= BENCH_MAX) return toast('Bench is full. Place or sell something first.');
  S.bench.push({ ...o.inst, mods: [...(o.inst.mods || [])], extra: o.inst.extra && { ...o.inst.extra } }); // a copy, so later merges don't change the sold card
  S.gold -= price; o.sold = true; render();
}
function sellInst(inst) {
  if (S.hand === inst) S.hand = null;
  S.gold += sellValue(inst);
  S.board = S.board.filter(o => o !== inst); S.bench = S.bench.filter(o => o !== inst);
  if (S.selected === inst.uid) S.selected = null;
  render();
}
function toast(msg) { const t = el('div', 'toast', msg); document.body.append(t); setTimeout(() => t.remove(), 2200); }

// ===================== Drag & drop / pick up =====================
// Drag an item, or click it to pick it up and click again to put it down. Putting it on another
// item swaps them: the other item goes to your hand. Right-click or Esc puts a held item back.
let drag = null; // { inst, node, from: 'board'|'bench'|'hand', held, moved, w, h, gx, gy, drop }
let lastPtr = null;
function bindDrag(root) {
  root.querySelectorAll('.grid .item, .bench .item').forEach(node => {
    node.addEventListener('pointerdown', ev => startDrag(ev, node));
    node.addEventListener('mouseenter', () => { const i = findOwned(+node.dataset.uid); if (i && !drag) showInspector({ inst: i, from: 'owned' }); });
  });
  if (S.hand && !drag) resumeHand();
}
function listen(on) {
  const f = on ? 'addEventListener' : 'removeEventListener';
  window[f]('pointermove', onDragMove);
  window[f]('keydown', onDragKey);
  if (!on) {
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointerdown', onHeldDown, true);
    window.removeEventListener('contextmenu', onHeldContext, true);
  }
}
function startDrag(ev, node) {
  if (ev.button !== 0 || drag) return;
  ev.preventDefault();
  const inst = findOwned(+node.dataset.uid); if (!inst) return;
  const r = node.getBoundingClientRect();
  const unit = S.board.includes(inst) ? CELL : r.width / inst.w;
  drag = { inst, node, from: S.board.includes(inst) ? 'board' : 'bench', sx: ev.clientX, sy: ev.clientY,
    moved: false, held: false, w: inst.w, h: inst.h, drop: null,
    gx: Math.min(inst.w - 1, Math.floor((ev.clientX - r.left) / unit)),
    gy: Math.min(inst.h - 1, Math.floor((ev.clientY - r.top) / unit)) };
  listen(true);
  window.addEventListener('pointerup', onDragUp);
}
function holdMode() {
  drag.held = drag.moved = true;
  window.removeEventListener('pointerup', onDragUp);
  window.addEventListener('pointerdown', onHeldDown, true);
  window.addEventListener('contextmenu', onHeldContext, true);
}
function onDragUp(ev) {
  if (!drag) return;
  if (!drag.moved) {
    if (S.pending != null) { const inst = drag.inst; endDrag(); return clickItem(inst); }
    // Click without moving: pick it up. It follows the pointer until the next click.
    holdMode();
    drag.node?.classList.add('dragging'); makeGhost();
    lastPtr = [ev.clientX, ev.clientY]; updateDrop(ev.clientX, ev.clientY);
    S.selected = drag.inst.uid; showInspector({ inst: drag.inst, from: 'owned' });
    return;
  }
  finishDrop();
}
function onHeldDown(ev) {
  ev.preventDefault(); ev.stopPropagation();
  // Swallow the click this press makes (so placing an item can't also press a button underneath),
  // but only this one: if no click follows (the element under it was re-rendered), drop the guard.
  const swallow = e => { e.preventDefault(); e.stopPropagation(); };
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.addEventListener('pointerup', () => setTimeout(() => window.removeEventListener('click', swallow, true), 0), { capture: true, once: true });
  if (ev.button === 2) return cancelHeld();
  // Clicking Find opponent while holding something: put it away, then go fight.
  if (ev.target.closest?.('.btn.fight')) { cancelHeld(); return advancePhase(); }
  lastPtr = [ev.clientX, ev.clientY];
  updateDrop(ev.clientX, ev.clientY); finishDrop();
}
function onHeldContext(ev) { ev.preventDefault(); }
function endDrag() { listen(false); drag = null; $('#drag-layer').replaceChildren(); }
// Pick the item in S.hand back up after a re-render (e.g. right after a swap).
function resumeHand() {
  const inst = S.hand;
  drag = { inst, node: null, from: 'hand', moved: true, held: true, w: inst.w, h: inst.h, gx: 0, gy: 0, drop: null };
  listen(true); holdMode(); makeGhost();
  if (lastPtr) updateDrop(...lastPtr);
}
function cancelHeld() {
  const d = drag; endDrag();
  if (d?.from === 'hand') {
    if (S.bench.length < BENCH_MAX) { S.bench.push(d.inst); S.hand = null; }
    else toast('Bench is full. Put the item somewhere first.');
  }
  render();
}
function makeGhost() {
  const g = itemEl({ ...drag.inst, w: drag.w, h: drag.h, x: -1 });
  g.classList.add('ghost'); $('#drag-layer').replaceChildren(g); drag.ghost = g;
}
function onDragKey(ev) {
  if (!drag) return;
  if (ev.key === 'Escape' && drag.held) return cancelHeld();
  if (ev.key.toLowerCase() !== 'r') return;
  [drag.w, drag.h] = [drag.h, drag.w];
  [drag.gx, drag.gy] = [Math.min(drag.gy, drag.w - 1), Math.min(drag.gx, drag.h - 1)];
  if (drag.moved && lastPtr) { makeGhost(); updateDrop(...lastPtr); }
}
function onDragMove(ev) {
  if (!drag) return;
  lastPtr = [ev.clientX, ev.clientY];
  if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 6) return;
  if (!drag.moved) { drag.moved = true; drag.node?.classList.add('dragging'); makeGhost(); }
  updateDrop(ev.clientX, ev.clientY);
}
const overlapping = (board, x, y, w, h, ignore) =>
  board.filter(o => o !== ignore && x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h);
function updateDrop(px, py) {
  if (!drag.ghost) return;
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
  if (canPlace(S.board, x, y, drag.w, drag.h, drag.inst.uid)) { box(x, y, drag.w, drag.h, 'ok'); drag.drop = { kind: 'place', x, y }; return; }
  // Covering exactly one other item: swap it into your hand.
  const hit = overlapping(S.board, x, y, drag.w, drag.h, drag.inst);
  const rest = S.board.filter(o => o !== hit[0]);
  if (hit.length === 1 && canPlace(rest, x, y, drag.w, drag.h, drag.inst.uid)) {
    box(x, y, drag.w, drag.h, 'swap'); drag.drop = { kind: 'swap', x, y, target: hit[0] }; return;
  }
  box(x, y, drag.w, drag.h, 'bad');
}
function finishDrop() {
  const d = drag; endDrag();
  if (!d) return;
  const inst = d.inst, drop = d.drop;
  const remove = () => { S.board = S.board.filter(o => o !== inst); S.bench = S.bench.filter(o => o !== inst); if (S.hand === inst) S.hand = null; };
  if (!drop) return render(); // a held item from the hand is picked back up by render()
  if (drop.kind === 'sell') { if (S.hand === inst) { S.hand = null; S.bench.push(inst); } return sellInst(inst); }
  if (drop.kind === 'bench') {
    if (d.from !== 'bench') {
      if (S.bench.length >= BENCH_MAX) { toast('Bench is full.'); return render(); }
      remove(); inst.x = inst.y = -1; S.bench.push(inst);
    }
    return render();
  }
  if (drop.kind === 'merge') {
    S.skillPicks.push(tierOf(drop.target)); remove(); mergeInto(drop.target, inst);
    S.selected = drop.target.uid; toast(`${def(inst).name} upgraded to ${RARITY[tierOf(drop.target)].name}`);
    return render();
  }
  remove(); Object.assign(inst, { x: drop.x, y: drop.y, w: d.w, h: d.h }); S.board.push(inst);
  if (drop.kind === 'swap') {
    const other = drop.target;
    S.board = S.board.filter(o => o !== other);
    S.hand = other; S.selected = other.uid;
  }
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
  if (S.hand) { // put a held item away before fighting
    if (drag) endDrag();
    if (S.bench.length >= BENCH_MAX) { toast('Put the item in your hand somewhere first.'); return render(); }
    S.bench.push(S.hand); S.hand = null;
  }
  const opp = store.pick(S.day, rng, { runId: S.runId, faced: S.faced });
  S.opponent = opp; S.faced.add(opp.id);
  S.mySnapshot = snapshot(S.board);
  const hp = maxHp(S.day);
  S.myCtx = myCtx();
  S.battle = new Battle(new Fighter('You', S.board, myMaxHp(), S.skills, S.myCtx),
    new Fighter(opp.name, fromSnapshot(opp.items), hp, opp.skills || [], opp.ctx), onFx);
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
  ui = { sides: [], src: [] };
  for (const i of [1, 0]) { // opponent on top
    const F = B.f[i];
    const panel = el('section', 'panel fighter' + (i ? ' is-enemy' : ''));
    const head = el('header', 'f-head');
    const sub = i ? `<span class="opp-meta">${oppLabel(o)} · rated <b>${pct(o.wr)}</b></span>` : '';
    const arts = skillIcons(i ? o.skills : S.skills, i ? o.ctx : S.myCtx);
    head.innerHTML = `<div class="f-name"><h2>${i ? F.name : 'You'}</h2>${sub}${arts ? `<span class="f-arts">${arts}</span>` : ''}<span class="speed"></span></div>
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
    for (const inst of F.items) {
      const node = U.items.get(inst.uid); if (!node) continue;
      if (inst.cost) node.style.setProperty('--c', Math.min(1, inst.charge / inst.cost));
      const chips = statChips(B.computeStats(i, inst)), box = node.querySelector('.stc');
      if (box && box.dataset.v !== chips) { box.innerHTML = chips; box.dataset.v = chips; }
    }
  }
  ui.clock.innerHTML = `<span>${B.t.toFixed(1)}s</span>` + (B.storm ? `<b>Storm ${B.storm}/hit</b>` : `<small>storm at ${OVERTIME}s</small>`);
}
// Damage/Burn/Poison fly from the item to the enemy's health bar; Heal/Shield/Regen fly to yours.
const FLY = new Set(['damage', 'burn', 'poison', 'shield', 'heal', 'regen']);
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function popFloat(side, text, cls) {
  const box = $('.floats', ui.sides[side].head);
  if (box.childElementCount > 14) box.firstChild.remove();
  const f = el('span', 'float f-' + cls, text);
  f.style.left = (8 + Math.random() * 70) + '%';
  box.append(f); setTimeout(() => f.remove(), 1100);
}
function flyFloat(fromNode, side, text, cls) {
  const a = fromNode.getBoundingClientRect(), bar = $('.hp', ui.sides[side].head).getBoundingClientRect();
  const f = el('span', 'fly f-' + cls, text);
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
  const x1 = bar.left + bar.width * (0.25 + Math.random() * 0.5), y1 = bar.top + bar.height / 2;
  f.style.left = x0 + 'px'; f.style.top = y0 + 'px';
  $('#fx-layer').append(f);
  const dur = 620 / Math.sqrt(battleSpeed);
  f.animate([
    { transform: 'translate(-50%, -50%) scale(0.8)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.15 },
    { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(1)`, opacity: 1, offset: 0.85 },
    { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(0.7)`, opacity: 0 },
  ], { duration: dur, easing: 'cubic-bezier(.3,.1,.3,1)' }).onfinish = () => { f.remove(); popFloat(side, text, cls); };
}
function onFx(type, i, a, b) {
  if (!ui) return;
  const U = ui.sides[i];
  if (type === 'activate') {
    ui.src.push({ side: i, uid: a.uid });
    const n = U.items.get(a.uid); if (!n) return;
    n.classList.remove('pulse'); void n.offsetWidth; n.classList.add('pulse');
  } else if (type === 'activated') {
    const k = ui.src.findLastIndex(x => x.side === i && x.uid === a.uid);
    if (k >= 0) ui.src.length = k;
  } else if (type === 'buff') {
    const n = U.items.get(a.uid); if (!n) return;
    n.classList.remove('buffed'); void n.offsetWidth; n.classList.add('buffed');
  } else if (type === 'float') {
    const src = ui.src[ui.src.length - 1];
    const node = src && ui.sides[src.side].items.get(src.uid);
    if (node && FLY.has(b) && !reduceMotion() && document.querySelectorAll('.fly').length < 40) flyFloat(node, i, a, b);
    else popFloat(i, a, b);
  }
}
// ===================== Battle summary =====================
// Per side: fight totals, then every item: how often it fired, its numbers at the end of the fight
// (with all scaling, buffs and skills) and what it applied over the whole fight.
const REC_COLS = [['damage', 'Damage'], ['burn', 'Burn'], ['poison', 'Poison'], ['shield', 'Shield'], ['heal', 'Healed'], ['regen', 'Regen'], ['gold', 'Gold']];
function sideSummary(B, i, name) {
  const F = B.f[i], T = F.tot;
  const tot = [
    ['Hit damage dealt', T.hitDmg, 'damage'], ['Burn damage dealt', T.burnDmg, 'burn'], ['Poison damage dealt', T.poisonDmg, 'poison'],
    ['Shield gained', T.shield, 'shield'], ['Damage blocked', T.blocked, 'shield'], ['Healed', T.healed, 'heal'], ['Regen healed', T.regenHealed, 'regen'],
    ['Storm taken', T.stormTaken, 'storm'], ['Gold earned', F.goldEarned, 'gold'],
  ].filter(([, v]) => v > 0);
  const rows = [...F.items].sort((a, b) => b.rec.fires - a.rec.fires || a.x - b.x).map(inst => {
    const d = def(inst), fin = B.computeStats(i, inst), mc = (inst.multicast || 1) + inst.extraMc;
    const finals = CHIP_STATS.filter(k => fin[k] > 0).map(k => `<i class="c-${k}">${STAT_ICON[k]}${compact(fin[k])}</i>`).join(' ');
    const scaling = (d.scale || []).map(sc => `${sc.v[inst.level - 1]}× ${SCALE_FROM[sc.from]}`).join(', ');
    const applied = REC_COLS.map(([k]) => `<td class="num c-${k}">${inst.rec[k] ? compact(inst.rec[k]) : ''}</td>`).join('');
    return `<tr><td class="it"><span>${d.icon}</span> ${d.name}${mc > 1 ? ` <small class="mcx">×${mc}</small>` : ''}</td><td class="num">${inst.rec.fires || '–'}</td>
      <td class="fin">${finals || '<span class="muted">–</span>'}${scaling ? `<small class="muted">${scaling}</small>` : ''}</td>${applied}</tr>`;
  }).join('');
  return `<section class="sum-side"><h4>${name} <small class="muted">${Math.max(0, Math.round(F.hp))} / ${F.maxHp} HP left</small></h4>
    <ul class="sum-tot">${tot.map(([n, v, c]) => `<li class="c-${c}"><b>${compact(v)}</b> ${n}</li>`).join('') || '<li class="muted">Nothing happened.</li>'}</ul>
    <div class="sum-wrap"><table class="sum-table"><thead><tr><th>Item</th><th class="num">Fired</th><th>Numbers at the end</th>${REC_COLS.map(([, n]) => `<th class="num">${n}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div></section>`;
}
function battleSummary(B) {
  return `<details class="battle-summary"><summary>Battle summary · ${B.t.toFixed(1)}s</summary>
    ${sideSummary(B, 0, 'You')}${sideSummary(B, 1, B.f[1].name)}
    <p class="muted sum-note">Fired counts every activation, multicast and triggers included. Damage counts what hit the enemy's HP and Shield; Healed counts HP actually restored.</p></details>`;
}

function showResult(res) {
  if (S.phase !== 'pvp' || $('.modal')) return;
  const pay = fightPayout(res, false), gain = pay.total;
  const payLines = pay.lines.length > 1 ? `<ul class="pay">${pay.lines.map(([n, g]) => `<li><span>${n}</span><b>+${g}</b></li>`).join('')}</ul>` : '';
  const title = { win: 'Victory', loss: 'Defeat', draw: 'Draw' }[res];
  const cost = lifeLoss(S.day);
  const last = res === 'loss' && S.lives - cost <= 0;
  const sub = { win: 'You win the day.', draw: 'Both fell. Nobody scores.',
    loss: last ? (S.lastStandUsed ? 'That was your last life.' : `You lose ${cost} ${cost > 1 ? 'lives' : 'life'} and you're out. Time for a Last Stand.`)
               : `You lose ${cost} ${cost > 1 ? 'lives' : 'life'}.` }[res];
  const m = el('div', 'modal');
  m.innerHTML = `<div class="modal-card ${res}"><h2>${title}</h2><p>${sub}</p>
    <p class="rating">Rating your board against Day ${S.day}'s field…</p>
    ${last && S.lastStandUsed ? '' : `<p class="income">+${gain} gold next shop</p>${payLines}`}
    ${battleSummary(S.battle)}
    <button type="button" class="btn fight" id="cont">Continue <span>→</span></button></div>`;
  document.body.append(m);
  const cont = $('#cont', m);
  cont.onclick = () => { m.remove(); nextDay(res); };
  cont.focus();
  // Rate and save the player's board so it can be matched against future runs.
  clearTimeout(S.rateTimer);
  S.rateTimer = setTimeout(() => {
    if (S.myWr == null) rateMyBoard();
    const r = $('.rating', m);
    if (r) r.innerHTML = `Your board wins <b>${pct(S.myWr)}</b> against Day ${S.day}'s field. It's now in the opponent pool.`;
  }, 30);
}
function rateMyBoard() {
  const team = store.submit({ runId: S.runId, day: S.day, name: 'Player', items: S.mySnapshot, skills: [...S.skills], ctx: S.myCtx });
  S.myWr = team.wr;
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

