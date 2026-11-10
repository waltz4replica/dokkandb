// Automatic card guide: a short summary of what a card does and suggestions for team, events,
// slot and timing. Everything comes from the card's own text (passive, super attacks, active skill,
// transformations) and from which leaders in the database cover it. No opinions from other sites.
// Tests: tests/advice-check.mjs

import { cardEffects, EFFECT_LABEL } from './effects.js';
import { leaderClauses, coverage } from './teams.js';

const plain = (html = '') => html.replace(/<[^>]+>/g, ' ')
  .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/’/g, "'").replace(/\s+/g, ' ').trim();
const top = (o) => (o ? o.seza || o.eza || o.base || o.desc || '' : '');
const ord = (n) => `${n}º`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

const clauseCache = new WeakMap();
const clausesOf = (card) => {
  let c = clauseCache.get(card);
  if (!c) { c = leaderClauses(card); clauseCache.set(card, c); }
  return c;
};

// ---------- reading the passive ----------

function passiveText(c) {
  return [c.passive, ...(c.forms || []).map((f) => f.passive)].map(top).map(plain).filter(Boolean).join(' | ');
}

/** Ki and ATK/DEF the card always gets ("Basic effect(s) - Ki +3 - ATK & DEF 200% ▲"). */
function basics(p) {
  const i = p.indexOf('Basic effect');
  const head = i >= 0 ? p.slice(i, i + 160) : p.slice(0, 120);
  const ki = /(?<!allies' |ally's )\bKi \+(\d+)/.exec(head)?.[1];
  const stat = /(?<!allies' |ally's |enemies' |enemy's )\b(ATK & DEF|ATK|DEF) (\d+)% ▲/.exec(head);
  return { ki: ki ? +ki : 0, stat: stat ? { which: stat[1], pct: +stat[2] } : null };
}

/** What the card says about attack order / slot. */
function slotHints(p) {
  const hints = [];
  const re = /(?:As the|When the character is the|If the character is the) ((?:1st|2nd|3rd)(?: or (?:1st|2nd|3rd))?) (attacker in a turn|to obtain Ki Spheres in a turn)( - [^|]*?)?(?= (?:When|As the|If|For|Starting|Every|After|Per|Basic)\b|\||$)/gi;
  let m;
  while ((m = re.exec(p))) {
    const slots = m[1].match(/\d/g).map(Number);
    const what = /obtain/.test(m[2]) ? 'orbs' : 'attack';
    const fx = (m[3] || '').toLowerCase();
    const atk = /atk(?: & def)? \d+% ▲|additional|critical/.test(fx);
    const def = /def \d+% ▲|damage reduction|guard|evad/.test(fx);
    const kind = atk && def ? 'both' : atk ? 'atk' : def ? 'def' : 'other';
    hints.push({ slots, what, kind });
  }
  return hints;
}

const turnOf = (s) => +(/(\d+)(?:st|nd|rd|th) turn/.exec(s)?.[1] || 0);

