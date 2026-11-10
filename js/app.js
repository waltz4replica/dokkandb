// Screens and navigation. Each screen is a function in `views` that returns HTML,
// and can optionally return a `mount(el)` function to wire up interactions.
// To add a new feature: add a view, a route in ROUTES and (optionally) a tab in index.html.

import { store, loadLocal, sync, onChange, isSyncing, cardById } from './sync.js';
import { cardThumb } from './wiki.js';
import { APP_VERSION, CHANGELOG_URL, RELEASES_URL, CHANNEL, storageName, STABLE_URL, BETA_URL } from './version.js';
import * as T from './teams.js';
import * as FX from './effects.js';
import * as ADV from './advice.js';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const AUTO_SYNC_MIN = 30;

// ---------- helpers ----------

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
function ago(iso) {
  if (!iso) return 'nunca';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
// Card art from DOKKAN.FYI's image server, with the wiki's copy as a backup.
const cardImg = (c) => c.image || cardThumb(c.id);
const thumbTag = (c, cls = 'thumb') => `<img class="${cls}" loading="lazy" alt="" src="${esc(cardImg(c))}" data-fallback="${esc(cardThumb(c.id))}">`;
const sourceUrl = (c) => c.source || `https://dokkan.fyi/characters/${c.page}`;

// Small rarity + type label over a card image (filled = Super, outlined = Extreme).
function rtTag(c) {
  if (!c?.rarity && !c?.type) return '';
  const t = (c.type || '').toLowerCase();
  return `<span class="rt">${c.rarity ? `<i class="r-${esc(c.rarity.toLowerCase())}">${esc(c.rarity)}</i>` : ''}${c.type ? `<i class="ty-${esc(t)}${c.cls === 'Extreme' ? ' ex' : ''}" title="${esc(`${c.cls || ''} ${c.type}`.trim())}">${esc(c.type)}</i>` : ''}</span>`;
}

function tile(c) {
  const isNew = c.firstSeen && Date.now() - Date.parse(c.firstSeen) < 7 * 864e5;
  return `<a class="tile" href="#/card/${enc(c.page)}">
    <span class="pic">${thumbTag(c)}${rtTag(c)}</span>
    ${isNew ? '<span class="flag">NUEVA</span>' : ''}
    ${c.seza ? '<span class="flag eza">SEZA</span>' : c.eza ? '<span class="flag eza">EZA</span>' : ''}
    ${T.trainingItem(c) ? '<span class="flag item">ENTRENAR</span>' : ''}
    <div class="nm">${isOwned(c) ? '<span class="own" title="La tienes">★</span> ' : ''}${esc(c.name)}</div></a>`;
}

// Newest first (cards without a date yet go on top).
function byRelease(a, b) {
  return (b.released || '9999').localeCompare(a.released || '9999') || b.page.localeCompare(a.page);
}

let toastTimer;
function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.append(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// Phone share sheet when there is one; otherwise copy the link.
async function shareLink(title, url) {
  try {
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
  } catch (err) {
    if (err?.name !== 'AbortError') toast('No se pudo compartir. Enlace: ' + url);
  }
}

// ---------- views ----------

const views = {};

views.home = () => {
  if (!store.cards.size) return firstRunView();
  const cards = [...store.cards.values()];
  // Newest release batch: every LR/UR from the last 3 release dates.
  const sorted = cards.filter((c) => c.rarity !== 'SSR').sort(byRelease);
  const dates = [...new Set(sorted.map((c) => c.released))].slice(0, 3);
  const latest = sorted.filter((c) => dates.includes(c.released)).slice(0, 15);
  const eza = cards.filter((c) => lastEza(c)).sort((a, b) => lastEza(b).localeCompare(lastEza(a))).slice(0, 12);
  const active = bannerList().filter((b) => bannerStatus(b) === 'live' && !isPermanent(b)).slice(0, 4);
  const news = (store.extra?.news?.items || []).slice(0, 3);
  const top = (store.extra?.tierlist?.tiers || []).flatMap((t) => t.units).slice(0, 6);
  return {
    title: '<span class="logo">Dokkan</span>DB',
    html: `
      ${active.length ? `<h2>Banners activos <a href="#/banners">Ver todos</a></h2>${active.map(bannerRow).join('')}` : ''}
      <h2>Cartas nuevas <a href="#/cards">Ver todas</a></h2>
      ${groupByDate(latest, (c) => c.released, tile)}
      ${eza.length ? `<h2>Últimos EZA / SEZA</h2>${groupByDate(eza, lastEza, tile)}` : ''}
      ${news.length ? `<h2>Noticias del juego <a href="#/events?tab=news">Ver todas</a></h2>${news.map(newsRow).join('')}` : ''}
      ${top.length ? `<h2>Top de la tier list <a href="#/tierlist">Ver completa</a></h2><div class="grid">${top.map(tierTile).join('')}</div>` : ''}`,
  };
};
const lastEza = (c) => [c.dates.glbSeza, c.dates.glbEza].filter(Boolean).sort().pop() || '';

// Renders items in a grid with a small date heading each time the date changes.
function groupByDate(items, dateOf, render) {
  let html = '', last = null;
  for (const it of items) {
    const d = dateOf(it) || '';
    if (d !== last) { html += `${last !== null ? '</div>' : ''}<div class="date-head">${d ? fmtDate(d) : 'Sin fecha'}</div><div class="grid">`; last = d; }
    html += render(it);
  }
  return html ? html + '</div>' : '';
}

function firstRunView() {
  return {
    title: '<span class="logo">Dokkan</span>DB',
    html: `<div class="box" style="margin-top:20px">
      <h2 style="margin-top:0">Bienvenido</h2>
      <p>La primera vez la app descarga toda la base de datos: unas 1.150 cartas LR, UR y SSR (datos sacados del juego) y los banners. Tarda menos de un minuto con Wi-Fi; después solo descarga lo nuevo.</p>
      <p class="muted small" id="sync-msg">${isSyncing() ? 'Descargando…' : 'Pulsa el botón para empezar.'}</p>
      ${isSyncing() ? '<div class="progress"><i></i></div>' : '<div class="btns"><button class="btn primary" id="start">Descargar datos</button></div>'}
    </div>`,
    mount(el) {
      $('#start', el)?.addEventListener('click', () => runSync({ full: true }));
    },
  };
}

// Filters live here so they survive moving between screens.
const filters = { q: '', rarity: new Set(), type: new Set(), cls: new Set(), eza: false, mine: false, sort: 'new', category: '',
  cats: new Set(), fx: new Set(), orb: new Set(), moreOpen: false };
const advancedCount = () => filters.cats.size + filters.fx.size + filters.orb.size;
let listShown = 60; // cards the list had loaded, so coming back from a card lands in the same place

// The Cards filters are remembered between visits (on this phone only).
const FILTERS_KEY = storageName('cardFilters');
const SET_KEYS = ['rarity', 'type', 'cls', 'cats', 'fx', 'orb'];
function saveFilters() {
  try {
    const out = { q: filters.q, eza: filters.eza, mine: filters.mine, sort: filters.sort, moreOpen: filters.moreOpen };
    for (const k of SET_KEYS) out[k] = [...filters[k]];
    localStorage.setItem(FILTERS_KEY, JSON.stringify(out));
  } catch { /* storage unavailable */ }
}
try {
  const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null');
  if (saved) {
    for (const k of ['q', 'eza', 'mine', 'sort', 'moreOpen']) if (k in saved) filters[k] = saved[k];
    for (const k of SET_KEYS) if (Array.isArray(saved[k])) filters[k] = new Set(saved[k]);
  }
} catch { /* ignore a damaged copy */ }

// "Mis cartas": the cards you own, marked from each card's page (on this phone only).
const OWNED_KEY = storageName('ownedCards');
let owned = new Set();
try { owned = new Set(JSON.parse(localStorage.getItem(OWNED_KEY) || '[]')); } catch { /* start empty */ }
const isOwned = (c) => !!c && owned.has(c.page);
function setOwned(page, on) {
  on ? owned.add(page) : owned.delete(page);
  try { localStorage.setItem(OWNED_KEY, JSON.stringify([...owned])); } catch { toast('No se pudo guardar en este móvil.'); }
}

// Every category, most common first, for the category picker.
let categoryList = null;
function allCategories() {
  if (categoryList && categoryList.size === store.cards.size) return categoryList.list;
  const n = new Map();
  for (const c of store.cards.values()) for (const k of c.categories) n.set(k, (n.get(k) || 0) + 1);
  categoryList = { size: store.cards.size, list: [...n].sort((a, b) => a[0].localeCompare(b[0])) };
  return categoryList.list;
}

function advancedFiltersHtml() {
  const chip = (group, val, label, extra = '') => `<button class="chip ${extra} ${filters[group].has(val) ? 'on' : ''}" data-g="${group}" data-v="${esc(val)}">${label}</button>`;
  return `
    <div class="adv-sec"><b>Categorías</b> <span class="muted small">(la carta debe tenerlas todas)</span>
      <select id="cat-add"><option value="">+ Añadir categoría…</option>
        ${allCategories().filter(([k]) => !filters.cats.has(k)).map(([k, n]) => `<option value="${esc(k)}">${esc(k)} (${n})</option>`).join('')}
      </select>
      <div class="chips" id="cat-chips">${[...filters.cats].map((k) => `<button class="chip on" data-g="cats" data-v="${esc(k)}">${esc(k)} ✕</button>`).join('')}</div></div>
    ${FX.EFFECT_GROUPS.map(([title, list]) => `<div class="adv-sec"><b>${title}</b>
      <div class="chips">${list.map(([id, label]) => chip('fx', id, label)).join('')}</div></div>`).join('')}
    <div class="adv-sec"><b>Cambia orbes a</b>
      <div class="chips">${FX.ORB_TYPES.map((t) => chip('orb', t, FX.ORB_LABELS[t] || t, t === 'Rainbow' ? 'orb-rb' : 't-' + t.toLowerCase())).join('')}</div></div>
    <p class="muted small">Los efectos se leen del texto de la pasiva, los súper ataques y la habilidad activa (al nivel más alto: SEZA, EZA o base, y sus transformaciones).</p>
    ${advancedCount() ? '<div class="btns"><button class="btn" id="adv-clear">Quitar estos filtros</button></div>' : ''}`;
}

views.cards = (params) => {
  if (!store.cards.size) return firstRunView();
  if (params.get('category') != null) { filters.category = params.get('category'); filters.q = ''; }
  // From a card's "Qué hace" tags: show every card with that effect.
  if (params.get('fx') || params.get('orb')) {
    filters.fx = new Set(params.get('fx') ? [params.get('fx')] : []);
    filters.orb = new Set(params.get('orb') ? [params.get('orb')] : []);
    filters.cats.clear(); filters.q = ''; filters.moreOpen = true;
  }
  const chip = (group, val, label, extra = '') => `<button class="chip ${extra} ${filters[group].has(val) ? 'on' : ''}" data-g="${group}" data-v="${val}">${label}</button>`;
  return {
    title: 'Cartas',
    html: `
      <input class="search" type="search" placeholder="Buscar por nombre, categoría, link…" value="${esc(filters.q)}" id="q" autocomplete="off">
      <div class="chips">
        <button class="chip mine ${filters.mine ? 'on' : ''}" data-g="mine">★ Mis cartas</button>
        ${['LR', 'UR', 'SSR'].map((r) => chip('rarity', r, r)).join('')}
        ${['AGL', 'TEQ', 'INT', 'STR', 'PHY'].map((t) => chip('type', t, t, 't-' + t.toLowerCase())).join('')}
        ${chip('cls', 'Super', 'Super')}${chip('cls', 'Extreme', 'Extreme')}
        <button class="chip ${filters.eza ? 'on' : ''}" data-g="eza">EZA</button>
      </div>
      ${filters.category ? `<div class="chips"><button class="chip on" data-g="category">Categoría: ${esc(filters.category)} ✕</button></div>` : ''}
      <details class="adv" id="adv" ${filters.moreOpen ? 'open' : ''}>
        <summary>Más filtros: categorías y habilidades <span class="adv-n" id="adv-n">${advancedCount() || ''}</span></summary>
        <div id="adv-body">${advancedFiltersHtml()}</div>
      </details>
      <div class="toolbar"><span id="count"></span>
        <select id="sort">
          <option value="new">Más recientes</option>
          <option value="old">Más antiguas</option>
          <option value="atk">Mayor ATK</option>
          <option value="hp">Mayor HP</option>
          <option value="def">Mayor DEF</option>
          <option value="name">Nombre</option>
        </select></div>
      <div class="grid" id="grid"></div><div class="sentinel" id="more"></div>`,
    mount(el) {
      $('#sort', el).value = filters.sort;
      let list = [], shown = 0;
      const grid = $('#grid', el);
      // When sorted by date, a heading marks each release day.
      let lastDate = null;
      const renderMore = (n = 60) => {
        const next = list.slice(shown, shown + n);
        const byDate = filters.sort === 'new' || filters.sort === 'old';
        grid.insertAdjacentHTML('beforeend', next.map((c) => {
          if (!byDate || c.released === lastDate) return tile(c);
          lastDate = c.released;
          return `<div class="date-head in-grid">${c.released ? fmtDate(c.released) : 'Sin fecha'}</div>${tile(c)}`;
        }).join(''));
        shown += next.length;
        listShown = shown;
      };
      // keep = coming back to the list: load as many cards as before so the scroll position still fits.
      const refresh = (keep = false) => {
        list = filterCards();
        shown = 0;
        lastDate = null;
        grid.innerHTML = list.length ? '' : `<div class="empty" style="grid-column:1/-1">${filters.mine && !owned.size
          ? 'Todavía no has marcado ninguna carta como tuya.<br>Entra en una carta y pulsa <b>☆ La tengo</b>.'
          : 'No hay cartas con esos filtros.'}</div>`;
        $('#count', el).textContent = `${list.length} cartas`;
        renderMore(keep ? Math.max(60, listShown) : 60);
        if (!keep) saveFilters();
      };
      let t;
      $('#q', el).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { filters.q = e.target.value; refresh(); }, 150); });
      $('#sort', el).addEventListener('change', (e) => { filters.sort = e.target.value; refresh(); });
      const redrawAdv = () => { $('#adv-body', el).innerHTML = advancedFiltersHtml(); $('#adv-n', el).textContent = advancedCount() || ''; };
      $('#adv', el).addEventListener('toggle', (e) => { filters.moreOpen = e.target.open; saveFilters(); });
      el.addEventListener('change', (e) => {
        if (e.target.id !== 'cat-add' || !e.target.value) return;
        filters.cats.add(e.target.value);
        redrawAdv();
        refresh();
      });
      el.addEventListener('click', (e) => {
        if (e.target.closest('#adv-clear')) { filters.cats.clear(); filters.fx.clear(); filters.orb.clear(); redrawAdv(); refresh(); return; }
        const b = e.target.closest('.chip');
        if (!b) return;
        const g = b.dataset.g;
        if (g === 'cats' || g === 'fx' || g === 'orb') {
          filters[g].has(b.dataset.v) ? filters[g].delete(b.dataset.v) : filters[g].add(b.dataset.v);
          redrawAdv();
          refresh();
          return;
        }
        if (g === 'eza' || g === 'mine') filters[g] = !filters[g];
        else if (g === 'category') { filters.category = ''; b.parentElement.remove(); }
        else filters[g].has(b.dataset.v) ? filters[g].delete(b.dataset.v) : filters[g].add(b.dataset.v);
        b.classList.toggle('on', g === 'eza' || g === 'mine' ? filters[g] : g === 'category' ? false : filters[g].has(b.dataset.v));
        refresh();
      });
      const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting && shown < list.length) renderMore(); }, { rootMargin: '600px' });
      io.observe($('#more', el));
      refresh(true);
      return () => io.disconnect();
    },
  };
};

