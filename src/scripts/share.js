// 課表 ⇄ 網址參數（?s=...，base64url 的精簡 JSON），收到時驗證數值範圍

const LIMIT = { prep: [0, 60], work: [5, 900], rest: [0, 600], rounds: [1, 50], warn: [0, 30], seg: [1, 900] };
const PACES = ['slow', 'mid', 'fast'];
const THEMES = ['bell', 'beep', 'voice'];

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
const int = (v, [lo, hi]) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error('range');
  return n;
};
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, max);

export function encodePreset(p) {
  const o = {
    n: p.name, t: p.theme, w: p.warn, h: p.half ? 1 : 0,
    c: p.combo && p.combo.on ? [p.combo.level === 'adv' ? 2 : 1, PACES.indexOf(p.combo.pace) + 1, ({ en: 1, zh: 2, ja: 3 })[p.combo.lang] || 1, ['normal', 'urgent', 'max'].indexOf(p.combo.intensity || 'urgent') + 1] : 0,
  };
  if (p.segments) o.s = p.segments.map((s) => [s.type[0], s.dur, s.name || '', s.how || '']);
  else Object.assign(o, { p: p.prep, r: p.work, b: p.rest, k: p.rounds });
  return b64url(JSON.stringify(o));
}

export function shareUrl(p, page = '') {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  return new URL(base + page + '?s=' + encodePreset(p), location.origin).href;
}

// 回傳驗證過的課表物件；格式錯或數值不合理回傳 null
export function decodePreset(str) {
  try {
    const o = JSON.parse(unb64url(str));
    const p = {
      name: text(o.n, 30) || '分享的課表',
      theme: THEMES.includes(o.t) ? o.t : 'bell',
      warn: int(o.w ?? 10, LIMIT.warn),
      half: !!o.h,
      combo: Array.isArray(o.c)
        ? { on: true, level: o.c[0] === 2 ? 'adv' : 'basic', pace: PACES[(o.c[1] || 2) - 1] || 'mid', lang: ['en', 'zh', 'ja'][(o.c[2] || 1) - 1] || 'en', intensity: ['normal', 'urgent', 'max'][(o.c[3] || 2) - 1] || 'urgent' }
        : { on: false, level: 'basic', pace: 'mid', lang: 'en', intensity: 'urgent' },
    };
    if (Array.isArray(o.s)) {
      if (!o.s.length || o.s.length > 120) return null;
      const T = { p: 'prepare', w: 'work', r: 'rest' };
      p.segments = o.s.map((s) => {
        if (!T[s[0]]) throw new Error('type');
        return { type: T[s[0]], dur: int(s[1], LIMIT.seg), name: text(s[2], 30), how: text(s[3], 200) };
      });
      if (!p.segments.some((s) => s.type === 'work')) return null;
    } else {
      Object.assign(p, { prep: int(o.p, LIMIT.prep), work: int(o.r, LIMIT.work), rest: int(o.b, LIMIT.rest), rounds: int(o.k, LIMIT.rounds) });
    }
    return p;
  } catch {
    return null;
  }
}
