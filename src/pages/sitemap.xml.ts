// sitemap.xml（build 時產生）：交給 Google Search Console
import type { APIContext } from 'astro';
import data from '../data/routines.json';

export function GET({ site }: APIContext) {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const today = new Date().toISOString().slice(0, 10);
  const urls = ['', 'routines/', 'builder/', ...data.routines.map((r) => `routines/${r.slug}/`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${new URL(base + u, site)}</loc><lastmod>${today}</lastmod><priority>${u === '' ? '1.0' : u.startsWith('routines/') && u !== 'routines/' ? '0.8' : '0.9'}</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
