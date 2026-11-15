// RoundBell 計時器：Store（本機資料）→ Audio／Voice／Wake（核心服務）→ Engine（狀態機）→ View（畫面）
import { comboPool, PACE, TIPS } from '../data/combos.js';
import { decodePreset, shareUrl } from './share.js';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
const fmtSec = (s) => fmt(s * 1000);
const DEF_COMBO = { on: false, level: 'basic', pace: 'mid', lang: 'en' };

/* =========================================================
 * Store：本機儲存（課表、設定、訓練紀錄）
 * ========================================================= */
const KEY = 'roundbell_v1';
const BUILTIN = [
  { id: 'pro', name: '職業拳擊', prep: 10, work: 180, rest: 60, rounds: 12, warn: 10, half: false, theme: 'bell', combo: { on: false, level: 'basic', pace: 'mid' } },
  { id: 'ama', name: '業餘拳擊', prep: 10, work: 120, rest: 60, rounds: 3, warn: 10, half: false, theme: 'bell', combo: { on: true, level: 'basic', pace: 'mid' } },
  { id: 'hiit', name: 'HIIT 間歇', prep: 10, work: 40, rest: 20, rounds: 8, warn: 5, half: false, theme: 'beep', combo: { on: false, level: 'basic', pace: 'fast' } },
  { id: 'tabata', name: 'Tabata', prep: 10, work: 20, rest: 10, rounds: 8, warn: 3, half: false, theme: 'beep', combo: { on: false, level: 'basic', pace: 'fast' } },
];
const Store = {
  data: null,
  temp: null,      // 分享連結「單次使用」的課表（不存）
  route: null,     // 課表頁固定的課表（不存）
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
    const fresh = !d || !Array.isArray(d.presets) || !d.presets.length;
    if (fresh) d = { presets: BUILTIN.map((p) => structuredClone(p)), activeId: 'pro', log: [] };
    d.presets.forEach((p) => { p.combo = Object.assign({}, DEF_COMBO, p.combo); });
    d.settings = Object.assign({ volume: 90, vibrate: true, tips: true, voiceEn: '', voiceZh: '', pitch: 0.9 }, d.settings);
    d.log = Array.isArray(d.log) ? d.log : [];
    this.data = d;
    if (fresh) this.save(); // 先存一份，編輯器才能直接加課表進來
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {} },
  get active() {
    if (this.route) return this.route;
    if (this.temp && this.data.activeId === 'tmp') return this.temp;
    return this.data.presets.find((p) => p.id === this.data.activeId) || this.data.presets[0];
  },
  add(p) {
    const n = structuredClone(p);
    n.id = 'c' + Date.now().toString(36);
    this.data.presets.push(n); this.data.activeId = n.id; this.save();
    return n;
  },
};

/* =========================================================
 * Audio：開頁就用 OfflineAudioContext 把合成音算成 AudioBuffer（音效池），
 * 播放時只要排一個 BufferSource → 零延遲、可預排、可一次取消
 * ========================================================= */
