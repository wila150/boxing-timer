// Service Worker（build 時產生）：預先快取所有頁面＋頁面用到的 _astro 檔，沒網路也能開任何課表
import data from '../data/routines.json';

export function GET() {
  const pages = ['./', './routines/', './builder/', ...data.routines.map((r) => `./routines/${r.slug}/`)];
  const files = ['./manifest.webmanifest', './img/icon.svg', './img/icon-192.png', './img/icon-512.png', './img/apple-touch-icon.png', './audio/coach.mp3'];
  const body = `// RoundBell 離線快取：先拿網路，斷網用快取（版本 ${Date.now()}）
const CACHE = 'roundbell-${Date.now().toString(36)}';
const PAGES = ${JSON.stringify(pages)};
const FILES = ${JSON.stringify(files)};

async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(FILES);
  const assets = new Set();
  await Promise.all(PAGES.map(async (p) => {
    try {
      const res = await fetch(p, { cache: 'no-cache' });
      if (!res.ok) return;
      const html = await res.clone().text();
      await c.put(p, res);
      for (const m of html.matchAll(/(?:href|src)="([^"]*\\/_astro\\/[^"]+)"/g)) assets.add(m[1]);
    } catch {}
  }));
  await Promise.all([...assets].map((a) => c.add(a).catch(() => {})));
}
self.addEventListener('install', (e) => { e.waitUntil(precache().then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('roundbell') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('./') : undefined))
  );
});
`;
  return new Response(body, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
}
