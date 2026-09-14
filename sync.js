/* 云同步模块（LeanCloud REST，无 SDK 依赖）
   单用户整包同步：本地任何学习数据变化后防抖上传；打开页面时拉取，哪边新用哪边。 */
'use strict';
(function () {
  const FILE_CFG = window.SYNC_CONFIG || {};
  // 统计页里填写的配置优先（存在本机，手机也能配，不用改文件）
  function lsCfg() {
    try { return JSON.parse(localStorage.getItem('mankiw.syncCfg') || '{}'); } catch (e) { return {}; };
  }
  function CFG() { return Object.assign({}, FILE_CFG, lsCfg()); }
  function saveLsCfg(patch) {
    const c = Object.assign(lsCfg(), patch);
    localStorage.setItem('mankiw.syncCfg', JSON.stringify(c));
  }
  function confOk() { return mode() !== 'off'; }
  // 后端：github = GitHub Gist（推荐，零注册）；lc = LeanCloud（自建应用）
  function mode() {
    const c = CFG();
    if (c.githubToken) return 'github';
    if (c.appId && c.appKey) return 'lc';
    return 'off';
  }
  // ---- LeanCloud ----
  function lcApiBase() {
    const c = CFG();
    return (c.apiServer || ('https://' + c.appId + '.api.lncld.net')) + '/1.1/classes/' + CLASS;
  }
  function lcHeaders() {
    const c = CFG();
    return { 'X-LC-Id': c.appId, 'X-LC-Key': c.appKey, 'Content-Type': 'application/json' };
  }
  // ---- GitHub Gist ----
  const GIST_FILE = 'mankiw-sync.json';
  function ghHeaders() {
    return { 'Authorization': 'Bearer ' + CFG().githubToken, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
  }
  async function ghEnsure() {
    let id = localStorage.getItem(PREFIX + 'gistId');
    if (id) return id;
    // 先找本账号下已有的同步存档（换设备时凭同一份令牌找到它）
    const list = await (await fetch('https://api.github.com/gists?per_page=100', { headers: ghHeaders() })).json();
    if (Array.isArray(list)) {
      const hit = list.find(g => g.files && g.files[GIST_FILE]);
      if (hit) { id = hit.id; localStorage.setItem(PREFIX + 'gistId', id); return id; }
    }
    // 没有就新建一个仅自己可见的存档
    const created = await (await fetch('https://api.github.com/gists', {
      method: 'POST', headers: ghHeaders(),
      body: JSON.stringify({ description: '曼昆宏观题库学习数据同步（自动生成，勿删）', public: false, files: { [GIST_FILE]: { content: JSON.stringify({ v: 1, ts: 0, data: {} }) } } })
    })).json();
    if (!created.id) throw new Error('创建云端存档失败');
    id = created.id;
    localStorage.setItem(PREFIX + 'gistId', id);
    return id;
  }
  async function ghGet() {
    const id = await ghEnsure();
    const r = await fetch('https://api.github.com/gists/' + id, { headers: ghHeaders() });
    if (r.status === 404) { localStorage.removeItem(PREFIX + 'gistId'); return ghGet(); }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const g = await r.json();
    const f = g.files && g.files[GIST_FILE];
    if (!f) return null;
    return JSON.parse(f.content || '{"ts":0,"data":{}}');
  }
  async function ghPut(payload) {
    const id = await ghEnsure();
    const r = await fetch('https://api.github.com/gists/' + id, {
      method: 'PATCH', headers: ghHeaders(),
      body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(payload) } } })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  // ---- 统一出口 ----
  async function remoteGet() {
    if (mode() === 'github') return ghGet();
    const r = await fetch(lcApiBase() + '/' + encodeURIComponent(syncId()), { headers: lcHeaders() });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function remotePut(payload) {
    if (mode() === 'github') return ghPut(payload);
    const r = await fetch(lcApiBase() + '/' + encodeURIComponent(syncId()), {
      method: 'PUT', headers: lcHeaders(), body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  const SYNC_KEYS = ['wrong', 'notes', 'fav', 'done', 'vocab', 'daily', 'lastQuiz', 'examState'];
  const CLASS = 'SyncData';
  const PREFIX = 'mankiw.';

  // 每个设备/浏览器一个随机存档编号，数据存在云端对应编号的 Object 里
  function syncId() {
    let id = localStorage.getItem(PREFIX + 'syncId');
    if (!id) {
      id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(PREFIX + 'syncId', id);
    }
    return id;
  }
  function localTs() { return +(localStorage.getItem(PREFIX + 'syncTs') || 0); }
  function setLocalTs(ts) {
    if (ts > localTs()) localStorage.setItem(PREFIX + 'syncTs', String(ts));
  }
  function lastSyncText() {
    const t = +localStorage.getItem(PREFIX + 'syncTime') || 0;
    if (!t) return '从未同步';
    const d = new Date(t), p = n => (n < 10 ? '0' : '') + n;
    return `上次同步 ${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function collect() {
    const data = {};
    for (const k of SYNC_KEYS) {
      const v = localStorage.getItem(PREFIX + k);
      if (v != null) data[k] = JSON.parse(v);
    }
    return { v: 1, ts: Date.now(), data };
  }
  function apply(remote) {
    for (const k of SYNC_KEYS) {
      if (k in remote.data) {
        localStorage.setItem(PREFIX + k, JSON.stringify(remote.data[k]));
        try { LS.set(k, remote.data[k]); } catch (e) {}
      }
    }
    setLocalTs(remote.ts);
  }

  // ---- 状态指示 ----
  let status = confOk() ? 'idle' : 'off'; // off | idle | syncing | error
  function renderStatus() {
    const el = document.getElementById('sync-dot');
    if (!el) return;
    const map = {
      off:     ['', '', '未配置同步'],
      idle:    ['ok', '', '已同步'],
      syncing: ['busy', '', '同步中…'],
      error:   ['err', '', '同步失败，点我查看']
    };
    const m = map[status] || map.off;
    el.className = 'sync-dot ' + m[0];
    el.title = m[2] + ' · ' + lastSyncText();
  }
  function setStatus(s) { status = s; renderStatus(); }

  // ---- 网络（统一出口见 remoteGet/remotePut）----

  // ---- 推送（防抖）----
  let timer = null, pushing = false, dirtyAgain = false;
  function markDirty() {
    if (!confOk()) return;
    setLocalTs(Date.now());
    if (pushing) { dirtyAgain = true; return; }
    clearTimeout(timer);
    timer = setTimeout(push, 2500);
  }
  async function push() {
    if (!confOk() || pushing) return;
    pushing = true; setStatus('syncing');
    try {
      await remotePut(collect());
      localStorage.setItem(PREFIX + 'syncTime', String(Date.now()));
      setStatus('idle');
    } catch (e) {
      setStatus('error');
    }
    pushing = false;
    if (dirtyAgain) { dirtyAgain = false; markDirty(); }
  }

  // ---- 启动拉取 ----
  async function pullOnStart() {
    if (!confOk()) { renderStatus(); return; }
    setStatus('syncing');
    try {
      const remote = await remoteGet();
      if (remote && remote.ts > localTs()) {
        apply(remote);                       // 云端更新 → 覆盖本地后刷新页面
        localStorage.setItem(PREFIX + 'syncTime', String(Date.now()));
        location.reload();
        return;
      }
      // 需要上传的情况：无云端存档、云端较旧、或云端是刚建的空存档而本地已有数据
      const hasData = Object.keys(collect().data).length > 0;
      if (!remote || remote.ts < localTs() || (remote.ts === 0 && hasData)) {
        await push();
      } else if (remote) {
        setLocalTs(remote.ts);
      }
      localStorage.setItem(PREFIX + 'syncTime', String(Date.now()));
      setStatus('idle');
    } catch (e) {
      setStatus('error');
    }
  }

  // ---- 手动操作 ----
  async function forceUpload() {
    if (!confOk()) return { ok: false, msg: '请先保存 GitHub 令牌' };
    await push();
    return status === 'idle' ? { ok: true, msg: '已上传到云端' } : { ok: false, msg: '上传失败，检查网络与配置' };
  }
  async function forceDownload() {
    if (!confOk()) return { ok: false, msg: '请先保存 GitHub 令牌' };
    try {
      const remote = await remoteGet();
      if (!remote) return { ok: false, msg: '云端没有存档（可先用这台设备上传一次）' };
      apply(remote);
      location.reload();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: '下载失败：' + e.message };
    }
  }
  function resetSync() {
    localStorage.removeItem(PREFIX + 'syncId');
    localStorage.removeItem(PREFIX + 'gistId');
    localStorage.removeItem(PREFIX + 'syncTs');
    localStorage.removeItem(PREFIX + 'syncTime');
  }

  window.Sync = {
    SYNC_KEYS, markDirty, push, pullOnStart, forceUpload, forceDownload, resetSync,
    lastSyncText, renderStatus, saveConfig: saveLsCfg,
    config: CFG,
    isOn: confOk,
    status: () => status
  };
  document.addEventListener('DOMContentLoaded', renderStatus);
})();