const Audio = (() => {
  let ctx = null, master = null, ready = null;
  const pool = {}, live = new Set(), SR = 44100;
  try { if (navigator.audioSession) navigator.audioSession.type = 'transient'; } catch {}

  function synth(c) {
    const out = c.destination;
    const noise = c.createBuffer(1, SR * 0.2, SR);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const env = (t, peak, decay) => {
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      g.connect(out);
      return g;
    };
    const osc = (type, f, dest, t, stop) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(t); o.stop(stop); };
    return {
      // 銅鐘：不和諧泛音＋長尾音
      strike(t, decay = 1.8, base = 830) {
        [[1, 1], [2.0, 0.55], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([r, a]) => {
          const d = decay / (1 + r * 0.12);
          osc('sine', base * r, env(t, 0.32 * a, d), t, t + d + 0.05);
        });
      },
      buzz(t, len = 0.55, f = 330) {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.01);
        g.gain.setValueAtTime(0.35, t + len - 0.04); g.gain.linearRampToValueAtTime(0.0001, t + len);
        lp.connect(g); g.connect(out);
        osc('sawtooth', f, lp, t, t + len + 0.02); osc('square', f * 1.005, lp, t, t + len + 0.02);
      },
      beep(t, f = 1000, len = 0.13, peak = 0.45) { osc('sine', f, env(t, peak, len), t, t + len + 0.02); },
      // 木魚／拍板：短促雜訊＋木頭音
      clack(t) {
        const s = c.createBufferSource(); s.buffer = noise;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 5;
        s.connect(bp); bp.connect(env(t, 1.2, 0.07)); s.start(t); s.stop(t + 0.1);
        osc('sine', 760, env(t, 0.35, 0.09), t, t + 0.12);
      },
    };
  }
  // 音效池：[長度秒, 合成方式]
  const RECIPES = {
    'start.bell': [2.6, (s) => s.strike(0.01, 2.2)],
    'start.beep': [0.8, (s) => s.buzz(0.01, 0.7)],
    'start.voice': [0.4, (s) => s.beep(0.01, 1320, 0.25)],
    'end.bell': [2.6, (s) => [0.01, 0.35, 0.69].forEach((t) => s.strike(t, 1.6))],
    'end.beep': [1.4, (s) => [0.01, 0.46, 0.91].forEach((t) => s.buzz(t, 0.32))],
    'end.voice': [0.4, (s) => s.beep(0.01, 660, 0.25)],
    'warn.bell': [0.9, (s) => [0.01, 0.17, 0.51, 0.67].forEach((t) => s.clack(t))],
    'warn.beep': [0.6, (s) => [0.01, 0.19, 0.37].forEach((t) => s.beep(t, 1500, 0.1))],
    'half.bell': [0.5, (s) => { s.beep(0.01, 1200, 0.12, 0.3); s.beep(0.21, 1200, 0.12, 0.3); }],
    'tick.bell': [0.2, (s) => s.beep(0.01, 880, 0.12)],
    'finish.bell': [5.6, (s) => [0.01, 1.11, 2.21].forEach((t) => s.strike(t, 3.2))],
    'finish.beep': [2.6, (s) => [0.01, 0.91, 1.81].forEach((t) => s.buzz(t, 0.7, 392))],
  };
  function render() {
    if (ready) return ready;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return (ready = Promise.resolve());
    ready = Promise.all(Object.entries(RECIPES).map(([k, [len, fn]]) => {
      const c = new OAC(1, Math.ceil(SR * len), SR);
      fn(synth(c));
      return c.startRendering().then((b) => { pool[k] = b; }).catch(() => {});
    }));
    return ready;
  }
  // 要在使用者點擊當下呼叫（手機瀏覽器解鎖音訊）
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 4;
      master = ctx.createGain();
      master.connect(comp); comp.connect(ctx.destination);
    }
    master.gain.value = (Store.data.settings.volume / 100) * 0.9;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return ctx;
  }
  function play(kind, theme, atPerf) {
    if (!ctx) return;
    const key = (theme === 'voice' && pool[kind + '.voice']) ? kind + '.voice'
      : (theme === 'beep' && pool[kind + '.beep']) ? kind + '.beep' : kind + '.bell';
    const buf = pool[key];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(master);
    src.start(Math.max(ctx.currentTime, ctx.currentTime + (atPerf - performance.now()) / 1000));
    live.add(src); src.onended = () => live.delete(src);
  }
  function cancel() {
    live.forEach((s) => { try { s.onended = null; s.stop(0); s.disconnect(); } catch {} });
    live.clear();
  }
  return { render, ensure, play, cancel };
})();

// 語音：可在設定選手機上有的聲音；「自動」優先挑男聲（名稱判斷，各系統聲音不同）
const MALE = /\bmale\b|daniel|aaron|fred|alex\b|\btom\b|rishi|arthur|gordon|oliver|david|\bguy\b|\bmark\b|james|ryan|andrew|brian|christopher|eric|roger|george|thomas|reed|rocko|grandpa|ralph|albert|yunjhe|zhiwei|kangkang|yunxi|yunyang|yunjian|li-mu|liang|hanhan-male/i;
const FEMALE = /female|samantha|karen|moira|tessa|victoria|zira|aria|jenny|susan|hazel|libby|sonia|meijia|sin-ji|ting-ting|hsiaochen|hsiaoyu|xiaoxiao|yating|hanhan/i;
const Voice = {
  list: [],
  refresh() { try { this.list = speechSynthesis.getVoices() || []; } catch { this.list = []; } return this.list; },
  of(lang) { const k = lang.slice(0, 2); return this.refresh().filter((v) => v.lang && v.lang.toLowerCase().startsWith(k)); },
  isMale(v) { return MALE.test(v.name) && !FEMALE.test(v.name.replace(/\bmale\b/i, '')); },
  pick(lang) {
    const want = Store.data.settings[lang.startsWith('en') ? 'voiceEn' : 'voiceZh'];
    const vs = this.of(lang);
    if (want) { const v = vs.find((x) => x.voiceURI === want || x.name === want); if (v) return v; }
    const local = lang.toLowerCase();
    const sameLoc = (v) => v.lang.toLowerCase().replace('_', '-') === local;
    return vs.find((v) => this.isMale(v) && sameLoc(v)) || vs.find((v) => this.isMale(v)) || vs.find(sameLoc) || vs[0] || null;
  },
  unlock() { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {} },
  // 每次念之前先清空佇列，避免語速太快聲音打架
  say(text, rate = 1.05, lang = 'zh-TW') {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pick(lang);
      if (v) { try { u.voice = v; } catch {} } // 指定失敗就用預設聲音，不要整句不念
      u.lang = v ? v.lang : lang; u.rate = rate; u.pitch = Store.data.settings.pitch;
      u.volume = Store.data.settings.volume / 100;
      speechSynthesis.speak(u);
    } catch {}
  },
  stop() { try { speechSynthesis.cancel(); } catch {} },
};

// 英文口號用英文語音念，中文數字用中文語音
function sayCombo(c) { if (c.lang === 'zh') Voice.say(c.say, 1.15); else Voice.say(c.say, 1.0, 'en-US'); }