// All chosen effects must be there; for orbs, any of the chosen types.
function matchesEffects(c) {
  const e = FX.cardEffects(c);
  return [...filters.fx].every((id) => e.fx.has(id)) && (!filters.orb.size || [...filters.orb].some((t) => e.orbs.has(t)));
}

function filterCards() {
  const words = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [...store.cards.values()].filter((c) =>
    (!filters.mine || owned.has(c.page)) &&
    (!filters.rarity.size || filters.rarity.has(c.rarity)) &&
    (!filters.type.size || filters.type.has(c.type)) &&
    (!filters.cls.size || filters.cls.has(c.cls)) &&
    (!filters.eza || c.eza || c.seza) &&
    (!filters.category || c.categories.includes(filters.category) || c.links.includes(filters.category)) &&
    [...filters.cats].every((k) => c.categories.includes(k)) &&
    words.every((w) => c.search.includes(w)) &&
    (!filters.fx.size && !filters.orb.size || matchesEffects(c)));
  const stat = (k) => (c) => c.stats[k][1] || c.stats[k][0] || 0;
  const sorters = {
    new: byRelease,
    old: (a, b) => -byRelease(a, b),
    atk: (a, b) => stat('atk')(b) - stat('atk')(a),
    hp: (a, b) => stat('hp')(b) - stat('hp')(a),
    def: (a, b) => stat('def')(b) - stat('def')(a),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return out.sort(sorters[filters.sort] || byRelease);
}

// "Guía rápida" box on a card: summary, effects, teams, events, slot and timing (js/advice.js).
// Items such as Elder Kai: what they are for, instead of the battle guide.
function itemGuideHtml(c, item) {
  const who = item.type ? `una carta de tipo <b>${item.type}</b>` : '<b>cualquier carta</b>';
  const odds = item.chance >= 100 ? 'sube <b>siempre</b> 1 nivel' : `tiene un <b>${item.chance}%</b> de probabilidad de subir 1 nivel`;
  return `<section class="box guide">
    <div class="g-head"><h2>Guía rápida</h2><span class="g-role">Objeto de entrenamiento</span></div>
    <ul>
      <li><b>No sirve para combatir</b>: no tiene súper ataque, pasiva ni links. No la pongas en equipos.</li>
      <li>Úsala en <b>Entrenamiento</b> como compañera de ${who}: su súper ataque ${odds}.</li>
      <li>Guárdala para las cartas que más uses o que tengan el súper ataque más bajo.${item.type ? ` Con una carta de otro tipo no sube nada.` : ''}</li>
    </ul>
    <p class="g-note">El efecto exacto, en inglés, está abajo en «Efecto en el entrenamiento».</p>
  </section>`;
}

function guideHtml(c) {
  const item = T.trainingItem(c);
  if (item) return itemGuideHtml(c, item);
  const a = ADV.cardAdvice(c, [...store.cards.values()], { tier: tierOf(c) });
  const e = FX.cardEffects(c);
  const tags = FX.EFFECTS.filter(([id]) => e.fx.has(id) && id !== 'orbs').map(([id, label]) => `<a href="#/cards?fx=${id}">${esc(label)}</a>`);
  for (const o of e.orbs) tags.push(`<a href="#/cards?orb=${enc(o)}">Orbes → ${esc(FX.ORB_LABELS[o] || o)}</a>`);
  const tierName = (store.extra?.tierlist?.tiers || []).find((t) => t.units.some((u) => u.cardId === c.id || (c.awakensFrom || []).includes(u.cardId)))?.tier;
  const li = (xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  const leaderRow = (t) => `<a class="g-lead" href="#/card/${enc(t.leader.page)}">
      <img alt="" loading="lazy" src="${esc(cardImg(t.leader))}">
      <span><b>${esc(t.group)}</b><span class="small muted">Líder: ${esc(t.leader.name)} · <span class="ok">+${t.pct}%</span>${t.ki ? ` · Ki +${t.ki}` : ''}</span></span></a>`;
  return `<section class="box guide">
    <div class="g-head"><h2>Guía rápida</h2><span class="g-role">${esc(a.role)}</span>${tierName ? `<a class="g-tier" href="#/tierlist">Tier ${esc(tierName)}</a>` : ''}</div>
    ${li(a.summary.map(esc))}
    ${tags.length ? `<div class="tags fx-tags">${tags.join('')}</div>` : ''}
    <h3>🛡️ En qué equipo</h3>
    ${a.teams.length ? a.teams.map(leaderRow).join('') : '<p class="small muted">No hay ningún líder en la base de datos que la cubra con +120% o más.</p>'}
    ${a.ownLead >= 150 ? `<p class="small">También sirve de <b>líder</b>: da +${a.ownLead}% a su grupo.</p>` : ''}
    <h3>🎯 En qué eventos</h3>
    ${li(a.events.map((x) => `<b>${esc(x.title)}</b>: ${esc(x.why)}.`))}
    <h3>📍 Slot</h3>
    ${li(a.slot.map(esc))}
    <h3>⏱️ Cuándo usarla</h3>
    ${li(a.timing.map(esc))}
    <p class="g-note">Guía automática a partir del texto de la carta en su nivel más alto${c.seza ? ' (SEZA)' : c.eza ? ' (EZA)' : ''} y de los líderes de la base de datos. Tómala como orientación.</p>
  </section>`;
}

views.card = (params, page) => {
  const c = store.cards.get(page);
  if (!c) return { title: 'Carta', back: true, html: `<div class="empty">Esta carta no está en la base de datos.<br><br><a href="https://dokkan.fyi/characters/${enc(page)}" target="_blank" rel="noopener">Buscar en DOKKAN.FYI</a></div>` };
  const levels = [['base', 'Base'], ...(c.eza ? [['eza', 'EZA']] : []), ...(c.seza ? [['seza', 'SEZA']] : [])];
  const t = c.type.toLowerCase();
  const item = T.trainingItem(c);
  const skill = (label, name, body, cond) => body ? `<div class="box skill"><h3>${label}</h3>${name ? `<div class="sn">${esc(name)}</div>` : ''}<div class="desc">${body}</div>${cond ? `<div class="cond">${cond}</div>` : ''}</div>` : '';
  const render = (lv) => {
    const pick = (o) => (o ? o[lv] || (lv === 'seza' ? o.eza : '') || o.base : '');
    return `
      ${skill(T.trainingItem(c) ? 'Efecto en el entrenamiento' : 'Habilidad de líder', '', pick(c.leader))}
      ${skill('Súper ataque', c.superAttack.name, pick(c.superAttack))}
      ${c.ultraSuperAttack ? skill('Ultra súper ataque', c.ultraSuperAttack.name, pick(c.ultraSuperAttack)) : ''}
      ${c.exSuperAttack ? skill('EX súper ataque', c.exSuperAttack.name, c.exSuperAttack.desc, c.exSuperAttack.condition) : ''}
      ${skill('Habilidad pasiva', c.passive.name, pick(c.passive))}
      ${c.active ? skill('Habilidad activa', c.active.name, c.active.desc, c.active.condition) : ''}
      ${c.transformation ? skill('Transformación', '', c.transformation) : ''}
      ${(c.forms || []).map((f) => formBox(f, lv)).join('')}`;
  };
  // A transformation / exchange form, shown inside its base card.
  const formBox = (f, lv) => {
    const pick = (o) => (o ? o[lv] || (lv === 'seza' ? o.eza : '') || o.base : '');
    return `<details class="box form"><summary>
        ${f.image ? `<img alt="" loading="lazy" src="${esc(f.image)}">` : ''}
        <span><span class="muted small">${f.how === 'Active Skill' ? 'Se transforma (habilidad activa)' : /exchange/i.test(f.how || '') ? 'Intercambio' : 'Se transforma'}</span><br><b>${esc(f.name || '')}</b>
        ${f.type ? ` <span class="type t-${esc(f.type.toLowerCase())}">${esc(f.type)}</span>` : ''}</span></summary>
      ${f.condition ? `<div class="cond">${f.condition}</div>` : ''}
      ${f.superAttack?.base ? `<div class="skill"><h3>Súper ataque</h3><div class="sn">${esc(f.superAttack.name)}</div><div class="desc">${pick(f.superAttack)}</div></div>` : ''}
      ${f.ultraSuperAttack?.base ? `<div class="skill"><h3>Ultra súper ataque</h3><div class="sn">${esc(f.ultraSuperAttack.name)}</div><div class="desc">${pick(f.ultraSuperAttack)}</div></div>` : ''}
      ${f.passive?.base ? `<div class="skill"><h3>Habilidad pasiva</h3><div class="sn">${esc(f.passive.name)}</div><div class="desc">${pick(f.passive)}</div></div>` : ''}
      ${f.active ? `<div class="skill"><h3>Habilidad activa</h3><div class="sn">${esc(f.active.name)}</div><div class="desc">${f.active.desc}</div>${f.active.condition ? `<div class="cond">${f.active.condition}</div>` : ''}</div>` : ''}
    </details>`;
  };
  const d = c.dates;
  const dateRows = [['Lanzamiento', d.glb, d.jp], ['EZA', d.glbEza, d.jpEza], ['SEZA', d.glbSeza, d.jpSeza]].filter((r) => r[1] || r[2]);
  return {
    title: esc(c.name),
    back: true,
    html: `
      <div class="hero">${thumbTag(c, '')}
        <div><div class="t">${esc(c.title)}</div><div class="n">${esc(c.name)}</div>
        <div class="badges"><span class="badge ${c.rarity.toLowerCase()}">${esc(c.rarity)}</span><span class="badge t-${t}">${esc(c.cls)} ${esc(c.type)}</span>
        ${c.cost && !item ? `<span class="badge">Coste ${c.cost}</span>` : ''}${c.seza ? '<span class="badge">SEZA</span>' : c.eza ? '<span class="badge">EZA</span>' : ''}</div></div>
      </div>
      <div class="card-actions">
        <button class="btn own-btn ${isOwned(c) ? 'on' : ''}" id="own" aria-pressed="${isOwned(c)}">${isOwned(c) ? '★ La tengo' : '☆ La tengo'}</button>
        <button class="btn" id="share">Compartir</button>
      </div>
      ${levels.length > 1 ? `<div class="seg" id="lv">${levels.map(([k, l], i) => `<button data-lv="${k}" class="${i === levels.length - 1 ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      ${guideHtml(c)}
      <div id="skills" style="margin-top:10px">${render(levels[levels.length - 1][0])}</div>
      ${item ? '' : `<div class="box"><table class="stats"><tr><th></th><th>Base</th><th>Máx.</th></tr>
        <tr><td>HP</td><td>${c.stats.hp[0] ?? '–'}</td><td>${c.stats.hp[1] ?? '–'}</td></tr>
        <tr><td>ATK</td><td>${c.stats.atk[0] ?? '–'}</td><td>${c.stats.atk[1] ?? '–'}</td></tr>
        <tr><td>DEF</td><td>${c.stats.def[0] ?? '–'}</td><td>${c.stats.def[1] ?? '–'}</td></tr></table>
        ${c.ki12 ? `<div class="small muted" style="margin-top:8px">Multiplicador a 12 de ki: ${esc(c.ki12)}</div>` : ''}</div>`}
      ${c.links.length ? `<h2>Links (${c.links.length})</h2><div class="tags">${c.links.map((l) => `<a href="#/cards?category=${enc(l)}">${esc(l)}</a>`).join('')}</div>` : ''}
      ${c.categories.length ? `<h2>Categorías (${c.categories.length})</h2><div class="tags">${c.categories.map((l) => `<a href="#/cards?category=${enc(l)}">${esc(l)}</a>`).join('')}</div>` : ''}
      ${dateRows.length ? `<h2>Fechas</h2><div class="box dates"><span></span><b>Global</b><b>Japón</b>${dateRows.map(([l, g, j]) => `<b>${l}</b><span>${fmtDate(g) || '–'}</span><span>${fmtDate(j) || '–'}</span>`).join('')}</div>` : '<p class="muted small">Sin fecha de lanzamiento todavía (próximamente o solo en Japón).</p>'}
      <p class="small"><a href="${esc(sourceUrl(c))}" target="_blank" rel="noopener">Ver en DOKKAN.FYI ↗</a></p>`,
    mount(el) {
      $('#own', el).addEventListener('click', (e) => {
        const on = !isOwned(c);
        setOwned(c.page, on);
        e.currentTarget.classList.toggle('on', on);
        e.currentTarget.setAttribute('aria-pressed', on);
        e.currentTarget.textContent = on ? '★ La tengo' : '☆ La tengo';
        toast(on ? 'Añadida a Mis cartas' : 'Quitada de Mis cartas');
      });
      $('#share', el).addEventListener('click', () => shareLink(`${c.name} (${c.rarity} ${c.type}) en DokkanDB`, `${location.origin}${location.pathname}#/card/${enc(c.page)}`));
      $('#lv', el)?.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        el.querySelectorAll('#lv button').forEach((x) => x.classList.toggle('on', x === b));
        $('#skills', el).innerHTML = render(b.dataset.lv);
      });
    },
  };
};

// ----- Banners (DokkanStats summons, via data/extra.json) -----

const bannerList = () => [...(store.extra?.summons?.items || [])].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
function bannerStatus(b, now = Date.now()) {
  if (b.start && Date.parse(b.start) > now) return 'soon';
  if (b.end && Date.parse(b.end) < now) return 'ended';
  return 'live';
}
// Ticket / point summons that run for years.
const isPermanent = (b) => b.end && Date.parse(b.end) - Date.now() > 365 * 864e5;
const STATUS = { live: ['Activo', 'live'], soon: ['Próximamente', 'soon'], ended: ['Terminado', 'ended'] };
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');

function bannerCardImg(id) {
  return cardById(id)?.image || `https://cdn.dokkan.fyi/assets/en/character/thumb/card_${id}_thumb/card_${id}_thumb.png`;
}

function bannerRow(b) {
  const [label, cls] = STATUS[bannerStatus(b)];
  const main = new Set(b.groups?.main || []);
  const minis = b.cards.slice(0, 6).map((id) => `<img loading="lazy" alt=""${main.has(id) ? ' class="hl"' : ''} src="${esc(bannerCardImg(id))}">`).join('');
  const dates = isPermanent(b) ? 'Permanente' : `${shortDate(b.start)} – ${shortDate(b.end)}`;
  return `<a class="row" href="#/banner/${enc(b.id)}">
    <img class="banner-img" loading="lazy" alt="" src="${esc(b.image)}">
    <div class="info"><b>${esc(b.name)}</b>
      <span class="small"><span class="status ${cls}">${label}</span> <span class="muted">${dates}</span></span>
      ${minis ? `<div class="minis">${minis}</div>` : ''}</div></a>`;
}

views.banners = () => {
  const all = bannerList();
  if (!all.length) return { title: 'Banners', html: noExtra() };
  const groups = [
    ['Activos ahora', all.filter((b) => bannerStatus(b) === 'live' && !isPermanent(b))],
    ['Próximamente', all.filter((b) => bannerStatus(b) === 'soon')],
    ['Permanentes (tickets y puntos)', all.filter((b) => bannerStatus(b) === 'live' && isPermanent(b))],
    ['Anteriores', all.filter((b) => bannerStatus(b) === 'ended')],
  ].filter(([, list]) => list.length);
  const src = store.extra.summons;
  return {
    title: 'Banners',
    html: `${groups.map(([title, list]) => `<h2>${title} <span class="muted small">${list.length}</span></h2>${list.map(bannerRow).join('')}`).join('')}
      <p class="muted small">Fuente: <a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.source)}</a>. Los banners anteriores se van guardando desde que la app empezó a recogerlos.</p>`,
  };
};

// A banner's cards in three blocks: headline units, other rate-up SSRs, rate-up SR/R.
function bannerGroups(g, cardTile) {
  const block = (cls, label, hint, ids) => (ids.length ? `<section class="bgroup ${cls}">
    <h2><span class="gtag ${cls}">${label}</span> <span class="muted small">${ids.length}</span></h2>
    <p class="muted small">${hint}</p>
    <div class="grid">${ids.map(cardTile).join('')}</div></section>` : '');
  return block('main', '★ Principales', 'Las cartas protagonistas del banner.', g.main)
    + block('feat', 'Featured', 'SSR con probabilidad aumentada.', g.featured)
    + block('sec', 'Secundarios', 'SR y R con probabilidad aumentada: se usan para despertar o como relleno.', g.secondary)
    + (g.unfeatured ? `<p class="muted small">Además pueden salir otras ${g.unfeatured} cartas con la probabilidad normal.</p>` : '');
}

views.banner = (params, id) => {
  const b = bannerList().find((x) => x.id === id);
  if (!b) return { title: 'Banner', back: true, html: '<div class="empty">Banner no encontrado.</div>' };
  const [label, cls] = STATUS[bannerStatus(b)];
  const names = b.groups?.names || {};
  // Hercule Statues ("Worth 1,000,000 Zeni") are only for selling.
  const zeniOf = (cid) => /Worth ([\d,.]+) Zeni/i.exec(names[cid] || '')?.[1];
  const statues = b.cards.filter(zeniOf);
  const cardTile = (cid) => {
    const c = cardById(cid);
    if (c) return tile(c);
    const zeni = zeniOf(cid);
    const label = zeni ? `Estatua de Mr. Satán · ${zeni.replace(/,/g, '.')} zeni` : names[cid] ? `${names[cid]} ↗` : 'DokkanStats ↗';
    return `<a class="tile" href="https://dokkanstats.com/en/cards/${+cid + 1}/" target="_blank" rel="noopener"><span class="pic"><img class="thumb" loading="lazy" alt="" src="${esc(bannerCardImg(cid))}"></span>${zeni ? '<span class="flag sell">VENDER</span>' : ''}<div class="nm ${zeni ? '' : 'muted'}">${esc(label)}</div></a>`;
  };
  return {
    title: esc(b.name),
    back: true,
    html: `<img alt="" src="${esc(b.image)}" style="width:100%;border-radius:12px;background:var(--bg2)">
      <p><span class="status ${cls}">${label}</span>
        <span class="muted small">${isPermanent(b) ? 'Permanente' : `${fmtDate(b.start)} – ${fmtDate(b.end)}`}</span></p>
      ${b.desc ? `<p class="small">${esc(b.desc)}</p>` : ''}
      ${statues.length ? '<div class="box small note-item">💰 Las <b>estatuas de Mr. Satán</b> no sirven para combatir ni para entrenar: solo se venden por zeni (lo que indica cada una).</div>' : ''}
      ${b.cards.some((cid) => T.trainingItem(cardById(cid))) ? '<div class="box small note-item">📈 Las cartas marcadas <b>ENTRENAR</b> (Elder Kai, Grand Kai…) no sirven para combatir: se usan en Entrenamiento para subir el nivel del súper ataque de otras cartas.</div>' : ''}
      ${b.groups ? bannerGroups(b.groups, cardTile)
        : b.cards.length ? `<h2>Cartas destacadas <span class="muted small">${b.cards.length}</span></h2><div class="grid">${b.cards.map(cardTile).join('')}</div>` : ''}
      <p class="small" style="margin-top:20px"><a href="${esc(b.url)}" target="_blank" rel="noopener">Ver en DokkanStats ↗</a></p>`,
  };
};

// ----- Events + news (from the fan sites, via data/extra.json) -----

const EVENT_GROUPS = [
  ['Limited', 'Limitados'], ['Challenge', 'Desafíos'], ['Bonus', 'Bonus'], ['Story', 'Historia'],
  ['Z-Battles', 'Batallas Z extremas'], ['Growth', 'Entrenamiento'], ['Quests', 'Misiones'], ['DB Story', 'Historia DB'],
];
const groupName = (g) => (EVENT_GROUPS.find(([k]) => k === g) || [g, g || 'Otros'])[1];

function newsRow(n) {
  return `<a class="row" href="${esc(n.url)}" target="_blank" rel="noopener">
    ${n.image ? `<img class="banner-img" loading="lazy" alt="" src="${esc(n.image)}">` : ''}
    <div class="info"><b>${esc(n.title)}</b><span class="muted small">${esc(n.tags.join(' · '))}${n.iso ? ' · ' + fmtDate(n.iso) : ''}</span></div></a>`;
}

function noExtra() {
  return '<div class="empty">Todavía no hay datos de eventos. Se descargan junto con la próxima actualización.</div>';
}

views.events = (params) => {
  const ex = store.extra;
  const tab = params.get('tab') === 'news' ? 'news' : 'events';
  const items = ex?.events?.items || [];
  const present = EVENT_GROUPS.map(([k]) => k).filter((k) => items.some((e) => e.group === k));
  const others = [...new Set(items.map((e) => e.group))].filter((g) => !present.includes(g));
  const groups = [...present, ...others];
  const tabs = `<div class="seg" style="margin-top:0"><button data-tab="events" class="${tab === 'events' ? 'on' : ''}">Eventos activos</button><button data-tab="news" class="${tab === 'news' ? 'on' : ''}">Noticias del juego</button></div>`;
  const withStones = items.filter((e) => e.stones > 0);
  const eventsHtml = !items.length ? noExtra() : `
    <input class="search" type="search" id="evq" placeholder="Buscar evento…" autocomplete="off">
    <div class="chips">${groups.map((g, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-g="${esc(g)}">${esc(groupName(g))} (${items.filter((e) => e.group === g).length})</button>`).join('')}
      ${withStones.length ? '<button class="chip" data-g="__stones">💎 Más piedras</button>' : ''}</div>
    <div class="ev-grid" id="ev"></div>
    <p class="muted small">Fuente: <a href="${esc(ex.events.url)}" target="_blank" rel="noopener">${esc(ex.events.source)}</a>${ex.events.updated ? ' · cambios detectados ' + ago(ex.events.updated) : ''}</p>`;
  const news = ex?.news?.items || [];
  const newsHtml = !news.length ? noExtra() : `${news.map(newsRow).join('')}
    <p class="muted small">Fuente: <a href="${esc(ex.news.url)}" target="_blank" rel="noopener">${esc(ex.news.source)}</a></p>`;
  return {
    title: 'Eventos',
    html: `${tabs}<div id="tab-body" style="margin-top:12px">${tab === 'news' ? newsHtml : eventsHtml}</div>`,
    mount(el) {
      el.querySelector('.seg').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) location.replace(`#/events${b.dataset.tab === 'news' ? '?tab=news' : ''}`);
      });
      const box = $('#ev', el);
      if (!box) return;
      let group = groups[0];
      // A search looks in every group; otherwise the chosen group (or every event with stones).
      const show = () => {
        const words = ($('#evq', el).value || '').toLowerCase().split(/\s+/).filter(Boolean);
        const list = words.length ? items.filter((e) => words.every((w) => e.title.toLowerCase().includes(w)))
          : group === '__stones' ? withStones.slice().sort((a, b) => b.stones - a.stones) : items.filter((e) => e.group === group);
        box.innerHTML = list.length ? list.map((e) => `
          <a class="ev" href="${esc(e.url)}" target="_blank" rel="noopener" title="${esc(e.title)}">
            <img loading="lazy" alt="" src="${esc(e.image)}"><span>${esc(e.title)}${e.stones ? ` <b class="stones">💎 ${e.stones}</b>` : ''}${words.length ? ` <i class="muted">· ${esc(groupName(e.group))}</i>` : ''}</span></a>`).join('')
          : '<div class="empty">No hay eventos con ese nombre.</div>';
      };
      el.querySelector('.chips').addEventListener('click', (e) => {
        const c = e.target.closest('.chip');
        if (!c) return;
        el.querySelectorAll('.chips .chip').forEach((x) => x.classList.toggle('on', x === c));
        group = c.dataset.g;
        $('#evq', el).value = '';
        show();
      });
      let t;
      $('#evq', el).addEventListener('input', () => { clearTimeout(t); t = setTimeout(show, 150); });
      show();
    },
  };
};

