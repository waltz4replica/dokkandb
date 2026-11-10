// Automatic card guide: a short summary of what a card does and suggestions for team, events,
// slot and timing. Everything comes from the card's own text (passive, super attacks, active skill,
// transformations) and from which leaders in the database cover it. No opinions from other sites.
// The base card and each transformation are read separately, so a form's effects are never
// presented as if the card always had them.
// Tests: tests/advice-check.mjs

import { cardEffects, EFFECT_LABEL, passiveSections } from './effects.js';
import { leaderClauses, coverage } from './teams.js';

const plain = (html = '') => html.replace(/<[^>]+>/g, ' ')
  .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/’/g, "'").replace(/\s+/g, ' ').trim();
const top = (o) => (o ? o.seza || o.eza || o.base || o.desc || '' : '');
const ord = (n) => `${n}ª`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

const clauseCache = new WeakMap();
const clausesOf = (card) => {
  let c = clauseCache.get(card);
  if (!c) { c = leaderClauses(card); clauseCache.set(card, c); }
  return c;
};

// ---------- reading the passive ----------

const STAT_NAMES = { atk: 'ATK', def: 'DEF', dr: 'reducción de daño', ev: 'esquiva' };
const statNames = (keys) => list(keys.map((k) => STAT_NAMES[k]));
const clean = (l) => l.replace(/\b(?:permanente|\d+ vez)\s*/g, '').trim();
// Lines about allies or enemies ("All allies' ATK", "Extreme Class enemies' DEF"); "evading enemy's attack" is still the card's own.
const othersLine = (l) => /(?:enem(?:y|ies)|all(?:y|ies))'?s? (?:ATK|DEF|Ki|chance)\b|\ball (?:enemies|allies)\b|allies'|ally's/i.test(l);

// What makes a passive section repeat, in Spanish ("cada vez que recibe un ataque").
const ACTIONS = [
  [/for every attack received or evaded|for every attack evaded or received/i, 'cada vez que recibe o esquiva un ataque'],
  [/for every attack received|after receiving an attack\b(?! from)|every time the character receives an attack|when receiving an attack\b/i, 'cada vez que recibe un ataque'],
  [/for every attack evaded|after evading an attack\b/i, 'cada vez que esquiva un ataque'],
  [/for every super attack performed|after performing a super attack\b/i, 'cada súper ataque que hace'],
  [/for every attack performed|after performing an attack\b/i, 'cada ataque que hace'],
  [/for every (?:\w+ )?ki sphere obtained/i, 'cada orbe que recoge'],
  [/after delivering a final blow/i, 'cada enemigo que derrota'],
  [/whenever guard is activated/i, 'cada vez que se pone en guardia'],
  [/for every super attack the enemy launches/i, 'cada súper ataque enemigo que recibe'],
];
const actionOf = (s) => ACTIONS.find(([re]) => re.test(s))?.[1] || '';
// "cada vez que…" reads on its own; "cada súper ataque que hace" needs "con"/"por" in front.
const withAction = (what, prep = 'con') => (/^cada vez/.test(what) ? what : `${prep} ${what}`);
// "When receiving an attack - DEF 200%" lasts only for that attack; it builds up only when marked permanent.
const repeats = (head, line) => /permanente/.test(line) && (actionOf(head) || /at the start of each turn|for every (?:\d+ )?turns? passed/i.test(head));

/** "ATK & DEF 60% ▼ (no more than -300%)" → [{ keys, pct, dir, cap, every, action }] */
function statParts(line) {
  const out = [];
  if (othersLine(line)) return out;
  for (const part of clean(line).split(/ and (?=[A-Z])/)) {
    const m = /^(.*?)(\d+)% (▲|▼)(.*)$/.exec(part);
    if (!m) continue;
    const label = m[1];
    if (/chance of (?:ATK|DEF)/i.test(label)) continue; // "Great chance of ATK & DEF 100% ▲" is a gamble, not a fixed boost
    const keys = [];
    if (/\bATK\b/.test(label)) keys.push('atk');
    if (/\bDEF\b/.test(label)) keys.push('def');
    if (/damage reduction/i.test(label)) keys.push('dr');
    if (/evading/i.test(label)) keys.push('ev');
    if (!keys.length || /for \d+ turn/i.test(m[4])) continue;
    const cap = /\((?:up to|no more than) [-+]?(\d+)%\)/i.exec(m[4]);
    const every = /for every (\d+ )?turns? passed/i.exec(m[4]);
    out.push({ keys, pct: +m[2], dir: m[3] === '▲' ? 1 : -1, cap: cap ? +cap[1] : 0, every: every ? +(every[1] || 1) : 0, action: actionOf(m[4]) });
  }
  return out;
}