const Wake = {
  lock: null, want: false,
  async on() { this.want = true; try { if ('wakeLock' in navigator && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch {} },
  off() { this.want = false; try { this.lock && this.lock.release(); } catch {} this.lock = null; },
};

// 計時心跳放在 Web Worker：分頁在背景時主執行緒的 setInterval 會被降頻
const Beat = (() => {
  let w = null, fallback = null;
  try {
    w = new Worker(URL.createObjectURL(new Blob(['let t=null;onmessage=e=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),250)}'], { type: 'text/javascript' })));
    w.onmessage = () => Engine.tick();
  } catch { w = null; }
  return {
    on() { if (w) w.postMessage(1); else if (!fallback) fallback = setInterval(() => Engine.tick(), 250); },
    off() { if (w) w.postMessage(0); clearInterval(fallback); fallback = null; },
  };
})();

/* =========================================================
 * Engine：段落清單狀態機＋時間戳記計時（不碰畫面）
 * 狀態：idle → prepare → work(→warning) → rest → … → finished
 * ========================================================= */
const Engine = {
  state: 'idle',          // idle | running | paused | finished
  preset: null,
  phases: [],             // {type, dur(秒), round, name, how}
  rounds: 0,
  idx: 0,
  plan: [],               // 從目前段開始的絕對時間 {i, start, end}
  events: [], evIdx: 0,
  remainAtPause: 0,
  activeMs: 0, runFrom: 0,
  combo: null,            // 目前字幕 {text, desc, at}

  build(p) {
    const a = [];
    if (p.segments) {
      let r = 0;
      p.segments.forEach((s) => {
        if (s.type === 'work') r++;
        a.push({ type: s.type, dur: s.dur, round: Math.max(1, s.type === 'rest' ? r : r || 1), name: s.name || '', how: s.how || '' });
      });
    } else {
      if (p.prep > 0) a.push({ type: 'prepare', dur: p.prep, round: 1 });
      for (let r = 1; r <= p.rounds; r++) {
        a.push({ type: 'work', dur: p.work, round: r });
        if (r < p.rounds && p.rest > 0) a.push({ type: 'rest', dur: p.rest, round: r });
      }
    }
    return a;
  },
  start(p) {
    this.preset = structuredClone(p);
    this.phases = this.build(p);
    this.rounds = this.phases.filter((x) => x.type === 'work').length;
    this.activeMs = 0; this.completed = false;
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
    this.events = this.makeEvents(now).filter((e) => e.t >= now - 60);
    this.evIdx = 0; this.combo = null;
    Audio.cancel();
    this.events.forEach((e) => e.sound && Audio.play(e.sound, this.preset.theme, e.t));
    this.state = 'running'; this.runFrom = now;
    Beat.on();
  },
  warnOf(ph) { const w = this.preset.warn; return ph.type === 'work' && w > 0 && w < ph.dur ? w : 0; },
  makeEvents(now) {
    const p = this.preset, ev = [], last = this.phases.length - 1;
    const combo = p.combo || DEF_COMBO;
    const pool = combo.on ? comboPool(combo.level, combo.lang) : null;
    this.plan.forEach(({ i, start, end }) => {
      const ph = this.phases[i];
      if (ph.type !== 'work') {
        for (let k = 3; k >= 1; k--) if (ph.dur > k) ev.push({ t: end - k * 1000, sound: 'tick' });
        ev.push({ t: start, say: ph.type === 'prepare' ? '準備' : '休息', vib: ph.type === 'rest' ? [200] : null });
        if (i === last) ev.push({ t: end, sound: 'finish', say: '訓練完成，辛苦了', vib: [600, 200, 600] });
        return;
      }
      ev.push({ t: start, sound: 'start', say: ph.name ? ph.name + '，開始' : '第' + ph.round + '回合，開始', vib: [400] });
      if (p.half && ph.dur >= 60) ev.push({ t: start + ph.dur * 500, sound: 'half', say: '一半' });
      const warn = this.warnOf(ph);
      if (warn) ev.push({ t: end - warn * 1000, sound: 'warn', say: '最後' + warn + '秒', vib: [120, 80, 120], warn: true });
      // 教練喊拳：鐘聲後 2.5 秒開始，進入最後警告前 1.5 秒停
      if (pool) {
        const stop = end - warn * 1000 - 1500;
        let t = Math.max(start + 2500, now + 1200), prev = null;
        while (t < stop) {
          let c; do { c = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && c === prev);
          ev.push({ t, combo: c }); prev = c;
          t += PACE[combo.pace] * (0.8 + Math.random() * 0.4) + (c.len - 2) * 350;
        }
      }
      ev.push(i === last ? { t: end, sound: 'finish', say: '訓練完成，辛苦了', vib: [600, 200, 600] } : { t: end, sound: 'end', vib: [300, 120, 300] });
    });
    return ev.sort((a, b) => a.t - b.t);
  },
  // 依時間戳記算出目前狀態；退到背景回來也會自動快轉
  tick(now = performance.now()) {
    if (this.state !== 'running') return;
    while (this.evIdx < this.events.length && this.events[this.evIdx].t <= now) {
      const e = this.events[this.evIdx++];
      if (now - e.t < 1500) this.fire(e, now);
    }
    const cur = this.plan.find((x) => now < x.end);
    if (!cur) { this.finish(); return; }
    if (cur.i !== this.idx) this.combo = null;
    this.idx = cur.i;
  },
  fire(e, now) {
    if (e.combo) { this.combo = { ...e.combo, at: now }; sayCombo(e.combo); }
    else if (e.warn) { this.combo = null; Voice.stop(); }
    if (this.preset.theme === 'voice' && e.say) Voice.say(e.say);
    if (e.vib && Store.data.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(e.vib); } catch {} }
  },
  current(now = performance.now()) {
    const ph = this.phases[this.idx];
    if (!ph) return null;
    const row = this.plan.find((x) => x.i === this.idx);
    const remain = this.state === 'paused' ? this.remainAtPause : this.state === 'running' ? Math.max(0, row.end - now) : 0;
    const total = this.state === 'running' ? this.plan[this.plan.length - 1].end - now
      : remain + this.phases.slice(this.idx + 1).reduce((s, x) => s + x.dur * 1000, 0);
    const warn = this.warnOf(ph);
    const type = warn && remain <= warn * 1000 ? 'warning' : ph.type;
    return { ph, type, remain, total, elapsed: ph.dur * 1000 - remain, frac: remain / (ph.dur * 1000) };
  },
  pause() {
    if (this.state !== 'running') return;
    const now = performance.now();
    this.remainAtPause = this.plan.find((x) => x.i === this.idx).end - now;
    this.activeMs += now - this.runFrom;
    Audio.cancel(); Voice.stop(); Beat.off();
    this.state = 'paused';
  },
  resume() { if (this.state === 'paused') this.schedule(this.idx, this.remainAtPause); },
  skip() {
    if (this.state !== 'paused') return;
    if (this.idx + 1 >= this.phases.length) { this.finish(true); return; }
    this.schedule(this.idx + 1, this.phases[this.idx + 1].dur * 1000);
  },
  roundsDone() { return this.completed ? this.rounds : this.phases.slice(0, this.idx).filter((x) => x.type === 'work').length; },
  workSecDone() { return this.phases.slice(0, this.completed ? this.phases.length : this.idx).filter((x) => x.type === 'work').reduce((s, x) => s + x.dur, 0); },
  finish(skipped) {
    if (this.state === 'running') this.activeMs += performance.now() - this.runFrom;
    this.completed = true; this.combo = null;
    if (skipped) Audio.play('finish', this.preset.theme, performance.now());
    Beat.off();
    this.state = 'finished';
    this.onEnd && this.onEnd(this.rounds, true);
  },
  stop() {
    if (this.state === 'running') this.activeMs += performance.now() - this.runFrom;
    const done = this.roundsDone();
    Audio.cancel(); Voice.stop(); Beat.off();
    this.state = 'idle'; this.combo = null;
    if (done > 0) this.onEnd && this.onEnd(done, false);
  },
};

/* =========================================================
 * View：只讀 Engine 狀態畫畫面
 * ========================================================= */
const el = { label: $('label'), combo: $('combo'), clock: $('clock'), round: $('round'), bar: $('bar'), sub: $('sub'), hint: $('hint'), chips: $('chips') };
const totalSec = (p) => p.segments ? p.segments.reduce((s, x) => s + x.dur, 0) : p.prep + p.rounds * p.work + Math.max(0, p.rounds - 1) * p.rest;
const workCount = (p) => p.segments ? p.segments.filter((s) => s.type === 'work').length : p.rounds;
const LABEL = { prepare: '準備', work: '開打', warning: '最後衝刺', rest: '休息' };
const lastText = {};
function setText(k, v) { if (lastText[k] !== v) { el[k].innerHTML = v; lastText[k] = v; } }
function setBody(cls) { if (document.body.className !== cls) document.body.className = cls; }
let lastCombo = null;

function comboLine(c, now) {
  if (Engine.state !== 'running' && Engine.state !== 'paused') return '';
  if (c.type === 'prepare') return '戴好拳套，準備開始';
  if (c.type === 'rest') {
    const next = Engine.phases[Engine.idx + 1];
    const tip = Store.data.settings.tips ? TIPS[(Math.floor(c.elapsed / 8000) + c.ph.round * 3) % TIPS.length] : '';
    return (next && next.name ? `<small>下一段</small>${esc(next.name)}` : '') + (tip ? `<small class="tip">💡 ${esc(tip)}</small>` : '');
  }
  const k = Engine.combo;
  if (k && now - k.at < 3200) {
    // 每個招式不斷行；組合越長字越小
    const words = k.text.split(' · ').map((w) => `<i>${esc(w)}</i>`).join(' <em>·</em> ');
    const size = k.text.length > 34 ? ' xs' : k.text.length > 20 ? ' sm' : '';
    return `<span class="pop${size}" data-k="${k.at}">${words}</span><small>${esc(k.desc)}</small>`;
  }
  return c.ph.how ? `<small>${esc(c.ph.how)}</small>` : '';
}

function render() {
  const p = Store.active, now = performance.now();
  if (Engine.state === 'idle') {
    setBody('s-idle');
    setText('label', esc(p.name));
    setText('combo', p.combo && p.combo.on ? `<small>教練喊拳：${p.combo.level === 'adv' ? '進階' : '基礎'}・${{ slow: '慢', mid: '中', fast: '快' }[p.combo.pace]}・${p.combo.lang === 'zh' ? '中文數字' : '英文口號'}</small>` : '');
    setText('clock', fmtSec(p.segments ? totalSec(p) : p.work));
    setText('round', p.segments ? `${p.segments.length} 段・${workCount(p)} 個訓練段` : 'ROUND <b>–</b> / ' + p.rounds);
    setText('sub', p.segments ? '總長 ' + fmtSec(totalSec(p)) : `休息 ${fmtSec(p.rest)}・準備 ${p.prep} 秒・總長 ${fmtSec(totalSec(p))}`);
    setText('hint', '');
    el.bar.style.transform = 'scaleX(0)';
  } else if (Engine.state === 'finished') {
    setBody('s-finished');
    setText('label', '訓練完成 🥊');
    setText('combo', '');
    setText('clock', Engine.rounds + '<span style="font-size:.35em"> ' + (Engine.preset.segments ? '段' : '回合') + '</span>');
    setText('round', '練完了，喝水拉筋 💪');
    setText('sub', '訓練時間 ' + fmt(Engine.activeMs));
    setText('hint', '點一下回到待機');
    el.bar.style.transform = 'scaleX(0)';
  } else {
    const c = Engine.current(now);
    if (!c) return;
    const paused = Engine.state === 'paused';
    setBody(`s-${c.type} ${paused ? 'is-paused' : 'running'}${c.type === 'warning' && !paused ? ' flash' : ''}`);
    setText('label', esc(Engine.preset.name) + '・' + (c.ph.name && c.type !== 'rest' ? esc(c.ph.name) : LABEL[c.type]));
    setText('combo', comboLine(c, now));
    const t = fmt(c.remain);
    if (lastText.clock !== t) el.clock.classList.toggle('long', t.length > 5);
    setText('clock', t);
    setText('round', `ROUND <b>${c.ph.round}</b> / ${Engine.rounds}`);
    setText('sub', '剩餘總時間 ' + fmt(c.total));
    setText('hint', paused ? '' : '點一下暫停・長按結束');
    el.bar.style.transform = `scaleX(${Math.min(1, Math.max(0, c.frac)).toFixed(4)})`;
  }
}
function loop() { render(); requestAnimationFrame(loop); }

function renderChips() {
  if (!el.chips) return;
  const a = Store.data.activeId;
  const chip = (p, cls = '') => `<button class="chip${p.id === a ? ' on' : ''}${cls}" data-id="${p.id}">${esc(p.name)}<small>${p.segments ? p.segments.length + ' 段・' + fmtSec(totalSec(p)) : `${fmtSec(p.work)} / ${fmtSec(p.rest)} × ${p.rounds}`}</small></button>`;
  el.chips.innerHTML = (Store.temp ? chip({ ...Store.temp, id: 'tmp', name: '🔗 ' + Store.temp.name }) : '')
    + Store.data.presets.map((p) => chip(p)).join('')
    + '<button class="chip add" data-add>＋ 自訂</button>';
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2000); }