// ----- Tier list (DokkanStats community votes) -----

const TREND = { up: '<span class="trend up" title="Sube">▲</span>', down: '<span class="trend down" title="Baja">▼</span>', same: '' };

function tierTile(u) {
  const c = cardById(u.cardId, u.title, u.name);
  const img = c ? cardImg(c) : `https://assets.dokkanstats.com/assets/global/en/character/thumb/card_${u.cardId}_thumb/card_${u.cardId}_thumb.png`;
  const href = c ? `#/card/${enc(c.page)}` : `https://dokkanstats.com/en/cards/${u.id}/`;
  return `<a class="tile" href="${esc(href)}" ${c ? '' : 'target="_blank" rel="noopener"'} title="${esc(u.title)}">
    <span class="pic"><img class="thumb" loading="lazy" alt="" src="${esc(img)}" data-fallback="${esc(c?.image || '')}">${rtTag(c)}</span>${TREND[u.trend] || ''}
    <div class="nm">${esc(u.name)}</div></a>`;
}

views.tierlist = () => {
  const tl = store.extra?.tierlist;
  if (!tl?.tiers?.length) return { title: 'Tier list', html: noExtra() };
  return {
    title: 'Tier list',
    html: `<p class="muted small" style="margin-top:0">Las mejores cartas LR y UR según los votos de la comunidad de
      <a href="${esc(tl.url)}" target="_blank" rel="noopener">${esc(tl.source)}</a>. ▲▼ = sube o baja respecto a la última vez.</p>
      ${tl.tiers.map((t) => `<h2><span><span class="tier-badge">${esc(t.tier)}</span> <span class="muted small">puestos ${esc(t.ranks)}</span></span></h2>
        <div class="grid">${t.units.map(tierTile).join('')}</div>`).join('')}
      ${tl.updated ? `<p class="muted small">Última vez que cambió: ${fmtDate(tl.updated)}</p>` : ''}`,
  };
};