/** What one passive (base card or one form) says. */
function readPassive(sections) {
  const r = {
    ki: 0, base: {}, entrance: {}, builds: new Set(), entry: [], later: [], needsAllies: false, hpDep: false, vsMany: 0,
    perTurn: {}, perAction: [], extras: [], text: sections.map((s) => `${s.head} - ${s.lines.join(' - ')}`).join(' | '),
  };
  for (const { head, lines } of sections) {
    const isBasic = /^basic effect/i.test(head);
    const turnHead = /for every (\d+ )?turns? passed/i.exec(head);
    const startEach = /at the start of each turn/i.test(head);
    const headAction = actionOf(head);
    for (const l of lines) {
      if (isBasic && !othersLine(l)) { const k = /^(?:\S+ )?Ki \+(\d+)/.exec(clean(l)); if (k && !r.ki) r.ki = +k[1]; }
      if (repeats(head, l) && !othersLine(l) && (/▲/.test(l.split('▼')[0]) || /\bKi \+\d/.test(l))) {
        r.builds.add(headAction || (startEach ? 'cada turno' : turnHead ? 'cada turno' : ''));
      }
      for (const s of statParts(l)) {
        if (s.every || turnHead || startEach) {
          const every = s.every || (turnHead ? +(turnHead[1] || 1) : 1);
          for (const k of s.keys) if (!r.perTurn[k]) r.perTurn[k] = { pct: s.pct * s.dir, every, cap: s.cap, now: startEach && !s.every };
          if (s.every && s.dir > 0) r.builds.add('cada turno');
          continue;
        }
        if (isBasic) { if (s.dir > 0) for (const k of s.keys) if (r.base[k] == null) r.base[k] = s.pct; continue; }
        // A permanent boost from the entrance animation is where the stat starts ("1 vez permanente ATK & DEF 999% ▲").
        if (/entrance animation/i.test(head) && /permanente/.test(l) && s.dir > 0) {
          for (const k of s.keys) r.entrance[k] = (r.entrance[k] || 0) + s.pct;
          if (/\bwhen\b/i.test(head)) r.entranceCond = true;
          continue;
        }
        const what = s.action || headAction;
        if (what && /permanente/.test(l)) { r.perAction.push({ keys: s.keys, pct: s.pct, dir: s.dir, cap: s.cap, what }); continue; }
        const ki = /^when (attacking|receiving an attack) with (\d+) or more Ki/i.exec(head);
        if (ki && s.dir > 0) r.extras.push({ attacking: /attacking/i.test(ki[1]), ki: +ki[2], pct: s.pct, keys: s.keys });
      }
    }
    const e = /For (\d+) turns?(?:\(s\))? from (?:the )?(character's entry turn|start of battle)/i.exec(head);
    if (e && +e[1] >= 2) r.entry.push({ n: +e[1], start: /battle/.test(e[2]) });
    const s = /Starting from the (\d+)(?:st|nd|rd|th) turn from (?:the )?(character's entry turn|start of battle)/i.exec(head);
    if (s && !lines.every((x) => /fuses|transforms|exchanges/i.test(x))) r.later.push({ n: +s[1], entry: /entry/.test(s[2]) });
    if (/attacking in the same turn/i.test(head)) r.needsAllies = true;
    if (/when HP is \d+% or (?:less|more)|the (?:more|less) HP (?:remaining|the character has)/i.test(head)) r.hpDep = true;
    const many = /when facing (\d+) or more enemies/i.exec(head);
    if (many && lines.some((l) => !othersLine(l) && /▲/.test(l))) r.vsMany = +many[1];
  }
  r.builds.delete('');
  r.decayTurn = Object.values(r.perTurn).some((t) => t.pct < 0);
  r.earlyTurns = r.entry.length ? Math.max(...r.entry.map((x) => x.n)) : 0;
  return r;
}

/** Slot hints: "As the 1st attacker in a turn - ...". */
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
    hints.push({ slots, what, kind: atk && def ? 'both' : atk ? 'atk' : def ? 'def' : 'other' });
  }
  return hints;
}