/* ---------- 開始／暫停／結束 ---------- */
async function startWorkout() {
  Audio.ensure(); Voice.unlock(); Wake.on();
  if (document.documentElement.classList.contains('routine-page')) window.scrollTo({ top: 0 });
  await Audio.render();
  Engine.start(Store.active);
}
function pauseWorkout() { Engine.pause(); Wake.off(); }
function resumeWorkout() { Audio.ensure(); Engine.resume(); Wake.on(); }
function endWorkout() { Engine.stop(); Wake.off(); render(); }
Engine.onEnd = (rounds, full) => {
  const p = Engine.preset;
  Store.data.log.unshift({ at: Date.now(), name: p.name, rounds, of: Engine.rounds, workSec: Engine.workSecDone(), ms: Math.round(Engine.activeMs), full });
  Store.data.log = Store.data.log.slice(0, 300);
  Store.save();
  if (full) Wake.off();
  else toast(`已記錄 ${rounds} ${p.segments ? '段' : '回合'}`);
};

$('go').addEventListener('click', startWorkout);
$('pResume').addEventListener('click', (e) => { e.stopPropagation(); resumeWorkout(); });
$('pSkip').addEventListener('click', (e) => { e.stopPropagation(); Audio.ensure(); Engine.skip(); Wake.on(); });
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
  if (e.target.closest('button, a, dialog, .bottom, .below')) return;
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
  if (p.finished) { Engine.state = 'idle'; return; }
  if (Engine.state === 'running') pauseWorkout();
  else if (Engine.state === 'paused') resumeWorkout();
});
document.addEventListener('pointercancel', cancelPress);
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.target.closest('input, textarea, select')) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (Engine.state === 'idle') startWorkout();
    else if (Engine.state === 'running') pauseWorkout();
    else if (Engine.state === 'paused') resumeWorkout();
    else Engine.state = 'idle';
  } else if (e.code === 'Escape' && (Engine.state === 'running' || Engine.state === 'paused')) endWorkout();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { Engine.tick(); if (Wake.want) Wake.on(); }
});