// ----- Team builder -----
// The team being edited lives in `editing` while you move between the editor and the card picker.

let editing = null; // { id, name, ids: [7 card ids or null], history: [previous ids], fromList }
const teamCards = () => editing.ids.map((id) => (id ? store.cards.get(id) || null : null));
const newTeam = () => ({ id: String(Date.now()), name: 'Equipo nuevo', ids: Array(T.SLOTS).fill(null), history: [] });
let allCats = null;
const knownCategories = () => (allCats ||= new Set([...store.cards.values()].flatMap((c) => c.categories)));

// Every change goes through here so it can be undone.
function changeTeam(fn) {
  (editing.history ||= []).push([...editing.ids]);
  if (editing.history.length > 30) editing.history.shift();
  fn(editing.ids);
  route();
}

function deleteTeam(id) {
  T.saveTeams(T.loadTeams().filter((t) => t.id !== id));
  if (editing?.id === id) editing = null;
}

views.teams = () => {
  if (!store.cards.size) return firstRunView();
  const list = T.loadTeams();
  const row = (t, i) => {
    const cards = t.ids.map((id) => (id ? store.cards.get(id) : null));
    const leader = cards[0];
    return `<div class="team-row">
      <a class="row" href="#/team/${i}">
        ${leader ? `<img class="banner-img sq" alt="" src="${esc(cardImg(leader))}">` : '<span class="mini-empty big"></span>'}
        <div class="info"><b>${esc(t.name)}</b>
          <span class="muted small">${cards.filter(Boolean).length}/7 cartas · coste ${T.summary(cards).cost}${cards.some(Boolean) ? ` · sinergia ${T.synergy(cards, T.arrange(cards, t.order), { known: knownCategories(), tierOf }).total}` : ''}</span>
          <div class="minis">${cards.slice(1).map((c) => c ? `<img loading="lazy" alt="" src="${esc(cardImg(c))}">` : '<span class="mini-empty"></span>').join('')}</div>
        </div></a>
      <button class="icon-btn danger" data-del="${esc(t.id)}" aria-label="Borrar ${esc(t.name)}">🗑</button>
    </div>`;
  };
  return {
    title: 'Equipos',
    html: `<div class="btns" style="margin-top:0"><a class="btn primary" href="#/team/new?fresh">+ Nuevo equipo</a></div>
      ${list.length ? `<h2>Mis equipos <span class="muted small">${list.length}</span></h2>${list.map(row).join('')}`
        : '<div class="empty">Todavía no tienes equipos.<br>Crea uno: elige un líder y la app te recomienda las mejores cartas para él, o pulsa «Completar» y lo monta ella.</div>'}
      <p class="muted small">Los equipos se guardan en este móvil. Usa «Compartir» para pasarlos a otro dispositivo.</p>`,
    mount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-del]');
        if (!b) return;
        const t = T.loadTeams().find((x) => x.id === b.dataset.del);
        if (t && confirm(`¿Borrar el equipo «${t.name}»? No se puede deshacer.`)) { deleteTeam(t.id); toast('Equipo borrado'); route(); }
      });
    },
  };
};

