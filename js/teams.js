// Team builder logic (no screen code): leader coverage, links, rotations, suggestions.
// A team is 7 card ids in team order: [leader, unit 2, 3, 4, 5, 6, friend].
// In battle the units come in that order, 3 per turn (1-2-3, 4-5-6, 7-1-2…), and on each turn
// the unit in the middle shares its Link Skills with both neighbours.

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