/* ---------- 課表列 ---------- */
el.chips && el.chips.addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  if (b.dataset.add) { openSettings(null); return; }
  if (Store.data.activeId === b.dataset.id) { openSettings(b.dataset.id); return; }
  Store.data.activeId = b.dataset.id; if (b.dataset.id !== 'tmp') Store.save();
  renderChips();
});

/* ---------- 設定頁 ---------- */
const NUMS = [
  { k: 'prep', label: '準備時間', min: 0, max: 60, step: 5, fmt: (v) => v + ' 秒' },
  { k: 'work', label: '回合時間', min: 10, max: 600, step: 10, fmt: fmtSec },
  { k: 'rest', label: '休息時間', min: 0, max: 300, step: 5, fmt: fmtSec },
  { k: 'rounds', label: '回合數', min: 1, max: 30, step: 1, fmt: (v) => v + ' 回合' },
];
const WARN = { k: 'warn', label: '最後警告', min: 0, max: 30, step: 1, fmt: (v) => v ? '剩 ' + v + ' 秒' : '關閉' };
let draft = null, editingId = null;
const stepper = (n) => `
  <div class="field"><div class="fl">${n.label} <output id="o_${n.k}"></output></div>
  <div class="step"><button type="button" data-dec="${n.k}" aria-label="減少">−</button>
  <input type="range" id="r_${n.k}" min="${n.min}" max="${n.max}" step="${n.step}"><button type="button" data-inc="${n.k}" aria-label="增加">＋</button></div></div>`;
