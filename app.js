/* 曼昆《宏观经济学》题库复习 - 纯静态单页应用（无框架、无 CDN）
   英文原文优先 · 一键翻译 · 点词查词 */
'use strict';

// ===== 章节中文名 =====
const CH_ZH = {
  1:'宏观经济学的科学', 2:'宏观经济数据', 3:'国民收入', 4:'货币体系', 5:'通货膨胀',
  6:'开放经济', 7:'失业', 8:'经济增长 I', 9:'经济增长 II', 10:'经济波动导论',
  11:'总需求 I', 12:'总需求 II', 13:'开放经济再探', 14:'总供给', 15:'经济波动的动态模型',
  16:'稳定化政策的其他视角', 17:'政府债务与预算赤字', 18:'金融体系'
};

// ===== 数据 =====
let DATA = null;
let qIndex = {};
let topicMap = {};
let topicById = {};

// ===== 用户状态（localStorage）=====
const LS = {
  get(k, d) { try { const v = localStorage.getItem('mankiw.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) {
    try { localStorage.setItem('mankiw.' + k, JSON.stringify(v)); }
    catch (e) { storageFail(k, e); }
    if (window.Sync && Sync.SYNC_KEYS.includes(k)) Sync.markDirty();
    if (window.Backup && Backup.WATCH_KEYS.includes(k)) Backup.markDirty();
  }
};
// ===== 存储可用性自检 =====
// 无痕模式 / 配额满 / 存储被禁用时，写入会失败。若不提示，用户会以为记住了其实没存。
let storageBroken = false;
function storageFail(key, err) {
  if (storageBroken) return;
  storageBroken = true;
  console.warn('[storage] 写入失败', key, err);
  showStorageWarning('⚠️ 浏览器无法保存学习进度（可能处于无痕模式或存储已满），本次记录不会保留。');
}
function storageCheck() {
  try {
    localStorage.setItem('mankiw.__probe', '1');
    localStorage.removeItem('mankiw.__probe');
    storageBroken = false;
    return true;
  } catch (e) {
    storageBroken = true;
    showStorageWarning('⚠️ 当前浏览器无法保存学习进度（可能处于无痕模式或存储已满），本次记录不会保留。');
    return false;
  }
}
function showStorageWarning(msg) {
  if (document.getElementById('storage-warn')) return;
  const d = document.createElement('div');
  d.id = 'storage-warn';
  d.textContent = msg;
  document.body.insertBefore(d, document.body.firstChild);
}
let wrong = LS.get('wrong', {});
// 错题间隔重复：{ due: 'YYYY-MM-DD', stage: 0..4 }，stage 对应 SRS_INTERVALS
// 0=今天该复习 1=+1天 2=+3天 3=+7天 4=+15天，第 4 档答对即毕业移出
const SRS_INTERVALS = [0, 1, 3, 7, 15];
(function migrateWrong() {
  const t = todayStr();
  for (const k of Object.keys(wrong)) if (wrong[k] === true) wrong[k] = { due: t, stage: 0 };
})();
let notes = LS.get('notes', {});
let fav   = LS.get('fav', {});
let done  = LS.get('done', {});
let vocab = LS.get('vocab', {});
let daily = LS.get('daily', {});
// 语言模式：'en' 英文原文 | 'zh' 中文 | 'both' 中英对照
let lang = LS.get('lang', 'en');

// ===== 测验状态 =====
let quiz = { keys: [], origKeys: [], idx: 0 };
let listFilter = 'all';
// 练习顺序：'seq' 顺序 | 'rand' 随机
let order = LS.get('order', 'seq');
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
// 记录上次练习，用于首页「继续学习」
function saveLastQuiz() {
  LS.set('lastQuiz', { keys: quiz.origKeys.length ? quiz.origKeys : quiz.keys, idx: quiz.idx });
}

// ===== 工具函数 =====
function key(ch, num) { return ch + '-' + num; }
// 内联 onclick 用的 JS 字符串转义（单引号包裹场景）
function jsq(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
// 内联 onclick 用的题目 key 数组字面量（key 只含数字和连字符，安全）
function qkeys(arr) { return '[' + arr.map(k => `'${jsq(k)}'`).join(',') + ']'; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// ===== 参考答案渲染 =====
// 新版解析为结构化文本：【要点】…【公式/推导】…【术语】…【易错】…
const ANS_SEC_CLASS = { '要点': 'key', '公式/推导': 'formula', '术语': 'term', '易错': 'trap' };
function ansPlainText(txt) { return String(txt || '').replace(/【[^】]*】/g, '').trim(); }
function renderAnsHtml(txt) {
  const s = String(txt || '');
  if (!s.trim()) return '';
  const parts = s.split(/(【[^】]+】)/);
  let html = '', cur = null, buf = [];
  const flush = () => {
    if (!cur) return;
    const body = buf.join('\n').trim();
    if (!body) return;
    const cls = ANS_SEC_CLASS[cur] || 'key';
    html += `<div class="ans-sec ${cls}"><div class="ans-hd">${esc(cur)}</div><div class="ans-bd">${esc(body)}</div></div>`;
    buf = [];
  };
  for (const p of parts) {
    const m = p.match(/^【([^】]+)】$/);
    if (m) { flush(); cur = m[1]; }
    else if (cur) buf.push(p);
  }
  flush();
  // 没有结构化标签时退回纯文本
  return html || `<div class="ans-bd">${esc(s)}</div>`;
}
// 包裹可点单词（跳过 HTML 实体，避免 &amp; 被拆坏）
function wrapWords(escapedHtml) {
  const ents = [];
  const s = escapedHtml
    .replace(/&[a-zA-Z#0-9]+;/g, m => { ents.push(m); return '' + (ents.length - 1) + ''; })
    .replace(/[A-Za-z][A-Za-z'\u2019-]+/g, w => `<span class="w">${w}</span>`);
  return s.replace(/(\d+)/g, (m, i) => ents[+i]);
}
function renderRich(text) {
  const s = String(text == null ? '' : text);
  const re = /\[\[IMG:([^\]]+)\]\]/g;
  // 图片先抽成占位符，避免后面的分行/表格处理打乱它。
  // 占位符只用私用区字符 + 数字：里面不能出现字母，否则 wrapWords 会把
  // "IMG0" 当成单词包上 <span class="w">，占位符就再也拼不回来了。
  const imgs = [];
  const t = s.replace(re, (m, f) => { imgs.push(f); return '\uE000' + (imgs.length - 1) + '\uE001'; });
  // 逐行渲染：含 " | " 的连续行当作表格，其余按行输出并换行
  const lines = t.split('\n');
  let out = '', i = 0;
  while (i < lines.length) {
    if (lines[i].indexOf(' | ') >= 0) {
      const rows = [];
      while (i < lines.length && lines[i].indexOf(' | ') >= 0) { rows.push(lines[i]); i++; }
      out += '<table class="qtbl">' + rows.map((r, ri) => {
        const cells = r.split('|').map(c => c.trim());
        const tag = ri === 0 ? 'th' : 'td';
        return '<tr>' + cells.map(c => `<${tag}>${wrapWords(esc(c))}</${tag}>`).join('') + '</tr>';
      }).join('') + '</table>';
    } else {
      out += wrapWords(esc(lines[i]));
      i++;
    }
    if (i < lines.length) out += '<br>';
  }
  // 图片放回
  return out.replace(/\uE000(\d+)\uE001/g, (m, n) => `<img src="data/images/${esc(imgs[+n])}" alt="">`);
}
function lookupOne(w) {
  if (DICT[w]) return { word: w, meaning: DICT[w] };
  // 词形还原：BFS 两轮剥词缀，处理 increasingly→increasing→increase 这类双重派生
  const rules = [
    x => x.length > 3 && x.endsWith('ies') ? x.slice(0, -3) + 'y' : null,
    x => x.length > 3 && x.endsWith('es') ? x.slice(0, -2) : null,
    x => x.length > 3 && x.endsWith('s') && !x.endsWith('ss') ? x.slice(0, -1) : null,
    x => x.length > 4 && x.endsWith('ing') ? x.slice(0, -3) : null,
    x => x.length > 4 && x.endsWith('ing') ? x.slice(0, -3) + 'e' : null,
    x => x.length > 3 && x.endsWith('ed') ? x.slice(0, -2) : null,
    x => x.length > 4 && x.endsWith('ed') ? x.slice(0, -1) : null,
    x => x.length > 3 && x.endsWith('ied') ? x.slice(0, -3) + 'y' : null,
    x => x.length > 4 && x.endsWith('ly') ? x.slice(0, -2) : null,
  ];
  let frontier = [w];
  for (let round = 0; round < 2; round++) {
    const next = [];
    for (const x of frontier) for (const f of rules) {
      const y = f(x);
      if (y && y !== x && y.length > 1 && !frontier.includes(y) && !next.includes(y)) {
        if (DICT[y]) return { word: y, meaning: DICT[y] };
        next.push(y);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return null;
}
function lookupWord(raw) {
  let w = raw.toLowerCase().replace(/[^a-z'\u2019-]/g, '');
  if (!w) return null;
  // 所有格：workers' / worker's -> worker
  w = w.replace(/['\u2019]s$/, '').replace(/['\u2019]$/, '');
  const r = lookupOne(w);
  if (r) return r;
  // 连字符复合词：整体未命中时拆各部分，全部命中则组合释义
  if (w.includes('-')) {
    const parts = w.split('-').filter(Boolean);
    const rs = parts.map(p => lookupOne(p));
    if (parts.length > 1 && rs.every(Boolean))
      return { word: w, meaning: rs.map(x => x.meaning).join(' + ') };
  }
  return null;
}
function todayStr(d) {
  d = d || new Date(); const p = n => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayStrOffset(d, off) {
  const t = new Date(d); t.setDate(t.getDate() - off);
  return todayStr(t);
}
function count(o) { return Object.keys(o).length; }
function streakDays() {
  let days = 0, d = new Date();
  while (daily[todayStrOffset(d, days)]) days++;
  return days;
}
function accRate() {
  const total = count(done), ok = Object.values(done).filter(v => v === 'ok').length;
  return total ? Math.round(ok / total * 100) : 0;
}
function saStat() {
  const ks = Object.keys(done).filter(k => qIndex[k] && qIndex[k].question.type === 'sa');
  if (!ks.length) return '—';
  const ok = ks.filter(k => done[k] === 'ok').length;
  return `${ok}/${ks.length}`;
}

// ===== 加载 =====
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 30);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}
async function init() {
  storageCheck();
  DATA = window.MANKIW_DATA || await fetch('data/questions.json').then(r => r.json());
  // 数据版本检测：资源版本号变化说明题库已更新（配合 index.html ?v= 缓存刷新）
  const build = window.DATA_BUILD || '';
  if (build && LS.get('build', '') !== build) {
    LS.set('build', build);
    if (LS.get('buildNoted', false)) showToast('题库数据已更新到 ' + build);
    else LS.set('buildNoted', true);
  }
  for (const ch of DATA.chapters) {
    for (const q of ch.questions) {
      const k = key(ch.num, q.num);
      qIndex[k] = { chapter: ch, question: q };
      for (const t of (q.topics || [])) (topicMap[t] = topicMap[t] || []).push(k);
    }
  }
  for (const t of (DATA.topics || [])) topicById[t.id] = t;
  bindUI();
  route();
  // 本地文件自动备份（可选，用户在统计页开启）
  if (window.Backup) { Backup.init(); window.onBackupStatusChange = () => route(); }
  // Service Worker：首次打开后即可完全离线使用（file:// 下浏览器不允许注册）
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ===== UI 绑定 =====
function bindUI() {
  document.getElementById('btn-dark').addEventListener('click', toggleTheme);
  document.getElementById('btn-back').addEventListener('click', () => history.back());
  document.querySelectorAll('#tabbar .tab').forEach(b =>
    b.addEventListener('click', () => { location.hash = '#/' + b.dataset.view; }));
  // 查词：事件委托
  document.getElementById('view').addEventListener('click', e => {
    const w = e.target.closest('.w');
    if (w) { e.stopPropagation(); showWordPopup(w.textContent, e.clientX, e.clientY); }
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('click', e => { if (!e.target.closest('#popup') && !e.target.closest('.w')) hidePopup(); });
  // 键盘快捷键（做题/测验页）：← → 切题，A-E / 1-5 选项
  document.addEventListener('keydown', e => {
    const inAnswer = location.hash.startsWith('#/quiz') || location.hash.startsWith('#/exam/run');
    if (!inAnswer) return;
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowLeft') document.getElementById('btn-prev')?.click();
    else if (e.key === 'ArrowRight') document.getElementById('btn-next')?.click();
    else {
      const i = 'abcde12345'.indexOf(e.key.toLowerCase());
      if (i >= 0) {
        // 选项改成双击作答，键盘快捷键同步触发双击
        const opt = document.querySelectorAll('#opts .opt')[i % 5];
        if (opt) opt.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
    }
  });
  // 手机滑动手势切题（横向滑动，纵向滚动不误触）
  let touchX = 0, touchY = 0;
  document.getElementById('view').addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
  }, { passive: true });
  document.getElementById('view').addEventListener('touchend', e => {
    const inAnswer = location.hash.startsWith('#/quiz') || location.hash.startsWith('#/exam/run');
    if (!inAnswer) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 64 && Math.abs(dy) < 48) {
      if (dx < 0) document.getElementById('btn-next')?.click();
      else document.getElementById('btn-prev')?.click();
    }
  }, { passive: true });
}
function toggleTheme() {
  const h = document.documentElement;
  const dark = h.dataset.theme === 'dark';
  const next = dark ? 'light' : 'dark';
  h.dataset.theme = next;
  document.getElementById('btn-dark').textContent = dark ? '☾' : '☀';
  LS.set('theme', next);
}
function applyTheme() {
  const t = LS.get('theme', '');
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : '';
  document.getElementById('btn-dark').textContent = dark ? '☀' : '☾';
  // 未手动设置时跟随系统
  if (!t) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!LS.get('theme', '')) {
      document.documentElement.dataset.theme = e.matches ? 'dark' : '';
      document.getElementById('btn-dark').textContent = e.matches ? '☀' : '☾';
    }
  });
}

// ===== 路由 =====
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [view, a] = h.split('/');
  // 离开测验页时停掉计时器、收起答题卡
  if (!h.startsWith('exam/run')) { if (examTimer) { clearInterval(examTimer); examTimer = null; } }
  document.getElementById('overlay').hidden = true;
  document.getElementById('btn-back').hidden = (view === 'home');
  document.body.classList.toggle('quiz-mode', view === 'quiz');
  document.querySelectorAll('#tabbar .tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === view));
  hidePopup();
  const el = document.getElementById('view');
  el.innerHTML = '';
  if (view === 'home') renderHome(el);
  else if (view === 'chapter') renderChapter(el, +a);
  else if (view === 'topic') renderTopic(el, a);
  else if (view === 'quiz') renderQuiz(el);
  else if (view === 'exam') renderExam(el, a);
  else if (view === 'wrong') renderWrong(el);
  else if (view === 'vocab') renderVocab(el);
  else if (view === 'stats') renderStats(el);
  else if (view === 'search') renderSearch(el);
  else renderHome(el);
  window.scrollTo(0, 0);
}
function setTitle(t) { document.getElementById('topbar-title').textContent = t; }

// ===== 首页 =====
function renderHome(el) {
  setTitle('曼昆《宏观经济学》题库');
  const tab = sessionStorage.getItem('homeTab') || 'chapter';
  const totalQ = Object.keys(qIndex).length;
  // 「继续学习」条
  const lq = LS.get('lastQuiz', null);
  let contHtml = '';
  if (lq && lq.keys && lq.keys.length && lq.idx > 0 && lq.idx < lq.keys.length) {
    const cur = qIndex[lq.keys[Math.min(lq.idx, lq.keys.length - 1)]];
    if (cur) {
      contHtml = `
      <div class="cont-card" onclick="continueQuiz()">
        <div>
          <div class="t">继续上次练习 · 第 ${cur.chapter.num} 章 ${CH_ZH[cur.chapter.num] || ''}</div>
          <div class="s">第 ${Math.min(lq.idx + 1, lq.keys.length)} / ${lq.keys.length} 题</div>
        </div>
        <span class="go">继续 →</span>
      </div>`;
    }
  }
  el.innerHTML = `
    <div class="hero">
      <h1>曼昆《宏观经济学》</h1>
      <div class="sub">Macroeconomics, 10th Edition · 英文题库 ${totalQ} 题</div>
      <div class="hero-stats">
        <div class="hero-stat"><div class="v">${count(done)}</div><div class="k">已做题</div></div>
        <div class="hero-stat"><div class="v">${accRate()}%</div><div class="k">正确率</div></div>
        <div class="hero-stat"><div class="v">${count(wrong)}</div><div class="k">错题</div></div>
        <div class="hero-stat"><div class="v">${streakDays()} 天</div><div class="k">连续打卡</div></div>
      </div>
    </div>
    ${contHtml}
    <div class="muted" style="font-size:12px;text-align:center;margin:-4px 0 12px">
      ${window.Backup && Backup.status().on
        ? '🔒 学习数据存在本机，未上传 · 自动备份已开启（' + esc(Backup.status().fileName || '本地文件') + '）'
        : '🔒 学习数据只存在本机浏览器，不会上传 · <span onclick="location.hash=\'#/stats\'" style="cursor:pointer;color:var(--accent)">开启自动备份到文件 ›</span>'}
    </div>
    <div class="cont-card" style="border-left-color:var(--warn)" onclick="location.hash='#/exam'">
      <div>
        <div class="t">模拟测验</div>
        <div class="s">随机抽题 · 限时作答 · 交卷判分 · 成绩计入统计</div>
      </div>
      <span class="go" style="color:var(--warn)">进入 →</span>
    </div>
    <div class="card row" style="cursor:pointer;margin-bottom:12px" onclick="location.hash='#/search'">
      <span class="grow muted">搜索题干 / 选项关键词…</span>
      <span style="color:var(--muted)">›</span>
    </div>
    <div class="tabs">
      <button data-t="chapter" class="${tab==='chapter'?'active':''}">按章节</button>
      <button data-t="topic" class="${tab==='topic'?'active':''}">按知识点</button>
    </div>
    <div id="home-list"></div>`;
  el.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    sessionStorage.setItem('homeTab', b.dataset.t);
    renderHome(el);
  }));
  const list = el.querySelector('#home-list');
  if (tab === 'chapter') renderChapterList(list);
  else renderTopicList(list);
}
function renderChapterList(el) {
  el.innerHTML = '<div class="ch-grid"></div>';
  const grid = el.querySelector('.ch-grid');
  for (const ch of DATA.chapters) {
    const n = ch.questions.length;
    const saN = ch.questions.filter(q => q.type === 'sa').length;
    const doneN = ch.questions.filter(q => done[key(ch.num, q.num)]).length;
    const wrongN = ch.questions.filter(q => wrong[key(ch.num, q.num)]).length;
    grid.insertAdjacentHTML('beforeend', `
      <div class="ch-card" onclick="location.hash='#/chapter/${ch.num}'">
        <div class="top">
          <div class="ch-badge">${ch.num}</div>
          <div class="grow" style="min-width:0">
            <div class="title">${CH_ZH[ch.num] || esc(ch.title)}</div>
            <div class="sub">${esc(ch.title)}</div>
          </div>
        </div>
        <div class="prog"><i style="width:${n ? Math.round(doneN / n * 100) : 0}%"></i></div>
        <div class="meta"><span>${doneN}/${n} 已完成</span><span>选择 ${n - saN} · 简答 ${saN}</span><span>${wrongN ? '❌ 错 ' + wrongN : ''}</span></div>
      </div>`);
  }
}
function renderTopicList(el) {
  // 按所属章节分组
  const groups = {};
  for (const t of DATA.topics) {
    const c = (t.chapters && t.chapters[0]) || 0;
    (groups[c] = groups[c] || []).push(t);
  }
  for (const c of Object.keys(groups).sort((a, b) => a - b)) {
    el.insertAdjacentHTML('beforeend',
      `<div class="t-group-label">第 ${c} 章 · ${CH_ZH[c] || ''}</div>`);
    for (const t of groups[c]) {
      const keys = topicMap[t.id] || [];
      el.insertAdjacentHTML('beforeend', `
        <div class="list-item" onclick="location.hash='#/topic/${t.id}'">
          <div class="grow">
            <div class="title">${esc(t.zh)}</div>
            <div class="sub">${esc(t.name)}</div>
          </div>
          <div class="tag">${keys.length} 题 ›</div>
        </div>`);
    }
  }
}

// ===== 章节详情 =====
function renderChapter(el, num) {
  const ch = DATA.chapters.find(c => c.num === num);
  if (!ch) { el.innerHTML = '<div class="empty">未找到该章节</div>'; return; }
  setTitle('第 ' + num + ' 章 · ' + (CH_ZH[num] || ''));
  const wrongKeys = ch.questions.filter(q => wrong[key(num, q.num)]).map(q => key(num, q.num));
  const dueKeys = wrongKeys.filter(k => wrongState(k) === 'due');
  const waitN = wrongKeys.length - dueKeys.length;
  const n = ch.questions.length, doneN = ch.questions.filter(q => done[key(num, q.num)]).length;
  el.innerHTML = `
    <div class="card">
      <h2>${CH_ZH[num] || esc(ch.title)}</h2>
      <div class="muted">${esc(ch.title)} · 共 ${n} 题</div>
      <div class="progress" style="margin-top:12px"><i style="width:${n ? Math.round(doneN / n * 100) : 0}%"></i></div>
      <div class="muted" style="margin-top:6px">已完成 ${doneN} / ${n}</div>
      <div class="btn-row">
        <button class="btn primary grow" onclick="startQuiz(${qkeys(ch.questions.map(q=>key(num,q.num)))})">开始练习</button>
      </div>
      ${dueKeys.length ? `<div class="btn-row"><button class="btn grow" onclick="startQuiz(${qkeys(dueKeys)})">错题重练（${dueKeys.length}）</button></div>` : ''}
      ${waitN ? `<div class="muted" style="margin-top:6px">另有 ${waitN} 道错题已按记忆曲线安排在未来复习</div>` : ''}
    </div>
    ${filterBarHtml()}
    <div id="qlist"></div>`;
  bindFilterBar(el, () => renderChapter(el, num));
  renderQuestionList(el.querySelector('#qlist'), ch.questions.map(q => key(num, q.num)), num);
}

// ===== 知识点详情 =====
function renderTopic(el, id) {
  const t = topicById[id];
  if (!t) { el.innerHTML = '<div class="empty">未找到该知识点</div>'; return; }
  setTitle(t.zh);
  const keys = topicMap[id] || [];
  el.innerHTML = `
    <div class="summary">
      <h2 style="margin-top:0">${esc(t.zh)}</h2>
      <div class="muted">${esc(t.name)} · ${keys.length} 题</div>
      <div style="margin-top:10px">${esc(t.summary).replace(/\n/g,'<br>')}</div>
      <div class="btn-row"><button class="btn primary grow" onclick="startQuiz(${qkeys(keys)})">练习该知识点</button></div>
    </div>
    ${filterBarHtml()}
    <div id="qlist"></div>`;
  bindFilterBar(el, () => renderTopic(el, id));
  renderQuestionList(el.querySelector('#qlist'), keys, null);
}

// ===== 筛选条 =====
function filterBarHtml() {
  const opts = [['all','全部'],['todo','未做'],['wrong','做错'],['fav','收藏']];
  return `<div class="chip-row">` +
    opts.map(([v, t]) => `<button class="filter-chip ${listFilter===v?'active':''}" data-f="${v}">${t}</button>`).join('') +
    `</div>`;
}
function bindFilterBar(el, rerender) {
  el.querySelectorAll('.filter-chip').forEach(b => b.addEventListener('click', () => {
    listFilter = b.dataset.f; rerender();
  }));
}

// ===== 题目列表（分页加载，每批 30 条） =====
const PAGE_SIZE = 30;
function renderQuestionList(el, keys, chnum, limit) {
  const max = limit || PAGE_SIZE;
  let shown = 0;
  el.innerHTML = '';
  for (const k of keys) {
    const { chapter, question: q } = qIndex[k];
    if (listFilter === 'todo' && done[k]) continue;
    if (listFilter === 'wrong' && !wrong[k]) continue;
    if (listFilter === 'fav' && !fav[k]) continue;
    if (shown >= max) break;
    shown++;
    const d = done[k];
    const icons = (fav[k] ? '<span style="color:var(--warn)">★</span> ' : '') +
      (notes[k] ? '✎ ' : '') +
      (d === 'ok' ? '<span style="color:var(--ok)">✓</span>' : d === 'bad' ? '<span style="color:var(--bad)">✗</span>' : '');
    const label = q.type === 'mc' ? `Q${q.num}` : `Q${q.num}·简答`;
    const text = q.question.replace(/\[\[IMG:[^\]]+\]\]/g, '[图]').slice(0, 80);
    const chapterTag = chnum == null ? `第${chapter.num}章` : '';
    el.insertAdjacentHTML('beforeend', `
      <div class="list-item" onclick="startQuiz(['${k}'])">
        <div class="num">${label}</div>
        <div class="grow">
          <div class="sub" style="color:var(--text);font-size:13px">${esc(text)}</div>
          ${chapterTag ? `<div class="tag">${chapterTag}</div>` : ''}
        </div>
        <div style="white-space:nowrap;font-size:13px">${icons}</div>
      </div>`);
  }
  // 统计过滤后总数，决定是否显示「加载更多」
  let total = 0;
  for (const k of keys) {
    if (listFilter === 'todo' && done[k]) continue;
    if (listFilter === 'wrong' && !wrong[k]) continue;
    if (listFilter === 'fav' && !fav[k]) continue;
    total++;
  }
  if (total === 0) { el.insertAdjacentHTML('beforeend', '<div class="empty">没有符合条件的题目</div>'); return; }
  if (total > shown) {
    el.insertAdjacentHTML('beforeend', `<button class="btn more-btn">加载更多（${shown}/${total}）</button>`);
    el.querySelector('.more-btn').addEventListener('click', () => {
      renderQuestionList(el, keys, chnum, shown + PAGE_SIZE);
    });
  }
}

// ===== 练习 =====
function startQuiz(keys, startIdx) {
  quiz.origKeys = keys.filter(k => qIndex[k]);
  quiz.keys = order === 'rand' ? shuffle([...quiz.origKeys]) : [...quiz.origKeys];
  quiz.idx = startIdx || 0;
  if (!quiz.keys.length) { location.hash = '#/home'; return; }
  listFilter = 'all';
  saveLastQuiz();
  location.hash = '#/quiz';
}
// 首页「继续学习」
window.continueQuiz = function () {
  const lq = LS.get('lastQuiz', null);
  if (!lq || !lq.keys || !lq.keys.length) return;
  quiz.origKeys = lq.keys.filter(k => qIndex[k]);
  quiz.keys = [...quiz.origKeys];
  quiz.idx = Math.min(lq.idx || 0, quiz.keys.length - 1);
  if (!quiz.keys.length) return;
  location.hash = '#/quiz';
};
// 顺序/随机切换：保持当前题位置不变
function bindOrderSeg(el) {
  const seg = el.querySelector('#order-seg');
  if (!seg) return;
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (order === b.dataset.o) return;
    order = b.dataset.o; LS.set('order', order);
    const cur = quiz.keys[quiz.idx];
    quiz.keys = order === 'rand' ? shuffle([...quiz.origKeys]) : [...quiz.origKeys];
    const ci = quiz.keys.indexOf(cur);
    if (ci >= 0) { quiz.keys.splice(ci, 1); quiz.keys.splice(quiz.idx, 0, cur); }
    renderQuiz(el);
  }));
}
function orderSegHtml() {
  return `<div class="seg" id="order-seg">` +
    [['seq','顺序'],['rand','随机']].map(([v, t]) =>
      `<button data-o="${v}" class="${order===v?'active':''}">${t}</button>`).join('') + `</div>`;
}
function langSegHtml(hasZh) {
  const modes = [['en','英'],['zh','中'],['both','对照']];
  return `<div class="seg" id="lang-seg">` + modes.map(([v, t]) =>
    `<button data-l="${v}" class="${lang===v?'active':''}" title="${hasZh?'':'该题暂无翻译'}">${t}</button>`).join('') + `</div>`;
}
function stemHtml(q) {
  const imgs = (q.images || []).map(f => `<img src="data/images/${esc(f)}" alt="">`).join('');
  let h = '';
  if (lang !== 'zh') h += `<div class="q-stem">${renderRich(q.question)}</div>`;
  if (lang !== 'en' && q.translation) h += `<div class="q-zh">${esc(q.translation.question)}</div>`;
  if (imgs) h += `<div class="q-img">${imgs}</div>`;
  return h;
}
function renderQuiz(el) {
  if (!quiz.keys.length || quiz.idx >= quiz.keys.length) {
    el.innerHTML = `<div class="empty">全部完成。</div>
      <div class="btn-row"><button class="btn primary block" onclick="location.hash='#/home'">返回首页</button></div>`;
    return;
  }
  const k = quiz.keys[quiz.idx];
  const { chapter, question: q } = qIndex[k];
  setTitle(`练习 ${quiz.idx + 1} / ${quiz.keys.length}`);
  const hasZh = !!q.translation;
  const last = done[k];

  el.innerHTML = `
    <div class="card" style="padding-bottom:18px">
      <div class="quiz-progress"><i style="width:${Math.round((quiz.idx) / quiz.keys.length * 100)}%"></i></div>
      <div class="q-meta">
        <span class="muted">第${chapter.num}章 Q${q.num}${q.type==='sa'?' · 简答':''}</span>
        <span class="grow"></span>
        <button class="icon-btn" id="btn-fav" title="收藏">${fav[k]?'★':'☆'}</button>
        ${orderSegHtml()}
        ${langSegHtml(hasZh)}
      </div>
      ${stemHtml(q)}
      ${q.type==='mc'
        ? `<div id="opts"></div><div id="fb"></div>`
        : `${q.answer_ref
           ? `<button class="btn grow ans-toggle" id="sa-ans-btn">显示参考答案</button>
              <div class="ans-box" id="sa-ans" hidden>${renderAnsHtml(q.answer_ref)}</div>`
           : `<div class="muted" style="margin-bottom:10px">简答题暂无参考答案，对照中文翻译自测后标记掌握情况。</div>`}
           <div class="btn-row">
             <button class="btn grow" id="sa-ok">会 做</button>
             <button class="btn grow" id="sa-bad">不 会</button>
           </div>
           <div id="sa-fb"></div>`}
      <div class="section-label">笔记</div>
      <textarea class="note-box" id="note" placeholder="写点笔记…">${esc(notes[k] || '')}</textarea>
    </div>
    <div class="quiz-nav">
      <button class="btn" id="btn-prev" ${quiz.idx===0?'disabled':''}>← 上一题</button>
      <button class="btn primary" id="btn-next">${quiz.idx===quiz.keys.length-1?'完成 ✓':'下一题 →'}</button>
    </div>`;

  const noteEl = el.querySelector('#note');
  noteEl.addEventListener('input', () => { notes[k] = noteEl.value; LS.set('notes', notes); });
  el.querySelector('#btn-fav').addEventListener('click', () => {
    if (fav[k]) delete fav[k]; else fav[k] = true;
    LS.set('fav', fav);
    el.querySelector('#btn-fav').textContent = fav[k] ? '★' : '☆';
  });
  el.querySelectorAll('#lang-seg button').forEach(b => b.addEventListener('click', () => {
    lang = b.dataset.l; LS.set('lang', lang); renderQuiz(el);
  }));
  bindOrderSeg(el);
  el.querySelector('#btn-prev').addEventListener('click', () => { quiz.idx--; saveLastQuiz(); renderQuiz(el); });
  el.querySelector('#btn-next').addEventListener('click', () => {
    if (quiz.idx === quiz.keys.length - 1) { location.hash = '#/home'; return; }
    quiz.idx++; saveLastQuiz(); renderQuiz(el);
  });

  if (q.type === 'mc') renderOptions(el, q, k, last);
  else {
    const okB = el.querySelector('#sa-ok'), badB = el.querySelector('#sa-bad'), fb = el.querySelector('#sa-fb');
    const ansBtn = el.querySelector('#sa-ans-btn'), ansBox = el.querySelector('#sa-ans');
    if (ansBtn) ansBtn.addEventListener('click', () => {
      const show = ansBox.hidden;
      ansBox.hidden = !show;
      ansBtn.textContent = show ? '隐藏参考答案' : '显示参考答案';
    });
    const finish = (st) => {
      markDone(k, st);
      fb.innerHTML = `<div class="feedback ${st==='ok'?'ok':'bad'}">已标记：${st==='ok'?'会做':'不会'}</div>`;
      okB.disabled = badB.disabled = true;
    };
    okB.addEventListener('click', () => finish('ok'));
    badB.addEventListener('click', () => finish('bad'));
    if (last) fb.innerHTML = `<div class="feedback ${last==='ok'?'ok':'bad'}">上次标记：${last==='ok'?'会做':'不会'}（可重新标记）</div>`;
  }
}
function renderOptions(el, q, k, last) {
  const opts = q.options;
  const zhOpts = q.translation ? q.translation.options : null;
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const optsEl = el.querySelector('#opts');
  const fb = el.querySelector('#fb');
  optsEl.insertAdjacentHTML('beforebegin', `<div class="opt-tip">双击选项作答 · 单击英文单词可查词（键盘 A–E / 1–5 也可以）</div>`);
  if (last) fb.innerHTML = `<div class="muted" style="margin-bottom:8px">上次结果：${last==='ok'?'答对 ✓':'答错 ✗'}（可重做）</div>`;
  let answered = false;
  opts.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt';
    // 中文模式：只显示中文；对照模式：英文 + 中文小字；英文模式：纯英文
    b.innerHTML = lang === 'zh'
      ? `<span class="opt-letter">${letters[i]}.</span> ${renderRich((zhOpts && zhOpts[i]) || o)}`
      : `<span class="opt-letter">${letters[i]}.</span> ${renderRich(o)}` +
        (lang === 'both' && zhOpts && zhOpts[i] ? `<span class="opt-zh">${renderRich(zhOpts[i])}</span>` : '');
    // 双击才作答：单击留给"点词查词"，避免想查个词却把题答了
    b.addEventListener('dblclick', (e) => {
      if (e.target && e.target.closest && e.target.closest('.w')) return;  // 双击在单词上 → 只查词
      if (answered) return;
      answered = true;
      const correct = letters[i] === q.answer;
      optsEl.querySelectorAll('.opt').forEach((bb, j) => {
        bb.disabled = true;
        if (letters[j] === q.answer) bb.classList.add('correct');
        else if (j === i) bb.classList.add('wrong');
      });
      fb.innerHTML = `<div class="feedback ${correct?'ok':'bad'}">${correct?'✓ 回答正确！':'✗ 回答错误，正确答案是 '+q.answer}</div>`;
      markDone(k, correct ? 'ok' : 'bad');
    });
    optsEl.appendChild(b);
  });
}
function markDone(k, status) {
  done[k] = status;
  if (status === 'bad') {
    // 答错：回到复习起点，今天该复习
    wrong[k] = { due: todayStr(), stage: 0 };
  } else if (wrong[k]) {
    // 答对：到期才升档；提前复习保持原安排
    const w = wrong[k];
    if (w.due <= todayStr()) {
      const ns = (w.stage || 0) + 1;
      if (ns >= SRS_INTERVALS.length) delete wrong[k];       // 毕业
      else {
        const d = new Date(); d.setDate(d.getDate() + SRS_INTERVALS[ns]);
        wrong[k] = { due: todayStr(d), stage: ns };
      }
    }
  }
  LS.set('done', done); LS.set('wrong', wrong);
  const t = todayStr(); daily[t] = (daily[t] || 0) + 1; LS.set('daily', daily);
}
// 错题复习状态：'due' 该复习 | 'wait' 待复习 | null 不在错题本
function wrongState(k) {
  const w = wrong[k];
  if (!w) return null;
  return w.due <= todayStr() ? 'due' : 'wait';
}
function dueLabel(k) {
  const due = new Date(wrong[k].due + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((due - now) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '明天';
  return diff + ' 天后';
}

// ===== 错题本（间隔重复：该复习 + 待复习） =====
function renderWrong(el) {
  setTitle('错题本');
  const keys = Object.keys(wrong);
  if (!keys.length) { el.innerHTML = '<div class="empty">暂无错题，继续加油。</div>'; return; }
  const due = keys.filter(k => wrongState(k) === 'due');
  const wait = keys.filter(k => wrongState(k) === 'wait');
  el.innerHTML = `
    ${due.length ? `<div class="btn-row" style="margin-bottom:12px"><button class="btn primary block" onclick="startQuiz(${qkeys(due)})">重练该复习的错题（${due.length}）</button></div>` : ''}
    ${due.length ? `<div class="section-label">该复习了 · ${due.length}</div><div id="due-list"></div>` : ''}
    ${wait.length ? `<div class="section-label">待复习 · ${wait.length}（按记忆曲线安排，到期出现在上方）</div><div id="wait-list"></div>` : '<div class="empty">没有到期错题，都已安排好复习。</div>'}`;
  if (due.length) renderQuestionList(el.querySelector('#due-list'), due, null);
  if (wait.length) {
    const wl = el.querySelector('#wait-list');
    // 待复习列表：显示到期时间
    for (const k of wait) {
      const { chapter, question: q } = qIndex[k];
      wl.insertAdjacentHTML('beforeend', `
        <div class="list-item" onclick="startQuiz(['${k}'])">
          <div class="num">Q${q.num}</div>
          <div class="grow">
            <div class="sub" style="color:var(--text);font-size:13px">${esc(q.question.replace(/\[\[IMG:[^\]]+\]\]/g, '[图]').slice(0, 70))}</div>
            <div class="tag">第${chapter.num}章 · 第 ${(wrong[k].stage || 0) + 1} 档 · ${dueLabel(k)}复习</div>
          </div>
        </div>`);
    }
  }
}

// ===== 生词本 =====
function renderVocab(el) {
  setTitle('生词本');
  const words = Object.keys(vocab);
  if (!words.length) { el.innerHTML = '<div class="empty">还没有生词。点击题目中的英文单词即可查词并收藏。</div>'; return; }
  el.innerHTML = `<div class="section-label" style="margin-top:0">共 ${words.length} 个生词</div><div id="vlist"></div>`;
  const list = el.querySelector('#vlist');
  for (const w of words.sort()) {
    const v = vocab[w];
    list.insertAdjacentHTML('beforeend', `
      <div class="list-item" style="cursor:default">
        <div class="grow">
          <div class="title">${esc(w)}</div>
          <div class="sub" id="vm-${esc(w)}">${esc(v.meaning || '未收录释义')}</div>
        </div>
        <button class="btn sm" onclick="editVocab('${jsq(w)}')">改</button>
        <button class="btn sm" onclick="delVocab('${jsq(w)}')">删</button>
      </div>`);
  }
}
window.editVocab = function (w) {
  const slot = document.getElementById('vm-' + w);
  if (!slot) return;
  const cur = (vocab[w] && vocab[w].meaning) || '';
  slot.innerHTML = `<span style="display:flex;gap:6px">
    <input class="pm-input" style="margin-top:0" id="ve-${esc(w)}" value="${esc(cur)}">
    <button class="btn sm primary" onclick="saveVocab('${jsq(w)}')">存</button></span>`;
  document.getElementById('ve-' + w).focus();
};
window.saveVocab = function (w) {
  const input = document.getElementById('ve-' + w);
  if (!input) return;
  vocab[w] = { meaning: input.value.trim(), time: Date.now() };
  LS.set('vocab', vocab);
  renderVocab(document.getElementById('view'));
};

// ===== 统计 =====
function renderStats(el) {
  setTitle('统计仪表盘');
  const t = todayStr();
  // 近 7 天做题量
  const DOW = ['日', '一', '二', '三', '四', '五', '六'];
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    week.push({
      n: daily[todayStr(dt)] || 0,
      label: i === 0 ? '今天' : i === 1 ? '昨天' : '周' + DOW[dt.getDay()]
    });
  }
  const maxN = Math.max(1, ...week.map(w => w.n));
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="v">${count(done)}</div><div class="k">累计做题</div></div>
      <div class="stat"><div class="v">${accRate()}%</div><div class="k">正确率</div></div>
      <div class="stat"><div class="v">${saStat()}</div><div class="k">简答掌握</div></div>
      <div class="stat"><div class="v">${count(wrong)}</div><div class="k">错题</div></div>
      <div class="stat"><div class="v">${count(fav)}</div><div class="k">收藏</div></div>
      <div class="stat"><div class="v">${count(vocab)}</div><div class="k">生词</div></div>
      <div class="stat"><div class="v">${daily[t] || 0}</div><div class="k">今日做题</div></div>
    </div>
    <div class="card" style="margin-top:12px">
      <h2>连续打卡 ${streakDays()} 天</h2>
      <div class="week">
        ${week.map(w => `
          <div class="col">
            <span class="n">${w.n || ''}</span>
            <div class="bar" style="height:${Math.round(w.n / maxN * 100)}%"><i></i></div>
            <span class="d">${w.label}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <h2>数据备份</h2>
      <div class="muted" style="margin-bottom:10px">错题、笔记、生词、进度都保存在本机浏览器中，可导出/导入备份。</div>
      <div class="btn-row">
        <button class="btn grow" id="btn-export">导出</button>
        <button class="btn grow" id="btn-import">导入</button>
        <input type="file" id="import-file" accept=".json" hidden>
      </div>
      <div class="btn-row">
        <button class="btn grow" id="btn-reset" style="color:var(--bad)">清空学习数据</button>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <h2>自动备份到文件</h2>
      <div class="muted" style="margin-bottom:10px">开启后，每次做题都会自动把学习数据写进你指定的一个本地 json 文件。换设备、清缓存后用它一键恢复。文件只保存在你自己的电脑上。</div>
      ${backupCardHtml()}
    </div>
    <div class="card" style="margin-top:12px">
      <h2>云同步</h2>
      <div class="muted" style="margin-bottom:10px">配置后学习数据自动同步到云端，换设备打开网页自动恢复。数据仅存你自己的云端存档位，无需注册账号。</div>
      ${Sync.isOn() ? `
      <div class="muted" style="margin-bottom:10px">状态：${({idle:'✅ 已同步',syncing:'⏳ 同步中…',error:'⚠️ 同步失败'})[Sync.status()] || '未配置'} · ${Sync.lastSyncText()}</div>
      <div class="btn-row">
        <button class="btn grow" id="btn-sync-up">立即上传</button>
        <button class="btn grow" id="btn-sync-down">从云端恢复</button>
      </div>
      <div class="btn-row">
        <button class="btn grow" id="btn-sync-off" style="color:var(--bad)">停用同步（保留本机数据）</button>
      </div>` : `
      <input class="pm-input" id="sync-token" placeholder="GitHub 访问令牌（ghp_ 开头）" autocomplete="off" type="password">
      <div class="btn-row" style="margin-top:8px">
        <button class="btn primary grow" id="btn-sync-save">保存并启用同步</button>
      </div>
      <div class="muted" style="margin-top:8px">需要一个带 <b>gist</b> 权限的 GitHub 令牌：github.com/settings/tokens/new → 勾 <b>gist</b> → Generate。令牌只保存在这台设备上，仅用于读写你自己的同步存档。</div>`}
    </div>`;
  el.querySelector('#btn-export').addEventListener('click', exportData);
  el.querySelector('#btn-import').addEventListener('click', () => el.querySelector('#import-file').click());
  el.querySelector('#import-file').addEventListener('change', importData);
  el.querySelector('#btn-reset').addEventListener('click', resetData);
  // 自动备份到本地文件
  const bOn = el.querySelector('#btn-backup-on');
  if (bOn) bOn.addEventListener('click', async () => {
    bOn.disabled = true;
    const r = await Backup.enable();
    showToast(r.msg);
    renderStats(el);
  });
  const bNow = el.querySelector('#btn-backup-now');
  if (bNow) bNow.addEventListener('click', async () => {
    bNow.disabled = true;
    const r = await Backup.saveNow();
    showToast(r.msg);
    renderStats(el);
  });
  const bRestore = el.querySelector('#btn-backup-restore');
  if (bRestore) bRestore.addEventListener('click', async () => {
    if (!confirm('用备份文件覆盖当前学习数据？\n当前未备份的进度会丢失。')) return;
    bRestore.disabled = true;
    const r = await Backup.restore();
    if (!r.ok) { showToast(r.msg); renderStats(el); return; }
    applyBackupData(r.data);
    showToast('已从备份恢复，正在重新加载…');
    setTimeout(() => location.reload(), 600);
  });
  const bOff = el.querySelector('#btn-backup-off');
  if (bOff) bOff.addEventListener('click', async () => {
    if (!confirm('关闭自动备份？\n浏览器内的数据会保留，备份文件也不再更新。')) return;
    const r = await Backup.disable();
    showToast(r.msg);
    renderStats(el);
  });
  if (Sync.isOn()) {
    el.querySelector('#btn-sync-up').addEventListener('click', async e => {
      e.target.disabled = true;
      const r = await Sync.forceUpload();
      showToast(r.msg); renderStats(el);
    });
    el.querySelector('#btn-sync-down').addEventListener('click', async e => {
      if (!confirm('用云端存档覆盖本机学习数据？\n本机未同步的进度会丢失。')) return;
      e.target.disabled = true;
      const r = await Sync.forceDownload();
      if (!r.ok) { showToast(r.msg); renderStats(el); }
    });
    el.querySelector('#btn-sync-off').addEventListener('click', () => {
      if (!confirm('停用云同步？\n本机数据保留，云端存档也保留，之后不再自动上传。')) return;
      Sync.saveConfig({ appId: '', appKey: '' });
      Sync.resetSync(); renderStats(el); Sync.renderStatus();
    });
  } else {
    el.querySelector('#btn-sync-save').addEventListener('click', async e => {
      const tok = el.querySelector('#sync-token').value.trim();
      if (!tok) { showToast('请填写 GitHub 令牌'); return; }
      e.target.disabled = true;
      Sync.saveConfig({ githubToken: tok, appId: '', appKey: '' });
      showToast('已保存，正在连接云端…');
      await Sync.pullOnStart();
      renderStats(el); Sync.renderStatus();
    });
  }
}
function backupCardHtml() {
  if (!window.Backup || !Backup.supported()) {
    return `<div class="muted">当前浏览器不支持自动写文件（Chrome / Edge 支持）。可先用上面的「导出」手动备份。</div>`;
  }
  const s = Backup.status();
  if (!s.on) {
    return `<div class="btn-row">
        <button class="btn primary grow" id="btn-backup-on">开启自动备份</button>
      </div>
      <div class="muted" style="margin-top:8px">点开后选择保存位置（建议放在网盘同步目录或桌面），之后每次做题都会自动写入。</div>`;
  }
  return `<div class="muted" style="margin-bottom:8px">备份文件：<b>${esc(s.fileName || '—')}</b> · ${Backup.lastSaveText()}${s.needPermission ? ' · <span style="color:var(--warn)">需要重新授权</span>' : ''}</div>
    <div class="btn-row">
      <button class="btn grow" id="btn-backup-now">立即备份</button>
      <button class="btn grow" id="btn-backup-restore">从备份恢复</button>
    </div>
    <div class="btn-row">
      <button class="btn grow" id="btn-backup-off" style="color:var(--bad)">关闭自动备份</button>
    </div>`;
}
function applyBackupData(d) {
  for (const k of ['wrong', 'notes', 'fav', 'done', 'vocab', 'daily', 'lastQuiz', 'examState', 'lang', 'order']) {
    if (d[k] != null) LS.set(k, d[k]);
  }
}
function resetData() {
  if (!confirm('确定清空所有学习数据？\n做题进度、错题、收藏、笔记、生词、打卡记录都将删除，且不可恢复。')) return;
  // 清空时先关掉自动备份，避免把备份文件也覆盖成空数据（保留最后一份好备份）
  if (window.Backup && Backup.status().on) { Backup.disable(); showToast('已关闭自动备份，备份文件保持原样'); }
  for (const k of ['wrong', 'notes', 'fav', 'done', 'vocab', 'daily', 'lastQuiz', 'examState']) LS.set(k, (k === 'notes' || k === 'vocab') ? {} : null);
  location.reload();
}
function exportData() {
  const blob = new Blob([JSON.stringify({ wrong, notes, fav, done, vocab, daily, lastQuiz: LS.get('lastQuiz', null), examState: LS.get('examState', null) }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mankiw-backup-' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      for (const k of ['wrong', 'notes', 'fav', 'done', 'vocab', 'daily', 'lastQuiz', 'examState']) if (d[k]) LS.set(k, d[k]);
      location.reload();
    } catch (err) { alert('导入失败：文件格式错误'); }
  };
  r.readAsText(f);
}

// ===== 全局搜索 =====
function renderSearch(el) {
  setTitle('搜索');
  el.innerHTML = `<input class="search-input" id="q" placeholder="输入关键词搜索题干/选项/翻译/答案…" autocomplete="off"><div id="res"></div>`;
  const input = el.querySelector('#q');
  input.addEventListener('input', () => {
    const kw = input.value.trim().toLowerCase();
    const res = el.querySelector('#res');
    res.innerHTML = '';
    if (!kw) return;
    const found = [];
    for (const ch of DATA.chapters)
      for (const q of ch.questions) {
        const hay = [q.question, ...(q.options || []), q.translation && q.translation.question, q.answer_ref].filter(Boolean).join(' ').toLowerCase();
        if (hay.includes(kw)) found.push(key(ch.num, q.num));
      }
    if (!found.length) { res.innerHTML = '<div class="empty">未找到匹配题目</div>'; return; }
    res.innerHTML = `<div class="section-label">找到 ${found.length} 题</div><div id="qlist"></div>`;
    renderQuestionList(res.querySelector('#qlist'), found.slice(0, 60), null);
  });
  input.focus();
}

// ===== 模拟测验 =====
let exam = null;          // { keys, answers:{}, idx, start, limit, finished }
let examResult = null;    // 交卷结果
let examTimer = null;


function saveExam() { if (exam && !exam.finished) LS.set('examState', exam); }
function clearExam() { LS.set('examState', null); }
function fmtTime(s) { const m = Math.floor(s / 60), ss = s % 60; return m + ':' + (ss < 10 ? '0' : '') + ss; }

function renderExam(el, sub) {
  if (sub === 'run') return renderExamRun(el);
  if (sub === 'result') return renderExamResult(el);
  setTitle('模拟测验');
  const saved = LS.get('examState', null);
  const hasSaved = saved && saved.keys && saved.keys.length && !saved.finished;
  el.innerHTML = `
    <div class="card">
      <h2>模拟测验</h2>
      <div class="muted" style="margin-bottom:10px">随机抽题、倒计时作答。交卷前可自由回看和修改答案；交卷后判分，成绩计入统计与错题本。</div>
      <div class="section-label" style="margin-top:6px">题目数量</div>
      <div class="seg" id="exam-count">
        ${[10, 20, 30].map(n => `<button data-n="${n}" class="${n === 20 ? 'active' : ''}">${n} 题</button>`).join('')}
      </div>
      <div class="section-label" style="margin-top:10px">题目类型</div>
      <div class="seg" id="exam-type">
        <button data-t="mc" class="active">纯选择题</button>
        <button data-t="mix">混合（含简答）</button>
      </div>
      <div class="muted" style="margin-top:10px">选择每题 90 秒 · 简答每题 150 秒（简答凭记忆作答后自评，交卷后可对照参考答案）</div>
      <div class="btn-row"><button class="btn primary grow" id="btn-start-exam">开始测验</button></div>
      ${hasSaved ? `
      <div class="section-label">有未完成的测验</div>
      <div class="btn-row"><button class="btn grow" id="btn-resume">继续（已答 ${Object.keys(saved.answers).length}/${saved.keys.length}）</button></div>
      <div class="btn-row"><button class="btn grow" id="btn-abandon" style="color:var(--bad)">放弃（答案不计入统计）</button></div>` : ''}
    </div>`;
  let count = 20, type = 'mc';
  el.querySelectorAll('#exam-count button').forEach(b => b.addEventListener('click', () => {
    count = +b.dataset.n;
    el.querySelectorAll('#exam-count button').forEach(x => x.classList.toggle('active', x === b));
  }));
  el.querySelectorAll('#exam-type button').forEach(b => b.addEventListener('click', () => {
    type = b.dataset.t;
    el.querySelectorAll('#exam-type button').forEach(x => x.classList.toggle('active', x === b));
  }));
  el.querySelector('#btn-start-exam').addEventListener('click', () => startExam(count, type));
  if (hasSaved) {
    el.querySelector('#btn-resume').addEventListener('click', () => { exam = saved; location.hash = '#/exam/run'; });
    el.querySelector('#btn-abandon').addEventListener('click', () => {
      if (!confirm('放弃这次测验？已答答案不会计入统计。')) return;
      clearExam(); renderExam(el);
    });
  }
}
function startExam(count, type) {
  const pool = [];
  for (const ch of DATA.chapters)
    for (const q of ch.questions)
      if (type === 'mix' || q.type === 'mc') pool.push(key(ch.num, q.num));
  shuffle(pool);
  const keys = pool.slice(0, count);
  const limit = keys.reduce((s, k) => s + (qIndex[k].question.type === 'sa' ? 150 : 90), 0);
  exam = { keys, type: type || 'mc', answers: {}, idx: 0, start: Date.now(), limit, finished: false };
  saveExam();
  location.hash = '#/exam/run';
}
function renderExamRun(el) {
  const saved = LS.get('examState', null);
  if (!exam && saved && saved.keys && !saved.finished) exam = saved;
  if (!exam || exam.finished || !exam.keys.length) { location.hash = '#/exam'; return; }
  saveExam();
  const k = exam.keys[exam.idx];
  const { chapter, question: q } = qIndex[k];
  const hasZh = !!q.translation;
  setTitle(`测验 ${exam.idx + 1} / ${exam.keys.length}`);
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const zhOpts = q.translation ? q.translation.options : null;

  el.innerHTML = `
    <div class="card" style="padding-bottom:18px">
      <div class="quiz-progress"><i style="width:${Math.round(exam.idx / exam.keys.length * 100)}%"></i></div>
      <div class="q-meta">
        <span class="muted">第${chapter.num}章 Q${q.num}${q.type==='sa'?' · 简答':''}</span>
        <span class="timer" id="exam-timer"></span>
        <span class="grow"></span>
        <button class="icon-btn" id="btn-sheet" title="答题卡">☰</button>
        ${langSegHtml(hasZh)}
      </div>
      ${stemHtml(q)}
      <div class="opt-tip">双击选项作答 · 单击英文单词可查词</div>
      <div id="opts"></div>
    </div>
    <div class="quiz-nav">
      <button class="btn" id="btn-prev" ${exam.idx === 0 ? 'disabled' : ''}>← 上一题</button>
      <button class="btn" id="btn-mid">答题卡</button>
      <button class="btn primary" id="btn-next">${exam.idx === exam.keys.length - 1 ? '交卷 ✓' : '下一题 →'}</button>
    </div>`;

  const optsEl = el.querySelector('#opts');
  const sel = exam.answers[k];
  if (q.type === 'sa') {
    optsEl.innerHTML = `
      <div class="muted" style="margin-bottom:10px">简答题：先在心里或在纸上作答，然后自评掌握情况（参考答案交卷后可对照）。</div>
      <div class="btn-row">
        <button class="btn grow sa-self" data-v="ok">会 做</button>
        <button class="btn grow sa-self" data-v="bad">不 会</button>
      </div>`;
    optsEl.querySelectorAll('.sa-self').forEach(b => b.addEventListener('click', () => {
      exam.answers[k] = b.dataset.v;
      saveExam();
      optsEl.querySelectorAll('.sa-self').forEach(x => x.classList.toggle('selected', x === b));
    }));
    if (sel) optsEl.querySelector(`.sa-self[data-v="${sel}"]`).classList.add('selected');
  } else q.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt' + (sel === letters[i] ? ' selected' : '');
    b.innerHTML = lang === 'zh'
      ? `<span class="opt-letter">${letters[i]}.</span> ${renderRich((zhOpts && zhOpts[i]) || o)}`
      : `<span class="opt-letter">${letters[i]}.</span> ${renderRich(o)}` +
        (lang === 'both' && zhOpts && zhOpts[i] ? `<span class="opt-zh">${renderRich(zhOpts[i])}</span>` : '');
    // 双击才选中：单击留给"点词查词"，避免误选
    b.addEventListener('dblclick', (e) => {
      if (e.target && e.target.closest && e.target.closest('.w')) return;
      exam.answers[k] = letters[i];
      saveExam();
      optsEl.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
    });
    optsEl.appendChild(b);
  });

  el.querySelectorAll('#lang-seg button').forEach(b => b.addEventListener('click', () => {
    lang = b.dataset.l; LS.set('lang', lang); renderExamRun(el);
  }));
  el.querySelector('#btn-prev').addEventListener('click', () => { exam.idx--; saveExam(); renderExamRun(el); });
  el.querySelector('#btn-next').addEventListener('click', () => {
    if (exam.idx === exam.keys.length - 1) { askSubmit(); return; }
    exam.idx++; saveExam(); renderExamRun(el);
  });
  el.querySelector('#btn-sheet').addEventListener('click', showAnswerSheet);
  el.querySelector('#btn-mid').addEventListener('click', showAnswerSheet);

  const timerEl = el.querySelector('#exam-timer');
  const tick = () => {
    const left = exam.limit - Math.floor((Date.now() - exam.start) / 1000);
    if (left <= 0) { clearInterval(examTimer); examTimer = null; submitExam(true); return; }
    timerEl.textContent = '剩余 ' + fmtTime(left);
    timerEl.classList.toggle('low', left <= 120);
  };
  clearInterval(examTimer);
  tick();
  examTimer = setInterval(tick, 1000);
}
function showAnswerSheet() {
  const ov = document.getElementById('overlay');
  ov.innerHTML = `
    <div class="sheet-panel">
      <div class="panel-head"><span class="grow">答题卡 · 已答 ${Object.keys(exam.answers).length}/${exam.keys.length}</span>
        <button class="btn sm" id="sheet-close">关闭</button></div>
      <div class="ans-grid">
        ${exam.keys.map((k, i) => `<button data-i="${i}" class="${exam.answers[k] ? 'on' : ''}">${i + 1}</button>`).join('')}
      </div>
      <div class="btn-row"><button class="btn primary block" id="sheet-submit">交卷判分</button></div>
    </div>`;
  ov.hidden = false;
  ov.querySelector('#sheet-close').addEventListener('click', () => { ov.hidden = true; });
  ov.addEventListener('click', e => { if (e.target === ov) ov.hidden = true; });
  ov.querySelectorAll('.ans-grid button').forEach(b => b.addEventListener('click', () => {
    exam.idx = +b.dataset.i; saveExam(); ov.hidden = true;
    renderExamRun(document.getElementById('view'));
  }));
  ov.querySelector('#sheet-submit').addEventListener('click', () => { ov.hidden = true; askSubmit(); });
}
function askSubmit() {
  const un = exam.keys.length - Object.keys(exam.answers).length;
  if (un > 0 && !confirm(`还有 ${un} 题未作答，未作答按错误计分。确定交卷？`)) return;
  submitExam(false);
}
function submitExam(auto) {
  clearInterval(examTimer); examTimer = null;
  let ok = 0, answered = 0;
  const wrongKeys = [], weakTopics = {};
  for (const k of exam.keys) {
    const q = qIndex[k].question;
    const ans = exam.answers[k];
    const good = q.type === 'sa' ? ans === 'ok' : (ans && ans === q.answer);
    if (ans) { answered++; markDone(k, good ? 'ok' : 'bad'); }
    if (good) ok++;
    else {
      wrongKeys.push(k);
      for (const t of (q.topics || [])) if (topicById[t]) weakTopics[t] = (weakTopics[t] || 0) + 1;
    }
  }
  const used = Math.min(exam.limit, Math.floor((Date.now() - exam.start) / 1000));
  examResult = {
    total: exam.keys.length, ok, answered, wrongKeys, type: exam.type || 'mc',
    answers: { ...exam.answers },
    score: Math.round(ok / exam.keys.length * 100),
    used,
    weakTopics: Object.entries(weakTopics).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, n]) => ({ id, n, zh: topicById[id] ? topicById[id].zh : id }))
  };
  exam.finished = true;
  clearExam(); exam = null;
  if (auto) alert('时间到，已自动交卷。');
  location.hash = '#/exam/result';
}
function renderExamResult(el) {
  setTitle('测验成绩');
  if (!examResult) { location.hash = '#/exam'; return; }
  const r = examResult;
  el.innerHTML = `
    <div class="card">
      <div class="score-hero">
        <div class="score">${r.score}</div>
        <div class="score-label">得分 · 答对 ${r.ok} / 共 ${r.total} 题</div>
      </div>
      <div class="result-grid">
        <div class="cell"><div class="v">${r.ok}</div><div class="k">答对</div></div>
        <div class="cell"><div class="v">${r.answered - r.ok}</div><div class="k">答错</div></div>
        <div class="cell"><div class="v">${r.total - r.answered}</div><div class="k">未答</div></div>
        <div class="cell"><div class="v">${fmtTime(r.used)}</div><div class="k">用时</div></div>
      </div>
      ${r.weakTopics.length ? `
      <div class="section-label">薄弱知识点</div>
      <div class="topic-chips">
        ${r.weakTopics.map(t => `<a onclick="location.hash='#/topic/${t.id}'">${esc(t.zh)} · 错 ${t.n}</a>`).join('')}
      </div>` : ''}
      <div class="btn-row">
        <button class="btn primary grow" onclick="startExam(${r.total},'${r.type || 'mc'}')">再测一次</button>
        <button class="btn grow" onclick="location.hash='#/home'">返回首页</button>
      </div>
    </div>
    ${r.wrongKeys.length ? `<div class="section-label">错题回顾（点击逐题查看，简答可对照参考答案）</div><div id="wronglist"></div>` : '<div class="empty">全部答对，漂亮。</div>'}`;
  const wl = el.querySelector('#wronglist');
  if (wl) {
    for (const k of r.wrongKeys.slice(0, 30)) {
      const { chapter, question: q } = qIndex[k];
      const mine = r.answers[k] || '未答';
      const ansLine = q.type === 'sa'
        ? `你的自评 <b class="bad">${mine === 'ok' ? '会做' : '不会'}</b> · <span class="muted">参考答案：${esc((ansPlainText(q.answer_ref) || '无').slice(0, 60))}${(ansPlainText(q.answer_ref) || '').length > 60 ? '…' : ''}</span>`
        : `你的答案 <b class="bad">${mine}</b> · 正确答案 <b class="ok">${q.answer}</b>`;
      wl.insertAdjacentHTML('beforeend', `
        <div class="list-item" onclick="startQuiz(['${k}'])">
          <div class="num">Q${q.num}</div>
          <div class="grow">
            <div class="sub" style="color:var(--text)">${esc(q.question.replace(/\[\[IMG:[^\]]+\]\]/g, '[图]').slice(0, 70))}</div>
            <div class="ans-line">${ansLine}</div>
          </div>
          <div class="tag">第${chapter.num}章 ›</div>
        </div>`);
    }
    if (r.wrongKeys.length > 30) wl.insertAdjacentHTML('beforeend', `<div class="muted" style="text-align:center;padding:8px">仅显示前 30 道，其余 ${r.wrongKeys.length - 30} 道已入错题本</div>`);
  }
}

