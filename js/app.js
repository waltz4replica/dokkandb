// Screens and navigation. Each screen is a function in `views` that returns HTML,
// and can optionally return a `mount(el)` function to wire up interactions.
// To add a new feature: add a view, a route in ROUTES and (optionally) a tab in index.html.

import { store, loadLocal, sync, onChange, isSyncing, cardById } from './sync.js';
import { cardThumb, fileUrl, pageUrl } from './wiki.js';

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

function tile(c) {
  const isNew = c.firstSeen && Date.now() - Date.parse(c.firstSeen) < 7 * 864e5;
  return `<a class="tile" href="#/card/${enc(c.page)}">
    ${thumbTag(c)}
    ${isNew ? '<span class="flag">NUEVA</span>' : ''}
    ${c.seza ? '<span class="flag eza">SEZA</span>' : c.eza ? '<span class="flag eza">EZA</span>' : ''}
    <div class="nm">${esc(c.name)}</div></a>`;
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

// ---------- views ----------

const views = {};

views.home = () => {
  if (!store.cards.size) return firstRunView();
  const cards = [...store.cards.values()];
  const latest = cards.filter((c) => c.rarity !== 'SSR').sort(byRelease).slice(0, 12);
  const recentlyAdded = cards.filter((c) => c.firstSeen).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen)).slice(0, 12);
  const eza = cards.filter((c) => c.dates.glbSeza || c.dates.glbEza || c.dates.jpSeza || c.dates.jpEza)
    .sort((a, b) => lastEza(b).localeCompare(lastEza(a))).slice(0, 12);
  const banners = [...store.banners.values()].sort(byAdded).slice(0, 4);
  const news = (store.extra?.news?.items || []).slice(0, 3);
  const top = (store.extra?.tierlist?.tiers || []).flatMap((t) => t.units).slice(0, 6);
  return {
    title: '<span class="logo">Dokkan</span>DB',
    html: `
      ${recentlyAdded.length ? `<h2>Añadidas a la base de datos</h2><div class="grid">${recentlyAdded.map(tile).join('')}</div>` : ''}
      ${news.length ? `<h2>Noticias del juego <a href="#/events?tab=news">Ver todas</a></h2>${news.map(newsRow).join('')}` : ''}
      ${top.length ? `<h2>Top de la tier list <a href="#/tierlist">Ver completa</a></h2><div class="grid">${top.map(tierTile).join('')}</div>` : ''}
      <h2>Últimas cartas <a href="#/cards">Ver todas</a></h2>
      <div class="grid">${latest.map(tile).join('')}</div>
      <h2>Últimos banners <a href="#/banners">Ver todos</a></h2>
      ${banners.map(bannerRow).join('')}
      <h2>Últimos EZA / SEZA</h2>
      <div class="grid">${eza.map(tile).join('')}</div>`,
  };
};
const lastEza = (c) => [c.dates.glbSeza, c.dates.jpSeza, c.dates.glbEza, c.dates.jpEza].filter(Boolean).sort().pop() || '';
const byAdded = (a, b) => (b.added || '').localeCompare(a.added || '');

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
const filters = { q: '', rarity: new Set(), type: new Set(), cls: new Set(), eza: false, sort: 'new', category: '' };