// Tier list position -> 0..1 rating, for the synergy score.
const TIER_SCORE = { 'S++': 1, 'S+': 0.95, S: 0.9, 'S-': 0.85, 'A+': 0.8, A: 0.75, 'A-': 0.7, 'B+': 0.65, B: 0.6, 'B-': 0.55 };
function tierOf(card) {
  for (const t of store.extra?.tierlist?.tiers || []) {
    if (t.units.some((u) => u.cardId === card.id || (card.awakensFrom || []).includes(u.cardId))) return TIER_SCORE[t.tier] ?? 0.6;
  }
  return null;
}

const shareUrl = () => `${location.origin}${location.pathname}#/team/new?c=${T.encodeTeam(editing.ids)}&o=${(editing.order || T.DEFAULT_ORDER).join('')}`;

views.team = (params, which) => {
  if (!store.cards.size) return firstRunView();
  const saved = T.loadTeams();
  // "?c=" = team opened from a share link; "?fresh" = "New team" button. Both are then dropped from
  // the address so coming back from the card picker keeps the team being edited.
  if (params.get('c') || params.has('fresh')) {
    editing = params.get('c') ? { ...newTeam(), name: 'Equipo compartido', ids: T.decodeTeam(params.get('c')) } : newTeam();
    const o = (params.get('o') || '').split('').map(Number);
    if (o.length === T.SLOTS && new Set(o).size === T.SLOTS) editing.order = o;
    history.replaceState(null, '', '#/team/new');
  } else if (/^\d+$/.test(which) && saved[+which] && (!editing || editing.id !== saved[+which].id)) {
    editing = { ...saved[+which], ids: [...saved[+which].ids], order: saved[+which].order ? [...saved[+which].order] : null, history: [], fromList: true };
  }
  if (!editing) editing = newTeam();
  editing.order ||= [...T.DEFAULT_ORDER];

  const all = [...store.cards.values()].filter(T.isFighter);
  const team = teamCards();
  const order = editing.order;
  const units = T.arrange(team, order);
  const leader = team[0], friend = team[T.SLOTS - 1];
  const lc = leader ? T.leaderClauses(leader) : [];
  const fc = friend ? T.leaderClauses(friend) : [];
  const filled = team.filter(Boolean).length;
  const members = team.slice(1, T.SLOTS - 1);
  const known = knownCategories();
  const view = T.unitLinkView(units, store.linkFx);
  const syn = T.synergy(team, units, { known, tierOf });
  const lStats = T.leaderStats(leader, team), fStats = T.leaderStats(friend, team);
  const own = team.slice(0, T.SLOTS - 1).filter(Boolean).map((c) => c.name);
  const dupes = [...new Set(own.filter((n, k) => own.indexOf(n) !== k))];
  const hasFx = Object.keys(store.linkFx || {}).length > 0;
  const tab = editing.tab || 'summary';

  // --- leader / friend boxes ---
  const targets = (clauses) => [...new Set(clauses.filter((c) => !c.extra).flatMap((c) => [
    ...c.categories.filter((x) => known.has(x)), ...c.types.map((t) => (c.cls ? c.cls + ' ' : '') + t),
    ...(c.classOnly ? [`Clase ${c.cls}`] : []), ...(c.all ? ['Todos'] : [])]))];
  const leadBox = (c, clauses, stats, slotIdx, label) => `<button class="lead-box2" data-slot="${slotIdx}">
      <span class="lb-label">${label}</span>
      ${c ? `<img alt="" src="${esc(cardImg(c))}"><span class="lb-team">Equipo: +${stats?.total || 0}%</span>
        <span class="lb-targets">${targets(clauses).slice(0, 3).map((t) => `<i>${esc(t)}</i>`).join('')}</span>` : '<span class="plus">+</span>'}
    </button>`;

  // --- formation board ---
  const cell = (pos) => {
    const c = units[pos];
    const slotIdx = order[pos];
    const v = view[pos];
    const lv = c && leader ? T.coverage(leader, c, lc) : null;
    const fv = c && friend ? T.coverage(friend, c, fc) : null;
    const role = slotIdx === 0 ? '<span class="role l">L</span>' : slotIdx === T.SLOTS - 1 ? '<span class="role f">A</span>' : '';
    if (!c) return `<button class="fcell empty" data-pos="${pos}" style="grid-area:p${pos}"><span class="plus">+</span></button>`;
    return `<button class="fcell tb-${c.type.toLowerCase()}" data-pos="${pos}" style="grid-area:p${pos}">
      <span class="fimg"><img alt="" src="${esc(cardImg(c))}">${role}${rtTag(c)}</span>
      <span class="fbadges">
        <i class="${lv?.covered ? 'b-ok' : 'b-no'}">L ${lv?.covered ? lv.pct + '%' : '—'}</i>
        <i class="${fv?.covered ? 'b-ok' : 'b-no'}">A ${fv?.covered ? fv.pct + '%' : '—'}</i>
      </span>
      <span class="fbadges">${hasFx ? `<i class="b-atk">ATK ${v.atk}%</i><i class="b-def">DEF ${v.def}%</i><i class="b-ki">Ki +${v.ki}</i>` : `<i class="b-lk">${v.names.length} links</i>`}</span>
    </button>`;
  };

  // --- tabs ---
  const ring = (n) => `<svg class="ring" viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" class="ring-bg"/>
    <circle cx="40" cy="40" r="34" class="ring-fg ${n >= 85 ? 'hi' : n >= 65 ? 'mid' : 'lo'}" stroke-dasharray="${(n / 100) * 213.6} 213.6" transform="rotate(-90 40 40)"/>
    <text x="40" y="47" text-anchor="middle">${n}</text></svg>`;
  const bar = (label, n) => `<div class="sbar"><span>${label}</span><span class="bar-track"><span class="${n >= 85 ? 'hi' : n >= 65 ? 'mid' : 'lo'}" style="width:${n}%"></span></span><b>${n}</b></div>`;
  const mk = T.teamMakeup(team);
  const sum = T.summary(team);
  const tl = T.teamLinks(team);
  const cats = T.sharedCategories(team);
  const thumbs = (list) => list.map((u) => `<img alt="" loading="lazy" src="${esc(cardImg(u))}">`).join('');
  const summaryTab = !filled ? '<p class="muted">Añade cartas para ver el resumen.</p>' : `
    <div class="box syn">${ring(syn.total)}<div class="syn-bars">
      ${bar('Cobertura del líder', syn.parts.coverage)}${bar('Calidad de links', syn.parts.links)}
      ${bar('Condiciones de pasiva', syn.parts.passive)}${bar('Apoyo', syn.parts.support)}${bar('Valoración (tier list)', syn.parts.rating)}</div></div>
    <p class="muted small">Sinergia calculada con la cobertura de líder y amigo, los links activos en cada turno, las categorías que piden las pasivas, el apoyo entre unidades y la tier list.</p>
    ${leader || friend ? `<h3 class="sec">Habilidades de líder</h3>
      ${[[leader, lStats, 'L'], [friend, fStats, 'A']].filter(([c]) => c).map(([c, s, k]) => `<div class="box lb-row"><span class="role ${k === 'L' ? 'l' : 'f'}">${k}</span>
        <div><b>mín ${s.min}% · media ${s.avg}%</b><div class="small muted">${c.leader.seza || c.leader.eza || c.leader.base}</div></div></div>`).join('')}` : ''}
    <div class="mk-grid">
      <div class="box"><span class="muted small">Coste</span><b>${sum.cost}</b></div>
      <div class="box"><span class="muted small">Tipos</span><span>${Object.entries(sum.types).filter(([, n]) => n).map(([t, n]) => `<i class="type t-${t.toLowerCase()}">${t} ${n}</i>`).join(' ')}</span></div>
      <div class="box"><span class="muted small">Rareza</span><span>${Object.entries(mk.rarity).map(([r, n]) => `<i class="badge ${r.toLowerCase()}">${r} ${n}</i>`).join(' ')}</span></div>
      <div class="box"><span class="muted small">Despertar</span><span>EZA ${mk.eza}/${mk.count} · SEZA ${mk.seza}/${mk.count}</span></div>
    </div>
    <div class="seg sub" id="subtab"><button data-s="links" class="${editing.sub !== 'cats' ? 'on' : ''}">Links (${tl.shared.length})</button><button data-s="cats" class="${editing.sub === 'cats' ? 'on' : ''}">Categorías (${cats.length})</button></div>
    ${editing.sub === 'cats'
      ? `<div class="box bars">${cats.map((c) => `<a class="bar" href="#/cards?category=${enc(c.name)}"><span class="bar-name">${esc(c.name)}</span><span class="bar-track"><span style="width:${Math.round((c.count / T.SLOTS) * 100)}%"></span></span><b>${c.count}/7</b></a>`).join('')}</div>`
      : `<h3 class="sec">Links compartidos (${tl.shared.length})</h3>${tl.shared.map((l) => `<div class="box link-row"><div class="lr-head"><span class="lv">Lv10</span><b>${esc(l.name)}</b><span class="${l.count >= 6 ? 'ok' : l.count >= 4 ? 'warn' : 'muted'}">${l.count}/7</span></div>
          ${store.linkFx[l.name] ? `<div class="small muted">${esc(store.linkFx[l.name])}</div>` : ''}<div class="lr-units">${thumbs(l.units)}</div></div>`).join('')}
        ${tl.unused.length ? `<h3 class="sec">Links sin usar (${tl.unused.length})</h3><div class="tags">${tl.unused.map((l) => `<span title="${esc(store.linkFx[l.name] || '')}">${esc(l.name)}</span>`).join('')}</div>` : ''}`}`;

  const rotTab = filled < 2 ? '<p class="muted">Añade más cartas para ver las rotaciones.</p>' : T.combos(units).map((c) => {
    const chip = (a, b) => { const n = a && b ? T.sharedLinks(a, b).length : 0; return `<span class="lk ${n >= 4 ? 'hi' : n ? 'mid' : ''}">${n}</span>`; };
    const unitBox = (u) => {
      if (!u) return '<span class="rc"><span class="mini-empty"></span></span>';
      const t = T.linkTotals(c.active.get(u) || [], store.linkFx);
      return `<span class="rc"><img alt="" src="${esc(cardImg(u))}">${hasFx ? `<i class="b-atk">ATK ${t.atk}%</i><i class="b-def">DEF ${t.def}%</i><i class="b-ki">Ki +${t.ki}</i>` : `<i class="b-lk">${(c.active.get(u) || []).length}</i>`}</span>`;
    };
    const [a, m, b] = c.line;
    return `<div class="box rot"><div class="rot-head"><b>Rotación ${c.rotation} · Floater ${c.floater}</b><span class="ok">${c.total} links</span></div>
      <div class="rot-line">${unitBox(a)}${chip(a, m)}${unitBox(m)}${chip(m, b)}${unitBox(b)}</div></div>`;
  }).join('');

  const unitsTab = !filled ? '' : team.map((c, i) => {
    if (!c) return '';
    const l = leader ? T.coverage(leader, c, lc) : null;
    const f = friend ? T.coverage(friend, c, fc) : null;
    const checks = T.passiveCategoryChecks(team, c, known);
    const support = T.supportLines(c);
    const pctTxt = (v) => (v ? (v.covered ? `<span class="ok">+${v.pct}%${v.ki ? ` Ki +${v.ki}` : ''}</span>` : '<span class="no">no</span>') : '—');
    return `<details class="unit"><summary><img alt="" src="${esc(cardImg(c))}">
        <span class="u-main"><b>${esc(c.name)}</b><span class="small muted">${T.SLOT_NAMES[i]} · ${c.rarity} ${c.cls} ${c.type}</span></span>
        <span class="u-cov small">L ${pctTxt(l)}<br>A ${pctTxt(f)}</span></summary>
      ${checks.length ? `<div class="small"><b>Su pasiva pide aliados de:</b><div class="tags">${checks.map((k) => `<span class="${k.allies ? 'chk-y' : 'chk-n'}">${k.allies ? '✓' : '✗'} ${esc(k.name)}${k.allies ? ` (${k.allies})` : ''}</span>`).join('')}</div></div>` : ''}
      ${support.length ? `<div class="small"><b>Apoyo al equipo:</b><ul>${support.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      <a class="small" href="#/card/${enc(c.page)}">Ver ficha completa →</a></details>`;
  }).join('');

  // --- assistant panel ---
  let assist = '';
  const emptySlot = team.findIndex((c, k) => !c && k > 0 && k < T.SLOTS - 1);
  if (!leader && members.some(Boolean)) {
    const sug = T.suggestLeaders(members, all, 6);
    const n = members.filter(Boolean).length;
    assist = sug.length ? `<h2>Líderes para estas cartas</h2><div class="reco">${sug.map((s) => `
      <button class="reco-card" data-lead="${esc(s.card.page)}"><img alt="" src="${esc(cardImg(s.card))}">
        <b>${esc(s.card.name)}</b><span class="ok">Cubre ${s.covered}/${n}</span><span class="muted">${leaderStrength(s.card)}%</span></button>`).join('')}</div>` : '';
  } else if (!leader) {
    assist = '<div class="hint">👉 Toca <b>Líder</b> para empezar. Después te recomiendo las cartas que mejor encajan, o pulsa <b>Completar</b> y monto el equipo entero. <b>Aleatorio</b> crea uno al azar.</div>';
  } else if (emptySlot >= 0) {
    const rec = T.recommend(team, all, 10, emptySlot);
    assist = rec.length ? `<h2>Recomendadas para tu equipo <span class="muted small">toca para añadir</span></h2><div class="reco">${rec.map((r) => `
      <button class="reco-card" data-add="${esc(r.card.page)}"><img alt="" src="${esc(cardImg(r.card))}">
        <b>${esc(r.card.name)}</b>
        <span class="ok">+${r.lead?.covered ? r.lead.pct : r.friend?.pct || 0}%</span>
        <span class="muted">${r.links} links${r.helps ? ' · ✓ pasiva' : ''}</span></button>`).join('')}</div>` : '';
  }

  return {
    title: 'Equipo',
    back: true,
    html: `
      <input class="search team-name" id="tname" value="${esc(editing.name)}" maxlength="40" aria-label="Nombre del equipo">
      <div class="toolbar-btns">
        <button class="tbtn" id="undo" ${editing.history?.length ? '' : 'disabled'}>↶<span>Deshacer</span></button>
        <button class="tbtn accent" id="fill" ${filled < T.SLOTS ? '' : 'disabled'}>✨<span>Completar</span></button>
        <button class="tbtn" id="opt" ${filled >= 4 ? '' : 'disabled'}>⚙<span>Optimizar</span></button>
        <button class="tbtn" id="rand">🎲<span>Aleatorio</span></button>
        <button class="tbtn" id="save">💾<span>Guardar</span></button>
        <button class="tbtn" id="share" ${filled ? '' : 'disabled'}>↗<span>Compartir</span></button>
        ${editing.fromList ? '<button class="tbtn danger" id="del">🗑<span>Borrar</span></button>' : ''}
      </div>
      <div class="leads2">${leadBox(leader, lc, lStats, 0, 'LÍDER')}${leadBox(friend, fc, fStats, T.SLOTS - 1, 'AMIGO')}</div>
      <div class="board-wrap">
        <div class="board">
          <span class="blabel" style="grid-area:h1">ROTACIÓN 1</span>
          <span class="blabel" style="grid-area:h2">ROTACIÓN 2</span>
          <span class="blabel fl" style="grid-area:hf">FLOATERS</span>
          ${[0, 1, 2, 3, 4, 5, 6].map(cell).join('')}
        </div>
        <svg class="board-lines" aria-hidden="true"></svg>
      </div>
      <div id="slot-actions"></div>
      ${dupes.length ? `<p class="small warn">⚠ No se pueden llevar dos cartas con el mismo nombre: ${dupes.map(esc).join(', ')}</p>` : ''}
      ${!hasFx && filled ? '<p class="muted small">El ATK/DEF/Ki de los links aparecerá cuando se actualice la base de datos de cartas.</p>' : ''}
      ${assist}
      ${filled ? `<div class="seg tabs" id="tabs">
        <button data-t="summary" class="${tab === 'summary' ? 'on' : ''}">Resumen</button>
        <button data-t="rot" class="${tab === 'rot' ? 'on' : ''}">Rotaciones</button>
        <button data-t="units" class="${tab === 'units' ? 'on' : ''}">Unidades</button></div>
        <div class="tab-body">${tab === 'rot' ? rotTab : tab === 'units' ? `<div class="units">${unitsTab}</div>` : summaryTab}</div>` : ''}`,
    mount(el) {
      let moving = null;
      const actions = $('#slot-actions', el);
      $('#tname', el).addEventListener('input', (e) => { editing.name = e.target.value || 'Equipo'; });

      // Link lines between the cards that attack together.
      const drawLines = () => {
        const svg = el.querySelector('.board-lines');
        const wrap = el.querySelector('.board-wrap');
        if (!svg || !wrap) return;
        const box = wrap.getBoundingClientRect();
        svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
        const at = (pos) => { const r = el.querySelector(`.fcell[data-pos="${pos}"] img`)?.getBoundingClientRect(); return r && { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, w: r.width / 2 }; };
        const colors = ['#ffcf4a', '#ff9d1f', '#39c27a', '#2f8cff', '#9b5cff', '#ff4d4d', '#5ad1e6'];
        let out = '';
        const pairs = [[0, 1], [2, 3], [1, 4], [1, 5], [1, 6], [3, 4], [3, 5], [3, 6]];
        for (const [a, b] of pairs) {
          const A = at(a), B = at(b);
          if (!A || !B || !units[a] || !units[b]) continue;
          const n = T.sharedLinks(units[a], units[b]).length;
          for (let k = 0; k < n; k++) {
            const off = (k - (n - 1) / 2) * 3;
            const x1 = A.x + A.w * 0.8, x2 = B.x - B.w * 0.8;
            const mx = (x1 + x2) / 2;
            out += `<path d="M${x1},${A.y + off} C${mx},${A.y + off} ${mx},${B.y + off} ${x2},${B.y + off}" stroke="${colors[k % colors.length]}" />`;
          }
        }
        svg.innerHTML = out;
      };
      requestAnimationFrame(drawLines);
      el.querySelectorAll('.board img').forEach((img) => img.addEventListener('load', drawLines, { once: true }));
      addEventListener('resize', drawLines);

      const openSlot = (slotIdx) => { location.hash = `#/team-pick/${slotIdx}`; };
      el.querySelector('.leads2').addEventListener('click', (e) => {
        const b = e.target.closest('[data-slot]');
        if (b) openSlot(+b.dataset.slot);
      });
      el.querySelector('.board').addEventListener('click', (e) => {
        const b = e.target.closest('.fcell');
        if (!b) return;
        const pos = +b.dataset.pos;
        if (moving !== null) { // second tap of "Mover": swap the two positions in the formation
          const from = moving; moving = null;
          (editing.history ||= []).push([...editing.ids]);
          [editing.order[from], editing.order[pos]] = [editing.order[pos], editing.order[from]];
          route(); return;
        }
        const slotIdx = editing.order[pos];
        if (!editing.ids[slotIdx]) { openSlot(slotIdx); return; }
        el.querySelectorAll('.fcell').forEach((s) => s.classList.toggle('sel', s === b));
        actions.innerHTML = `<div class="slot-menu">
          <button class="btn" data-a="pick">Cambiar</button>
          <button class="btn" data-a="move">Mover</button>
          <a class="btn" href="#/card/${enc(editing.ids[slotIdx])}">Ficha</a>
          <button class="btn" data-a="del">Quitar</button></div>`;
        actions.onclick = (ev) => {
          const a = ev.target.closest('[data-a]')?.dataset.a;
          if (a === 'pick') openSlot(slotIdx);
          if (a === 'del') changeTeam((ids) => { ids[slotIdx] = null; });
          if (a === 'move') { moving = pos; actions.innerHTML = '<p class="small ok">Toca la posición con la que quieres intercambiarla.</p>'; }
        };
      });
      el.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add]');
        const lead = e.target.closest('[data-lead]');
        const t = e.target.closest('#tabs [data-t]');
        const s = e.target.closest('#subtab [data-s]');
        if (add) {
          const k = editing.ids.findIndex((x, n) => !x && n > 0 && n < T.SLOTS - 1);
          if (k >= 0) changeTeam((ids) => { ids[k] = add.dataset.add; });
        }
        if (lead) changeTeam((ids) => { ids[0] = lead.dataset.lead; if (!ids[T.SLOTS - 1]) ids[T.SLOTS - 1] = lead.dataset.lead; });
        if (t) { editing.tab = t.dataset.t; route(); }
        if (s) { editing.sub = s.dataset.s; route(); }
      });
      $('#undo', el).addEventListener('click', () => { const prev = editing.history?.pop(); if (prev) { editing.ids = prev; route(); } });
      const optimize = () => {
        const best = T.optimizeFormation(teamCards(), editing.order);
        const before = T.formationScore(T.arrange(teamCards(), editing.order));
        editing.order = best.order;
        return [before, best.score];
      };
      $('#fill', el).addEventListener('click', () => {
        const done = T.autoFill(teamCards(), all);
        (editing.history ||= []).push([...editing.ids]);
        done.forEach((c, k) => { editing.ids[k] = c?.page || null; });
        if (editing.ids.every(Boolean)) optimize();
        toast('Equipo completado y ordenado. Puedes deshacerlo con ↶');
        route();
      });
      $('#opt', el).addEventListener('click', () => {
        const [before, after] = optimize();
        toast(after > before ? `Formación mejorada: ${before} → ${after} links` : 'La formación ya era la mejor');
        route();
      });
      $('#rand', el).addEventListener('click', () => {
        const leaders = all.filter((c) => c.rarity !== 'SSR' && leaderStrength(c) >= 150);
        const pickL = leaders[Math.floor(Math.random() * leaders.length)];
        if (!pickL) return;
        (editing.history ||= []).push([...editing.ids]);
        const done = T.autoFill([pickL, null, null, null, null, null, pickL], all);
        done.forEach((c, k) => { editing.ids[k] = c?.page || null; });
        editing.order = [...T.DEFAULT_ORDER];
        optimize();
        toast(`Equipo aleatorio con ${pickL.name} de líder`);
        route();
      });
      $('#save', el).addEventListener('click', () => {
        const list = T.loadTeams();
        const k = list.findIndex((t) => t.id === editing.id);
        const data = { id: editing.id, name: editing.name, ids: editing.ids, order: editing.order };
        if (k >= 0) list[k] = data; else list.unshift(data);
        toast(T.saveTeams(list) ? 'Equipo guardado' : 'No se pudo guardar en este dispositivo');
        if (!editing.fromList) { editing.fromList = true; route(); }
      });
      $('#share', el).addEventListener('click', () => shareLink(editing.name, shareUrl()));
      $('#del', el)?.addEventListener('click', () => {
        if (!confirm(`¿Borrar el equipo «${editing.name}»? No se puede deshacer.`)) return;
        deleteTeam(editing.id);
        toast('Equipo borrado');
        location.hash = '#/teams';
      });
      return () => removeEventListener('resize', drawLines);
    },
  };
};


