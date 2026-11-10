// Checks the automatic card guide (js/advice.js) on real cards.
// Run: node tests/advice-check.mjs
import { readFile } from 'node:fs/promises';
import { cardAdvice } from '../js/advice.js';
import { trainingItem, isFighter } from '../js/teams.js';

const { cards } = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
const byId = new Map(cards.map((c) => [c.page, c]));
let fail = 0;
const check = (label, ok) => { console.log(ok ? '  ok  ' : '  FAIL', label); if (!ok) fail++; };
const advice = (id) => cardAdvice(byId.get(id), cards);

// Frieza (Full Power): different boosts as 1st and as 2nd/3rd attacker
const frieza = advice('1004251');
check('Frieza: slot 1 defence', frieza.slot.some((s) => /^Slot 1: gana defensa/.test(s)));
check('Frieza: slot 2 o 3 attack and defence', frieza.slot.some((s) => /^Slot 2 o 3: gana ataque y defensa/.test(s)));
check('Frieza: extra effects from turn 5', frieza.timing.some((s) => /turno 5/.test(s)));
check('Frieza: Wicked Bloodline team', frieza.teams.some((t) => t.group === '«Wicked Bloodline»'));

// Nappa/Vegeta: active skill from turn 3, exchange shown once
const nappa = advice('1019401');
check('Nappa: active skill from turn 3', nappa.timing.some((s) => /Habilidad activa.*turno 3/.test(s)));
check('Nappa: exchange listed once', nappa.timing.filter((s) => /intercambia/.test(s)).length === 1);

// Great Saiyaman 2: strong for its first 5 turns
const gs2 = advice('1034731');
check('Great Saiyaman 2: first 5 turns', gs2.timing.some((s) => /primeros 5 turnos/.test(s)));
check('Great Saiyaman 2: own leader skill', gs2.ownLead >= 150);

// SSJ Goku "Lurking Abnormality": loses ATK/DEF every turn, strong first 5 turns
const goku = byId.has('1034871') && advice('1034871');
check('Goku decay: card found', !!goku);
if (goku) {
  check('Goku decay: no "más fuerte con los turnos"', !goku.timing.some((s) => /cuanto más dure/.test(s)) && !goku.summary.some((s) => /más fuerte con cada turno/.test(s)));
  check('Goku decay: says it weakens', goku.summary.some((s) => /Pierde ATK, DEF, reducción de daño y esquiva con cada turno/.test(s)));
  check('Goku decay: first 5 turns of battle', goku.timing.some((s) => /5 primeros turnos del combate/.test(s)));
  check('Goku math: 600 → 300 from turn 6', goku.summary.some((s) => /ATK y DEF: empieza en \+600% y pierde 60% cada turno hasta quedarse en \+300% desde el turno 6/.test(s)));
  const gm = goku.math.find((m) => m.keys?.includes('atk'));
  check('Goku math: table 600,540,480,420,360,300', gm && gm.rows.map((r) => r[1]).join() === '+600%,+540%,+480%,+420%,+360%,+300%');
  check('Goku math: 12 Ki adds 300 → 900 / 600', gm && gm.notes.some((n) => /\+900% en el turno 1 y .*\+600%/.test(n)));
  const gr = goku.math.find((m) => m.keys?.includes('dr'));
  check('Goku math: damage reduction 50 → 0', gr && gr.rows[0][1] === '50%' && gr.rows[gr.rows.length - 1][1] === '0%');
  check('Goku decay: no long-battle event', !goku.events.some((e) => /Zona Roja y Supreme/.test(e.title)));
}

// Training items (Elder Kai, Grand Kai…) are not fighters
const items = cards.filter((c) => trainingItem(c));
check(`training items found (${items.length})`, items.length >= 10 && items.length < 30);
check('Elder Kai: always +1', trainingItem(byId.get('1003971') || cards.find((c) => c.id === '1003970'))?.chance === 100);
check('Elder Kai (Dozing): 30%', trainingItem(cards.find((c) => c.id === '1013400'))?.chance === 30);
check('Grand Kai [AGL]: AGL only', trainingItem(cards.find((c) => c.id === '1012230'))?.type === 'AGL');
check('normal cards are fighters', isFighter(byId.get('1004251')) && isFighter(byId.get('1034731')));

// Every card gets a guide with something in each section, quickly
const t0 = Date.now();
let empty = 0;
for (const c of cards.slice(0, 200)) {
  const a = cardAdvice(c, cards);
  if (!a.role || !a.events.length || !a.slot.length || !a.timing.length) empty++;
}
const ms = (Date.now() - t0) / 200;
check(`every section filled (${empty} empty of 200)`, empty === 0);
check(`fast enough (${ms.toFixed(1)} ms per card)`, ms < 60);

process.exit(fail ? 1 : 0);