/** "Can be activated when HP is 60% or less, or starting from the 3rd turn…" → "cuando le queda 60% de vida o menos, o a partir del turno 3…" */
function translateCondition(s) {
  const t = plain(s);
  const pieces = t.replace(/\(once only\)|once only/gi, '').split(/,? or (?=when|starting|if|after|with)/i);
  const out = [];
  for (const piece of pieces) {
    const parts = [];
    const hp = /HP is (\d+)% or (less|more)/i.exec(piece);
    if (hp) parts.push(hp[2] === 'less' ? `cuando le queda ${hp[1]}% de vida o menos` : `mientras le quede ${hp[1]}% de vida o más`);
    if (/attacking in the same turn/i.test(piece)) {
      const names = [...piece.matchAll(/whose names? includes? "([^"]+)"/gi)].map((m) => `«${m[1]}»`);
      const more = /"([^"]+)"(?: or "([^"]+)")?/.exec(piece.split(/whose name/i)[1] || '');
      if (names.length || /whose name/i.test(piece)) {
        const all = more ? [more[1], more[2]].filter(Boolean).map((x) => `«${x}»`) : names;
        parts.push(`si ataca en el mismo turno que ${/another/i.test(piece) ? 'otro aliado' : 'un aliado'} llamado ${all.join(' o ')}`);
      } else {
        const cat = /(?:(\d+)|another) "([^"]+)" (?:Category|Class|Type) all/i.exec(piece);
        parts.push(cat ? `si ataca en el mismo turno que ${cat[1] ? `${cat[1]} aliados` : 'otro aliado'} de «${cat[2]}»` : 'si ataca en el mismo turno que ciertos aliados');
      }
    }
    if (/facing (\d+) or more enemies/i.test(piece)) parts.push(`contra ${/facing (\d+)/i.exec(piece)[1]} o más enemigos`);
    const turn = /starting from the (\d+)(?:st|nd|rd|th) turn from (?:the )?(start of battle|character's entry turn)/i.exec(piece);
    if (turn) parts.push(`a partir del turno ${turn[1]} ${/entry/.test(turn[2]) ? 'desde que entra en combate' : 'del combate'}`);
    if (/receiv\w* (\d+) or more attacks/i.test(piece)) parts.push(`tras recibir ${/receiv\w* (\d+)/i.exec(piece)[1]} ataques o más`);
    if (/KO'd/i.test(piece)) parts.push('cuando la derrotan');
    const team = /all allies are "([^"]+)"/i.exec(piece);
    if (team) parts.push(`si todo el equipo es de «${team[1]}»`);
    const foe = /there is an? "([^"]+)"(?: or "([^"]+)")? Category enemy/i.exec(piece);
    if (foe) parts.push(`contra un enemigo de ${[foe[1], foe[2]].filter(Boolean).map((x) => `«${x}»`).join(' o ')}`);
    const times = /(?:attacking|attacks?) (\d+) or more times|performs? (\d+) or more (Super Attacks|attacks)/i.exec(piece);
    if (times) parts.push(times[3] && /super/i.test(times[3]) ? `tras hacer ${times[2]} súper ataques o más` : `tras atacar ${times[1] || times[2]} veces o más`);
    if (parts.length) { const p = parts.join(' y '); if (!out.includes(p)) out.push(p); }
  }
  let txt = out.join(', o ');
  if (/chance/i.test(t)) txt = txt ? `${txt} (con cierta probabilidad)` : 'con cierta probabilidad';
  if (/once only/i.test(t)) txt = `${txt}${txt ? ', ' : ''}una sola vez`;
  return txt;
}

// ---------- stat math (how ATK/DEF/… change during the battle) ----------

const fmtPct = (key, v) => (key === 'atk' || key === 'def' ? `${v >= 0 ? '+' : '−'}${Math.abs(v)}%` : `${Math.max(0, v)}%`);
const fmtBase = (base, keys) => {
  const v = keys.map((k) => base[k] || 0);
  return v.every((x) => x === v[0]) ? fmtPct(keys[0], v[0]) : '';
};