views.cards = (params) => {
  if (!store.cards.size) return firstRunView();
  if (params.get('category') != null) { filters.category = params.get('category'); filters.q = ''; }
  const chip = (group, val, label, extra = '') => `<button class="chip ${extra} ${filters[group].has(val) ? 'on' : ''}" data-g="${group}" data-v="${val}">${label}</button>`;
  return {
    title: 'Cartas',
    html: `
      <input class="search" type="search" placeholder="Buscar por nombre, categoría, link…" value="${esc(filters.q)}" id="q" autocomplete="off">
      <div class="chips">
        ${['LR', 'UR', 'SSR'].map((r) => chip('rarity', r, r)).join('')}
        ${['AGL', 'TEQ', 'INT', 'STR', 'PHY'].map((t) => chip('type', t, t, 't-' + t.toLowerCase())).join('')}
        ${chip('cls', 'Super', 'Super')}${chip('cls', 'Extreme', 'Extreme')}
        <button class="chip ${filters.eza ? 'on' : ''}" data-g="eza">EZA</button>
      </div>
      ${filters.category ? `<div class="chips"><button class="chip on" data-g="category">Categoría: ${esc(filters.category)} ✕</button></div>` : ''}
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
      const renderMore = () => {
        const next = list.slice(shown, shown + 60);
        grid.insertAdjacentHTML('beforeend', next.map(tile).join(''));
        shown += next.length;
      };
      const refresh = () => {
        list = filterCards();
        shown = 0;
        grid.innerHTML = list.length ? '' : '<div class="empty" style="grid-column:1/-1">No hay cartas con esos filtros.</div>';
        $('#count', el).textContent = `${list.length} cartas`;
        renderMore();
      };
      let t;
      $('#q', el).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { filters.q = e.target.value; refresh(); }, 150); });
      $('#sort', el).addEventListener('change', (e) => { filters.sort = e.target.value; refresh(); });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        const g = b.dataset.g;
        if (g === 'eza') filters.eza = !filters.eza;
        else if (g === 'category') { filters.category = ''; b.parentElement.remove(); }
        else filters[g].has(b.dataset.v) ? filters[g].delete(b.dataset.v) : filters[g].add(b.dataset.v);
        b.classList.toggle('on', g === 'eza' ? filters.eza : g === 'category' ? false : filters[g].has(b.dataset.v));
        refresh();
      });
      const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting && shown < list.length) renderMore(); }, { rootMargin: '600px' });
      io.observe($('#more', el));
      refresh();
      return () => io.disconnect();
    },
  };
};

function filterCards() {
  const words = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [...store.cards.values()].filter((c) =>
    (!filters.rarity.size || filters.rarity.has(c.rarity)) &&
    (!filters.type.size || filters.type.has(c.type)) &&
    (!filters.cls.size || filters.cls.has(c.cls)) &&
    (!filters.eza || c.eza || c.seza) &&
    (!filters.category || c.categories.includes(filters.category) || c.links.includes(filters.category)) &&
    words.every((w) => c.search.includes(w)));
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

views.card = (params, page) => {
  const c = store.cards.get(page);
  if (!c) return { title: 'Carta', back: true, html: `<div class="empty">Esta carta no está en la base de datos.<br><br><a href="https://dokkan.fyi/characters/${enc(page)}" target="_blank" rel="noopener">Buscar en DOKKAN.FYI</a></div>` };
  const levels = [['base', 'Base'], ...(c.eza ? [['eza', 'EZA']] : []), ...(c.seza ? [['seza', 'SEZA']] : [])];
  const t = c.type.toLowerCase();
  const skill = (label, name, body, cond) => body ? `<div class="box skill"><h3>${label}</h3>${name ? `<div class="sn">${esc(name)}</div>` : ''}<div class="desc">${body}</div>${cond ? `<div class="cond">${cond}</div>` : ''}</div>` : '';
  const render = (lv) => {
    const pick = (o) => (o ? o[lv] || (lv === 'seza' ? o.eza : '') || o.base : '');
    return `
      ${skill('Habilidad de líder', '', pick(c.leader))}
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
        ${c.cost ? `<span class="badge">Coste ${c.cost}</span>` : ''}${c.seza ? '<span class="badge">SEZA</span>' : c.eza ? '<span class="badge">EZA</span>' : ''}</div></div>
      </div>
      ${levels.length > 1 ? `<div class="seg" id="lv">${levels.map(([k, l], i) => `<button data-lv="${k}" class="${i === levels.length - 1 ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      <div id="skills" style="margin-top:10px">${render(levels[levels.length - 1][0])}</div>
      <div class="box"><table class="stats"><tr><th></th><th>Base</th><th>Máx.</th></tr>
        <tr><td>HP</td><td>${c.stats.hp[0] ?? '–'}</td><td>${c.stats.hp[1] ?? '–'}</td></tr>
        <tr><td>ATK</td><td>${c.stats.atk[0] ?? '–'}</td><td>${c.stats.atk[1] ?? '–'}</td></tr>
        <tr><td>DEF</td><td>${c.stats.def[0] ?? '–'}</td><td>${c.stats.def[1] ?? '–'}</td></tr></table>
        ${c.ki12 ? `<div class="small muted" style="margin-top:8px">Multiplicador a 12 de ki: ${esc(c.ki12)}</div>` : ''}</div>
      <h2>Links (${c.links.length})</h2><div class="tags">${c.links.map((l) => `<a href="#/cards?category=${enc(l)}">${esc(l)}</a>`).join('')}</div>
      <h2>Categorías (${c.categories.length})</h2><div class="tags">${c.categories.map((l) => `<a href="#/cards?category=${enc(l)}">${esc(l)}</a>`).join('')}</div>
      ${dateRows.length ? `<h2>Fechas</h2><div class="box dates"><span></span><b>Global</b><b>Japón</b>${dateRows.map(([l, g, j]) => `<b>${l}</b><span>${fmtDate(g) || '–'}</span><span>${fmtDate(j) || '–'}</span>`).join('')}</div>` : '<p class="muted small">Sin fecha de lanzamiento todavía (próximamente o solo en Japón).</p>'}
      <p class="small"><a href="${esc(sourceUrl(c))}" target="_blank" rel="noopener">Ver en DOKKAN.FYI ↗</a></p>`,
    mount(el) {
      $('#lv', el)?.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        el.querySelectorAll('#lv button').forEach((x) => x.classList.toggle('on', x === b));
        $('#skills', el).innerHTML = render(b.dataset.lv);
      });
    },
  };
};

function bannerRow(b) {
  const minis = b.newCards.slice(0, 6).map((x) => `<img loading="lazy" alt="" src="${esc(cardById(x.id)?.image || cardThumb(x.id))}">`).join('');
  return `<a class="row" href="#/banner/${enc(b.page)}">
    <img class="banner-img" loading="lazy" alt="" src="${esc(fileUrl(b.image, 360))}">
    <div class="info"><b>${esc(b.name)}</b><span class="muted small">${esc(b.kind)}${b.added ? ' · ' + fmtDate(b.added) : ''}</span>
    ${minis ? `<div class="minis">${minis}</div>` : ''}</div></a>`;
}

views.banners = () => {
  if (!store.cards.size) return firstRunView();
  const kinds = [...new Set([...store.banners.values()].map((b) => b.category))].sort();
  return {
    title: 'Banners',
    html: `<div class="chips"><button class="chip on" data-k="">Todos</button>${kinds.map((k) => `<button class="chip" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>
      <div id="list" style="margin-top:8px"></div><div class="sentinel" id="more"></div>`,
    mount(el) {
      let list = [], shown = 0;
      const box = $('#list', el);
      const more = () => { box.insertAdjacentHTML('beforeend', list.slice(shown, shown + 25).map(bannerRow).join('')); shown += 25; };
      const show = (k) => { list = [...store.banners.values()].filter((b) => !k || b.category === k).sort(byAdded); shown = 0; box.innerHTML = ''; more(); };
      el.addEventListener('click', (e) => {
        const c = e.target.closest('.chip');
        if (!c) return;
        el.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
        show(c.dataset.k);
      });
      const io = new IntersectionObserver((en) => { if (en[0].isIntersecting && shown < list.length) more(); }, { rootMargin: '600px' });
      io.observe($('#more', el));
      show('');
      return () => io.disconnect();
    },
  };
};

views.banner = (params, page) => {
  const b = store.banners.get(page);
  if (!b) return { title: 'Banner', back: true, html: '<div class="empty">Banner no encontrado.</div>' };
  const cardTile = (x) => {
    const c = cardById(x.id);
    if (c) return tile(c);
    return `<a class="tile" href="${esc(pageUrl(x.page))}" target="_blank" rel="noopener"><img class="thumb" loading="lazy" alt="" src="${esc(cardThumb(x.id))}"><div class="nm">${esc(x.page)}</div></a>`;
  };
  return {
    title: esc(b.name),
    back: true,
    html: `<img alt="" src="${esc(fileUrl(b.image, 800))}" style="width:100%;border-radius:12px;background:var(--bg2)">
      <p class="muted small">${esc(b.kind)}${b.added ? ' · añadido a la wiki el ' + fmtDate(b.added) : ''}${b.coins ? ' · ' + esc(b.coins) : ''}</p>
      ${b.newCards.length ? `<h2>Cartas nuevas</h2><div class="grid">${b.newCards.map(cardTile).join('')}</div>` : ''}
      ${b.featured.length ? `<h2>Destacadas</h2><div class="grid">${b.featured.map(cardTile).join('')}</div>` : ''}
      <p class="small" style="margin-top:20px"><a href="${esc(pageUrl(b.page))}" target="_blank" rel="noopener">Ver en la Dokkan Wiki ↗</a></p>`,
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
  const eventsHtml = !items.length ? noExtra() : `
    <div class="chips">${groups.map((g, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-g="${esc(g)}">${esc(groupName(g))} (${items.filter((e) => e.group === g).length})</button>`).join('')}</div>
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
      const show = (g) => {
        box.innerHTML = items.filter((e) => e.group === g).map((e) => `
          <a class="ev" href="${esc(e.url)}" target="_blank" rel="noopener" title="${esc(e.title)}">
            <img loading="lazy" alt="" src="${esc(e.image)}"><span>${esc(e.title)}</span></a>`).join('');
      };
      el.querySelector('.chips').addEventListener('click', (e) => {
        const c = e.target.closest('.chip');
        if (!c) return;
        el.querySelectorAll('.chips .chip').forEach((x) => x.classList.toggle('on', x === c));
        show(c.dataset.g);
      });
      show(groups[0]);
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
    <img class="thumb" loading="lazy" alt="" src="${esc(img)}" data-fallback="${esc(c?.image || '')}">${TREND[u.trend] || ''}
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

views.settings = () => ({
  title: 'Ajustes',
  html: `
    <h2>Base de datos</h2>
    <div class="box kv">
      <b>Cartas</b><span>${store.cards.size}</span>
      <b>Banners</b><span>${store.banners.size}</span>
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
      <b>Banners:</b> <a href="https://dbz-dokkanbattle.fandom.com/" target="_blank" rel="noopener">Dokkan Wiki</a> (Fandom, licencia CC BY-SA). La app la consulta directamente.<br><br>
      <b>Tier list y eventos activos:</b> <a href="https://dokkanstats.com/en/" target="_blank" rel="noopener">DokkanStats</a>.<br>
      <b>Noticias del juego:</b> <a href="https://dokkan.fyi/news" target="_blank" rel="noopener">DOKKAN.FYI</a>.<br>
      Estos se recogen cada 3 horas en GitHub${store.extra?.generated ? ` (última vez con cambios: ${fmtDate(store.extra.generated)}, ${ago(store.extra.generated)})` : ''}.<br><br>
      Los textos del juego están en inglés. App de fans, sin relación con Bandai Namco ni Akatsuki.</div>`,
  mount(el) {
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
  const main = $('main');
  $('#title').innerHTML = out.title;
  $('#back').hidden = !out.back;
  main.innerHTML = out.html;
  cleanup = out.mount?.(main) || null;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, scrollPos.get(location.hash) || 0);
}

addEventListener('hashchange', route);
addEventListener('scroll', () => scrollPos.set(location.hash, scrollY), { passive: true });

// Broken card image -> fall back to the page image from the wiki.
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
    if (opts.manual || opts.full) toast('No se pudo conectar con la wiki');
    if (location.hash.startsWith('#/settings') || !store.cards.size) route();
  }
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
  if (!store.cards.size && navigator.onLine) runSync({ full: true });
  else autoSync();
  setInterval(autoSync, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) autoSync(); });
  addEventListener('online', autoSync);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();

onChange((ev) => { if (ev.type === 'sync-done' && location.hash.startsWith('#/settings')) { const l = $('#last'); if (l) l.textContent = `${fmtDate(store.lastSync)} (${ago(store.lastSync)})`; } });
