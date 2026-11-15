'use strict';
/* =========================================================
 * Store：本機儲存（課表、設定、訓練紀錄）
 * ========================================================= */
const KEY = 'roundbell_v1';
const BUILTIN = [
  { id: 'pro',   name: '職業拳擊', prep: 10, work: 180, rest: 60, rounds: 12, warn: 10, half: false, theme: 'bell' },
  { id: 'ama',   name: '業餘拳擊', prep: 10, work: 120, rest: 60, rounds: 3,  warn: 10, half: false, theme: 'bell' },
  { id: 'hiit',  name: 'HIIT 間歇', prep: 10, work: 40,  rest: 20, rounds: 8,  warn: 5,  half: false, theme: 'beep' },
  { id: 'tabata',name: 'Tabata',   prep: 10, work: 20,  rest: 10, rounds: 8,  warn: 3,  half: false, theme: 'beep' },
];
const Store = {
  data: null,
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
    if (!d || !Array.isArray(d.presets) || !d.presets.length) d = { presets: BUILTIN.map((p) => ({ ...p })), activeId: 'pro', log: [] };
    d.settings = Object.assign({ volume: 90, vibrate: true }, d.settings);
    d.log = Array.isArray(d.log) ? d.log : [];
    this.data = d;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {} },
  get active() { return this.data.presets.find((p) => p.id === this.data.activeId) || this.data.presets[0]; },
};

/* =========================================================
 * Audio：Web Audio 合成音效（零下載、零延遲、可預排）
 * ========================================================= */
const Audio = (() => {
  let ctx = null, master = null, noise = null;
  const live = new Set();
  try { if (navigator.audioSession) navigator.audioSession.type = 'transient'; } catch {}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 4;
      master = ctx.createGain();
      master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    master.gain.value = (Store.data.settings.volume / 100) * 0.9;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return ctx;
  }
  function track(src, stopAt) {
    live.add(src);
    src.onended = () => live.delete(src);
    src.stop(stopAt);
  }
  function env(t, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(master);
    return g;
  }
  // 銅鐘：不和諧泛音＋長尾音
  function strike(t, decay = 1.8, base = 830) {
    [[1, 1], [2.0, 0.55], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([r, a]) => {
      const o = ctx.createOscillator();
      o.frequency.value = base * r;
      const d = decay / (1 + r * 0.12);
      o.connect(env(t, 0.32 * a, d));
      o.start(t); track(o, t + d + 0.05);
    });
  }
  function buzz(t, len = 0.55, f = 330) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.01);
    g.gain.setValueAtTime(0.35, t + len - 0.04); g.gain.linearRampToValueAtTime(0.0001, t + len);
    lp.connect(g); g.connect(master);
    [['sawtooth', f], ['square', f * 1.005]].forEach(([type, fr]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.connect(lp);
      o.start(t); track(o, t + len + 0.02);
    });
  }
  function beep(t, f = 1000, len = 0.13, peak = 0.45) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    o.connect(env(t, peak, len)); o.start(t); track(o, t + len + 0.02);
  }
  // 木魚／拍板：短促雜訊＋木頭音
  function clack(t) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 5;
    s.connect(bp); bp.connect(env(t, 1.2, 0.07)); s.start(t); track(s, t + 0.1);
    const o = ctx.createOscillator(); o.frequency.value = 760; o.connect(env(t, 0.35, 0.09)); o.start(t); track(o, t + 0.12);
  }

  // 各種事件在各主題的聲音
  const SOUNDS = {
    start:  { bell: (t) => strike(t, 2.2),                         beep: (t) => buzz(t, 0.7) },
    end:    { bell: (t) => [0, 0.34, 0.68].forEach((d) => strike(t + d, 1.6)), beep: (t) => [0, 0.45, 0.9].forEach((d) => buzz(t + d, 0.32)) },
    warn:   { bell: (t) => { clack(t); clack(t + 0.16); clack(t + 0.5); clack(t + 0.66); }, beep: (t) => [0, 0.18, 0.36].forEach((d) => beep(t + d, 1500, 0.1)) },
    half:   { bell: (t) => { beep(t, 1200, 0.12, 0.3); beep(t + 0.2, 1200, 0.12, 0.3); } },
    tick:   { bell: (t) => beep(t, 880, 0.12) },
    finish: { bell: (t) => [0, 1.1, 2.2].forEach((d) => strike(t + d, 3.2)), beep: (t) => [0, 0.9, 1.8].forEach((d) => buzz(t + d, 0.7, 392)) },
  };
  function play(kind, theme, atPerf) {
    if (!ensure()) return;
    const t = Math.max(ctx.currentTime, ctx.currentTime + (atPerf - performance.now()) / 1000);
    const set = SOUNDS[kind];
    // 語音主題：聲音用較輕的提示，重點交給語音
    const fn = theme === 'beep' ? (set.beep || set.bell) : theme === 'voice' && (kind === 'start' || kind === 'end') ? (x) => beep(x, kind === 'start' ? 1320 : 660, 0.25) : set.bell;
    fn(t);
  }
  function cancel() {
    live.forEach((s) => { try { s.onended = null; s.stop(0); s.disconnect(); } catch {} });
    live.clear();
  }
  return { ensure, play, cancel };
})();