function mathFor(r, form) {
  const out = [];
  const where = form ? ` — forma «${form}»` : '';
  // Same change for several stats → one table ("ATK y DEF").
  const groups = new Map();
  const start = (k) => (r.base[k] || 0) + (r.entrance[k] || 0);
  for (const [k, t] of Object.entries(r.perTurn)) {
    const id = `${start(k)}|${t.pct}|${t.every}|${t.cap}|${t.now}`;
    groups.set(id, [...(groups.get(id) || []), k]);
  }
  for (const [id, keys] of groups) {
    const [b, pct, every, cap, now] = id.split('|').map((x, i) => (i === 4 ? x === 'true' : +x));
    const name = statNames(keys);
    const k0 = keys[0];
    const step = Math.abs(pct);
    const steps = cap ? Math.ceil(cap / step) : 0;
    const sign = pct < 0 ? '−' : '+';
    const valueAt = (t) => {
      const n = Math.floor((t - (now ? 0 : 1)) / every);
      return { n, v: b + Math.sign(pct) * (cap ? Math.min(cap, step * n) : step * n) };
    };
    const lastTurn = cap ? steps * every + (now ? 0 : 1) : 6;
    const rows = [];
    for (let t = 1; t <= Math.min(lastTurn, 12); t++) {
      const { n, v } = valueAt(t);
      const capped = cap && step * n > cap;
      const formula = n === 0 ? (t === 1 ? 'inicio' : 'aún sin cambios') : capped ? `${b} ${sign} ${cap} (tope)` : `${b} ${sign} ${step} × ${n}`;
      rows.push([t === lastTurn && cap ? `${t} en adelante` : `${t}`, fmtPct(k0, v), formula]);
    }
    const goes = pct < 0 ? 'baja' : 'sube';
    const cadence = every > 1 ? `cada ${every} turnos` : 'cada turno';
    const end = b + Math.sign(pct) * cap;
    const why = [];
    const fromBasic = r.base[k0] || 0, fromEntrance = r.entrance[k0] || 0;
    const src = [fromBasic && `${fmtPct(k0, fromBasic)} que le da su pasiva siempre («Basic effect»)`, fromEntrance && `${fmtPct(k0, fromEntrance)} que gana al entrar en combate («Entrance Animation»)`].filter(Boolean);
    why.push(b ? `Empieza con ${fmtPct(k0, b)} de ${name}${src.length > 1 ? `: ${src.join(' más ')}` : `: es el ${src[0]}`}.` : `No tiene ${name} fijo por su pasiva: empieza en ${fmtPct(k0, 0)}.`);
    why.push(now
      ? `Al principio de cada turno ${goes} ${step}%, también en el turno 1 («at the start of each turn»).`
      : every > 1
        ? `${upper(goes)} ${step}% por cada ${every} turnos que pasan («for every ${every} turns passed»): el primer cambio llega en el turno ${every + 1}, cuando ya han pasado ${every}.`
        : `${upper(goes)} ${step}% por cada turno que pasa («for every turn passed»). En el turno 1 todavía no ha pasado ninguno, por eso el primer cambio llega en el turno 2.`);
    if (cap) {
      const exact = cap % step === 0;
      why.push(`Como mucho puede ${pct < 0 ? 'perder' : 'ganar'} ${cap}% («${pct < 0 ? 'no more than −' : 'up to '}${cap}%»). ${cap} ÷ ${step} = ${num(cap / step)}${exact ? '' : `, o sea, ${steps} cambios (el último ya no es completo)`}: en el turno ${lastTurn} llega a ${fmtPct(k0, end)} (${b} ${sign} ${cap}) y se queda así el resto del combate.`);
    } else why.push('No tiene límite.');
    const short = `${upper(name)}${form ? ` (forma «${form}»)` : ''}: ${rows[0][1]} en el turno 1; ${goes} ${step}% ${cadence}${cap ? ` hasta quedarse en ${rows[rows.length - 1][1]} desde el turno ${lastTurn}` : ''}.`;
    out.push({ title: `${upper(name)} turno a turno${where}`, why: why.join(' '), rows, notes: [], keys, kind: 'turn', dir: Math.sign(pct), short, form });
  }

  // Same change per action for several stats → one entry.
  const actions = new Map();
  for (const a of r.perAction) {
    const id = `${a.what}|${a.pct}|${a.dir}|${a.cap}`;
    if (!actions.has(id)) actions.set(id, { ...a, keys: [] });
    for (const k of a.keys) if (!actions.get(id).keys.includes(k)) actions.get(id).keys.push(k);
  }
  for (const a of actions.values()) {
    const name = statNames(a.keys);
    const b = fmtBase(r.base, a.keys);
    const bv = r.base[a.keys[0]] || 0;
    const why = [];
    if (a.dir > 0) {
      why.push(`${upper(withAction(a.what, 'por'))} gana ${a.pct}% de ${name} y no lo pierde en el resto del combate.`);
      if (a.cap) {
        const n = Math.ceil(a.cap / a.pct);
        why.push(`Como mucho gana ${a.cap}% («up to ${a.cap}%»): ${a.cap} ÷ ${a.pct} = ${num(a.cap / a.pct)}, así que llega al tope ${n === 1 ? 'la primera vez' : `a la ${ord(n)} vez`}.`);
        if (b && bv) why.push(`Sumado al ${b} que tiene siempre, se queda en ${fmtPct(a.keys[0], bv + a.cap)} (${bv} + ${a.cap}).`);
      } else {
        why.push('No tiene límite.');
        if (b && bv) why.push(`Sobre su ${b} de siempre: tras 3 veces tendría ${fmtPct(a.keys[0], bv + 3 * a.pct)} y tras 5, ${fmtPct(a.keys[0], bv + 5 * a.pct)}.`);
      }
    } else {
      why.push(`${upper(withAction(a.what, 'por'))} pierde ${a.pct}% de ${name} para el resto del combate.`);
      if (a.cap) why.push(`Como mucho pierde ${a.cap}% («no more than −${a.cap}%»): ${a.cap} ÷ ${a.pct} = ${num(a.cap / a.pct)}, así que ${Math.ceil(a.cap / a.pct) === 1 ? 'la primera vez' : `a la ${ord(Math.ceil(a.cap / a.pct))} vez`} llega al mínimo.`);
    }
    out.push({ title: `${upper(name)} que ${a.dir > 0 ? 'gana' : 'pierde'} ${withAction(a.what, 'por')}${where}`, why: why.join(' '), rows: [], notes: [], keys: a.keys, kind: 'action', dir: a.dir, what: a.what, form });
  }

  // One-attack boosts from Ki ("When attacking with 12 or more Ki - ATK 300% ▲"), added to the turn table.
  if (out.length && r.extras.length) {
    const table = out.find((m) => m.kind === 'turn' && m.keys.includes('atk'));
    const val = (s) => parseInt(s.replace('−', '-'), 10);
    const sorted = [...r.extras].sort((x, y) => x.ki - y.ki);
    let prev = null;
    for (const x of sorted) {
      const name = statNames(x.keys);
      if (!x.attacking) { out[0].notes.push(`Al recibir un ataque teniendo ${x.ki} o más de Ki gana ${x.pct}% de ${name} solo para ese golpe (no se acumula).`); continue; }
      let n = `Al atacar con ${x.ki} o más de Ki gana ${x.pct}% de ${name} solo para ese ataque (no se acumula)`;
      if (prev && x.keys.includes('atk')) n += `; se suma al de ${prev.ki} de Ki, así que con ${x.ki} o más son +${prev.pct + x.pct}% de ATK en ese ataque`;
      else if (table && x.keys.includes('atk')) {
        const f = table.rows[0], l = table.rows[table.rows.length - 1];
        n += `. Junto con la tabla de ATK: turno 1 → ${f[1]} + ${x.pct}% = ${fmtPct('atk', val(f[1]) + x.pct)}; ${l[0].includes('adelante') ? `desde el turno ${parseInt(l[0], 10)}` : `turno ${l[0]}`} → ${l[1]} + ${x.pct}% = ${fmtPct('atk', val(l[1]) + x.pct)}`;
      }
      out[0].notes.push(`${n}.`);
      if (x.keys.includes('atk')) prev = x;
    }
  }
  return out;
}