// Best boost of a Leader Skill, ignoring ones aimed at names rather than real categories/types.
let knownCats = null;
function leaderStrength(card) {
  if (!knownCats) knownCats = new Set([...store.cards.values()].flatMap((c) => c.categories));
  const usable = T.leaderClauses(card).filter((c) => c.all || c.types.length || c.classOnly || c.categories.some((x) => knownCats.has(x)));
  return usable.length ? Math.max(...usable.map((c) => c.pct)) : 0;
}

// Card picker for one slot of the team.
const pick = { q: '', lead: true, mine: false, rarity: new Set(), type: new Set() };
views['team-pick'] = (params, slotStr) => {
  if (!editing) { location.replace('#/teams'); return { title: '', html: '' }; }
  const i = +slotStr;
  const team = teamCards();
  const hasLeader = !!(team[0] || team[T.SLOTS - 1]);
  const isLeaderSlot = i === 0 || i === T.SLOTS - 1;
  const chip = (g, v, label, extra = '') => `<button class="chip ${extra} ${pick[g].has(v) ? 'on' : ''}" data-g="${g}" data-v="${v}">${label}</button>`;
  return {
    title: `Elegir: ${T.SLOT_NAMES[i]}`,
    back: true,
    html: `<input class="search" type="search" id="pq" placeholder="Buscar carta…" value="${esc(pick.q)}" autocomplete="off">
      <div class="chips">
        ${i !== T.SLOTS - 1 && owned.size ? `<button class="chip mine ${pick.mine ? 'on' : ''}" data-g="mine">★ Solo mis cartas</button>` : ''}
        ${hasLeader && !isLeaderSlot ? `<button class="chip ${pick.lead ? 'on' : ''}" data-g="lead">Bajo el líder</button>` : ''}
        ${['LR', 'UR', 'SSR'].map((r) => chip('rarity', r, r)).join('')}
        ${['AGL', 'TEQ', 'INT', 'STR', 'PHY'].map((t) => chip('type', t, t, 't-' + t.toLowerCase())).join('')}
      </div>
      <p class="muted small" id="pcount"></p>
      <div class="pick-list" id="plist"></div><div class="sentinel" id="pmore"></div>`,
    mount(el) {
      const others = team.map((c, k) => (k === i ? null : c));
      const score = T.candidateScorer(others);
      const leader = others[0], friend = others[T.SLOTS - 1];
      const lc = leader ? T.leaderClauses(leader) : null;
      const fc = friend ? T.leaderClauses(friend) : null;
      let list = [], shown = 0;
      const box = $('#plist', el);
      const rowHtml = (c) => {
        const l = lc && T.coverage(leader, c, lc);
        const links = others.filter(Boolean).reduce((n, o) => n + T.sharedLinks(c, o).length, 0);
        const lead = isLeaderSlot ? { pct: leaderStrength(c) } : null;
        return `<button class="row pick" data-id="${esc(c.page)}">
          <img class="banner-img sq" loading="lazy" alt="" src="${esc(cardImg(c))}">
          <span class="info"><b>${esc(c.name)}</b><span class="muted small">${esc(c.title)}</span>
          <span class="small">${c.rarity} ${c.cls} ${c.type}
            ${l ? (l.covered ? ` · <span class="ok">Líder +${l.pct}%</span>` : ' · <span class="no">fuera del líder</span>') : ''}
            ${others.some(Boolean) ? ` · ${links} links` : ''}
            ${lead ? ` · <span class="ok">Líder ${lead.pct}%</span>` : ''}${isOwned(c) ? ' · <span class="own">★ tuya</span>' : ''}</span></span></button>`;
      };
      const more = () => { box.insertAdjacentHTML('beforeend', list.slice(shown, shown + 40).map(rowHtml).join('')); shown += 40; };
      const refresh = () => {
        const words = pick.q.toLowerCase().split(/\s+/).filter(Boolean);
        // Game rule: your own 6 units can't share a name (the friend is the exception).
        const takenNames = new Set(others.slice(0, T.SLOTS - 1).filter(Boolean).map((c) => c.name));
        const isFriend = i === T.SLOTS - 1;
        list = [...store.cards.values()].filter((c) => T.isFighter(c) &&
          (!pick.mine || isFriend || !owned.size || owned.has(c.page)) &&
          (!pick.rarity.size || pick.rarity.has(c.rarity)) &&
          (!pick.type.size || pick.type.has(c.type)) &&
          (isFriend || !takenNames.has(c.name)) &&
          words.every((w) => c.search.includes(w)) &&
          (!pick.lead || !hasLeader || isLeaderSlot ||
            (lc && T.coverage(leader, c, lc).covered) || (fc && T.coverage(friend, c, fc).covered)));
        if (isLeaderSlot) list.sort((a, b) => leaderStrength(b) - leaderStrength(a) || byRelease(a, b));
        else { const s = new Map(list.map((c) => [c.page, score(c)])); list.sort((a, b) => s.get(b.page) - s.get(a.page) || byRelease(a, b)); }
        $('#pcount', el).textContent = `${list.length} cartas${isLeaderSlot ? ' · ordenadas por fuerza del líder' : hasLeader ? ' · las que más links comparten con tu equipo, primero' : ''}`;
        shown = 0; box.innerHTML = ''; more();
      };
      let t;
      $('#pq', el).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { pick.q = e.target.value; refresh(); }, 150); });
      el.querySelector('.chips').addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        const g = b.dataset.g;
        if (g === 'lead' || g === 'mine') pick[g] = !pick[g];
        else pick[g].has(b.dataset.v) ? pick[g].delete(b.dataset.v) : pick[g].add(b.dataset.v);
        b.classList.toggle('on', g === 'lead' || g === 'mine' ? pick[g] : pick[g].has(b.dataset.v));
        refresh();
      });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('.pick');
        if (!b) return;
        (editing.history ||= []).push([...editing.ids]);
        editing.ids[i] = b.dataset.id;
        // A leader is usually also brought as the friend.
        if (i === 0 && !editing.ids[T.SLOTS - 1]) editing.ids[T.SLOTS - 1] = b.dataset.id;
        history.back();
      });
      const io = new IntersectionObserver((en) => { if (en[0].isIntersecting && shown < list.length) more(); }, { rootMargin: '600px' });
      io.observe($('#pmore', el));
      refresh();
      return () => io.disconnect();
    },
  };
};