const Voice = {
  unlock() { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {} },
  say(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW'; u.rate = 1.05; u.volume = Store.data.settings.volume / 100;
      speechSynthesis.speak(u);
    } catch {}
  },
  stop() { try { speechSynthesis.cancel(); } catch {} },
};

/* =========================================================
 * WakeLock：訓練中螢幕不休眠
 * ========================================================= */
const Wake = {
  lock: null, want: false,
  async on() { this.want = true; try { if ('wakeLock' in navigator && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch {} },
  off() { this.want = false; try { this.lock && this.lock.release(); } catch {} this.lock = null; },
};

/* =========================================================
 * Engine：狀態機＋時間戳記計時（不碰畫面）
 * 狀態：idle → prepare → work(→warning) → rest → … → finished
 * ========================================================= */
const Engine = {
  state: 'idle',          // idle | running | paused | finished
  preset: null,
  phases: [],             // {type, dur(秒), round}
  idx: 0,
  plan: [],               // 從目前段開始的絕對時間 {i, start, end}
  events: [], evIdx: 0,   // 預排事件（語音／震動在 tick 觸發；聲音已交給 Web Audio）
  remainAtPause: 0,
  activeMs: 0, runFrom: 0,

  build(p) {
    const a = [];
    if (p.prep > 0) a.push({ type: 'prepare', dur: p.prep, round: 1 });
    for (let r = 1; r <= p.rounds; r++) {
      a.push({ type: 'work', dur: p.work, round: r });
      if (r < p.rounds && p.rest > 0) a.push({ type: 'rest', dur: p.rest, round: r });
    }
    return a;
  },
  start(p) {
    this.preset = { ...p };
    this.phases = this.build(p);
    this.activeMs = 0;
    this.schedule(0, this.phases[0].dur * 1000);
  },
  // 從第 idx 段、剩 remain 毫秒開始排整個剩餘時間軸，並把所有聲音一次預排進 Web Audio
  schedule(idx, remain) {
    const now = performance.now();
    this.idx = idx; this.plan = [];
    let t = now + remain;
    this.plan.push({ i: idx, start: t - this.phases[idx].dur * 1000, end: t });
    for (let i = idx + 1; i < this.phases.length; i++) {
      const s = t; t += this.phases[i].dur * 1000;
      this.plan.push({ i, start: s, end: t });
    }
    this.events = this.makeEvents().filter((e) => e.t >= now - 60);
    this.evIdx = 0;
    Audio.cancel();
    const theme = this.preset.theme;
    this.events.forEach((e) => e.sound && Audio.play(e.sound, theme, e.t));
    this.state = 'running'; this.runFrom = now;
  },
  makeEvents() {
    const p = this.preset, ev = [];
    const last = this.phases.length - 1;
    this.plan.forEach(({ i, start, end }) => {
      const ph = this.phases[i];
      if (ph.type === 'prepare' || ph.type === 'rest') {
        for (let k = 3; k >= 1; k--) if (ph.dur > k) ev.push({ t: end - k * 1000, sound: 'tick' });
        if (ph.type === 'prepare') ev.push({ t: start, say: '準備' });
        else ev.push({ t: start + 0, say: '休息', vib: [200] });
      } else {
        ev.push({ t: start, sound: 'start', say: '第' + ph.round + '回合，開始', vib: [400] });
        if (p.half && ph.dur >= 60) ev.push({ t: start + ph.dur * 500, sound: 'half', say: '一半' });
        if (p.warn > 0 && p.warn < ph.dur) ev.push({ t: end - p.warn * 1000, sound: 'warn', say: '最後' + p.warn + '秒', vib: [120, 80, 120] });
        if (i === last) ev.push({ t: end, sound: 'finish', say: '訓練完成，辛苦了', vib: [600, 200, 600] });
        else ev.push({ t: end, sound: 'end', vib: [300, 120, 300] });
      }
    });
    return ev.sort((a, b) => a.t - b.t);
  },
  // 依時間戳記算出目前狀態；退到背景回來也會自動快轉
  tick(now = performance.now()) {
    if (this.state !== 'running') return;
    while (this.evIdx < this.events.length && this.events[this.evIdx].t <= now) {
      const e = this.events[this.evIdx++];
      if (now - e.t < 1500) this.fire(e);
    }
    const cur = this.plan.find((x) => now < x.end);
    if (!cur) { this.finish(); return; }
    this.idx = cur.i;
  },
  fire(e) {
    if (this.preset.theme === 'voice' && e.say) Voice.say(e.say);
    if (e.vib && Store.data.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(e.vib); } catch {} }
  },
  current(now = performance.now()) {
    const ph = this.phases[this.idx];
    if (!ph) return null;
    let remain, total;
    if (this.state === 'paused') remain = this.remainAtPause;
    else if (this.state === 'running') remain = Math.max(0, this.plan.find((x) => x.i === this.idx).end - now);
    else remain = 0;
    total = this.state === 'running' ? this.plan[this.plan.length - 1].end - now
      : remain + this.phases.slice(this.idx + 1).reduce((s, x) => s + x.dur * 1000, 0);
    let type = ph.type;
    if (type === 'work' && this.preset.warn > 0 && remain <= this.preset.warn * 1000 && this.preset.warn < ph.dur) type = 'warning';
    return { ph, type, remain, total, frac: 1 - remain / (ph.dur * 1000) };
  },
  pause() {
    if (this.state !== 'running') return;
    const now = performance.now();
    this.remainAtPause = this.plan.find((x) => x.i === this.idx).end - now;
    this.activeMs += now - this.runFrom;
    Audio.cancel(); Voice.stop();
    this.state = 'paused';
  },
  resume() { if (this.state === 'paused') this.schedule(this.idx, this.remainAtPause); },
  skip() {
    if (this.state !== 'paused') return;
    if (this.idx + 1 >= this.phases.length) { this.finish(true); return; }
    this.schedule(this.idx + 1, this.phases[this.idx + 1].dur * 1000);
  },
  roundsDone() {
    const ph = this.phases[this.idx];
    if (this.state === 'finished' && this.completed) return this.preset.rounds;
    return this.phases.slice(0, this.idx).filter((x) => x.type === 'work').length;
  },
  finish(skipped) {
    if (this.state === 'running') this.activeMs += performance.now() - this.runFrom;
    this.completed = true;
    if (skipped) Audio.play('finish', this.preset.theme, performance.now());
    this.state = 'finished';
    this.onEnd && this.onEnd(this.preset.rounds, true);
  },
  stop() {
    if (this.state === 'running') this.activeMs += performance.now() - this.runFrom;
    const done = this.roundsDone();
    Audio.cancel(); Voice.stop();
    this.state = 'idle'; this.completed = false;
    if (done > 0) this.onEnd && this.onEnd(done, false);
  },
};

/* =========================================================
 * View：只讀 Engine 狀態畫畫面
 * ========================================================= */
const $ = (id) => document.getElementById(id);
const el = { label: $('label'), clock: $('clock'), round: $('round'), bar: $('bar'), sub: $('sub'), hint: $('hint'), chips: $('chips') };
const fmt = (ms) => { const s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
const fmtSec = (s) => fmt(s * 1000);
const totalSec = (p) => p.prep + p.rounds * p.work + Math.max(0, p.rounds - 1) * p.rest;
const LABEL = { prepare: '準備', work: '開打', warning: '最後衝刺', rest: '休息' };
let lastText = {};
function setText(k, v) { if (lastText[k] !== v) { el[k].innerHTML = v; lastText[k] = v; } }
function setBody(cls) { if (document.body.className !== cls) document.body.className = cls; }

function render() {
  const p = Store.active;
  if (Engine.state === 'idle') {
    setBody('s-idle');
    setText('label', p.name);
    setText('clock', fmtSec(p.work));
    setText('round', 'ROUND <b>–</b> / ' + p.rounds);
    setText('sub', `休息 ${fmtSec(p.rest)}・準備 ${p.prep} 秒・總長 ${fmtSec(totalSec(p))}`);
    setText('hint', '');
    el.bar.style.transform = 'scaleX(0)';
  } else if (Engine.state === 'finished') {
    setBody('s-finished');
    setText('label', '訓練完成 🥊');
    setText('clock', Engine.preset.rounds + '<span style="font-size:.35em"> 回合</span>');
    setText('round', '練完了，喝水拉筋 💪');
    setText('sub', '訓練時間 ' + fmt(Engine.activeMs));
    setText('hint', '點一下回到待機');
    el.bar.style.transform = 'scaleX(1)';
  } else {
    const c = Engine.current();
    if (!c) return;
    const paused = Engine.state === 'paused';
    setBody(`s-${c.type} ${paused ? 'is-paused' : 'running'}${c.type === 'warning' && !paused ? ' flash' : ''}`);
    setText('label', c.type === 'rest' ? `休息・下一回合 ${c.ph.round + 1}` : LABEL[c.type]);
    const t = fmt(c.remain);
    if (lastText.clock !== t) el.clock.classList.toggle('long', t.length > 5);
    setText('clock', t);
    setText('round', `ROUND <b>${c.ph.round}</b> / ${Engine.preset.rounds}`);
    setText('sub', '剩餘總時間 ' + fmt(c.total));
    setText('hint', paused ? '' : '點一下暫停・長按結束');
    el.bar.style.transform = `scaleX(${Math.min(1, Math.max(0, c.frac)).toFixed(4)})`;
  }
}
function loop() { Engine.tick(); render(); requestAnimationFrame(loop); }
// 背景時 rAF 停止，用計時器補 tick（語音／完成判斷）
setInterval(() => { if (document.hidden) Engine.tick(); }, 500);

function renderChips() {
  const a = Store.data.activeId;
  el.chips.innerHTML = Store.data.presets.map((p) =>
    `<button class="chip${p.id === a ? ' on' : ''}" data-id="${p.id}">${esc(p.name)}<small>${fmtSec(p.work)} / ${fmtSec(p.rest)} × ${p.rounds}</small></button>`).join('')
    + '<button class="chip add" data-add>＋ 自訂</button>';
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1800); }

/* ---------- 開始／暫停／結束 ---------- */
function startWorkout() {
  Audio.ensure(); Voice.unlock();
  Engine.start(Store.active);
  Wake.on();
}
function endWorkout() { Engine.stop(); Wake.off(); render(); }
Engine.onEnd = (rounds, full) => {
  const p = Engine.preset;
  Store.data.log.unshift({ at: Date.now(), name: p.name, rounds, of: p.rounds, workSec: rounds * p.work, ms: Math.round(Engine.activeMs), full });
  Store.data.log = Store.data.log.slice(0, 300);
  Store.save();
  if (full) Wake.off();
  else toast(`已記錄 ${rounds} 回合`);
};

$('go').addEventListener('click', startWorkout);
$('pResume').addEventListener('click', (e) => { e.stopPropagation(); Audio.ensure(); Engine.resume(); });
$('pSkip').addEventListener('click', (e) => { e.stopPropagation(); Audio.ensure(); Engine.skip(); });
$('pEnd').addEventListener('click', (e) => { e.stopPropagation(); endWorkout(); });

// 點畫面任意處＝暫停／繼續；長按 0.8 秒＝結束
const HOLD_MS = 800;
let press = null;
const holdEl = $('hold'), holdFg = $('holdFg');
function holdAnim() {
  if (!press) return;
  const k = Math.min(1, (performance.now() - press.t) / HOLD_MS);
  holdFg.style.strokeDashoffset = String(377 * (1 - k));
  if (k > 0.15) holdEl.classList.add('on');
  if (k >= 1) { press.done = true; holdEl.classList.remove('on'); if (navigator.vibrate) try { navigator.vibrate(80); } catch {} endWorkout(); return; }
  press.raf = requestAnimationFrame(holdAnim);
}
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, a, dialog, .bottom')) return;
  if (Engine.state === 'idle') return;
  if (Engine.state === 'finished') { press = { t: performance.now(), finished: true }; return; }
  press = { t: performance.now(), x: e.clientX, y: e.clientY };
  press.raf = requestAnimationFrame(holdAnim);
});
document.addEventListener('pointermove', (e) => {
  if (press && !press.finished && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 40) cancelPress();
});
function cancelPress() { if (press) cancelAnimationFrame(press.raf); press = null; holdEl.classList.remove('on'); holdFg.style.strokeDashoffset = '377'; }
document.addEventListener('pointerup', () => {
  if (!press) return;
  const p = press; cancelPress();
  if (p.done) return;
  if (p.finished) { Engine.state = 'idle'; render(); return; }
  if (Engine.state === 'running') Engine.pause();
  else if (Engine.state === 'paused') { Audio.ensure(); Engine.resume(); }
});
document.addEventListener('pointercancel', cancelPress);
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (Engine.state === 'idle') startWorkout();
    else if (Engine.state === 'running') Engine.pause();
    else if (Engine.state === 'paused') { Audio.ensure(); Engine.resume(); }
    else { Engine.state = 'idle'; }
  } else if (e.code === 'Escape' && (Engine.state === 'running' || Engine.state === 'paused')) endWorkout();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { Engine.tick(); if (Wake.want) Wake.on(); }
});

