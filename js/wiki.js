// Client for the Dokkan Wiki's public MediaWiki API (dbz-dokkanbattle.fandom.com).
// The API allows cross-site requests with origin=*, so the app can call it straight from the phone.

export const WIKI = 'https://dbz-dokkanbattle.fandom.com';
const API = WIKI + '/api.php';
const PAUSE_MS = 250; // be polite: small gap between requests

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(params, attempt = 1) {
  const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params });
  try {
    const res = await fetch(`${API}?${qs}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.info || json.error.code);
    await sleep(PAUSE_MS);
    return json;
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(1000 * 2 ** attempt);
    return call(params, attempt + 1);
  }
}

// Calls the API repeatedly while it says there is more ("continue").
async function* paged(params) {
  let cont = {};
  do {
    const json = await call({ ...params, ...cont });
    yield json;
    cont = json.continue || null;
  } while (cont);
}

function toPage(p) {
  return {
    title: p.title,
    wikitext: p.revisions?.[0]?.slots?.main?.content || '',
    image: p.thumbnail?.source || '',
    imageName: p.pageimage || '',
    touched: p.touched || '',
    categories: (p.categories || []).map((c) => c.title.replace(/^Category:/, '')),
  };
}

const PAGE_PROPS = {
  prop: 'revisions|pageimages|info',
  rvprop: 'content',
  rvslots: 'main',
  piprop: 'thumbnail|name',
  pithumbsize: '240',
};

/** Yields batches of full pages (up to 50 at a time) for every page in a category. */
export async function* pagesInCategory(category) {
  for await (const json of paged({ ...PAGE_PROPS, generator: 'categorymembers', gcmtitle: 'Category:' + category, gcmlimit: '50', gcmnamespace: '0' })) {
    yield (json.query?.pages || []).filter((p) => !p.missing).map(toPage);
  }
}

/** Title -> time the page was added to the category (used to sort banners by date). */
export async function categoryAddedTimes(category) {
  const out = {};
  for await (const json of paged({ list: 'categorymembers', cmtitle: 'Category:' + category, cmlimit: '500', cmprop: 'title|timestamp', cmnamespace: '0' })) {
    for (const m of json.query?.categorymembers || []) out[m.title] = m.timestamp;
  }
  return out;
}

/** Full pages for specific titles, including which of `categories` each belongs to. */
export async function pagesByTitle(titles, categories) {
  const out = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const params = { ...PAGE_PROPS, prop: PAGE_PROPS.prop + '|categories', titles: batch.join('|'), cllimit: 'max', clcategories: categories.map((c) => 'Category:' + c).join('|') };
    // A batch can need several calls before every page's categories are listed.
    const merged = new Map();
    for await (const json of paged(params)) {
      for (const p of json.query?.pages || []) {
        if (p.missing) continue;
        const prev = merged.get(p.title);
        if (!prev) merged.set(p.title, p);
        else {
          prev.categories = [...(prev.categories || []), ...(p.categories || [])];
          if (!prev.revisions && p.revisions) prev.revisions = p.revisions;
          if (!prev.thumbnail && p.thumbnail) prev.thumbnail = p.thumbnail;
        }
      }
    }
    out.push(...[...merged.values()].map(toPage));
  }
  return out;
}

/** Titles of articles created or edited since `sinceIso` (newest first). */
export async function changedSince(sinceIso) {
  const titles = new Set();
  for await (const json of paged({ list: 'recentchanges', rcnamespace: '0', rctype: 'edit|new', rcprop: 'title|timestamp', rclimit: '500', rcend: sinceIso })) {
    for (const c of json.query?.recentchanges || []) titles.add(c.title);
  }
  return [...titles];
}

/** URL of a wiki file (image), optionally resized. */
export function fileUrl(name, width) {
  if (!name) return '';
  const clean = name.replace(/^File:/i, '').trim().replace(/ /g, '_');
  return `${WIKI}/wiki/Special:FilePath/${encodeURIComponent(clean)}${width ? `?width=${width}` : ''}`;
}

export const cardThumb = (id) => (id ? fileUrl(`Card ${id} thumb.png`) : '');
export const pageUrl = (title) => `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