/**
 * How the card's own ATK, DEF, damage reduction and evasion change during the battle, with the math.
 * [{ title, why, rows: [[turn, value, formula]], notes: [], keys, kind: 'turn'|'action', dir, short?, form }]
 */
export function statMath(c) {
  const all = passiveSections(c);
  const forms = [null, ...new Set(all.filter((s) => s.form).map((s) => s.form))];
  const out = forms.flatMap((f) => mathFor(readPassive(all.filter((s) => s.form === f)), f));
  if (out.length) out[out.length - 1].notes.push('Cómo se calcula: todos los % de la pasiva que estén activos a la vez se suman entre sí, y ese total se aplica sobre su ATK/DEF ya mejorado por el líder.');
  return out;
}

// ---------- main ----------

const ROLES = {
  atk: 'Atacante',
  def: 'Tanque (aguanta golpes)',
  sup: 'Apoyo',
  mix: 'Todoterreno (ataca y aguanta)',
};

// Short Spanish names for what an effect gives, used in "Lo que mejor hace".
const BEST = {
  'atk-stack': 'acumula ATK', aoe: 'ataca a todos los enemigos', extra: 'hace ataques adicionales', crit: 'da golpes críticos',
  'eff-all': 'es eficaz contra todos los tipos', 'def-stack': 'acumula DEF', 'dmg-red': 'reduce el daño que recibe', evade: 'esquiva',
  guard: 'se pone en guardia', counter: 'contraataca', heal: 'recupera vida', support: 'mejora a sus aliados',
  'enemy-atk': 'baja el ATK del enemigo', 'enemy-def': 'baja la DEF del enemigo', stun: 'aturde', seal: 'sella súper ataques', orbs: 'cambia orbes',
};
const best = (id) => BEST[id] || lower(EFFECT_LABEL[id]);

