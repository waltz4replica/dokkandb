// App version. Don't change it by hand: scripts/release.ps1 sets it here, in sw.js and in
// package.json, and writes the CHANGELOG.md entry. See RELEASING.md.
export const APP_VERSION = '2.8.0-beta.5';
export const CHANGELOG_URL = 'https://github.com/waltz4replica/dokkandb/blob/main/CHANGELOG.md';
export const RELEASES_URL = 'https://github.com/waltz4replica/dokkandb/releases';

// Two copies of the app live on the same site: stable at /dokkandb/ and beta at /dokkandb/beta/.
// They share the browser's storage, so the beta keeps its data under separate names.
export const CHANNEL = typeof location !== 'undefined' && /\/beta\//.test(location.pathname) ? 'beta' : 'stable';
export const storageName = (name) => (CHANNEL === 'beta' ? `${name}-beta` : name);
export const STABLE_URL = 'https://waltz4replica.github.io/dokkandb/';
export const BETA_URL = 'https://waltz4replica.github.io/dokkandb/beta/';