/* ---------- 課表列 ---------- */
el.chips.addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  if (b.dataset.add) { openSettings(null); return; }
  if (Store.data.activeId === b.dataset.id) { openSettings(b.dataset.id); return; }
  Store.data.activeId = b.dataset.id; Store.save(); renderChips(); render();
});

/* ---------- 設定頁 ---------- */
const NUMS = [
  { k: 'prep',   label: '準備時間', min: 0,  max: 60,  step: 5,  fmt: (v) => v + ' 秒' },
  { k: 'work',   label: '回合時間', min: 10, max: 600, step: 10, fmt: fmtSec },
  { k: 'rest',   label: '休息時間', min: 0,  max: 300, step: 5,  fmt: fmtSec },
  { k: 'rounds', label: '回合數',   min: 1,  max: 30,  step: 1,  fmt: (v) => v + ' 回合' },
  { k: 'warn',   label: '最後警告', min: 0,  max: 30,  step: 1,  fmt: (v) => v ? '剩 ' + v + ' 秒' : '關閉' },
];
let draft = null, editingId = null;
$('fNums').innerHTML = NUMS.map((n) => `
  <div class="field"><div class="fl">${n.label} <output id="o_${n.k}"></output></div>
  <div class="step"><button type="button" data-dec="${n.k}" aria-label="減少">−</button>
  <input type="range" id="r_${n.k}" min="${n.min}" max="${n.max}" step="${n.step}"><button type="button" data-inc="${n.k}" aria-label="增加">＋</button></div></div>`).join('');