function translateCondition(s) {
  const t = plain(s);
  const turn = /starting from the (\d+)(?:st|nd|rd|th) turn from (?:the )?(start of battle|character's entry turn)/i.exec(t);
  const hp = /when HP is (\d+)% or (less|more)/i.exec(t);
  const parts = [];
  if (turn) parts.push(`a partir del turno ${turn[1]} ${/entry/.test(turn[2]) ? 'desde que entra en combate' : 'del combate'}`);
  if (hp) parts.push(`cuando su vida está ${hp[2] === 'less' ? 'en el' : 'por encima del'} ${hp[1]}%${hp[2] === 'less' ? ' o menos' : ''}`);
  if (/chance/i.test(t) && !parts.length) parts.push('con cierta probabilidad');
  if (/once only/i.test(t)) parts.push('(una vez)');
  return parts.length ? parts.join(' ') : '';
}

// ---------- main ----------

const ROLES = {
  atk: 'Atacante',
  def: 'Tanque (aguanta golpes)',
  sup: 'Apoyo',
  mix: 'Todoterreno (ataca y aguanta)',
};

/**
 * @param c card
 * @param cards all cards (to find the leaders that cover it)
 * @param opts.tier tier-list score 0-1 or null
 */
export function cardAdvice(c, cards, opts = {}) {
  const { fx, orbs } = cardEffects(c);
  const has = (id) => fx.has(id);
  const p = passiveText(c);
  const b = basics(p);

  // Role
  const att = ['atk-stack', 'extra', 'crit', 'aoe', 'eff-all'].filter(has);
  const def = ['def-stack', 'dmg-red', 'evade', 'guard', 'counter', 'heal'].filter(has);
  const sup = ['support', 'orbs', 'enemy-atk', 'enemy-def', 'stun', 'seal'].filter(has);
  const allyBuff = /All allies'|Category allies'|Class allies'|Type allies'/.test(p);
  const score = { atk: att.length, def: def.length, sup: sup.length + (allyBuff ? 1 : 0) };
  let role = Object.entries(score).sort((x, y) => y[1] - x[1])[0][0];
  if (score.atk >= 2 && score.def >= 2 && Math.abs(score.atk - score.def) <= 1) role = 'mix';

  // Build-up
  const builds = [];
  if (/for every attack (?:received|evaded)|every time the character receives|after receiving/i.test(p)) builds.push('con cada ataque que recibe');
  if (/for every (?:attack|Super Attack) performed/i.test(p)) builds.push('con cada ataque que hace');
  if (/for every (?:\w+ )?Ki Sphere obtained/i.test(p)) builds.push('con cada orbe que recoge');
  if (/for every turn passed/i.test(p)) builds.push('con cada turno que pasa');
  const stacks = has('atk-stack') || has('def-stack');
  const needsAllies = /Category ally (?:attacking )?in the same turn|ally attacking in the same turn/i.test(p);
  const hpDep = /when HP is \d+% or (?:less|more)|the more HP remaining|the less HP remaining/i.test(p);
  const highKi = +(/with (\d+) or more Ki/i.exec(p)?.[1] || 0);

  // ----- summary -----
  const summary = [];
  const main = { atk: att, def, sup, mix: [...att.slice(0, 2), ...def.slice(0, 2)] }[role].map((id) => lower(EFFECT_LABEL[id]));
  if (main.length) summary.push(`Destaca por: ${list(main.slice(0, 4))}.`);
  if (b.ki || b.stat) {
    const bits = [];
    if (b.ki) bits.push(`Ki +${b.ki}`);
    if (b.stat) bits.push(`${b.stat.which} +${b.stat.pct}%`);
    summary.push(`Siempre tiene ${list(bits)} por su pasiva.`);
  }
  if (builds.length) summary.push(`Se hace más fuerte ${list(builds)}.`);
  if (orbs.size) summary.push(`Cambia orbes a ${list([...orbs].map((o) => (o === 'Rainbow' ? 'arcoíris' : o)))}.`);
  if (needsAllies) summary.push('Parte de su pasiva necesita aliados de su categoría o clase atacando en el mismo turno.');
  if (hpDep) summary.push('Parte de su pasiva depende de su vida (HP).');
  if (has('transform')) summary.push('Se transforma durante el combate (ver «Cuándo usarla»).');

  // ----- teams: leaders that cover it -----
  const groups = new Map();
  for (const L of cards) {
    if (L.rarity === 'SSR') continue;
    const cl = clausesOf(L);
    if (!cl.length) continue;
    const cov = coverage(L, c, cl);
    if (!cov.covered || cov.pct < 120) continue;
    const named = cl.filter((x) => !x.extra).flatMap((x) => x.categories).filter((k) => c.categories.includes(k));
    const key = named[0] ? `«${named[0]}»` : cl.some((x) => x.types.includes(c.type)) ? `Tipo ${c.type}` : cl.some((x) => x.cls === c.cls) ? `Clase ${c.cls}` : 'Cualquier equipo';
    const g = groups.get(key);
    if (!g || cov.pct > g.pct || (cov.pct === g.pct && L.rarity === 'LR' && g.leader.rarity !== 'LR')) groups.set(key, { group: key, leader: L, pct: cov.pct, ki: cov.ki });
  }
  const teams = [...groups.values()].sort((x, y) => y.pct - x.pct).slice(0, 3);
  const ownLead = Math.max(0, ...clausesOf(c).filter((x) => !x.extra && (x.categories.length || x.types.length || x.all)).map((x) => x.pct));

  // ----- events -----
  const events = [];
  const ev = (title, why) => { if (!events.some((e) => e.title === title)) events.push({ title, why }); };
  if (stacks || builds.length) ev('Zona Roja y Supreme Magnificent Battle', 'son combates largos y esta carta gana fuerza con los turnos');
  if (def.length >= 2) ev('Jefes que pegan muy fuerte (Zona Roja, Batallas Z extremas)', `aguanta bien: ${list(def.slice(0, 3).map((id) => lower(EFFECT_LABEL[id])))}`);
  if (has('stun') || has('seal')) ev('Jefes con súper ataques peligrosos', has('stun') && has('seal') ? 'puede aturdirlos y sellar sus súper ataques' : has('stun') ? 'puede aturdirlos' : 'puede sellar sus súper ataques');
  if (has('aoe')) ev('Fases con varios enemigos a la vez', 'su súper ataque golpea a todos los enemigos');
  if (has('enemy-def')) ev('Jefes con mucha defensa', 'baja la DEF del enemigo');
  if (has('heal')) ev('Eventos de muchas fases (Super Battle Road)', 'recupera vida y ahorra objetos');
  if (has('eff-all')) ev('Cualquier evento, sea cual sea el tipo del enemigo', 'es eficaz contra todos los tipos');
  if (att.length >= 2 && !stacks) ev('Batallas cortas o fases que hay que acabar rápido', 'pega fuerte desde el principio');
  if (!events.length) ev('Super Battle Road y misiones de su categoría', 'sirve para cumplir condiciones de categoría o tipo');
  events.splice(3);

  // ----- slot -----
  const hints = slotHints(p);
  const slot = [];
  const name = (s) => `Slot ${s.join(' o ')}`;
  for (const h of hints) {
    const why = h.what === 'orbs' ? `si es el ${h.slots.map(ord).join(' o ')} en recoger orbes` : `si es el ${h.slots.map(ord).join(' o ')} en atacar`;
    const gain = { both: 'gana ataque y defensa', def: 'gana defensa', atk: 'gana ataque' }[h.kind] || 'gana efectos extra';
    slot.push(`${name(h.slots)}: ${gain} ${why}.`);
  }
  if (!hints.length) {
    if (/for every (?:\w+ )?Ki Sphere obtained/i.test(p) || highKi >= 18) slot.push(`Slot 1: recoge orbes antes que nadie${highKi >= 18 ? ` y necesita ${highKi} de Ki o más` : ''}.`);
    else slot.push('Cualquier slot: su pasiva no depende de la posición.');
  }
  if (needsAllies) slot.push('Ponla en la misma rotación que cartas de sus categorías para activar los extras de «en el mismo turno».');
  if (stacks || builds.length) slot.push('Mejor en una rotación (2 cartas que se turnan) que de flotante: sale más veces y acumula más.');

  // ----- timing -----
  const timing = [];
  const entry = [...p.matchAll(/For (\d+) turns? from the character's entry turn/gi)].map((m) => +m[1]);
  const bigEntry = entry.filter((n) => n >= 2);
  if (bigEntry.length) timing.push(`Muy fuerte en sus primeros ${Math.max(...bigEntry)} turnos desde que entra en combate: no la guardes para el final.`);
  const later = [...p.matchAll(/Starting from the (\d+)(?:st|nd|rd|th) turn from (?:the )?(character's entry turn|start of battle)/gi)].map((m) => ({ n: +m[1], entry: /entry/.test(m[2]) }));
  if (later.length) {
    const first = later.sort((x, y) => x.n - y.n)[0];
    timing.push(`Gana efectos extra a partir del turno ${first.n} ${first.entry ? 'desde que entra en combate' : 'del combate'}${later.length > 1 ? ` (y más en el turno ${later[later.length - 1].n})` : ''}.`);
  }
  if (c.active) {
    const cond = translateCondition(c.active.condition || '');
    timing.push(`Habilidad activa «${c.active.name || ''}»${cond ? `: ${cond}` : ''}.`);
  }
  for (const f of c.forms || []) {
    if (!f.condition) continue;
    const cond = translateCondition(f.condition);
    const swap = /exchange/i.test(`${f.how || ''} ${f.condition}`);
    timing.push(`${swap ? `Se intercambia con ${f.name || 'otra carta'}` : `Se transforma en ${f.name || 'otra forma'}`}${cond ? ` ${cond}` : ''}.`);
  }
  const exch = /([^|.]{0,80})- Exchanges with ([^|.]+)/i.exec(p);
  if (exch && !(c.forms || []).some((f) => /exchange/i.test(`${f.how || ''} ${f.condition || ''}`))) {
    const cond = translateCondition(exch[1]);
    timing.push(`Se intercambia con ${exch[2].trim()}${cond ? ` ${cond}` : ''}.`);
  }
  if (stacks && !bigEntry.length) timing.push('Rinde más cuanto más dure el combate.');
  if (!timing.length) timing.push('Rinde igual durante todo el combate.');

  return { role: ROLES[role], summary, teams, ownLead, events, slot, timing, tier: opts.tier ?? null };
}