/**
 * @param c card
 * @param cards all cards (to find the leaders that cover it)
 * @param opts.tier tier-list score 0-1 or null
 */
export function cardAdvice(c, cards, opts = {}) {
  const { fx, orbs } = cardEffects(c);
  const baseFx = cardEffects({ ...c, forms: [] }).fx;
  const has = (id) => fx.has(id);
  const all = passiveSections(c);
  const B = readPassive(all.filter((s) => !s.form));
  const formNames = [...new Set(all.filter((s) => s.form).map((s) => s.form))];
  const F = formNames.map((name) => ({ name, r: readPassive(all.filter((s) => s.form === name)) }));
  const p = all.map((s) => `${s.head} - ${s.lines.join(' - ')}`).join(' | ');
  const math = statMath(c);
  const bMath = math.filter((m) => !m.form);

  // Role: support only counts the things that really help the team.
  const att = ['atk-stack', 'extra', 'crit', 'aoe', 'eff-all'].filter(has);
  const def = ['def-stack', 'dmg-red', 'evade', 'guard', 'counter', 'heal'].filter(has);
  const sup = ['orbs', 'enemy-atk', 'enemy-def', 'stun', 'seal', 'support'].filter(has);
  // Only boosts the team always gets count (conditional ones like "when 3 allies attack together" don't make it a support).
  const allyBuff = /^(?:All allies'|"[^"]+" Category allies'|\w+ Class allies'|\w+ Type allies')/m.test(all.filter((s) => !s.form && /^basic effect/i.test(s.head)).flatMap((s) => s.lines.map(clean)).join('\n'));
  const score = {
    atk: att.length,
    def: def.filter((id) => id !== 'heal').length + (has('heal') ? 0.5 : 0),
    sup: sup.filter((id) => id !== 'support').length * 0.5 + (allyBuff ? 1 : 0),
  };
  let role = Object.entries(score).sort((x, y) => y[1] - x[1])[0][0];
  if (score.atk >= 2 && score.def >= 2 && Math.abs(score.atk - score.def) <= 1) role = 'mix';

  const baseStacks = baseFx.has('atk-stack') || baseFx.has('def-stack');
  const growsBase = (baseStacks || B.builds.size > 0) && !B.decayTurn;
  const growsForm = F.some((f) => f.r.builds.size > 0 && !f.r.decayTurn) || (!baseStacks && (has('atk-stack') || has('def-stack')));
  const grows = growsBase || growsForm;
  // A card that keeps stacking isn't a "short battles" card just because it also has a boost for its first turns.
  const early = B.decayTurn || (B.earlyTurns > 0 && !growsBase);
  const highKi = +(/with (\d+) or more Ki/i.exec(B.text)?.[1] || 0);

  // ----- summary -----
  const summary = [];
  const main = { atk: att, def, sup, mix: [...att.slice(0, 2), ...def.slice(0, 2)] }[role];
  if (main.length) summary.push(`Lo que mejor hace: ${list(main.slice(0, 4).map(best))}.`);
  const fixed = [];
  if (B.ki) fixed.push(`Ki +${B.ki}`);
  const ad = ['atk', 'def'].filter((k) => B.base[k]);
  if (ad.length === 2 && B.base.atk === B.base.def) fixed.push(`+${B.base.atk}% de ATK y DEF`);
  else for (const k of ad) fixed.push(`+${B.base[k]}% de ${STAT_NAMES[k]}`);
  if (B.base.dr) fixed.push(`${B.base.dr}% de reducción de daño`);
  const ent = ['atk', 'def'].filter((k) => B.entrance[k]);
  const entTxt = ent.length === 2 && B.entrance.atk === B.entrance.def ? `+${B.entrance.atk}% de ATK y DEF` : list(ent.map((k) => `+${B.entrance[k]}% de ${STAT_NAMES[k]}`));
  if (B.decayTurn) {
    if (ent.length) fixed.push(`${entTxt} (de su animación de entrada)`);
    if (fixed.length) summary.push(`Empieza el combate con ${list(fixed)}, pero parte de eso baja con los turnos.`);
  } else {
    if (fixed.length) summary.push(`Su pasiva le da siempre ${list(fixed)}.`);
    if (ent.length) summary.push(`Al entrar en combate gana además ${entTxt} para el resto del combate${B.entranceCond ? ' (solo si se cumple la condición de su animación de entrada)' : ''}.`);
  }
  for (const m of bMath.filter((x) => x.kind === 'turn')) summary.push(m.short);
  if (B.builds.size) summary.push(`Se hace más fuerte ${list([...B.builds].map((w) => withAction(w)))}, y lo que gana le dura el resto del combate.`);
  for (const m of bMath.filter((x) => x.kind === 'action' && x.dir < 0)) summary.push(`Se debilita: ${withAction(m.what)} pierde ${statNames(m.keys)}.`);
  if (orbs.size) summary.push(`Cambia orbes a ${list([...orbs].map((o) => (o === 'Rainbow' ? 'arcoíris' : o)))}.`);
  if (B.vsMany) summary.push(`Se hace más fuerte cuando hay ${B.vsMany} o más enemigos.`);
  if (B.needsAllies) summary.push('Algunos extras solo se activan si ataca en el mismo turno que ciertos aliados.');
  if (B.hpDep) summary.push('Algunos efectos cambian según la vida que le quede.');
  for (const f of F) {
    const bits = [];
    if (f.r.builds.size) bits.push(`se hace más fuerte ${list([...f.r.builds].map((w) => withAction(w)))}`);
    if (f.r.decayTurn) bits.push('se debilita con los turnos');
    const swap = (c.forms || []).some((x) => x.name === f.name && /exchange/i.test(`${x.how || ''} ${x.condition || ''}`));
    summary.push(`${swap ? `Puede intercambiarse por «${f.name}»` : `Se transforma en «${f.name}»`}${bits.length ? `, que ${list(bits)}` : ''} (cuándo, en «Cuándo usarla»).`);
  }
  if (!summary.length) summary.push('Su pasiva es muy sencilla y no tiene efectos especiales: vale sobre todo por sus estadísticas y su súper ataque.');

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
  const SHORT = 'Combates cortos o fases que hay que acabar rápido';
  if (early) ev(SHORT, B.decayTurn ? 'es más fuerte en los primeros turnos y luego se debilita' : `sus mejores efectos duran solo ${B.earlyTurns} turnos`);
  if (grows) ev('Combates largos (Zona Roja, Supreme Magnificent Battle)', growsBase ? 'cuanto más dura el combate, más fuerte se hace' : 'tras transformarse se hace más fuerte con el tiempo');
  if (def.length >= 2) ev('Jefes que pegan muy fuerte', `aguanta bien porque ${list(def.slice(0, 3).map(best))}`);
  if (has('stun') || has('seal')) ev('Jefes con súper ataques peligrosos', has('stun') && has('seal') ? 'puede aturdirlos y sellar sus súper ataques' : has('stun') ? 'puede aturdirlos para que no ataquen' : 'puede sellar sus súper ataques');
  if (has('aoe')) ev('Fases con varios enemigos a la vez', 'su súper ataque golpea a todos los enemigos');
  else if (B.vsMany) ev('Fases con varios enemigos a la vez', `se hace más fuerte contra ${B.vsMany} o más enemigos`);
  if (has('enemy-def')) ev('Jefes con mucha defensa', 'baja la DEF del enemigo y así todo el equipo le hace más daño');
  if (has('heal')) ev('Eventos de muchas fases (Super Battle Road)', 'recupera vida, así gastas menos objetos');
  if (has('eff-all')) ev('Eventos con enemigos de cualquier tipo', 'sus ataques son eficaces contra todos los tipos');
  if (att.length >= 2 && !grows) ev(SHORT, 'pega fuerte desde el primer turno');
  if (!events.length) ev('Super Battle Road y misiones de su categoría', 'sirve para cumplir condiciones de categoría o tipo');
  events.splice(3);

  // ----- slot -----
  const hints = slotHints(p);
  const slot = [];
  for (const h of hints) {
    const gain = { both: 'gana ataque y defensa', def: 'gana defensa', atk: 'gana ataque' }[h.kind] || 'gana efectos extra';
    const pos = h.slots.map(ord).join(' o ');
    const line = `Slot ${h.slots.join(' o ')}: ${gain} cuando es la ${pos} ${h.what === 'orbs' ? 'en recoger orbes' : 'en atacar'} del turno.`;
    if (!slot.includes(line)) slot.push(line);
  }
  if (!hints.length) {
    if (/for every (?:\w+ )?Ki Sphere obtained/i.test(B.text)) slot.push('Slot 1: la primera en atacar recoge los orbes antes que nadie, y su pasiva gana con cada orbe.');
    else if (highKi >= 18) slot.push(`Slot 1: necesita ${highKi} de Ki o más para su mejor efecto, y la primera en atacar es la que más orbes recoge.`);
    else slot.push('Cualquier posición: su pasiva no premia atacar en un orden concreto.');
  }
  if (B.needsAllies) slot.push('Ponla en la misma rotación que los aliados que le activan los extras de «en el mismo turno».');
  if (grows) slot.push('Mejor en la rotación (las 2 cartas que salen turno sí, turno no) que como flotante: saldrá más veces y acumulará más.');

  // ----- timing -----
  const timing = [];
  if (B.earlyTurns && !early) {
    const fromStart = B.entry.filter((x) => x.n === B.earlyTurns).every((x) => x.start);
    timing.push(`Tiene un extra durante sus ${B.earlyTurns} primeros turnos ${fromStart ? 'del combate' : 'desde que entra'}, aparte de lo que acumula.`);
  } else if (B.earlyTurns) {
    const fromStart = B.entry.filter((x) => x.n === B.earlyTurns).every((x) => x.start);
    timing.push(fromStart
      ? `Sus mejores efectos duran los ${B.earlyTurns} primeros turnos del combate: sácala en la primera rotación.`
      : `Sus mejores efectos duran ${B.earlyTurns} turnos desde que entra en combate: no la dejes para el final.`);
  }
  if (B.decayTurn) timing.push('Pierde fuerza cada turno: aprovéchala sobre todo al principio.');
  if (B.later.length) {
    const first = [...B.later].sort((x, y) => x.n - y.n)[0];
    timing.push(`Gana efectos extra a partir del turno ${first.n} ${first.entry ? 'desde que entra en combate' : 'del combate'}.`);
  }
  if (c.active) {
    const cond = translateCondition(c.active.condition || '');
    timing.push(`Habilidad activa «${c.active.name || ''}»: ${cond ? `se puede usar ${cond}` : 'mira su condición en la carta'}.`);
  }
  for (const f of c.forms || []) {
    if (!f.condition) continue;
    const cond = translateCondition(f.condition);
    const swap = /exchange/i.test(`${f.how || ''} ${f.condition}`);
    timing.push(`${swap ? `Se intercambia por «${f.name || 'otra carta'}»` : `Se transforma en «${f.name || 'otra forma'}»`}${cond ? ` ${cond}` : ''}.`);
  }
  const exch = /([^|.]{0,80})- Exchanges with ([^|.-]+)/i.exec(p);
  if (exch && !(c.forms || []).some((f) => /exchange/i.test(`${f.how || ''} ${f.condition || ''}`))) {
    const cond = translateCondition(exch[1]);
    timing.push(`Se intercambia por «${exch[2].trim()}»${cond ? ` ${cond}` : ''}.`);
  }
  if (grows && !early) timing.push(growsBase ? 'Cuanto más dura el combate, mejor rinde.' : 'Rinde más después de transformarse.');
  if (!timing.length) timing.push('No cambia con los turnos: rinde igual al principio que al final.');

  return { role: ROLES[role], summary, teams, ownLead, events, slot, timing, math, tier: opts.tier ?? null };
}