$('fNums').innerHTML = NUMS.map(stepper).join('');
$('fWarn').innerHTML = stepper(WARN);
const ALLN = NUMS.concat(WARN);
function segOn(id, v) { document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); }
function paintDraft() {
  ALLN.forEach((n) => { if (draft[n.k] == null) return; $('r_' + n.k).value = draft[n.k]; $('o_' + n.k).textContent = n.fmt(draft[n.k]); });
  $('fNums').hidden = !!draft.segments;
  $('fSegNote').hidden = !draft.segments;
  $('fHalf').checked = !!draft.half;
  segOn('fTheme', draft.theme);
  $('fCombo').checked = draft.combo.on;
  $('comboOpts').hidden = !draft.combo.on;
  segOn('fLevel', draft.combo.level); segOn('fPace', draft.combo.pace); segOn('fCLang', draft.combo.lang);
  $('fVol').value = Store.data.settings.volume; $('oVol').textContent = Store.data.settings.volume + '%';
  $('fVib').checked = !!Store.data.settings.vibrate;
  $('fTips').checked = !!Store.data.settings.tips;
  paintVoices();
}
function openSettings(id) {
  editingId = Store.route ? 'route' : id;
  const base = Store.route ? Store.route : id === 'tmp' ? Store.temp : id ? Store.data.presets.find((p) => p.id === id) : { ...BUILTIN[1], name: '我的課表' };
  draft = structuredClone(base);
  draft.combo = Object.assign({}, DEF_COMBO, draft.combo);
  $('fName').value = draft.name;
  const saved = id && id !== 'tmp' && !Store.route;
  $('btnDel').hidden = !(saved && Store.data.presets.length > 1);
  $('btnCopy').hidden = !saved;
  $('btnSave').textContent = Store.route ? '套用' : saved ? '儲存' : '儲存為新課表';
  $('btnEditSeg').href = BASE + 'builder/?s=' + encodeURIComponent(shareUrl(draft).split('?s=')[1]);
  $('btnReset').hidden = !!Store.route;
  paintDraft();
  $('dSet').showModal();
}
$('btnSet').addEventListener('click', () => openSettings(Store.route ? 'route' : Store.data.activeId));
function bindStepper(box) {
  box.addEventListener('input', (e) => {
    const n = ALLN.find((x) => 'r_' + x.k === e.target.id); if (!n) return;
    draft[n.k] = +e.target.value; $('o_' + n.k).textContent = n.fmt(draft[n.k]);
  });
  box.addEventListener('click', (e) => {
    const k = e.target.dataset.dec || e.target.dataset.inc; if (!k) return;
    const n = ALLN.find((x) => x.k === k);
    draft[k] = Math.min(n.max, Math.max(n.min, draft[k] + (e.target.dataset.dec ? -n.step : n.step)));
    paintDraft();
  });
}
bindStepper($('fNums')); bindStepper($('fWarn'));
$('fTheme').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; draft.theme = b.dataset.v; paintDraft(); });
$('fLevel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; draft.combo.level = b.dataset.v; paintDraft(); });
$('fCLang').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; draft.combo.lang = b.dataset.v; paintDraft(); });
$('fPace').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; draft.combo.pace = b.dataset.v; paintDraft(); });
$('fCombo').addEventListener('change', (e) => { draft.combo.on = e.target.checked; paintDraft(); });
$('fHalf').addEventListener('change', (e) => { draft.half = e.target.checked; });
$('fVol').addEventListener('input', (e) => { Store.data.settings.volume = +e.target.value; $('oVol').textContent = e.target.value + '%'; Store.save(); });
$('fVol').addEventListener('change', () => { Audio.ensure(); Audio.render().then(() => Audio.play('start', draft.theme, performance.now())); });
$('fVib').addEventListener('change', (e) => { Store.data.settings.vibrate = e.target.checked; Store.save(); if (e.target.checked && navigator.vibrate) navigator.vibrate(200); });
$('fTips').addEventListener('change', (e) => { Store.data.settings.tips = e.target.checked; Store.save(); });
function paintVoices() {
  const fill = (id, lang, key) => {
    const vs = Voice.of(lang), cur = Store.data.settings[key], auto = Voice.pick(lang);
    $(id).innerHTML = `<option value="">自動（優先男聲${auto ? '：' + esc(auto.name) : ''}）</option>`
      + vs.map((v) => `<option value="${esc(v.voiceURI)}"${v.voiceURI === cur ? ' selected' : ''}>${Voice.isMale(v) ? '♂ ' : ''}${esc(v.name)}（${esc(v.lang)}）</option>`).join('');
    $(id).disabled = !vs.length;
  };
  fill('fVoiceEn', 'en-US', 'voiceEn'); fill('fVoiceZh', 'zh-TW', 'voiceZh');
  $('voiceNone').hidden = Voice.of('en-US').length > 0;
  $('fPitch').value = Store.data.settings.pitch; $('oPitch').textContent = pitchLabel(Store.data.settings.pitch);
}
const pitchLabel = (v) => (v <= 0.7 ? '很低沉' : v < 0.95 ? '低沉' : v <= 1.05 ? '原本' : '偏高') + `（${(+v).toFixed(1)}）`;
try { speechSynthesis.addEventListener('voiceschanged', () => { if ($('dSet').open) paintVoices(); }); } catch {}
$('fVoiceEn').addEventListener('change', (e) => { Store.data.settings.voiceEn = e.target.value; Store.save(); Voice.unlock(); Voice.say('One-two, Hook, Right', 1.0, 'en-US'); });
$('fVoiceZh').addEventListener('change', (e) => { Store.data.settings.voiceZh = e.target.value; Store.save(); Voice.unlock(); Voice.say('第一回合，開始'); });
$('fPitch').addEventListener('input', (e) => { Store.data.settings.pitch = +e.target.value; $('oPitch').textContent = pitchLabel(+e.target.value); Store.save(); });
$('fPitch').addEventListener('change', () => { Voice.unlock(); Voice.say('Jab, One-two, Uppercut', 1.0, 'en-US'); });
document.querySelector('.listen').addEventListener('click', (e) => {
  const k = e.target.dataset.try; if (!k) return;
  Audio.ensure(); Audio.cancel();
  Audio.render().then(() => Audio.play(k, draft.theme, performance.now()));
  if (draft.theme === 'voice') { Voice.unlock(); Voice.say({ start: '第1回合，開始', warn: '最後' + (draft.warn || 10) + '秒', end: '休息', finish: '訓練完成，辛苦了' }[k]); }
});
$('tryCombo').addEventListener('click', () => {
  const pool = comboPool(draft.combo.level, draft.combo.lang), c = pool[Math.floor(Math.random() * pool.length)];
  Voice.unlock(); sayCombo(c); toast(c.text + '（' + c.desc + '）');
});
function readName() { return $('fName').value.trim().slice(0, 30) || '我的課表'; }
$('btnSave').addEventListener('click', () => {
  draft.name = readName();
  if (editingId === 'route') { Object.assign(Store.route, draft); toast('已套用（這次訓練）'); }
  else if (editingId && editingId !== 'tmp') { Object.assign(Store.data.presets.find((p) => p.id === editingId), draft); Store.save(); toast('已儲存'); }
  else { Store.add(draft); if (editingId === 'tmp') Store.temp = null; toast('已存進我的課表'); }
  renderChips(); $('dSet').close();
});
$('btnCopy').addEventListener('click', () => {
  Store.add({ ...draft, name: readName() + '（複製）' });
  renderChips(); $('dSet').close(); toast('已另存新課表');
});
$('btnDel').addEventListener('click', () => {
  if (!confirm(`刪除課表「${draft.name}」？`)) return;
  Store.data.presets = Store.data.presets.filter((p) => p.id !== editingId);
  if (!Store.data.presets.some((p) => p.id === Store.data.activeId)) Store.data.activeId = Store.data.presets[0].id;
  Store.save(); renderChips(); $('dSet').close();
});
$('btnReset').addEventListener('click', () => {
  if (!confirm('把四個預設課表恢復原狀？（自訂課表會保留）')) return;
  const custom = Store.data.presets.filter((p) => !BUILTIN.some((b) => b.id === p.id));
  Store.data.presets = BUILTIN.map((p) => structuredClone(p)).concat(custom);
  Store.data.activeId = 'pro'; Store.save(); renderChips(); $('dSet').close(); toast('已恢復預設課表');
});
// 一鍵複製分享連結
async function copyLink(p) {
  const url = shareUrl(p);
  try { await navigator.clipboard.writeText(url); toast('已複製分享連結，貼給拳友就能用'); return; } catch {}
  try { if (navigator.share) { await navigator.share({ title: p.name, url }); return; } } catch { return; }
  prompt('複製這個連結：', url);
}
$('btnShare').addEventListener('click', () => { draft.name = readName(); copyLink(draft); });
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