// ===== 生词删除（全局函数，供内联 onclick）=====
window.delVocab = function (w) {
  delete vocab[w]; LS.set('vocab', vocab);
  renderVocab(document.getElementById('view'));
};
window.startQuiz = startQuiz;
window.startExam = startExam;

// ===== 查词弹窗 =====
function showWordPopup(raw, x, y) {
  const r = lookupWord(raw);
  const pop = document.getElementById('popup');
  const lw = raw.toLowerCase().replace(/[^a-z'\u2019-]/g, '');
  let body = '';
  if (vocab[lw]) {
    body = `<div class="pm">${esc(vocab[lw].meaning || '未收录释义')}</div>
      <div class="pa"><button class="btn sm" onclick="delVocab('${jsq(lw)}');hidePopup()">移出生词本</button></div>`;
  } else if (r) {
    body = `<div class="pm">${esc(r.meaning)}</div>
      <div class="pa"><button class="btn sm primary" onclick="addVocab('${jsq(lw)}','${jsq(r.meaning)}')">加入生词本</button></div>`;
  } else {
    body = `<div class="pp">离线词典未收录，可手动填写释义：</div>
      <input class="pm-input" id="pm-in" placeholder="输入释义…">
      <div class="pa"><button class="btn sm primary" onclick="addVocabCustom('${jsq(lw)}')">保存到生词本</button></div>`;
  }
  pop.innerHTML = `<div class="pw">${esc(raw)}</div>${body}`;
  pop.hidden = false;
  if (innerWidth < 640) {
    pop.classList.add('sheet');
  } else {
    pop.classList.remove('sheet');
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.min(Math.max(x - w / 2, 8), innerWidth - w - 8) + 'px';
    pop.style.top = Math.min(y + 14, innerHeight - h - 8) + 'px';
  }
  const input = pop.querySelector('#pm-in');
  if (input) input.focus();
}
window.addVocab = function (w, meaning) {
  if (!w) return;
  vocab[w] = { meaning, time: Date.now() };
  LS.set('vocab', vocab);
  hidePopup();
};
window.addVocabCustom = function (w) {
  const input = document.getElementById('pm-in');
  if (!w) { hidePopup(); return; }
  vocab[w] = { meaning: input ? input.value.trim() : '', time: Date.now() };
  LS.set('vocab', vocab);
  hidePopup();
};
window.hidePopup = hidePopup;
function hidePopup() {
  const pop = document.getElementById('popup');
  pop.hidden = true;
  pop.classList.remove('sheet');
}

// ===== 启动 =====
applyTheme();
init();
// 配置好 LeanCloud 后：启动时从云端拉取较新的数据（云端较新则自动重载页面），
// 之后本地任何学习数据变化都会防抖自动上传
if (window.Sync) Sync.pullOnStart();
