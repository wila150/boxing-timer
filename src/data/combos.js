// 教練喊拳拳法庫（以右撇子正架為準）
// 數字拳：1 刺拳 2 後手直拳 3 前手勾拳 4 後手勾拳 5 前手上勾拳 6 後手上勾拳
// 防守／步伐：閃＝閃躲、潛避、格擋、後撤、前進、側移

// 英文口號＝教練實際喊法（2026-11-16 使用者提供；閃躲／潛避／前進用標準英文 Slip／Roll／Step in）
// 英文口號＝教練實際喊法（2026-11-16 使用者提供；閃躲／潛避／前進用標準英文 Slip／Roll／Step in；2 號只念 Right）
// 日文口令（2026-11-16 使用者提供）：ジャブ、ストレート、ワン・ツー、フック、アッパー、ボディ…
export const PUNCH = {
  1: { say: '一', name: '刺拳', en: 'Jab', ja: 'ジャブ' },
  2: { say: '二', name: '直拳', en: 'Right', ja: 'ストレート' },
  3: { say: '三', name: '左勾', en: 'Hook', ja: 'フック' },
  4: { say: '四', name: '右勾', en: 'Hook', ja: 'フック' },
  5: { say: '五', name: '左上勾', en: 'Uppercut', ja: 'アッパー' },
  6: { say: '六', name: '右上勾', en: 'Uppercut', ja: 'アッパー' },
};
export const MOVE = {
  腹: { en: 'Body', name: '左勾腹', ja: 'ボディ' },
  閃: { en: 'Slip', name: '閃躲', ja: 'ダッキング' },
  潛避: { en: 'Roll', name: '潛避', ja: 'ウィービング' },
  後仰: { en: 'Sway', name: '後仰閃', ja: 'スウェー' },
  格擋: { en: 'Cover up', name: '防禦架勢', ja: 'ブロック' },
  後撤: { en: 'Back step', name: '後退步', ja: 'バックステップ' },
  前進: { en: 'Step in', name: '前進', ja: 'ステップ' },
  側移: { en: 'Side step', name: '側移', ja: 'サイドステップ' },
};
// 1-2 連在一起的念法
const ONE_TWO = { en: 'One-two', ja: 'ワン・ツー' };

// 組合之間偶爾穿插的鼓勵／提醒
export const CHEER = {
  en: [['Hands up!', '手舉高'], ['Nice punch!', '好拳'], ['Relax!', '放輕鬆'], ['Keep moving!', '腳步別停']],
  zh: [['手舉高！', '護好臉'], ['好拳！', '打得漂亮'], ['放輕鬆！', '肩膀別僵'], ['腳步別停！', '保持移動']],
  ja: [['ガード上げて！', '手舉高'], ['ナイスパンチ！', '好拳'], ['リラックス！', '放輕鬆'], ['ステップ！', '腳步別停']],
};
// 最後警告時喊一句催促
export function urgeText(lang, warn) {
  if (lang === 'zh') return '最後衝刺！加油加油！';
  if (lang === 'ja') return `ラスト${warn}秒！連打！`;
  return `Last ${warn === 10 ? 'ten' : warn}! Go go go!`;
}
export const VOICE_LANG = { en: 'en-US', zh: 'zh-TW', ja: 'ja-JP' };

export const BASIC = [
  '1', '1-1', '1-2', '1-1-2', '2-3', '1-2-3', '1-2-3-2', '3-2', '2-3-2',
  '1-6', '1-6-3-2', '5-2', '1-2-5-2', '5-6', '6-3-2', '1-2-3-4', '1-1-2-3', '3-4', '4-3-2', '1-2-1-2',
];

export const ADVANCED = [
  '1-2-閃-2', '1-2-潛避-2', '格擋-2-3-2', '1-2-3-潛避-3-2', '閃-閃-2-3', '前進-1-2', '1-1-2-後撤',
  '1-2-側移', '格擋-格擋-2', '3-潛避-3-2', '1-2-3-閃-3', '2-閃-2-3', '前進-1-2-3-後撤', '5-2-潛避-2',
  '1-6-3-2-側移', '閃-2-5-2', '格擋-1-2-3', '1-2-潛避-6-3', '後撤-1-2', '1-1-前進-2-3',
  '1-2-腹', '1-腹-3', '2-腹-3-2', '後仰-2', '1-後仰-2-3', '腹-3-2', '1-2-後仰-2',
];

// 節奏：兩次喊拳之間的基本間隔（毫秒），實際會 ±20% 隨機，招數越長間隔越長
export const PACE = { slow: 7000, mid: 4500, fast: 2800 };

// lang：'en' 英文口號／'ja' 日文口令（1-2 連在一起念 One-two／ワン・ツー）／'zh' 中文數字
export function parseCombo(str, lang = 'en') {
  const parts = str.split('-');
  const name = (p) => (PUNCH[p] ? PUNCH[p].name : MOVE[p] ? MOVE[p].name : p);
  if (lang === 'zh') {
    return {
      text: parts.join('-'),
      say: parts.map((p) => (PUNCH[p] ? PUNCH[p].say : p)).join('、'),
      desc: parts.map(name).join('・'),
      len: parts.length, lang,
    };
  }
  const L = lang === 'ja' ? 'ja' : 'en';
  const words = [], zh = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '1' && parts[i + 1] === '2') { words.push(ONE_TWO[L]); zh.push('刺拳＋直拳'); i++; continue; }
    const p = parts[i];
    words.push(PUNCH[p] ? PUNCH[p][L] : MOVE[p] ? MOVE[p][L] : p);
    zh.push(name(p));
  }
  return { text: words.join(' · '), say: words.join(L === 'ja' ? '、' : ', '), desc: zh.join('・'), len: parts.length, lang: L };
}

export function comboPool(level, lang = 'en') {
  return (level === 'adv' ? BASIC.slice(4).concat(ADVANCED) : BASIC).map((c) => parseCombo(c, lang));
}

export function cheerPool(lang = 'en') {
  return (CHEER[lang] || CHEER.en).map(([say, desc]) => ({ text: say, say, desc, len: 1, lang: lang in CHEER ? lang : 'en', cheer: true }));
}

// 休息時的技術提醒（輪播）
export const TIPS = [
  '鼻吸嘴吐，把呼吸放慢',
  '下巴收好，雙手回到臉旁',
  '出拳後馬上收回，不要停在外面',
  '肩膀放鬆，力量從腳跟轉出來',
  '前腳尖、膝蓋、拳頭朝同一個方向',
  '直拳打完，後腳跟要轉起來',
  '勾拳用身體轉，不是用手臂甩',
  '眼睛看前方，不要低頭看腳',
  '腳步保持比肩寬，重心在中間',
  '閃躲用膝蓋，不要只彎腰',
  '喝一小口水就好，別灌太多',
  '下一回合先想好一個要練的重點',
];
