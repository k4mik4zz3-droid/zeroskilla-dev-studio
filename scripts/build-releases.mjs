import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(join(root, 'releases-source.json'), 'utf8'));
const offline = process.argv.includes('--offline');
const repo = process.env.GITHUB_REPOSITORY || '';
const projects = ['infernal-rift', 'moj-notatnik', 'photomind', 'volvio-scanner', 'encloser-cad', 'padbridge'];
const channels = [
  ['infernal-rift', 'native'], ['infernal-rift', 'unity'],
  ['moj-notatnik', 'android'], ['moj-notatnik', 'windows'],
  ['photomind', 'android'], ['volvio-scanner', 'android'],
  ['encloser-cad', 'windows'], ['padbridge', 'windows']
];

function parseTag(tag) {
  for (const [project, channel] of channels) {
    const prefix = `${project}-${channel}-`;
    if (!tag.startsWith(prefix)) continue;
    const version = tag.slice(prefix.length);
    if (/^v\d+\.\d+\.\d+$/.test(version)) return { project, channel, version };
  }
  return null;
}

function versionOrder(a, b) {
  const va = a.version.slice(1).split('.').map(Number);
  const vb = b.version.slice(1).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return vb[i] - va[i];
  }
  return b.date.localeCompare(a.date);
}

function assetFiles(release, channel) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const hostPrefix = `https://github.com/${repo}/releases/download/`;
  return assets.filter((asset) => {
    const name = String(asset.name || '');
    const isApk = /\.apk$/i.test(name);
    const isZip = /\.zip$/i.test(name);
    const validChannel = channel === 'native' || channel === 'android' ? isApk
      : channel === 'windows' ? isZip : isApk || isZip;
    return validChannel && asset.state === 'uploaded' && asset.size > 0
      && String(asset.browser_download_url || '').startsWith(hostPrefix);
  }).map((asset) => ({
    type: /\.apk$/i.test(asset.name) ? 'APK' : 'ZIP',
    platform: /\.apk$/i.test(asset.name) ? 'Android' : 'Windows',
    name: asset.name,
    sizeBytes: asset.size,
    url: asset.browser_download_url,
    access: 'public'
  }));
}

async function fetchReleases() {
  if (offline) return [];
  if (!/^[a-z\d_.-]+\/[a-z\d_.-]+$/i.test(repo)) {
    throw new Error('Brak poprawnej zmiennej GITHUB_REPOSITORY (owner/repo).');
  }
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'zeroskilla-dev-studio-pages',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
      }
    });
    if (!response.ok) throw new Error(`Nie można pobrać wydań GitHub (HTTP ${response.status}).`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Nieprawidłowa odpowiedź GitHub Releases API.');
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.filter((release) => !release.draft);
}

const published = await fetchReleases();
const publishedByTag = new Map(published.map((release) => [release.tag_name, release]));
const records = new Map();

for (const planned of metadata.planned) {
  const parsed = parseTag(planned.tag);
  if (!parsed || !projects.includes(planned.project) || parsed.project !== planned.project || parsed.channel !== planned.channel || parsed.version !== planned.version) {
    throw new Error(`Niepoprawny wpis zaplanowanego wydania: ${planned.tag}`);
  }
  records.set(planned.tag, { ...planned });
}

for (const release of published) {
  const parsed = parseTag(String(release.tag_name || ''));
  if (!parsed) continue;
  const existing = records.get(release.tag_name) || {};
  const description = existing.description || String(release.name || '').slice(0, 160) || 'Nowe wydanie';
  records.set(release.tag_name, {
    project: parsed.project,
    channel: parsed.channel,
    version: parsed.version,
    tag: release.tag_name,
    date: existing.date || String(release.published_at || release.created_at || '').slice(0, 10),
    description
  });
}

const releases = Object.fromEntries(projects.map((project) => [project, { versions: [] }]));

for (const item of records.values()) {
  const actual = publishedByTag.get(item.tag);
  const files = actual ? assetFiles(actual, item.channel) : [];
  releases[item.project].versions.push({
    ...(item.project === 'infernal-rift' ? { engine: item.channel === 'native' ? 'Własny silnik' : 'Unity' } : {}),
    version: item.version,
    date: item.date,
    description: item.description,
    files,
    tag: item.tag,
    ...(actual?.prerelease ? { prerelease: true } : {})
  });
}

for (const project of projects) {
  const all = releases[project].versions;
  if (project === 'infernal-rift') {
    const native = all.filter((v) => v.engine === 'Własny silnik').sort(versionOrder).slice(0, 3);
    const unity = all.filter((v) => v.engine === 'Unity').sort(versionOrder).slice(0, 2);
    releases[project].versions = [...native, ...unity];
  } else {
    // Zachowaj jedno najnowsze wydanie osobno dla Androida i Windows.
    const android = all.filter((v) => v.tag.includes('-android-')).sort(versionOrder).slice(0, 1);
    const windows = all.filter((v) => v.tag.includes('-windows-')).sort(versionOrder).slice(0, 1);
    releases[project].versions = [...android, ...windows];
  }
}

const output = {
  schemaVersion: 2,
  lastChecked: new Date().toISOString().slice(0, 10),
  releases
};
await writeFile(join(root, 'dist', 'releases.json'), JSON.stringify(output, null, 2) + '\n');
console.log(`Katalog gotowy: ${Object.values(releases).reduce((n, p) => n + p.versions.length, 0)} wydań, ${Object.values(releases).flatMap((p) => p.versions).reduce((n, v) => n + v.files.length, 0)} plików.`);
