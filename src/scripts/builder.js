// 課表編輯器：動作庫 → 動作清單 → 段落課表（跟計時器同一個格式），可開始／存本機／分享
import { decodePreset, shareUrl } from './share.js';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const MOVES = JSON.parse($('movesData').textContent);
const DRAFT_KEY = 'roundbell_builder_v1', STORE_KEY = 'roundbell_v1', MAX_SEG = 120;

let items = [];   // {name, sec, how}
let cat = MOVES.categories[0].id;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
function opts() {
  return {
    name: $('bName').value.trim().slice(0, 30) || '我的拳擊課表',
    prep: clamp($('bPrep').value, 0, 60), rest: clamp($('bRest').value, 0, 300),
    sets: clamp($('bSets').value, 1, 10), setRest: clamp($('bSetRest').value, 0, 600),
    warn: clamp($('bWarn').value, 0, 30), theme: $('bTheme').value,
    combo: { on: !!$('bCombo').value, level: $('bCombo').value || 'basic', pace: $('bPace').value },
  };
}
function toPreset() {
  const o = opts(), seg = [];
  if (o.prep) seg.push({ type: 'prepare', dur: o.prep, name: '準備', how: '' });
  for (let s = 1; s <= o.sets; s++) {
    items.forEach((it, i) => {
      seg.push({ type: 'work', dur: it.sec, name: o.sets > 1 ? `${it.name}（第 ${s} 組）`.slice(0, 30) : it.name, how: it.how || '' });
      if (i < items.length - 1 && o.rest) seg.push({ type: 'rest', dur: o.rest, name: '休息', how: '' });
    });
    if (s < o.sets && o.setRest) seg.push({ type: 'rest', dur: o.setRest, name: '組間休息', how: '' });
  }
  return { name: o.name, warn: o.warn, half: false, theme: o.theme, combo: o.combo, segments: seg };
}

function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ items, opts: opts() })); } catch {} }
function applyOpts(o) {
  $('bName').value = o.name; $('bPrep').value = o.prep; $('bRest').value = o.rest; $('bSets').value = o.sets; $('bSetRest').value = o.setRest;
  $('bWarn').value = o.warn; $('bTheme').value = o.theme; $('bCombo').value = o.combo && o.combo.on ? o.combo.level : ''; $('bPace').value = (o.combo && o.combo.pace) || 'mid';
}

