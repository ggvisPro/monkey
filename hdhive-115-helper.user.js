// ==UserScript==
// @name         HDHive 115 助手 (OpenAPI 版)
// @namespace    https://hdhive.com/
// @version      2.0.2
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/hdhive-115-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/hdhive-115-helper.user.js
// @description  在 115 网盘文件旁注入 HH 按钮：右侧抽屉单条搜索 + 解锁。使用 HDHive OpenAPI + TMDB v4，独立设置。
// @author       ggvisPro
// @modified     2026-07-06 00:40:46 CST
// @match        *://115.com/*
// @match        *://*.115.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hdhive.com
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      hdhive.com
// @connect      api.themoviedb.org
// @connect      image.tmdb.org
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 常量 ----------
  const HDHIVE_BASE = 'https://hdhive.com/api/open';
  const HDHIVE_DETAIL = 'https://hdhive.com/tmdb';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w154';
  const POSTER_FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="92" height="138" viewBox="0 0 92 138">' +
    '<rect width="100%" height="100%" fill="#F5E8E0"/>' +
    '<text x="50%" y="50%" fill="#B8A89E" font-family="sans-serif" font-size="12" ' +
    'text-anchor="middle" dominant-baseline="middle">无封面</text></svg>'
  );

  const MODES = [
    { id: 'multi',    label: '聚合',         ph: '搜索电影 / 剧集 关键词…', numeric: false },
    { id: 'movie',    label: '电影',         ph: '搜索电影名…',             numeric: false },
    { id: 'tv',       label: '剧集',         ph: '搜索剧集名…',             numeric: false },
    { id: 'movie-id', label: '电影 TMDB ID', ph: '输入电影 TMDB 数字 ID…', numeric: true  },
    { id: 'tv-id',    label: '剧集 TMDB ID', ph: '输入剧集 TMDB 数字 ID…', numeric: true  },
  ];

  // ---------- 设置（独立存储，与 web app 不互通）----------
  function getKey() { return GM_getValue('hdhive_key', '') || ''; }
  function getTmdb() { return GM_getValue('tmdb_token', '') || ''; }
  function setKey(v) { GM_setValue('hdhive_key', v); }
  function setTmdb(v) { GM_setValue('tmdb_token', v); }

  function promptSettings() {
    const k = prompt('HDHive API Key:', getKey());
    if (k === null) return;
    setKey(k.trim());
    const t = prompt('TMDB v4 Access Token:', getTmdb());
    if (t === null) return;
    setTmdb(t.trim());
    alert('已保存。如已打开搜索面板，请重新打开。');
  }
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('HDHive 设置', promptSettings);
    GM_registerMenuCommand('清除 HDHive 凭证', () => {
      setKey(''); setTmdb(''); alert('已清除。');
    });
  }

  // ---------- GM_xhr 封装 ----------
  function gmRequest(opt) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opt.method || 'GET',
        url: opt.url,
        headers: opt.headers || {},
        data: opt.data,
        timeout: opt.timeout || 20000,
        onload: (r) => resolve(r),
        onerror: () => reject(new Error('网络错误')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  // ---------- HDHive OpenAPI ----------
  async function hdRequest(path, { method = 'GET', body = null, query = null } = {}) {
    const key = getKey();
    if (!key) throw mkErr('MISSING_API_KEY', '请先在油猴菜单中配置 HDHive API Key');
    let url = HDHIVE_BASE + path;
    if (query) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== '') usp.set(k, String(v));
      }
      const qs = usp.toString();
      if (qs) url += '?' + qs;
    }
    const headers = { 'X-API-Key': key, 'Accept': 'application/json' };
    let payload;
    if (body != null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await gmRequest({ method, url, headers, data: payload });
    let json = null;
    try { json = JSON.parse(res.responseText); } catch {}
    const retryAfter = parseInt((res.responseHeaders || '').match(/^retry-after:\s*(\d+)/im)?.[1] || '0', 10);
    if (res.status >= 400 || !json || json.success === false) {
      throw mkErr(
        (json && json.code) || String(res.status),
        (json && json.message) || `HDHive 请求失败 (HTTP ${res.status})`,
        {
          description: json && json.description,
          retryAfter: (json && json.retry_after_seconds) || retryAfter,
          limitScope: json && json.limit_scope,
        }
      );
    }
    return json;
  }
  function mkErr(code, message, opts = {}) {
    const e = new Error(message);
    e.code = code; e.description = opts.description; e.retryAfter = opts.retryAfter || 0;
    e.limitScope = opts.limitScope;
    return e;
  }

  // ---------- TMDB ----------
  async function tmdbRequest(path, params = {}) {
    const token = getTmdb();
    if (!token) throw mkErr('MISSING_TMDB', '请先配置 TMDB v4 Token');
    const url = new URL(TMDB_BASE + path);
    url.searchParams.set('language', 'zh-CN');
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    }
    const res = await gmRequest({
      method: 'GET', url: url.toString(),
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
    });
    if (res.status >= 400) {
      throw mkErr('TMDB_' + res.status, `TMDB 请求失败 (HTTP ${res.status})`);
    }
    try { return JSON.parse(res.responseText); }
    catch { throw mkErr('PARSE', 'TMDB 返回了非 JSON'); }
  }

  // /me 接口需要 Premium，普通用户不可用。改用 /shares 反查自己的 user_id：
  // 拉一条自己的分享，里面 user_id 就是当前账号。前提是你至少分享过 1 次。
  let myUserId = null;
  let myUserIdAttempted = false;
  async function ensureMyUserId() {
    if (myUserIdAttempted) return myUserId;
    myUserIdAttempted = true;
    try {
      const r = await hdRequest('/shares', { query: { page: 1, page_size: 1 } });
      const first = (r.data || [])[0];
      if (first) {
        myUserId = first.user_id || (first.user && first.user.id) || null;
      }
    } catch { /* 无分享或失败，继续 */ }
    return myUserId;
  }

  // ---------- 搜索 ----------
  async function runSearch(mode, q) {
    if (mode === 'multi') {
      const r = await tmdbRequest('/search/multi', { query: q, page: 1, include_adult: false });
      return (r.results || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv');
    }
    if (mode === 'movie') {
      const r = await tmdbRequest('/search/movie', { query: q, page: 1, include_adult: false });
      return (r.results || []).map(x => ({ ...x, media_type: 'movie' }));
    }
    if (mode === 'tv') {
      const r = await tmdbRequest('/search/tv', { query: q, page: 1, include_adult: false });
      return (r.results || []).map(x => ({ ...x, media_type: 'tv' }));
    }
    if (mode === 'movie-id') {
      const r = await tmdbRequest(`/movie/${encodeURIComponent(q)}`);
      return [{ ...r, media_type: 'movie' }];
    }
    if (mode === 'tv-id') {
      const r = await tmdbRequest(`/tv/${encodeURIComponent(q)}`);
      return [{ ...r, media_type: 'tv' }];
    }
    return [];
  }

  // ---------- UI（Shadow DOM 右抽屉）----------
  const host = document.createElement('div');
  host.id = 'hdhive-host-115';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
<style>
  :host { all: initial; }
  .mask {
    position: fixed; inset: 0; pointer-events: none;
    display: none; z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
  }
  .mask.open { display: block; }
  .panel {
    position: absolute; top: 0; right: 0; height: 100vh;
    width: min(560px, 60vw);
    background: #FFFAF7; color: #3D2E25;
    border-radius: 14px 0 0 14px;
    box-shadow: -12px 0 48px rgba(180,120,80,0.18);
    display: flex; flex-direction: column; overflow: hidden;
    pointer-events: auto;
  }
  .tabs-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px 0;
    background: linear-gradient(180deg, #FFF5F0 0%, #FFFAF7 100%);
  }
  .tabs { display: flex; gap: 5px; flex-wrap: wrap; flex: 1; min-width: 0; }
  .tab {
    background: #fff; border: 1px solid #F0DDD4; color: #8B6F5C;
    border-radius: 999px; padding: 4px 11px; font-size: 11.5px; font-weight: 500;
    cursor: pointer; transition: all 0.15s;
  }
  .tab:hover { border-color: #DA7756; color: #C4643F; }
  .tab.active {
    background: linear-gradient(135deg, #DA7756 0%, #C4643F 100%);
    border-color: transparent; color: #fff; font-weight: 600;
    box-shadow: 0 2px 8px rgba(218,119,86,0.32);
  }
  .top { padding: 8px 12px 10px; display: flex; gap: 6px; align-items: stretch;
         background: #FFFAF7; border-bottom: 1px solid #F5E8E0; }
  .top input {
    flex: 1; background: #fff; border: 1px solid #F0DDD4;
    border-radius: 8px; padding: 7px 10px; color: #3D2E25; font-size: 13px;
    outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .top input::placeholder { color: #B8A89E; }
  .top input:focus { border-color: #DA7756; box-shadow: 0 0 0 3px rgba(218,119,86,0.12); }
  .top button {
    background: linear-gradient(135deg, #DA7756 0%, #C4643F 100%);
    color: #fff; border: none; border-radius: 8px;
    padding: 6px 14px; cursor: pointer; font-size: 12px; font-weight: 600;
  }
  .top button:hover { filter: brightness(1.06); }
  .top button.ghost { background: #fff; color: #8B6F5C; border: 1px solid #F0DDD4; }
  .top button.ghost:hover { color: #C4643F; border-color: #DA7756; }

  .points-bar {
    padding: 4px 12px; font-size: 11px; color: #8B6F5C;
    background: #FFFAF7; border-bottom: 1px solid #F5E8E0;
    display: flex; gap: 10px;
  }
  .points-bar .pts { color: #C4643F; font-weight: 600; }

  .results { flex: 1; overflow: auto; padding: 4px; background: #FFFAF7; }
  .results::-webkit-scrollbar { width: 6px; }
  .results::-webkit-scrollbar-thumb { background: #F0DDD4; border-radius: 3px; }
  .results::-webkit-scrollbar-thumb:hover { background: #DA7756; }
  .item {
    display: flex; gap: 8px; padding: 8px;
    border-radius: 8px; text-decoration: none; color: inherit;
    transition: background 0.12s;
  }
  .item:hover { background: #FFF0E8; }
  .item img { width: 52px; height: 78px; object-fit: cover; border-radius: 6px;
              background: #F5E8E0; flex: none;
              box-shadow: 0 2px 8px rgba(180,120,80,0.12); }
  .meta { flex: 1; min-width: 0; }
  .title { font-size: 13px; font-weight: 700; color: #3D2E25; margin-bottom: 3px;
           display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .title a { color: #3D2E25; text-decoration: none; }
  .title a:hover { color: #C4643F; }
  .badge { font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px;
           background: #DA7756; color: #fff; letter-spacing: 0.2px; }
  .badge.movie { background: #B85D3F; }
  .badge.tmdb { background: #fff; color: #C4643F; border: 1px solid #F0DDD4; font-weight: 600; }
  .sub { font-size: 11px; color: #8B6F5C; margin-bottom: 3px; }
  .ov { font-size: 11px; color: #6B5D4C; line-height: 1.4;
        display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }

  .res115 { margin-top: 6px; padding: 6px 8px;
            background: #fff; border: 1px solid #F0DDD4; border-radius: 8px;
            font-size: 11px; line-height: 1.45; }
  .res115 .head { display: flex; align-items: center; justify-content: space-between;
                  color: #3D2E25; font-weight: 700; margin-bottom: 4px; gap: 6px; }
  .res115 .pill {
    background: linear-gradient(135deg, #DA7756 0%, #C4643F 100%);
    color: #fff; padding: 1px 7px; border-radius: 4px;
    font-size: 9.5px; font-weight: 700;
  }
  .res115 .pill.none { background: #F0DDD4; color: #8B6F5C; }
  .res115 .summary { color: #8B6F5C; font-size: 10px; font-weight: 500; }
  .res115 .row { display: flex; gap: 5px; align-items: center; padding: 3px 4px;
                 color: #6B5D4C; border-radius: 4px; }
  .res115 .row:hover { background: #FFF0E8; }
  .res115 .row.mine { background: rgba(218,119,86,.08); }
  .res115 .row .sz { color: #C4643F; font-weight: 700; flex: none; min-width: 50px; font-size: 11px; }
  .res115 .row .specs { color: #8B6F5C; flex: 1; min-width: 0; font-size: 10.5px;
                        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .res115 .tag { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px;
                 flex: none; letter-spacing: 0.2px; }
  .res115 .tag.off  { background: #6B5D4C; color: #fff; }
  .res115 .tag.free { background: #2E7D5C; color: #fff; }
  .res115 .tag.pts  { background: #E8A04C; color: #fff; }
  .res115 .tag.pts.unlocked { background: rgba(46,125,92,.14); color: #2E7D5C; }
  .res115 .tag.mine {
    background: linear-gradient(135deg, #DA7756 0%, #C4643F 100%); color: #fff;
  }
  .unlock-btn {
    font-size: 10px; padding: 2px 8px; border-radius: 4px; border: none;
    background: linear-gradient(135deg, #DA7756 0%, #C4643F 100%); color: #fff;
    font-weight: 600; cursor: pointer; flex: none;
  }
  .unlock-btn:hover { filter: brightness(1.06); }
  .unlock-btn.unlocked { background: rgba(46,125,92,.14); color: #2E7D5C; }
  .unlock-btn:disabled { opacity: 0.5; cursor: wait; }
  .res115 .more { color: #B8A89E; font-size: 10px; padding-top: 3px; }
  .res115 .errline { color: #B85D3F; font-size: 10.5px; font-style: italic; }

  .empty, .loading, .err {
    padding: 22px 16px; text-align: center; color: #B8A89E; font-size: 12px;
  }
  .err { color: #B85D3F; white-space: pre-wrap; }
  .hint { font-size: 10.5px; color: #B8A89E; padding: 6px 12px;
          border-top: 1px solid #F5E8E0; background: #FFF5F0; }
  .spinner-sm {
    display: inline-block; width: 10px; height: 10px; border-radius: 50%;
    border: 2px solid #F0DDD4; border-top-color: #DA7756;
    animation: hdspin .8s linear infinite; vertical-align: -1px;
  }
  @keyframes hdspin { to { transform: rotate(360deg); } }

  /* 解锁结果 */
  .ur-mask {
    position: fixed; inset: 0; background: rgba(60,40,30,0.4);
    display: none; align-items: center; justify-content: center;
    z-index: 2147483647; backdrop-filter: blur(4px);
  }
  .ur-mask.open { display: flex; }
  .ur-card {
    background: #FFFAF7; border-radius: 14px; padding: 20px;
    box-shadow: 0 20px 60px rgba(180,120,80,.22);
    width: min(440px, 92vw); pointer-events: auto;
  }
  .ur-card h3 { margin: 0 0 14px; color: #3D2E25; font-size: 15px; }
  .ur-row {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 10px; background: #fff; border: 1px solid #F0DDD4;
    border-radius: 8px; margin-bottom: 8px;
  }
  .ur-lbl { font-size: 11px; color: #8B6F5C; font-weight: 600; min-width: 44px; }
  .ur-val {
    flex: 1; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11.5px; color: #3D2E25;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ur-btn {
    font-size: 10.5px; padding: 3px 10px; border-radius: 5px; border: 1px solid #F0DDD4;
    background: #fff; color: #8B6F5C; cursor: pointer;
  }
  .ur-btn:hover { color: #C4643F; border-color: #DA7756; }
  .ur-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 10px; }
  .ur-primary {
    background: linear-gradient(135deg, #DA7756, #C4643F);
    color: #fff; border: none; padding: 5px 14px; border-radius: 6px;
    font-size: 11.5px; font-weight: 600; cursor: pointer;
  }
</style>
<div class="mask" id="mask">
  <div class="panel">
    <div class="tabs-bar">
      <div class="tabs" id="tabs"></div>
      <button class="tab" id="close" title="关闭">×</button>
    </div>
    <div class="points-bar" id="points-bar">
      <span style="margin-left:auto"><a id="settings-link" href="javascript:;" style="color:#8B6F5C;text-decoration:none">⚙ 设置</a></span>
    </div>
    <div class="top">
      <input id="q" placeholder="" autocomplete="off">
      <button id="go">搜索</button>
    </div>
    <div class="results" id="results">
      <div class="empty">输入关键词或 TMDB ID，按 Enter 搜索</div>
    </div>
    <div class="hint">Alt+H 唤出 / 关闭 · Esc 关闭 · 点 115 文件旁 HH 按钮直接带入文件名</div>
  </div>
</div>
<div class="ur-mask" id="ur-mask">
  <div class="ur-card">
    <h3>✓ 解锁成功</h3>
    <div class="ur-row"><span class="ur-lbl">链接</span><span class="ur-val" id="ur-url"></span><button class="ur-btn" data-copy="url">复制</button></div>
    <div class="ur-row" id="ur-code-wrap"><span class="ur-lbl">访问码</span><span class="ur-val" id="ur-code"></span><button class="ur-btn" data-copy="code">复制</button></div>
    <div class="ur-row"><span class="ur-lbl">完整</span><span class="ur-val" id="ur-full"></span><button class="ur-btn" data-copy="full">复制</button></div>
    <div class="ur-actions">
      <a class="ur-btn" id="ur-open" target="_blank" rel="noopener">打开</a>
      <button class="ur-primary" id="ur-close">完成</button>
    </div>
  </div>
</div>
`;

  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));
  const mask = $('#mask'), input = $('#q'), results = $('#results'), tabsEl = $('#tabs');
  const urMask = $('#ur-mask');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // 模式 tabs
  let currentMode = 'multi';
  function setMode(id) {
    currentMode = id;
    const m = MODES.find(x => x.id === id);
    input.placeholder = m.ph;
    for (const el of $$('.tab')) {
      if (el.dataset.id) el.classList.toggle('active', el.dataset.id === id);
    }
  }
  for (const m of MODES) {
    const b = document.createElement('button');
    b.className = 'tab'; b.textContent = m.label; b.dataset.id = m.id;
    b.addEventListener('click', () => { setMode(m.id); input.focus(); });
    tabsEl.appendChild(b);
  }
  setMode('multi');

  // 开关
  function openPanel() {
    mask.classList.add('open');
    setTimeout(() => input.focus(), 0);
  }
  function closePanel() { mask.classList.remove('open'); }
  $('#close').addEventListener('click', closePanel);
  $('#settings-link').addEventListener('click', promptSettings);

  // 渲染辅助
  function isMine(item) {
    return myUserId != null &&
      (item.user_id === myUserId || (item.user && item.user.id === myUserId));
  }
  function fmtSpecs(item) {
    const parts = [];
    if (Array.isArray(item.video_resolution) && item.video_resolution.length) parts.push(item.video_resolution.join('/'));
    if (Array.isArray(item.source) && item.source.length) parts.push(item.source.join('/'));
    if (Array.isArray(item.subtitle_language) && item.subtitle_language.length) {
      const t = Array.isArray(item.subtitle_type) && item.subtitle_type.length ? `(${item.subtitle_type.join('/')})` : '';
      parts.push(`字幕:${item.subtitle_language.join('/')}${t}`);
    }
    return parts.join(' · ');
  }
  function unlockTagHtml(item) {
    const pts = Number(item.unlock_points || 0);
    if (!pts) return `<span class="tag free">免费</span>`;
    const unlocked = item.is_unlocked || item.is_forever_vip;
    const cls = unlocked ? 'tag pts unlocked' : 'tag pts';
    return `<span class="${cls}">${unlocked ? `已解锁(${pts})` : `${pts}分`}</span>`;
  }
  function sortShares(arr) {
    return [...arr].sort((a, b) => {
      const am = isMine(a) ? 1 : 0, bm = isMine(b) ? 1 : 0;
      if (bm - am) return bm - am;
      if (!!b.is_official - !!a.is_official) return !!b.is_official - !!a.is_official;
      return (b.submitted_at || '').localeCompare(a.submitted_at || '');
    });
  }

  function renderShareRow(item) {
    const mine = isMine(item);
    const row = document.createElement('div');
    row.className = 'row' + (mine ? ' mine' : '');
    row.innerHTML = `
      <span class="sz">${escapeHtml(item.share_size || '?')}</span>
      ${mine ? '<span class="tag mine">我</span>' : ''}
      ${item.is_official ? '<span class="tag off">官</span>' : ''}
      ${unlockTagHtml(item)}
      <span class="specs" title="${escapeHtml(item.remark || '')}">${escapeHtml(fmtSpecs(item))}${item.remark ? ' · ' + escapeHtml(item.remark) : ''}</span>
    `;
    const unlocked = item.is_unlocked || item.is_forever_vip;
    const btn = document.createElement('button');
    btn.className = 'unlock-btn' + (unlocked ? ' unlocked' : '');
    btn.textContent = unlocked ? '查看' : '解锁';
    btn.addEventListener('click', () => unlockResource(item.slug, btn));
    row.appendChild(btn);
    return row;
  }

  async function loadShares(box, type, tmdbId) {
    box.innerHTML = `<div class="head"><span>115 网盘</span><span class="pill none"><span class="spinner-sm"></span> 检查中</span></div>`;
    try {
      const [res] = await Promise.all([
        hdRequest(`/resources/${encodeURIComponent(type)}/${encodeURIComponent(tmdbId)}`),
        ensureMyUserId(),
      ]);
      const all = res.data || [];
      const arr = all.filter(r => /115/i.test(r.pan_type || ''));
      const others = [...new Set(all.filter(r => !/115/i.test(r.pan_type || '')).map(r => r.pan_type).filter(Boolean))];
      const off = all.filter(x => x.is_official).length;
      const free = all.filter(x => !Number(x.unlock_points || 0)).length;
      const mineN = all.filter(isMine).length;
      const sum = [`共 ${all.length}`, `官组 ${off}`, `免费 ${free}`];
      if (myUserId != null) sum.push(`我 ${mineN}`);
      box.innerHTML = `<div class="head">
        <span>115 网盘 ${arr.length ? `<span class="pill">${arr.length} 个</span>` : `<span class="pill none">无 115</span>`}</span>
        <span class="summary">${escapeHtml(sum.join(' · '))}</span>
      </div>`;
      const top = sortShares(arr).slice(0, 3);
      for (const it of top) box.appendChild(renderShareRow(it));
      if (arr.length > top.length) {
        const m = document.createElement('div');
        m.className = 'more';
        m.textContent = `仅显示前 ${top.length}，全部 ${arr.length}`;
        box.appendChild(m);
      }
      if (!arr.length && others.length) {
        const m = document.createElement('div');
        m.className = 'more';
        m.textContent = '其它网盘：' + others.join(' / ');
        box.appendChild(m);
      }
    } catch (e) {
      box.innerHTML = `<div class="head"><span>115 网盘</span><span class="pill none">失败</span></div>`;
      const er = document.createElement('div');
      er.className = 'errline';
      er.textContent = (e.code ? e.code + ': ' : '') + (e.description || e.message);
      box.appendChild(er);
    }
  }

  function render(list) {
    results.innerHTML = '';
    if (!list || !list.length) {
      results.innerHTML = '<div class="empty">没有匹配结果</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    let added = 0;
    for (const r of list) {
      const type = r.media_type;
      if (type !== 'movie' && type !== 'tv') continue;
      if (added >= 6) break;
      const a = document.createElement('a');
      a.className = 'item';
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.href = `${HDHIVE_DETAIL}/${type}/${r.id}`;

      const img = document.createElement('img');
      img.src = r.poster_path ? TMDB_IMG_BASE + r.poster_path : POSTER_FALLBACK;
      img.onerror = () => { img.src = POSTER_FALLBACK; };
      img.loading = 'lazy';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const title = r.title || r.name || '(无标题)';
      const orig = r.original_title || r.original_name;
      const date = r.release_date || r.first_air_date || '';
      const year = date ? date.slice(0, 4) : '';
      const badge = type === 'tv' ? '剧集' : '电影';
      const badgeCls = type === 'movie' ? 'movie' : '';
      const rating = (typeof r.vote_average === 'number' && r.vote_average > 0)
        ? `★ ${r.vote_average.toFixed(1)}` : '';
      meta.innerHTML = `
        <div class="title">
          <span class="badge ${badgeCls}">${badge}</span>
          <span class="badge tmdb">#${r.id}</span>
          ${rating ? `<span class="badge" style="background:#E8A04C">${escapeHtml(rating)}</span>` : ''}
          <span class="t"></span>
        </div>
        <div class="sub"></div>
        <div class="ov"></div>
      `;
      meta.querySelector('.t').textContent = title;
      meta.querySelector('.sub').textContent = [orig && orig !== title ? orig : '', year].filter(Boolean).join(' · ');
      meta.querySelector('.ov').textContent = r.overview || '';
      a.appendChild(img); a.appendChild(meta); frag.appendChild(a);

      if (added < 2) {
        const box = document.createElement('div');
        box.className = 'res115';
        meta.appendChild(box);
        loadShares(box, type, r.id);
      }
      added++;
    }
    results.innerHTML = '';
    results.appendChild(frag);
  }

  async function doSearch() {
    const q = input.value.trim();
    if (!q) return;
    const mode = MODES.find(m => m.id === currentMode);
    if (mode.numeric && !/^\d+$/.test(q)) {
      results.innerHTML = `<div class="err">${escapeHtml(mode.label)} 模式仅接受数字</div>`;
      return;
    }
    if (!getKey()) {
      results.innerHTML = `<div class="err">尚未配置 HDHive API Key，点上方"⚙ 设置"或油猴菜单</div>`;
      return;
    }
    if (!getTmdb() && !mode.numeric) {
      results.innerHTML = `<div class="err">尚未配置 TMDB Token，点"⚙ 设置"</div>`;
      return;
    }
    results.innerHTML = '<div class="loading"><span class="spinner-sm"></span> 搜索中…</div>';
    try {
      const list = await runSearch(currentMode, q);
      render(list);
    } catch (e) {
      const msg = (e.code ? e.code + ': ' : '') + (e.description || e.message);
      results.innerHTML = `<div class="err">${escapeHtml(msg)}</div>`;
    }
  }
  $('#go').addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault(); doSearch();
    } else if (e.key === 'Escape') closePanel();
  });

  // 解锁
  async function unlockResource(slug, btn) {
    if (!slug) return;
    const orig = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const r = await hdRequest('/resources/unlock', { method: 'POST', body: { slug } });
      const d = r.data || {};
      showUnlockResult(d);
      if (btn) { btn.classList.add('unlocked'); btn.textContent = '已解锁'; }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = orig || '解锁'; }
      alert((e.code ? e.code + ': ' : '') + (e.description || e.message));
    }
  }
  function showUnlockResult(d) {
    const url = d.url || '';
    const code = d.access_code || '';
    const full = d.full_url || (code && url ? `${url}?pwd=${code}` : url);
    $('#ur-url').textContent = url; $('#ur-url').title = url;
    if (!code) $('#ur-code-wrap').style.display = 'none';
    else { $('#ur-code-wrap').style.display = ''; $('#ur-code').textContent = code; }
    $('#ur-full').textContent = full; $('#ur-full').title = full;
    $('#ur-open').href = full || url || '#';
    urMask.classList.add('open');
  }
  $('#ur-close').addEventListener('click', () => urMask.classList.remove('open'));
  urMask.addEventListener('click', (e) => { if (e.target === urMask) urMask.classList.remove('open'); });
  for (const b of $$('.ur-btn[data-copy]')) {
    b.addEventListener('click', async () => {
      const kind = b.dataset.copy;
      const map = { url: $('#ur-url'), code: $('#ur-code'), full: $('#ur-full') };
      const val = map[kind] ? map[kind].textContent : '';
      try {
        await navigator.clipboard.writeText(val);
        b.textContent = '✓';
        setTimeout(() => { b.textContent = '复制'; }, 1200);
      } catch {
        b.textContent = '失败';
        setTimeout(() => { b.textContent = '复制'; }, 1200);
      }
    });
  }

  // ---------- 对外 API + 全局快捷键 ----------
  function openWithQuery(name) {
    const q = cleanFileName(name);
    openPanel();
    input.value = q;
    if (q) doSearch();
  }
  function cleanFileName(raw) {
    let s = String(raw || '').trim();
    s = s.replace(/(?:星标|取消星标|置顶|取消置顶|备注|评分)+\s*$/g, '').trim();
    s = s.replace(/\.(mkv|mp4|avi|mov|wmv|flv|ts|m2ts|rmvb|webm|iso|zip|rar|7z)$/i, '');
    s = s.replace(/\s*[（(](?:19|20)\d{2}[）)]\s*$/, '');
    s = s.replace(/\s*\[[^\]]{1,15}\]\s*$/, '');
    return s.trim();
  }
  try { window.HDLiveOpen = openWithQuery; } catch {}

  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyH') {
      e.preventDefault();
      mask.classList.contains('open') ? closePanel() : openPanel();
    } else if (e.key === 'Escape' && mask.classList.contains('open')) {
      closePanel();
    }
  }, true);

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('打开 HDHive 面板', openPanel);
  }

  // ---------- 115 文件列表按钮注入（沿用现有 logic）----------
  const HDLIVE_CSS = `
.hdlive-btn { display: inline-flex; align-items: center; gap: 3px; cursor: pointer; }
.hdlive-btn .hdlive-ico {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 4px;
  background: linear-gradient(135deg,#DA7756 0%, #C4643F 100%);
  color: #fff; font-style: normal; font-size: 9px; font-weight: 800;
  font-family: -apple-system, sans-serif; letter-spacing: -0.5px;
  box-shadow: 0 1px 3px rgba(180,93,63,0.35);
}
`;
  const attached = new WeakSet();
  function tryAttach() {
    const iframe = document.querySelector('iframe[rel="wangpan"]');
    if (!iframe || attached.has(iframe)) return;
    let doc;
    try { doc = iframe.contentDocument; } catch { return; }
    if (!doc || !doc.body) return;
    attached.add(iframe);
    try {
      const st = doc.createElement('style');
      st.id = 'hdlive-style';
      st.textContent = HDLIVE_CSS;
      doc.head && doc.head.appendChild(st);
    } catch {}
    injectAll(doc);
    const mo = new MutationObserver(() => scheduleInject(doc));
    mo.observe(doc.body, { childList: true, subtree: true });
    iframe.addEventListener('load', () => {
      attached.delete(iframe);
      setTimeout(tryAttach, 300);
    });
  }
  let scheduled = false;
  function scheduleInject(doc) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectAll(doc); });
  }
  function injectAll(doc) {
    const bars = doc.querySelectorAll('.file-opr, .file-ctrl');
    for (const tb of bars) {
      if (tb.dataset.hdliveInjected === '1') continue;
      tb.dataset.hdliveInjected = '1';
      injectButton(doc, tb);
    }
  }
  function extractFileNameFromLi(li) {
    if (!li) return '';
    const attrName = li.getAttribute('file_name');
    if (attrName && attrName.trim()) return attrName.trim();
    const wrap = li.querySelector('[rel="file_name"], .file-name');
    if (!wrap) return '';
    let best = '';
    for (const a of wrap.querySelectorAll('a')) {
      const t = (a.getAttribute('title') || a.textContent || '').trim();
      if (!t) continue;
      if (t.length > best.length) best = t;
    }
    if (best) return best;
    const clone = wrap.cloneNode(true);
    clone.querySelectorAll(
      'i, .ic-mark, .ic-cancelmark, .ic-star, [rel="star"], [rel="star_alt"],' +
      '[rel="set_mark"], [rel="cancel_mark"], [menu="get_star"], [menu="star"],' +
      '.labels-text, .labels-wrap, .file-settop, [rel="top_ico"]'
    ).forEach(el => el.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function injectButton(doc, tb) {
    const isThumb = tb.classList.contains('file-ctrl');
    const btn = doc.createElement('a');
    btn.href = 'javascript:;';
    btn.className = 'hdlive-btn';
    btn.setAttribute('menu', 'hdlive');
    btn.setAttribute('data_title', 'HDHive');
    btn.title = 'HDHive 影视搜索';
    btn.innerHTML = `<i class="hdlive-ico">HH</i>${isThumb ? '' : '<span>HDHive</span>'}`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const li = btn.closest('li');
      const name = extractFileNameFromLi(li);
      if (window.top && window.top.HDLiveOpen) {
        try { window.top.HDLiveOpen(name); return; } catch {}
      }
      openWithQuery(name);
    }, true);
    tb.insertBefore(btn, tb.firstChild);
    const shareBtn = tb.querySelector('[menu="public_share"]');
    if (shareBtn && shareBtn !== btn.nextSibling) {
      tb.insertBefore(shareBtn, btn.nextSibling);
    }
  }
  tryAttach();
  setInterval(tryAttach, 1500);
})();
