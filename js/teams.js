// Team builder logic (no screen code): leader coverage, links, rotations, suggestions.
// A team is 7 card ids: [leader, unit 2, 3, 4, 5, 6, friend], plus a formation `order` that places
// them in 2 rotations (2 units each, always together) and 3 floaters (see "formation" below).
// The older 3-per-turn `rotation()` helpers are kept for reference but the screens use the formation.

export const SLOTS = 7;
export const SLOT_NAMES = ['Líder', 'Unidad 2', 'Unidad 3', 'Unidad 4', 'Unidad 5', 'Unidad 6', 'Amigo'];

const TYPES = ['AGL', 'TEQ', 'INT', 'STR', 'PHY'];
const plain = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

/** Leader Skill text at its highest awakening. */
export const leaderText = (card) => plain(card?.leader?.seza || card?.leader?.eza || card?.leader?.base || '');

/**
 * Reads a Leader Skill into clauses: [{ extra, all, categories, types, cls, ki, pct, text }].
 * `extra` clauses ("plus an additional … for characters who also belong to …") stack on top.
 */
export function leaderClauses(card) {
  const text = leaderText(card);
  if (!text) return [];
  const parts = [];
  for (const piece of text.split(/;\s*(?:or\s+)?/)) {
    const [main, ...extras] = piece.split(/,?\s*plus an additional\s+/i);
    parts.push({ text: main, extra: false });
    extras.forEach((e) => parts.push({ text: e, extra: true }));
  }
  return parts.map(({ text: t, extra }) => {
    const categories = [...t.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const typeM = /\b(?:(Super|Extreme)\s+)?((?:AGL|TEQ|INT|STR|PHY)(?:\s*(?:,|&|and)\s*(?:AGL|TEQ|INT|STR|PHY))*)\s+Types?\b/.exec(t);
    const classM = /\b(Super|Extreme) (?:Class|Type allies)\b/.exec(t);
    // "All Types …", or a boost that names no group at all ("Ki +3 and ATK & DEF +30% when HP…").
    const noTarget = !categories.length && !typeM && !classM;
    const all = noTarget && (/\bAll Types\b|\ball allies\b/i.test(t) || /^(Ki \+|ATK|DEF|HP)/.test(t));
    const pcts = [...t.matchAll(/\+(\d+)%/g)].map((m) => +m[1]);
    return {
      extra,
      all,
      categories,
      types: typeM ? typeM[2].match(/AGL|TEQ|INT|STR|PHY/g) : [],
      cls: typeM?.[1] || classM?.[1] || '',
      classOnly: !typeM && !!classM,
      ki: +(/Ki \+(\d+)/.exec(t)?.[1] || 0),
      pct: pcts.length ? Math.max(...pcts) : 0,
      text: t,
    };
  }).filter((c) => c.all || c.categories.length || c.types.length || c.classOnly);
}

function matches(clause, unit) {
  if (clause.all) return true;
  if (clause.categories.some((cat) => unit.categories.includes(cat))) return true;
  if (clause.types.length && clause.types.includes(unit.type) && (!clause.cls || clause.cls === unit.cls)) return true;
  if (clause.classOnly && clause.cls === unit.cls) return true;
  return false;
}

/** How much a leader boosts a unit: { covered, pct, ki }. */
export function coverage(leader, unit, clauses = leaderClauses(leader)) {
  if (!leader || !unit) return { covered: false, pct: 0, ki: 0 };
  let best = null;
  for (const c of clauses) if (!c.extra && matches(c, unit) && (!best || c.pct > best.pct)) best = c;
  if (!best) return { covered: false, pct: 0, ki: 0 };
  const extra = clauses.filter((c) => c.extra && matches(c, unit)).reduce((n, c) => n + c.pct, 0);
  return { covered: true, pct: best.pct + extra, ki: best.ki };
}

/** Link Skills two units share. */
export function sharedLinks(a, b) {
  if (!a || !b) return [];
  const set = new Set(b.links);
  return a.links.filter((l) => set.has(l));
}

/**
 * The 7 turns of a full rotation: [{ units: [i, j, k], middle, links }] where `middle` is the
 * position that links best with the other two and `links` how many Link Skills activate.
 */
export function rotation(team) {
  const turns = [];
  for (let t = 0; t < SLOTS; t++) {
    const idx = [0, 1, 2].map((k) => (3 * t + k) % SLOTS);
    const units = idx.map((i) => team[i]);
    let best = { middle: idx[1], links: 0 };
    for (let m = 0; m < 3; m++) {
      if (!units[m]) continue;
      const others = units.filter((_, k) => k !== m);
      const n = others.reduce((s, o) => s + sharedLinks(units[m], o).length, 0);
      if (n > best.links) best = { middle: idx[m], links: n };
    }
    turns.push({ units: idx, ...best });
  }
  return turns;
}

export const rotationScore = (team) => rotation(team).reduce((n, t) => n + t.links, 0);

/** Reorders units 2-6 (leader and friend stay put) to activate the most Link Skills. */
export function optimizeOrder(team) {
  const fixed = [team[0], team[SLOTS - 1]];
  const middle = team.slice(1, SLOTS - 1);
  let best = { score: rotationScore(team), order: team };
  const permute = (arr, k = 0) => {
    if (k === arr.length) {
      const order = [fixed[0], ...arr, fixed[1]];
      const score = rotationScore(order);
      if (score > best.score) best = { score, order: [...order] };
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      permute(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  permute([...middle]);
  return best;
}

// ---------- formation: 2 rotations of 2 units + 3 floaters ----------
// As in the game: the two units of a rotation always attack together, and one of the three
// floaters joins them each turn. `order` maps the 7 positions to team slots (0 = leader, 6 = friend).

export const POSITIONS = ['Rotación 1', 'Rotación 1', 'Rotación 2', 'Rotación 2', 'Floater', 'Floater', 'Floater'];
export const DEFAULT_ORDER = [0, 1, 2, 3, 4, 5, 6];
export const arrange = (team, order = DEFAULT_ORDER) => order.map((i) => team[i] || null);

/** ATK / DEF / Ki a Link Skill gives at level 10, from its text ("Ki +2 and ATK & DEF +5%"). */
export function linkEffect(text = '') {
  const fx = { atk: 0, def: 0, ki: 0 };
  for (const part of text.split(/;|,? and |, /)) {
    if (/enem/i.test(part)) continue;
    const ki = /Ki \+(\d+)/.exec(part);
    if (ki) fx.ki += +ki[1];
    const both = /ATK & DEF \+(\d+)%/.exec(part);
    if (both) { fx.atk += +both[1]; fx.def += +both[1]; continue; }
    const atk = /ATK \+(\d+)%/.exec(part);
    if (atk) fx.atk += +atk[1];
    const def = /DEF \+(\d+)%/.exec(part);
    if (def) fx.def += +def[1];
  }
  return fx;
}

/**
 * One turn with three units: picks who goes in the middle (linking with both sides) and returns
 * { line: [left, middle, right], active: Map(card -> [link names]), total }.
 */
export function trio(units) {
  const present = units.filter(Boolean);
  let best = null;
  for (const mid of present) {
    const sides = present.filter((u) => u !== mid);
    const active = new Map();
    const midLinks = new Set();
    for (const s of sides) {
      const shared = sharedLinks(mid, s);
      active.set(s, shared);
      shared.forEach((l) => midLinks.add(l));
    }
    active.set(mid, [...midLinks]);
    const total = [...active.values()].reduce((n, l) => n + l.length, 0);
    if (!best || total > best.total) best = { line: [sides[0] || null, mid, sides[1] || null], active, total };
  }
  return best || { line: [null, null, null], active: new Map(), total: 0 };
}

/** The 6 turn combinations (each rotation with each floater). */
export function combos(units) {
  const out = [];
  for (const [r, pair] of [[1, [units[0], units[1]]], [2, [units[2], units[3]]]]) {
    for (let f = 0; f < 3; f++) out.push({ rotation: r, floater: f + 1, ...trio([pair[0], pair[1], units[4 + f]]) });
  }
  return out;
}

export const formationScore = (units) => combos(units).reduce((n, c) => n + c.total, 0);

/** Best `order` for the team (most Link Skills active over all 6 turn combinations). */
export function optimizeFormation(team, order = DEFAULT_ORDER) {
  let best = { score: formationScore(arrange(team, order)), order: [...order] };
  const idx = [...DEFAULT_ORDER];
  const permute = (k) => {
    if (k === idx.length) {
      // Skip mirror images: swapping the two units of a rotation or reordering floaters changes nothing.
      if (idx[0] > idx[1] || idx[2] > idx[3] || idx[4] > idx[5] || idx[5] > idx[6]) return;
      const score = formationScore(arrange(team, idx));
      if (score > best.score) best = { score, order: [...idx] };
      return;
    }
    for (let i = k; i < idx.length; i++) {
      [idx[k], idx[i]] = [idx[i], idx[k]];
      permute(k + 1);
      [idx[k], idx[i]] = [idx[i], idx[k]];
    }
  };
  permute(0);
  return best;
}

/** Sum of the effects of a unit's active links: { atk, def, ki }. */
export function linkTotals(names, fxMap) {
  const t = { atk: 0, def: 0, ki: 0 };
  for (const n of names) {
    const fx = linkEffect(fxMap?.[n] || '');
    t.atk += fx.atk; t.def += fx.def; t.ki += fx.ki;
  }
  return t;
}

/**
 * Per-unit numbers shown under each card: links active with its rotation partner (always
 * together) plus the floater that links best with them; floaters use their best rotation.
 */
export function unitLinkView(units, fxMap) {
  const all = combos(units);
  return units.map((u, pos) => {
    if (!u) return null;
    const mine = all.filter((c) => [...c.active.keys()].includes(u));
    let best = { names: [] };
    for (const c of mine) { const names = c.active.get(u) || []; if (names.length > best.names.length) best = { names }; }
    return { names: best.names, ...linkTotals(best.names, fxMap) };
  });
}

// ---------- team summary ----------

/** Every Link Skill on the team: shared ones (2+ units) and unused ones (1 unit). */
export function teamLinks(team) {
  const map = new Map();
  for (const u of team) if (u) for (const l of u.links) { if (!map.has(l)) map.set(l, []); if (!map.get(l).includes(u)) map.get(l).push(u); }
  const list = [...map].map(([name, units]) => ({ name, units, count: units.length }));
  return {
    shared: list.filter((l) => l.count >= 2).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    unused: list.filter((l) => l.count === 1).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Leader numbers: total boost over the 7 units, minimum and average. */
export function leaderStats(leader, team) {
  if (!leader) return null;
  const clauses = leaderClauses(leader);
  const vals = team.filter(Boolean).map((u) => coverage(leader, u, clauses).pct);
  if (!vals.length) return { total: 0, min: 0, avg: 0 };
  return { total: vals.reduce((a, b) => a + b, 0), min: Math.min(...vals), avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) };
}

/**
 * Synergy score 0-100 and its parts (each 0-100):
 * leader coverage, link quality, passive conditions, support and unit rating (tier list).
 */
export function synergy(team, units, { known = new Set(), tierOf = () => null } = {}) {
  const members = team.filter(Boolean);
  if (!members.length) return null;
  const leader = team[0], friend = team[SLOTS - 1];
  const lc = leader ? leaderClauses(leader) : null, fc = friend ? leaderClauses(friend) : null;
  const cov = members.reduce((n, u) => n + (lc && coverage(leader, u, lc).covered ? 0.5 : 0) + (fc && coverage(friend, u, fc).covered ? 0.5 : 0), 0) / members.length;

  // Links: share of each unit's Link Skills that are active, averaged over all turn combinations.
  let ratio = 0, samples = 0;
  for (const c of combos(units)) for (const [u, names] of c.active) { if (u.links.length) { ratio += names.length / u.links.length; samples++; } }
  const links = samples ? Math.min(1, (ratio / samples) / 0.75) : 0; // 75% of links active counts as perfect

  let asked = 0, met = 0;
  for (const u of members) for (const chk of passiveCategoryChecks(team, u, known)) { asked++; if (chk.allies) met++; }
  const passive = asked ? met / asked : 1;

  const supporters = members.filter((u) => supportLines(u).length).length;
  const support = Math.min(1, supporters / 3);

  const ratings = members.map((u) => tierOf(u)).map((r) => (r == null ? 0.45 : r));
  const rating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

  const parts = { coverage: cov, links, passive, support, rating };
  const weights = { coverage: 0.3, links: 0.25, passive: 0.15, support: 0.1, rating: 0.2 };
  const total = Object.entries(weights).reduce((n, [k, w]) => n + parts[k] * w, 0);
  const pct = (x) => Math.round(x * 100);
  return { total: pct(total), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, pct(v)])) };
}

/** Counts by rarity and how many units have EZA / SEZA. */
export function teamMakeup(team) {
  const units = team.filter(Boolean);
  const rarity = {};
  for (const u of units) rarity[u.rarity] = (rarity[u.rarity] || 0) + 1;
  return { rarity, eza: units.filter((u) => u.eza || u.seza).length, seza: units.filter((u) => u.seza).length, count: units.length };
}

/** Categories shared by at least two units, most common first: [{ name, count }]. */
export function sharedCategories(units) {
  const count = new Map();
  for (const u of units) if (u) for (const c of u.categories) count.set(c, (count.get(c) || 0) + 1);
  return [...count].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => ({ name, count: n }));
}

/** Best leaders for the units already in the team: [{ card, covered, pct }]. */
export function suggestLeaders(units, allCards, limit = 10) {
  const members = units.filter(Boolean);
  if (!members.length) return [];
  const out = [];
  for (const card of allCards) {
    if (card.rarity === 'SSR') continue;
    const clauses = leaderClauses(card);
    if (!clauses.length) continue;
    let covered = 0, pct = 0;
    for (const u of members) {
      const cv = coverage(card, u, clauses);
      if (cv.covered) { covered++; pct += cv.pct; }
    }
    if (covered) out.push({ card, covered, pct });
  }
  return out.sort((a, b) => b.covered - a.covered || b.pct - a.pct).slice(0, limit);
}

/**
 * Ranks candidates for an empty slot: units the leaders cover first, then by links shared
 * with the rest of the team. Returns a score function for sorting.
 */
export function candidateScorer(team) {
  const leader = team[0], friend = team[SLOTS - 1];
  const lc = leader ? leaderClauses(leader) : null;
  const fc = friend ? leaderClauses(friend) : null;
  const members = team.filter(Boolean);
  return (card) => {
    let s = 0;
    if (lc) { const c = coverage(leader, card, lc); if (c.covered) s += 1000 + c.pct; }
    if (fc && friend !== leader) { const c = coverage(friend, card, fc); if (c.covered) s += 500 + c.pct / 2; }
    for (const m of members) if (m.page !== card.page) s += sharedLinks(card, m).length * 10;
    return s;
  };
}

// ---------- the assistant ----------

/** Name rule of the game: your own 6 units can't share a name (the friend can). */
export function nameAllowed(team, slot, card) {
  if (slot === SLOTS - 1) return true;
  return !team.some((c, k) => c && k !== slot && k !== SLOTS - 1 && c.name === card.name);
}

/**
 * Why a card fits the team: { score, lead, friend, links, cats } — used to rank and to explain
 * recommendations ("+220% líder · 9 links · 5 categorías").
 */
export function fit(team, card) {
  const leader = team[0], friend = team[SLOTS - 1];
  const lead = leader ? coverage(leader, card) : null;
  const fr = friend ? coverage(friend, card) : null;
  const members = team.filter((m) => m && m.page !== card.page);
  const links = members.reduce((n, m) => n + sharedLinks(card, m).length, 0);
  const leaderCats = new Set([...(leader ? leaderClauses(leader) : []), ...(friend ? leaderClauses(friend) : [])].flatMap((c) => c.categories));
  const cats = card.categories.filter((c) => leaderCats.has(c)).length;
  // Categories the other units' passives ask allies for ("…another "Planet Namek Saga" Category ally").
  const wanted = new Set(members.flatMap((m) => [...plain(m.passive?.seza || m.passive?.eza || m.passive?.base || '').matchAll(/"([^"]+)"/g)].map((x) => x[1])));
  const helps = card.categories.filter((c) => wanted.has(c)).length;
  let score = links * 10 + cats * 15 + helps * 30 + (card.rarity === 'LR' ? 20 : card.rarity === 'UR' ? 10 : 0) + (card.seza ? 15 : card.eza ? 8 : 0);
  if (lead?.covered) score += 1000 + lead.pct;
  if (fr?.covered && friend !== leader) score += 500 + fr.pct / 2;
  // Newer units are usually stronger.
  if (card.released) score += Math.max(0, +card.released.slice(0, 4) - 2015) * 6;
  return { score, lead, friend: fr, links, cats, helps };
}

/** Best cards to add next, best first: [{ card, ...fit }]. */
export function recommend(team, allCards, limit = 8, slot = team.findIndex((c, k) => !c && k > 0 && k < SLOTS - 1)) {
  if (slot < 0) return [];
  const taken = new Set(team.filter(Boolean).map((c) => c.page));
  const hasLeader = !!(team[0] || team[SLOTS - 1]);
  const out = [];
  for (const card of allCards) {
    if (taken.has(card.page) || !nameAllowed(team, slot, card)) continue;
    const f = fit(team, card);
    if (hasLeader && !f.lead?.covered && !f.friend?.covered) continue;
    out.push({ card, ...f });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Fills every empty slot (best leader first if missing), then optimises the order. */
export function autoFill(team, allCards) {
  const t = [...team];
  if (!t[0]) {
    const best = suggestLeaders(t.slice(1, SLOTS - 1), allCards, 1)[0];
    if (best) t[0] = best.card;
  }
  if (!t[SLOTS - 1] && t[0]) t[SLOTS - 1] = t[0];
  for (let k = 1; k < SLOTS - 1; k++) {
    if (t[k]) continue;
    const [best] = recommend(t, allCards, 1, k);
    if (best) t[k] = best.card;
  }
  return t;
}

// ---------- passive conditions and support ----------

const plainLines = (html = '') => html.replace(/<span class="tag[^"]*">[^<]*<\/span>/g, '')
  .split(/<br>|<hr>/).map(plain).filter(Boolean);

/**
 * Categories a unit's Passive Skill asks allies for, and whether the team has them:
 * [{ name, allies }] where `allies` = how many other team members belong to it.
 */
export function passiveCategoryChecks(team, card, knownCategories) {
  const text = plain(card.passive?.seza || card.passive?.eza || card.passive?.base || '');
  const names = [...new Set([...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((n) => knownCategories.has(n)))];
  return names.map((name) => ({ name, allies: team.filter((m) => m && m.page !== card.page && m.categories.includes(name)).length }));
}

/** Lines of a unit's Passive Skill that boost allies ("Super Class allies' DEF 70%"). */
export function supportLines(card) {
  const html = card.passive?.seza || card.passive?.eza || card.passive?.base || '';
  return plainLines(html).map((l) => l.replace(/^- /, '')).filter((l) => /\ballies'|\ball allies\b|\bally\b.*\+/i.test(l) && !/^When|^For every|^Starting/i.test(l)).slice(0, 4);
}

/** Totals for the summary box. */
export function summary(team) {
  const units = team.filter(Boolean);
  const types = Object.fromEntries(TYPES.map((t) => [t, 0]));
  let cost = 0;
  for (const u of units) { cost += u.cost || 0; if (types[u.type] != null) types[u.type]++; }
  return { count: units.length, cost, types };
}

// ---------- saving / sharing ----------

const KEY = 'dokkandb-teams';

export function loadTeams() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveTeams(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}
/** Team -> short text for a share link ("1034031.1032241.-.…"). */
export const encodeTeam = (ids) => ids.map((id) => id || '-').join('.');
export const decodeTeam = (s = '') => {
  const ids = s.split('.').slice(0, SLOTS).map((x) => (/^\d{7}$/.test(x) ? x : null));
  while (ids.length < SLOTS) ids.push(null);
  return ids;
};