function renderLib() {
  $('tabs').innerHTML = MOVES.categories.map((c) => `<button class="${c.id === cat ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('');
  $('lib').innerHTML = MOVES.moves.filter((m) => m.cat === cat).map((m) =>
    `<button class="mv" data-id="${m.id}"><b>＋ ${esc(m.name)}</b><small>${m.sec} 秒・${esc(m.how)}</small></button>`).join('');
}
function render() {
  const p = toPreset();
  const total = p.segments.reduce((s, x) => s + x.dur, 0);
  $('sum').textContent = items.length ? `${items.length} 個動作・${p.segments.length} 段・總長 ${fmt(total)}` : '';
  $('emptyHint').hidden = items.length > 0;
  $('items').innerHTML = items.map((it, i) => `
    <li data-i="${i}">
      <span class="no">${i + 1}</span>
      <input class="nm" type="text" maxlength="24" value="${esc(it.name)}" aria-label="動作名稱">
      <span class="sec"><button data-a="dec" aria-label="減 5 秒">−</button><input type="number" min="5" max="900" step="5" value="${it.sec}" aria-label="秒數"><button data-a="inc" aria-label="加 5 秒">＋</button></span>
      <span class="ops"><button data-a="up" aria-label="上移" ${i ? '' : 'disabled'}>↑</button><button data-a="down" aria-label="下移" ${i < items.length - 1 ? '' : 'disabled'}>↓</button><button data-a="del" aria-label="刪除">✕</button></span>
    </li>`).join('');
  const over = p.segments.length > MAX_SEG;
  ['bStart', 'bSave', 'bShare'].forEach((id) => { $(id).disabled = !items.length || over; });
  if (over) $('sum').textContent += `（超過 ${MAX_SEG} 段，請減少組數或動作）`;
  saveDraft();
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200); }

$('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; cat = b.dataset.c; renderLib(); });
$('lib').addEventListener('click', (e) => {
  const b = e.target.closest('.mv'); if (!b) return;
  const m = MOVES.moves.find((x) => x.id === b.dataset.id);
  items.push({ name: m.name.replace(/（\d）$/, ''), sec: m.sec, how: m.how });
  render(); toast(`已加入：${m.name}`);
});
$('items').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const i = +b.closest('li').dataset.i, a = b.dataset.a;
  if (a === 'dec' || a === 'inc') items[i].sec = clamp(items[i].sec + (a === 'dec' ? -5 : 5), 5, 900);
  else if (a === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
  else if (a === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
  else if (a === 'del') items.splice(i, 1);
  render();
});
$('items').addEventListener('change', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  const it = items[+li.dataset.i];
  if (e.target.classList.contains('nm')) it.name = e.target.value.trim().slice(0, 24) || '動作';
  else it.sec = clamp(e.target.value, 5, 900);
  render();
});
document.querySelector('.builder').addEventListener('change', (e) => { if (e.target.closest('.bx') && !e.target.closest('#items')) render(); });

$('bStart').addEventListener('click', () => { location.href = shareUrl(toPreset()); });
$('bSave').addEventListener('click', () => {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY)) || null;
    if (!d || !Array.isArray(d.presets)) { location.href = shareUrl(toPreset()); return; } // 還沒開過計時器：交給首頁的匯入視窗
    const p = toPreset(); p.id = 'c' + Date.now().toString(36);
    d.presets.push(p); d.activeId = p.id;
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
    toast('已存到我的課表，回計時器就看得到');
  } catch { toast('存不進去（瀏覽器可能關閉了儲存空間）'); }
});
$('bShare').addEventListener('click', async () => {
  const url = shareUrl(toPreset());
  try { await navigator.clipboard.writeText(url); toast('已複製分享連結'); return; } catch {}
  try { if (navigator.share) { await navigator.share({ title: opts().name, url }); return; } } catch { return; }
  prompt('複製這個連結：', url);
});
$('bClear').addEventListener('click', () => { if (items.length && !confirm('清空目前的動作？')) return; items = []; render(); });

/* ---------- 啟動：網址帶課表 → 載入；否則用上次的草稿 ---------- */
function loadFromPreset(p) {
  const works = p.segments ? p.segments.filter((s) => s.type === 'work') : [];
  const rest = p.segments ? (p.segments.find((s) => s.type === 'rest') || {}).dur || 0 : p.rest;
  const prep = p.segments ? (p.segments.find((s) => s.type === 'prepare') || {}).dur || 0 : p.prep;
  // 編輯器產生的多組課表：名稱結尾「（第 N 組）」→ 還原成第 1 組的動作＋組數＋組間休息
  const setOf = (s) => { const m = /（第 (\d+) 組）$/.exec(s.name || ''); return m ? +m[1] : 0; };
  const sets = Math.max(1, ...works.map(setOf));
  const firstSet = sets > 1 ? works.filter((s) => setOf(s) === 1) : works;
  const setRest = p.segments ? (p.segments.find((s) => s.name === '組間休息') || {}).dur || 0 : 60;
  const restIn = p.segments ? (p.segments.find((s) => s.type === 'rest' && s.name !== '組間休息') || {}).dur || 0 : p.rest;
  items = p.segments ? firstSet.map((s) => ({ name: (s.name || '動作').replace(/（第 \d+ 組）$/, ''), sec: s.dur, how: s.how || '' }))
    : Array.from({ length: p.rounds }, (_, i) => ({ name: `第 ${i + 1} 回合`, sec: p.work, how: '' }));
  applyOpts({ name: p.name, prep, rest: p.segments ? restIn : rest, sets, setRest: setRest || 60, warn: p.warn, theme: p.theme, combo: p.combo });
}
const q = new URLSearchParams(location.search).get('s');
const shared = q && decodePreset(q);
if (shared) { loadFromPreset(shared); history.replaceState(null, '', location.pathname); toast('已載入課表，可以開始修改'); }
else {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY)); if (d && Array.isArray(d.items)) { items = d.items; applyOpts(d.opts); } } catch {}
}
renderLib(); render();