/* ---------- 收到分享連結 ---------- */
function summary(p) {
  const combo = p.combo.on ? `教練喊拳 ${p.combo.level === 'adv' ? '進階' : '基礎'}・${{ slow: '慢', mid: '中', fast: '快' }[p.combo.pace]}・${p.combo.lang === 'zh' ? '中文數字' : '英文口號'}` : '不喊拳';
  const theme = { bell: '傳統銅鐘', beep: '電子蜂鳴', voice: '語音報時' }[p.theme];
  if (p.segments) {
    return `<b>${esc(p.name)}</b><ul class="seglist">${p.segments.map((s) => `<li><span>${{ prepare: '準備', work: '訓練', rest: '休息' }[s.type]}${s.name ? '・' + esc(s.name) : ''}</span><span>${fmtSec(s.dur)}</span></li>`).join('')}</ul><p>總長 ${fmtSec(totalSec(p))}・${theme}・${combo}</p>`;
  }
  return `<b>${esc(p.name)}</b><p>回合 ${fmtSec(p.work)}・休息 ${fmtSec(p.rest)} × ${p.rounds} 回合<br>準備 ${p.prep} 秒・最後警告 ${p.warn} 秒・總長 ${fmtSec(totalSec(p))}<br>${theme}・${combo}</p>`;
}
function checkIncoming() {
  const q = new URLSearchParams(location.search);
  const s = q.get('s');
  if (!s || Store.route) return;
  q.delete('s');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  const p = decodePreset(s);
  if (!p) { toast('這個分享連結格式不對，已略過'); return; }
  $('inBody').innerHTML = summary(p);
  $('inOnce').onclick = () => { Store.temp = p; Store.data.activeId = 'tmp'; renderChips(); $('dIn').close(); toast('這次先用，不會存起來'); };
  $('inSave').onclick = () => { Store.add(p); renderChips(); $('dIn').close(); toast('已存進我的課表'); };
  $('dIn').showModal();
}