views.settings = () => ({
  title: 'Ajustes',
  html: `
    <h2>App</h2>
    <div class="box kv">
      <b>Versión</b><span>${APP_VERSION} · <a href="#" id="notes-now">Novedades</a> · <a href="${CHANGELOG_URL}" target="_blank" rel="noopener">Historial</a></span>
      <b>Canal</b><span>${CHANNEL === 'beta' ? 'Beta (pruebas)' : 'Estable'}</span>
    </div>
    <p class="muted small">${CHANNEL === 'beta'
      ? `Estás en la <b>beta</b>: aquí salen primero las funciones nuevas para probarlas. Tus datos y equipos de la beta van aparte. <a href="${STABLE_URL}">Ir a la versión estable</a>`
      : `¿Quieres probar las funciones nuevas antes que nadie? <a href="${BETA_URL}">Abrir la beta</a> (se instala aparte y no toca tus datos).`}</p>
    <h2>Tus datos</h2>
    <div class="box kv">
      <b>Mis cartas</b><span>${owned.size} <a href="#/cards" id="see-mine">Ver</a></span>
      <b>Equipos guardados</b><span>${T.loadTeams().length}</span>
    </div>
    <p class="muted small">Se guardan solo en este móvil${CHANNEL === 'beta' ? ' (y aparte de la versión estable)' : ''}. Haz una copia antes de cambiar de móvil o borrar los datos del navegador.</p>
    <div class="btns">
      <button class="btn" id="backup">Copiar copia de seguridad</button>
      <button class="btn" id="restore">Restaurar copia</button>
    </div>
    <h2>Base de datos</h2>
    <div class="box kv">
      <b>Cartas</b><span>${store.cards.size}</span>
      <b>Banners</b><span>${bannerList().length}</span>
      <b>Última actualización</b><span id="last">${store.lastSync ? `${fmtDate(store.lastSync)} (${ago(store.lastSync)})` : 'nunca'}</span>
    </div>
    <p class="muted small">La app busca novedades cada vez que la abres y cada ${AUTO_SYNC_MIN} minutos mientras está abierta. Solo descarga lo que ha cambiado.</p>
    <div class="btns">
      <button class="btn primary" id="sync-now" ${isSyncing() ? 'disabled' : ''}>Buscar novedades ahora</button>
      <button class="btn" id="sync-full" ${isSyncing() ? 'disabled' : ''}>Volver a descargar todo</button>
    </div>
    <p class="muted small" id="sync-msg"></p>
    <h2>Fuentes</h2>
    <div class="box small">
      <b>Cartas:</b> <a href="https://dokkan.fyi/" target="_blank" rel="noopener">DOKKAN.FYI</a>, con datos sacados directamente del juego. Se recogen cada 3 horas en GitHub${store.cardsVersion ? ` (última versión: ${fmtDate(store.cardsVersion)}, ${ago(store.cardsVersion)})` : ''}.<br>
      <b>Banners, tier list y eventos activos:</b> <a href="https://dokkanstats.com/en/" target="_blank" rel="noopener">DokkanStats</a>, actualizados desde el PC.<br>
      <b>Noticias del juego:</b> <a href="https://dokkan.fyi/news" target="_blank" rel="noopener">DOKKAN.FYI</a>.<br>
      Estos se recogen cada 3 horas en GitHub${store.extra?.generated ? ` (última vez con cambios: ${fmtDate(store.extra.generated)}, ${ago(store.extra.generated)})` : ''}.<br><br>
      Los textos del juego están en inglés. App de fans, sin relación con Bandai Namco ni Akatsuki.</div>`,
  mount(el) {
    $('#see-mine', el).addEventListener('click', () => { filters.mine = true; saveFilters(); });
    $('#backup', el).addEventListener('click', async () => {
      const text = JSON.stringify({ app: 'DokkanDB', v: 1, date: new Date().toISOString(), owned: [...owned], teams: T.loadTeams() });
      try { await navigator.clipboard.writeText(text); toast('Copia copiada: pégala en una nota o mándatela por mensaje.'); }
      catch { prompt('Copia este texto y guárdalo:', text); }
    });
    $('#restore', el).addEventListener('click', () => {
      const text = prompt('Pega aquí tu copia de seguridad:');
      if (!text) return;
      try {
        const data = JSON.parse(text);
        if (data.app !== 'DokkanDB' || !Array.isArray(data.owned) || !Array.isArray(data.teams)) throw new Error('formato');
        if (!confirm(`La copia tiene ${data.owned.length} cartas tuyas y ${data.teams.length} equipos. Se añadirán a los que ya tienes. ¿Seguir?`)) return;
        data.owned.forEach((p) => setOwned(String(p), true));
        const have = new Set(T.loadTeams().map((t) => t.id));
        T.saveTeams([...T.loadTeams(), ...data.teams.filter((t) => t && Array.isArray(t.ids) && !have.has(t.id))]);
        toast('Copia restaurada');
        route();
      } catch { alert('Ese texto no es una copia de seguridad de DokkanDB.'); }
    });
    $('#sync-now', el).addEventListener('click', () => runSync({ manual: true }));
    $('#sync-full', el).addEventListener('click', () => { if (confirm('¿Volver a descargar toda la base de datos? Tarda unos minutos.')) runSync({ full: true }); });
  },
});

