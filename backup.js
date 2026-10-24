/* 本地文件自动备份 —— 把学习数据持续写到一个本地 json 文件
   作用：浏览器存储被清空 / 换设备 / 换浏览器时，学习记录还在文件里，可一键恢复。
   依赖：File System Access API（Chrome / Edge 支持；Firefox / Safari 自动降级为手动导出）。
   文件句柄存在 IndexedDB 里（localStorage 存不了句柄），页面重开后仍指向同一个文件。 */
(function (global) {
  'use strict';

  const DB_NAME = 'mankiw';
  const STORE = 'fs';
  const HANDLE_KEY = 'backupFile';
  const WATCH_KEYS = ['wrong', 'notes', 'fav', 'done', 'vocab', 'daily', 'lastQuiz', 'examState'];
  const FILE_NAME = 'mankiw-learning-data.json';

  let handle = null;
  let timer = null;
  let lastSave = 0;
  let lastError = '';
  let on = false;
  let needPermission = false;

  // ===== IndexedDB：保存文件句柄 =====
  function openDB() {
    return new Promise((res, rej) => {
      if (!global.indexedDB) return rej(new Error('no-idb'));
      const r = global.indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE); } catch (e) {} };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbSet(k, v) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v, k);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(k) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const q = tx.objectStore(STORE).get(k);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(tx.error);
    });
  }
  async function idbDel(k) {
    const db = await openDB();
    return new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(k);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  }

  // ===== 数据快照 =====
  function snapshot() {
    const out = { _app: 'mankiw-macro', _version: 1, _at: new Date().toISOString() };
    for (const k of WATCH_KEYS.concat(['lang', 'order'])) {
      try {
        const v = global.localStorage.getItem('mankiw.' + k);
        if (v != null) out[k] = JSON.parse(v);
      } catch (e) {}
    }
    return out;
  }

  // ===== 权限 =====
  async function ensurePermission(interactive) {
    if (!handle) return false;
    if (!handle.queryPermission) return true;          // 老实现：直接当有权限
    const st = await handle.queryPermission({ mode: 'readwrite' });
    if (st === 'granted') { needPermission = false; return true; }
    if (!interactive) { needPermission = true; return false; }
    const st2 = await handle.requestPermission({ mode: 'readwrite' });
    if (st2 === 'granted') { needPermission = false; return true; }
    needPermission = true;
    return false;
  }

  // ===== 写入 =====
  async function saveNow() {
    if (!handle) return { ok: false, msg: '尚未开启自动备份' };
    if (!await ensurePermission(false)) {
      return { ok: false, msg: '需要重新授权备份文件（在统计页点「恢复自动备份」）' };
    }
    try {
      const w = await handle.createWritable();
      await w.write(new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' }));
      await w.close();
      lastSave = Date.now();
      lastError = '';
      return { ok: true, msg: '已备份到 ' + handle.name };
    } catch (e) {
      lastError = String(e && e.message || e);
      return { ok: false, msg: '备份失败：' + lastError };
    }
  }

  // 学习数据一变就标脏，稍后自动落盘
  function markDirty() {
    if (!on || !handle) return;
    clearTimeout(timer);
    timer = setTimeout(() => { saveNow(); }, 1500);
  }

  // ===== 开启 =====
  async function enable() {
    if (!supported()) return { ok: false, msg: '当前浏览器不支持自动写文件（Chrome / Edge 可用）' };
    let h = handle;
    if (!h) {
      try {
        h = await global.showSaveFilePicker({
          suggestedName: FILE_NAME,
          types: [{ description: '学习数据备份', accept: { 'application/json': ['.json'] } }]
        });
      } catch (e) {
        return { ok: false, msg: '未选择备份文件' };
      }
    }
    try { await ensurePermission(true); } catch (e) {}
    handle = h;
    on = true;
    needPermission = false;
    try { await idbSet(HANDLE_KEY, h); } catch (e) {}
    const r = await saveNow();
    return r.ok ? { ok: true, msg: '已开启自动备份：' + h.name } : r;
  }

  async function disable() {
    on = false;
    clearTimeout(timer);
    handle = null;
    try { await idbDel(HANDLE_KEY); } catch (e) {}
    return { ok: true, msg: '已关闭自动备份（浏览器内的数据保留）' };
  }

  // ===== 恢复 =====
  async function restore() {
    if (!handle) return { ok: false, msg: '没有可用的备份文件' };
    if (!await ensurePermission(true)) return { ok: false, msg: '未授权读取备份文件' };
    try {
      const f = await handle.getFile();
      const d = JSON.parse(await f.text());
      if (!d || typeof d !== 'object' || !('wrong' in d || 'done' in d)) {
        return { ok: false, msg: '备份文件内容不对' };
      }
      return { ok: true, data: d, msg: '已从备份文件读取' };
    } catch (e) {
      return { ok: false, msg: '读取失败：' + String(e && e.message || e) };
    }
  }

  function supported() {
    return typeof global.showSaveFilePicker === 'function' && !!global.indexedDB;
  }

  function status() {
    return {
      supported: supported(),
      on,
      fileName: handle ? handle.name : '',
      lastSave,
      lastError,
      needPermission
    };
  }

  function lastSaveText() {
    if (!lastSave) return '尚未备份';
    const d = new Date(lastSave);
    const p = n => String(n).padStart(2, '0');
    return '最近备份 ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // ===== 启动：恢复句柄、恢复权限 =====
  async function init() {
    if (!supported()) return;
    try {
      const h = await idbGet(HANDLE_KEY);
      if (h) {
        handle = h;
        on = true;
        const ok = await ensurePermission(false);
        if (!ok) {
          // 权限需要用户手势才能重新授予：第一次点击页面时顺手申请
          const once = async () => {
            document.removeEventListener('click', once, true);
            const granted = await ensurePermission(true);
            if (granted) { await saveNow(); if (global.onBackupStatusChange) global.onBackupStatusChange(); }
          };
          document.addEventListener('click', once, true);
        }
      }
    } catch (e) {}
  }

  global.Backup = {
    WATCH_KEYS, enable, disable, saveNow, restore, status, markDirty, init,
    supported, lastSaveText
  };
})(window);