/* ---------- 訓練紀錄 ---------- */
function openLog() {
  const log = Store.data.log;
  const weekAgo = Date.now() - 7 * 864e5;
  const sumR = (a) => a.reduce((s, x) => s + x.rounds, 0);
  const mins = Math.round(log.reduce((s, x) => s + (x.ms || 0), 0) / 60000);
  $('stats').innerHTML = `<div><b>${sumR(log.filter((x) => x.at >= weekAgo))}</b><span>近 7 天回合</span></div><div><b>${sumR(log)}</b><span>累計回合</span></div><div><b>${mins}</b><span>累計分鐘</span></div>`;
  $('logList').innerHTML = log.length ? log.slice(0, 50).map((x) => {
    const d = new Date(x.at);
    const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `<li><span>${esc(x.name)}・${x.rounds}${x.full ? '' : '/' + x.of} 回合${x.full ? ' ✅' : ''}</span><span>${fmt(x.ms || 0)}・${when}</span></li>`;
  }).join('') : '<li class="empty">還沒有紀錄，開始第一場訓練吧！</li>';
  $('dLog').showModal();
}
$('btnLog').addEventListener('click', openLog);
$('btnClearLog').addEventListener('click', () => { if (!confirm('清除全部訓練紀錄？')) return; Store.data.log = []; Store.save(); openLog(); });

/* ---------- 安裝引導：Android 用安裝按鈕、iPhone 教「加入主畫面」 ---------- */
(() => {
  const OFF = 'roundbell_install_off';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let off = false; try { off = !!localStorage.getItem(OFF); } catch {}
  if (standalone || off) return;
  const box = $('install'); let deferred = null;
  $('installX').addEventListener('click', () => { box.hidden = true; try { localStorage.setItem(OFF, '1'); } catch {} });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e;
    $('installText').textContent = '安裝成 App，沒網路也能用';
    $('installBtn').hidden = false; box.hidden = false;
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    const r = await deferred.userChoice.catch(() => null);
    deferred = null; box.hidden = true;
    if (r && r.outcome === 'accepted') toast('已安裝，主畫面找 RoundBell');
  });
  window.addEventListener('appinstalled', () => { box.hidden = true; });
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    $('installText').innerHTML = '加到主畫面：點 <b>分享</b> <span aria-hidden="true">⎋</span> →「加入主畫面」';
    $('installBtn').hidden = true; box.hidden = false;
  }
})();

/* ---------- 啟動 ---------- */
Store.load();
const routeData = $('routineData');
if (routeData) {
  Store.route = JSON.parse(routeData.textContent);
  Store.route.combo = Object.assign({}, DEF_COMBO, Store.route.combo);
  const saveBtn = $('saveRoutine');
  saveBtn && saveBtn.addEventListener('click', () => { Store.add(Store.route); toast('已加入我的課表，首頁就看得到'); });
  const shareBtn = $('shareRoutine');
  shareBtn && shareBtn.addEventListener('click', () => copyLink(Store.route));
}
renderChips();
checkIncoming();
Audio.render();
requestAnimationFrame(loop);
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {}));

// 給測試用
window.__rb = { Engine, Store, Voice };