// ---------- router ----------

const ROUTES = [
  [/^#?\/?$/, 'home', 'home'],
  [/^#\/cards$/, 'cards', 'cards'],
  [/^#\/card\/(.+)$/, 'card', 'cards'],
  [/^#\/banners$/, 'banners', 'banners'],
  [/^#\/banner\/(.+)$/, 'banner', 'banners'],
  [/^#\/teams$/, 'teams', 'teams'],
  [/^#\/team\/(.+)$/, 'team', 'teams'],
  [/^#\/team-pick\/(\d)$/, 'team-pick', 'teams'],
  [/^#\/events$/, 'events', 'events'],
  [/^#\/tierlist$/, 'tierlist', 'tierlist'],
  [/^#\/settings$/, 'settings', 'settings'],
];

let cleanup = null;
const scrollPos = new Map();

function route() {
  const [path, query = ''] = location.hash.split('?');
  const params = new URLSearchParams(query);
  let view = 'home', tab = 'home', arg;
  for (const [re, v, t] of ROUTES) {
    const m = re.exec(path || '');
    if (m) { view = v; tab = t; arg = m[1] && decodeURIComponent(m[1]); break; }
  }
  cleanup?.(); cleanup = null;
  const out = views[view](params, arg);
  // A fresh <main> for every screen, so click handlers from the previous screen don't pile up.
  const old = $('main');
  const main = old.cloneNode(false);
  old.replaceWith(main);
  $('#title').innerHTML = out.title;
  $('#back').hidden = !out.back;
  main.innerHTML = out.html;
  cleanup = out.mount?.(main) || null;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, scrollPos.get(location.hash) || 0);
}

addEventListener('hashchange', route);
addEventListener('scroll', () => scrollPos.set(location.hash, scrollY), { passive: true });

// Broken card image -> try the backup copy (data-fallback) once.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.fallback && img.src !== img.dataset.fallback) {
    img.src = img.dataset.fallback;
    img.dataset.fallback = '';
  }
}, true);

// ---------- syncing ----------

function setPill(state, text) {
  const pill = $('#pill');
  pill.className = 'sync-pill ' + state;
  $('#pill-text').textContent = text;
}

async function runSync(opts = {}) {
  setPill('busy', 'Actualizando…');
  const msg = () => $('#sync-msg');
  const job = sync({ ...opts, onProgress: (m) => { if (msg()) msg().textContent = m; } });
  if (location.hash.startsWith('#/settings') || !store.cards.size) route();
  try {
    const r = await job;
    setPill('', 'Al día');
    const parts = [];
    if (r.newCards.length) parts.push(`${r.newCards.length} carta${r.newCards.length > 1 ? 's' : ''} nueva${r.newCards.length > 1 ? 's' : ''}`);
    if (r.newBanners.length) parts.push(`${r.newBanners.length} banner${r.newBanners.length > 1 ? 's' : ''} nuevo${r.newBanners.length > 1 ? 's' : ''}`);
    if (r.newNews?.length) parts.push(`${r.newNews.length} noticia${r.newNews.length > 1 ? 's' : ''}`);
    if (parts.length) toast('Novedades: ' + parts.join(' y '));
    else if (opts.manual || opts.full) toast(r.full ? `Base de datos descargada: ${store.cards.size} cartas` : 'Todo está al día');
    // Refresh the screen unless the user is reading a detail page.
    if (!/^#\/(card|banner)\//.test(location.hash) || $('main .empty')) route();
  } catch (err) {
    console.error(err);
    setPill('err', 'Sin conexión');
    if (msg()) msg().textContent = 'No se pudo actualizar: ' + err.message;
    if (opts.manual || opts.full) toast(navigator.onLine ? 'No se pudieron descargar las novedades. Inténtalo más tarde.' : 'Sin conexión a internet. Se usan los datos guardados.');
    if (location.hash.startsWith('#/settings') || !store.cards.size) route();
  }
}

// ---------- what's new (from CHANGELOG.md) ----------

// The notes for this version: NEXT.md while it is a beta, else its section of CHANGELOG.md.
async function versionNotes() {
  const isBeta = APP_VERSION.includes('-beta');
  const res = await fetch(isBeta ? 'NEXT.md' : 'CHANGELOG.md', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const md = (await res.text()).replace(/<!--[\s\S]*?-->/g, '');
  if (isBeta) {
    const notes = md.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
    if (!notes) throw new Error('no notes');
    return notes;
  }
  const sec = md.split(/^## /m).slice(1).find((s) => s.startsWith(`${APP_VERSION} `));
  if (!sec) throw new Error('no notes');
  return sec.slice(sec.indexOf('\n') + 1).trim();
}

// Just enough Markdown for the changelog: nested "- " lists, **bold** and `code`.
function notesHtml(md) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  let html = '';
  let depth = 0;
  const close = (to) => { while (depth > to) { html += '</li></ul>'; depth--; } };
  for (const line of md.split(/\r?\n/)) {
    const m = /^(\s*)- (.*)$/.exec(line);
    if (!m) { if (line.trim()) { close(0); html += `<p>${inline(line.trim())}</p>`; } continue; }
    const d = Math.min(Math.floor(m[1].length / 2) + 1, depth + 1);
    if (d > depth) { html += '<ul><li>'; depth = d; } else { close(d); html += '</li><li>'; }
    html += inline(m[2]);
  }
  close(0);
  return html;
}

async function showWhatsNew() {
  const notes = notesHtml(await versionNotes());
  const box = document.createElement('div');
  box.className = 'modal-back';
  box.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Novedades">
    <h2>Novedades de la versión ${esc(APP_VERSION)}</h2>
    <div class="notes">${notes}</div>
    <div class="btns"><button class="btn primary" data-close>Vale</button>
      <a class="btn" href="${RELEASES_URL}" target="_blank" rel="noopener">Todas las versiones</a></div></div>`;
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-close]')) box.remove(); });
  document.body.append(box);
}

function autoSync() {
  if (isSyncing() || !navigator.onLine) return;
  if (!store.cards.size) return; // first download waits for the user to press the button
  if (store.extra && store.lastSync && Date.now() - Date.parse(store.lastSync) < AUTO_SYNC_MIN * 60000) return;
  runSync();
}

// ---------- start ----------

(async function start() {
  await loadLocal();
  setPill('', store.lastSync ? 'Al día' : 'Sin datos');
  route();
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notes-now')) return;
    e.preventDefault();
    showWhatsNew().catch(() => toast('No se pudieron cargar las novedades.'));
  });
  if (CHANNEL === 'beta') $('#title').insertAdjacentHTML('afterend', '<span class="chan-badge">BETA</span>');
  // Tell the user when the app itself was updated, with that version's notes.
  try {
    const key = storageName('appVersion');
    const seen = localStorage.getItem(key);
    localStorage.setItem(key, APP_VERSION);
    if (seen && seen !== APP_VERSION) showWhatsNew().catch(() => toast(`App actualizada a la versión ${APP_VERSION}`));
  } catch { /* storage unavailable: skip the notice */ }
  if (!store.cards.size && navigator.onLine) runSync({ full: true });
  else autoSync();
  setInterval(autoSync, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) autoSync(); });
  addEventListener('online', autoSync);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();

onChange((ev) => { if (ev.type === 'sync-done' && location.hash.startsWith('#/settings')) { const l = $('#last'); if (l) l.textContent = `${fmtDate(store.lastSync)} (${ago(store.lastSync)})`; } });