function paintDraft() {
  NUMS.forEach((n) => { $('r_' + n.k).value = draft[n.k]; $('o_' + n.k).textContent = n.fmt(draft[n.k]); });
  $('fHalf').checked = !!draft.half;
  document.querySelectorAll('#fTheme button').forEach((b) => b.classList.toggle('on', b.dataset.v === draft.theme));
  $('fVol').value = Store.data.settings.volume; $('oVol').textContent = Store.data.settings.volume + '%';
  $('fVib').checked = !!Store.data.settings.vibrate;
}
function openSettings(id) {
  editingId = id;
  const base = id ? Store.data.presets.find((p) => p.id === id) : { ...Store.active, name: '我的課表' };
  draft = { ...base };
  $('fName').value = draft.name;
  $('btnDel').style.display = id && Store.data.presets.length > 1 ? '' : 'none';
  $('btnCopy').style.display = id ? '' : 'none';
  $('btnSave').textContent = id ? '儲存' : '新增課表';
  paintDraft();
  $('dSet').showModal();
}
$('btnSet').addEventListener('click', () => openSettings(Store.active.id));
$('fNums').addEventListener('input', (e) => {
  const n = NUMS.find((x) => 'r_' + x.k === e.target.id); if (!n) return;
  draft[n.k] = +e.target.value; $('o_' + n.k).textContent = n.fmt(draft[n.k]);
});
$('fNums').addEventListener('click', (e) => {
  const k = e.target.dataset.dec || e.target.dataset.inc; if (!k) return;
  const n = NUMS.find((x) => x.k === k);
  draft[k] = Math.min(n.max, Math.max(n.min, draft[k] + (e.target.dataset.dec ? -n.step : n.step)));
  paintDraft();
});
$('fTheme').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; draft.theme = b.dataset.v; paintDraft(); });
$('fHalf').addEventListener('change', (e) => { draft.half = e.target.checked; });
$('fVol').addEventListener('input', (e) => { Store.data.settings.volume = +e.target.value; $('oVol').textContent = e.target.value + '%'; Store.save(); });
$('fVol').addEventListener('change', () => { Audio.play('start', draft.theme, performance.now()); });
$('fVib').addEventListener('change', (e) => { Store.data.settings.vibrate = e.target.checked; Store.save(); if (e.target.checked && navigator.vibrate) navigator.vibrate(200); });
document.querySelector('.listen').addEventListener('click', (e) => {
  const k = e.target.dataset.try; if (!k) return;
  Audio.cancel(); Audio.play(k, draft.theme, performance.now());
  if (draft.theme === 'voice') { Voice.unlock(); Voice.say({ start: '第1回合，開始', warn: '最後' + (draft.warn || 10) + '秒', end: '休息', finish: '訓練完成，辛苦了' }[k]); }
});
function readName() { return $('fName').value.trim() || '我的課表'; }
$('btnSave').addEventListener('click', () => {
  draft.name = readName();
  if (editingId) Object.assign(Store.data.presets.find((p) => p.id === editingId), draft);
  else { draft.id = 'c' + Date.now().toString(36); Store.data.presets.push(draft); Store.data.activeId = draft.id; }
  Store.save(); renderChips(); render(); $('dSet').close(); toast('已儲存');
});
$('btnCopy').addEventListener('click', () => {
  const n = { ...draft, name: readName() + '（複製）', id: 'c' + Date.now().toString(36) };
  Store.data.presets.push(n); Store.data.activeId = n.id;
  Store.save(); renderChips(); render(); $('dSet').close(); toast('已另存新課表');
});
$('btnDel').addEventListener('click', () => {
  if (!confirm(`刪除課表「${draft.name}」？`)) return;
  Store.data.presets = Store.data.presets.filter((p) => p.id !== editingId);
  if (!Store.data.presets.some((p) => p.id === Store.data.activeId)) Store.data.activeId = Store.data.presets[0].id;
  Store.save(); renderChips(); render(); $('dSet').close();
});
$('btnReset').addEventListener('click', () => {
  if (!confirm('把四個預設課表恢復原狀？（自訂課表會保留）')) return;
  const custom = Store.data.presets.filter((p) => !BUILTIN.some((b) => b.id === p.id));
  Store.data.presets = BUILTIN.map((p) => ({ ...p })).concat(custom);
  Store.data.activeId = 'pro'; Store.save(); renderChips(); render(); $('dSet').close(); toast('已恢復預設課表');
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

/* ---------- 訓練紀錄 ---------- */
function openLog() {
  const log = Store.data.log;
  const weekAgo = Date.now() - 7 * 864e5;
  const week = log.filter((x) => x.at >= weekAgo);
  const sumR = (a) => a.reduce((s, x) => s + x.rounds, 0);
  const mins = Math.round(log.reduce((s, x) => s + (x.ms || 0), 0) / 60000);
  $('stats').innerHTML = `<div><b>${sumR(week)}</b><span>近 7 天回合</span></div><div><b>${sumR(log)}</b><span>累計回合</span></div><div><b>${mins}</b><span>累計分鐘</span></div>`;
  $('logList').innerHTML = log.length ? log.slice(0, 50).map((x) => {
    const d = new Date(x.at);
    const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `<li><span>${esc(x.name)}・${x.rounds}${x.full ? '' : '/' + x.of} 回合${x.full ? ' ✅' : ''}</span><span>${fmt(x.ms || 0)}・${when}</span></li>`;
  }).join('') : '<li class="empty">還沒有紀錄，開始第一場訓練吧！</li>';
  $('dLog').showModal();
}
$('btnLog').addEventListener('click', openLog);
$('btnClearLog').addEventListener('click', () => { if (!confirm('清除全部訓練紀錄？')) return; Store.data.log = []; Store.save(); openLog(); });

/* ---------- 啟動 ---------- */
Store.load();
renderChips();
render();
requestAnimationFrame(loop);
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {}));
