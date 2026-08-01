// ==UserScript==
// @name         115网盘 TMDB 剧集重命名助手
// @namespace    https://115.com/
// @version      6.4
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/115-tmdb-rename.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/115-tmdb-rename.user.js
// @description  从TMDB获取剧集信息，通过115官方API批量重命名网盘文件及文件夹（性能优化版）。TMDB API key 运行时由用户输入并持久化，源码不含任何 key。
// @author       ggvisPro
// @modified     2026-07-06 00:18:54 CST
// @match        https://115.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=115.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.themoviedb.org
// @connect      image.tmdb.org
// @connect      webapi.115.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 配置
    // ==========================================
    // TMDB API key 由用户在运行时输入并持久化（源码不含任何 key）。
    // v3 key 申请地址：https://www.themoviedb.org/settings/api
    const TMDB_API_KEY_STORAGE = 'tmdb_api_key';
    function tmdbKey() {
        return (GM_getValue(TMDB_API_KEY_STORAGE, '') || '').trim();
    }
    function setApiKey(key) {
        GM_setValue(TMDB_API_KEY_STORAGE, (key || '').trim());
    }
    // 首次使用时弹窗收集 key；返回当前 key（'' 表示用户取消/未设置）
    function ensureApiKey() {
        let key = tmdbKey();
        if (key) return key;
        key = (prompt('请输入 TMDB API key (v3)\n申请地址: https://www.themoviedb.org/settings/api') || '').trim();
        if (key) setApiKey(key);
        return key;
    }
    const SKIP_KEYWORDS = ['影视', '动漫', '电影', '电视剧', '纪录片', '综艺', '根目录', '最近接收', '云下载', '个人文档', 'APP', 'av', '国产剧', '纪录片', '日韩剧', '欧美剧'];
    // 文件名（不区分大小写）包含任一关键字 → 在扫描阶段静默送入回收站，仅作用于文件（fid 项），不影响文件夹
    // 留空即关闭该功能；示例：['sample', 'trailer', '广告', 'CD2', 'screens']
    const DELETE_KEYWORDS = ['下载请访问', 'Fonts', 'Subtitles', 'tc.ass'];
    const CONCURRENCY = 4; // 并发请求数

    // ==========================================
    // 样式注入 — Claude 暖橙浅色主题
    // ==========================================
    GM_addStyle(`
        /* ===== 面板 ===== */
        #tmdb-rename-panel {
            position: fixed; top: 16px; right: 16px; width: 480px; max-height: 90vh;
            background: #FFFAF7; color: #3D2E25;
            border: 1px solid #F0DDD4;
            box-shadow: 0 12px 48px rgba(180,120,80,0.14), 0 0 0 1px rgba(218,119,86,0.05) inset;
            z-index: 99999; border-radius: 16px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            font-size: 13px; display: flex; flex-direction: column;
            overflow: hidden;
            transition: opacity 0.25s ease, transform 0.25s ease;
        }
        #tmdb-rename-panel.tmdb-hidden {
            opacity: 0; transform: translateY(-12px) scale(0.97); pointer-events: none;
        }

        /* ===== 头部 ===== */
        .tmdb-header {
            padding: 14px 18px;
            background: linear-gradient(135deg, #DA7756 0%, #C4643F 100%);
            display: flex; align-items: center; justify-content: space-between;
            flex-shrink: 0;
        }
        .tmdb-header-title {
            font-size: 15px; font-weight: 700; color: #fff;
            display: flex; align-items: center; gap: 8px;
        }
        .tmdb-header-title .tmdb-logo {
            width: 22px; height: 22px; border-radius: 6px;
            background: rgba(255,255,255,0.25);
            display: flex; align-items: center; justify-content: center;
            font-size: 13px;
        }
        .tmdb-close-btn {
            width: 26px; height: 26px; border-radius: 8px; border: none;
            background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.85); cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 15px; transition: all 0.15s; line-height: 1;
        }
        .tmdb-close-btn:hover { background: rgba(255,255,255,0.3); color: #fff; }

        /* ===== 步骤 ===== */
        .tmdb-steps {
            display: flex; align-items: center; padding: 12px 18px;
            gap: 0; flex-shrink: 0; background: #FFF5F0;
            border-bottom: 1px solid #F5E8E0;
        }
        .tmdb-step { display: flex; align-items: center; gap: 7px; flex: 1; }
        .tmdb-step-num {
            width: 22px; height: 22px; border-radius: 50%;
            background: #F5E8E0; color: #B8A89E;
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 700; flex-shrink: 0; transition: all 0.3s;
        }
        .tmdb-step.active .tmdb-step-num { background: #DA7756; color: #fff; box-shadow: 0 0 10px rgba(218,119,86,0.25); }
        .tmdb-step.done .tmdb-step-num { background: #4CAF50; color: #fff; }
        .tmdb-step-label { font-size: 12px; color: #B8A89E; transition: color 0.3s; }
        .tmdb-step.active .tmdb-step-label { color: #DA7756; font-weight: 600; }
        .tmdb-step.done .tmdb-step-label { color: #4CAF50; }
        .tmdb-step-line { flex: 0 0 20px; height: 1px; background: #F5E8E0; margin: 0 4px; }

        /* ===== 内容区 ===== */
        .tmdb-body { padding: 14px 18px; overflow-y: auto; flex: 1; min-height: 0; }
        .tmdb-body::-webkit-scrollbar { width: 5px; }
        .tmdb-body::-webkit-scrollbar-track { background: transparent; }
        .tmdb-body::-webkit-scrollbar-thumb { background: #F0DDD4; border-radius: 3px; }

        /* ===== 搜索栏 ===== */
        .tmdb-search-row { display: flex; gap: 8px; margin-bottom: 14px; }
        .tmdb-input {
            flex: 1; padding: 9px 14px; box-sizing: border-box;
            background: #fff; border: 1px solid #F0DDD4;
            border-radius: 10px; font-size: 13px; color: #3D2E25; outline: none;
            transition: all 0.2s;
        }
        .tmdb-input::placeholder { color: #B8A89E; }
        .tmdb-input:focus { border-color: #DA7756; box-shadow: 0 0 0 3px rgba(218,119,86,0.15); }
        .tmdb-btn {
            padding: 9px 16px; border: none; border-radius: 10px; cursor: pointer;
            font-size: 12px; font-weight: 600; color: #fff; transition: all 0.15s; white-space: nowrap;
        }
        .tmdb-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.1); }
        .tmdb-btn:active:not(:disabled) { transform: translateY(0); }
        .tmdb-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .tmdb-btn-primary   { background: linear-gradient(135deg, #DA7756, #C4643F); }
        .tmdb-btn-secondary { background: #8B7367; }
        .tmdb-btn-sm { padding: 6px 12px; font-size: 11px; border-radius: 8px; }

        /* ===== 搜索结果 ===== */
        #tmdb-search-results { margin-bottom: 14px; display: none; }
        .tmdb-results-label {
            font-size: 11px; color: #B8A89E; margin-bottom: 8px;
            text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
        }
        .tmdb-result-card {
            display: flex; gap: 10px; padding: 10px;
            background: #fff; border: 1px solid #F5E8E0;
            border-radius: 10px; cursor: pointer; transition: all 0.15s; margin-bottom: 6px;
        }
        .tmdb-result-card:hover { background: rgba(218,119,86,0.06); border-color: #DA7756; }
        .tmdb-result-card.selected { background: rgba(218,119,86,0.08); border-color: #DA7756; box-shadow: 0 0 0 1px #DA7756; }
        .tmdb-result-poster {
            width: 44px; height: 66px; border-radius: 6px; object-fit: cover;
            background: #FFF0E8; flex-shrink: 0;
        }
        .tmdb-result-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
        .tmdb-result-name {
            font-size: 13px; font-weight: 600; color: #3D2E25;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .tmdb-result-meta { font-size: 11px; color: #8B7367; margin-top: 3px; display: flex; gap: 8px; align-items: center; }
        .tmdb-result-meta .tmdb-tag {
            padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;
            background: #FFF0E8; color: #DA7756;
        }
        .tmdb-result-overview {
            font-size: 11px; color: #B8A89E; margin-top: 4px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* ===== 状态条 ===== */
        #tmdb-status {
            font-size: 12px; color: #8B7367; padding: 10px 12px;
            background: #FFF5F0; border: 1px solid #F5E8E0;
            border-radius: 8px; margin-bottom: 12px; line-height: 1.6;
        }

        /* ===== 文件夹重命名 ===== */
        #tmdb-folder-rename { margin-bottom: 12px; }
        .tmdb-folder-rename {
            padding: 10px 12px;
            background: #FFF0E8; border: 1px solid #F0DDD4;
            border-radius: 10px; font-size: 12px;
        }
        .tmdb-folder-rename-label {
            font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
            color: #DA7756; margin-bottom: 6px;
        }
        .tmdb-folder-old { color: #B8A89E; text-decoration: line-through; margin-bottom: 3px; word-break: break-all; }
        .tmdb-folder-new { color: #DA7756; font-weight: 600; word-break: break-all; flex: 1; }
        .tmdb-folder-row { display: flex; align-items: center; gap: 8px; }
        .tmdb-folder-badge {
            font-size: 10px; padding: 2px 8px; border-radius: 6px; font-weight: 600; flex-shrink: 0;
        }

        /* ===== 文件列表 ===== */
        #tmdb-file-list {
            max-height: 320px; overflow-y: auto;
            border: 1px solid #F5E8E0; border-radius: 10px;
            background: #fff;
        }
        #tmdb-file-list::-webkit-scrollbar { width: 4px; }
        #tmdb-file-list::-webkit-scrollbar-track { background: transparent; }
        #tmdb-file-list::-webkit-scrollbar-thumb { background: #F0DDD4; border-radius: 2px; }
        .tmdb-file-item {
            padding: 10px 12px; font-size: 12px;
            border-bottom: 1px solid #F5E8E0; transition: background 0.15s;
        }
        .tmdb-file-item:last-child { border-bottom: none; }
        .tmdb-file-item:hover { background: #FFFAF7; }
        .tmdb-old-name {
            color: #B8A89E; font-size: 11px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            text-decoration: line-through; margin-bottom: 4px;
        }
        .tmdb-new-name-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .tmdb-new-name {
            color: #C4643F; font-weight: 600; font-size: 12px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
        }
        .tmdb-file-badge {
            font-size: 10px; padding: 2px 8px; border-radius: 6px;
            font-weight: 600; white-space: nowrap; flex-shrink: 0;
        }
        .tmdb-badge-pending { background: rgba(245,166,35,0.1); color: #E8A435; }
        .tmdb-badge-success { background: rgba(76,175,80,0.1); color: #4CAF50; }
        .tmdb-badge-fail    { background: rgba(229,57,53,0.1); color: #E53935; }
        .tmdb-file-empty { text-align: center; padding: 28px 16px; color: #B8A89E; font-size: 12px; }

        /* ===== 全选栏 ===== */
        .tmdb-select-bar {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 12px; border-bottom: 1px solid #F5E8E0;
            background: #FFF5F0;
        }
        .tmdb-select-bar label {
            display: flex; align-items: center; gap: 6px; cursor: pointer;
            font-size: 11px; color: #8B7367; user-select: none;
        }
        .tmdb-select-count { font-size: 11px; color: #B8A89E; }

        /* ===== Checkbox ===== */
        .tmdb-checkbox {
            width: 15px; height: 15px; border-radius: 4px;
            border: 1.5px solid #F0DDD4; background: #fff;
            cursor: pointer; appearance: none; -webkit-appearance: none;
            position: relative; flex-shrink: 0; transition: all 0.15s;
        }
        .tmdb-checkbox:checked { background: #DA7756; border-color: #DA7756; }
        .tmdb-checkbox:checked::after {
            content: ''; position: absolute; left: 4px; top: 1px;
            width: 4px; height: 8px;
            border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
        }
        .tmdb-file-item.unchecked { opacity: 0.4; }

        /* ===== 操作栏 ===== */
        .tmdb-action-bar {
            padding: 12px 18px; border-top: 1px solid #F5E8E0;
            display: flex; gap: 8px; justify-content: flex-end; flex-shrink: 0;
            background: #FFF5F0;
        }

        /* ===== 浮动按钮 ===== */
        #tmdb-toggle-btn {
            position: fixed; bottom: 24px; right: 24px; z-index: 99998;
            background: linear-gradient(135deg, #DA7756 0%, #C4643F 100%);
            color: #fff; padding: 0; width: 50px; height: 50px; border-radius: 15px;
            cursor: pointer; box-shadow: 0 4px 16px rgba(218,119,86,0.35);
            font-size: 22px; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s; border: none;
        }
        #tmdb-toggle-btn:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 6px 24px rgba(218,119,86,0.45); }

        /* ===== 加载动画 ===== */
        .tmdb-spinner {
            display: inline-block; width: 13px; height: 13px;
            border: 2px solid #F5E8E0;
            border-top-color: #DA7756; border-radius: 50%;
            animation: tmdb-spin 0.6s linear infinite;
            vertical-align: middle; margin-right: 6px;
        }
        @keyframes tmdb-spin { to { transform: rotate(360deg); } }

        /* ===== 进度条 ===== */
        .tmdb-progress-wrap {
            height: 3px; background: #FFF0E8;
            border-radius: 2px; overflow: hidden; margin-top: 8px; display: none;
        }
        .tmdb-progress-bar {
            height: 100%; background: linear-gradient(90deg, #DA7756, #4CAF50);
            border-radius: 2px; transition: width 0.3s ease; width: 0%;
        }
    `);

    // ==========================================
    // 全局状态
    // ==========================================
    let state = {
        files: [],
        tmdbEpisodes: {},
        seriesName: "",
        seriesYear: "",
        currentStep: 0,
        runId: 0,
        folderRename: null,
        seasonFolderRenames: [],
        _currentFolder: null
    };

    // ==========================================
    // 工具函数
    // ==========================================
    function getCurrentCid() {
        const match = location.href.match(/cid=(\d+)/);
        return match ? match[1] : '0';
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // 缓存已完成的请求
    const requestCache = new Map();

    function request(method, url, data = null, isForm = false) {
        // GET 请求可缓存（TMDB API）
        const cacheKey = method === 'GET' && url.includes('api.themoviedb.org') ? url : null;
        if (cacheKey && requestCache.has(cacheKey)) {
            return Promise.resolve(requestCache.get(cacheKey));
        }
        return new Promise((resolve, reject) => {
            let headers = {};
            if (isForm) headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
            GM_xmlhttpRequest({
                method, url, headers, data,
                responseType: "json",
                timeout: 15000,
                onload(res) {
                    try {
                        const result = res.response || JSON.parse(res.responseText);
                        if (cacheKey) requestCache.set(cacheKey, result);
                        resolve(result);
                    }
                    catch { reject(new Error('响应解析失败')); }
                },
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    // 批量送回收站（仅文件 fid，文件夹请勿传入）
    async function deleteFidsBatch(fids) {
        const formData = new URLSearchParams();
        fids.forEach((id, i) => formData.append(`fid[${i}]`, id));
        formData.append('ignore_warn', '1');
        return await request('POST', 'https://webapi.115.com/rb/delete', formData.toString(), true);
    }

    // 并发控制器：最多同时 N 个请求
    async function parallelMap(items, fn, concurrency = CONCURRENCY) {
        const results = new Array(items.length);
        let idx = 0;
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (idx < items.length) {
                const i = idx++;
                results[i] = await fn(items[i], i);
            }
        });
        await Promise.all(workers);
        return results;
    }

    function extractSeasonNum(name) {
        const n = name.trim();
        let m;
        m = n.match(/^season\s*(\d+)$/i);
        if (m) return parseInt(m[1], 10);
        m = n.match(/^S(\d{1,2})$/i);
        if (m) return parseInt(m[1], 10);
        m = n.match(/(?:^|[\.\s_\-])S(\d{1,2})(?:[\.\s_\-]|$)(?!E\d)/i);
        if (m) return parseInt(m[1], 10);
        return null;
    }

    function isSeasonFolder(name) {
        return extractSeasonNum(name) !== null;
    }

    // ==========================================
    // UI 状态
    // ==========================================
    function setStep(n) {
        state.currentStep = n;
        document.querySelectorAll('.tmdb-step').forEach((el, i) => {
            el.classList.toggle('done', i < n);
            el.classList.toggle('active', i === n);
        });
        const matchBtn = document.getElementById('tmdb-match-btn');
        const execBtn = document.getElementById('tmdb-execute-btn');
        if (matchBtn) matchBtn.disabled = (n < 1);
        if (execBtn) execBtn.disabled = (n < 2);
    }

    function updateStatus(text, loading = false) {
        const el = document.getElementById('tmdb-status');
        if (!el) return;
        el.innerHTML = (loading ? '<span class="tmdb-spinner"></span>' : '') + escapeHtml(text);
    }

    function setProgress(pct) {
        const wrap = document.querySelector('.tmdb-progress-wrap');
        const bar = document.querySelector('.tmdb-progress-bar');
        if (!wrap || !bar) return;
        wrap.style.display = pct >= 0 ? 'block' : 'none';
        bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
    }

    // ==========================================
    // 核心逻辑
    // ==========================================

    async function fetchShowNameAndFolder() {
        try {
            const cid = getCurrentCid();
            if (cid === '0') return { name: '', folder: null };
            const url = `https://webapi.115.com/files?aid=1&cid=${cid}&o=user_ptime&asc=0&offset=0&show_dir=1&limit=1&format=json`;
            const res = await request('GET', url);
            if (!res.path || res.path.length < 1) return { name: '', folder: null };

            const path = res.path;
            let idx = path.length - 1;
            while (idx >= 0 && isSeasonFolder(path[idx].name)) idx--;
            if (idx < 0) return { name: '', folder: null };

            const folder = { cid: path[idx].cid, name: path[idx].name };
            const cleanName = path[idx].name.replace(/\s*[\(（]\d{4}[\)）]\s*$/, '').trim();
            return { name: cleanName, folder };
        } catch {
            return { name: '', folder: null };
        }
    }

    function shouldSkip(name) {
        return SKIP_KEYWORDS.some(kw => name.includes(kw));
    }

    async function autoRun() {
        const { name, folder } = await fetchShowNameAndFolder();
        state._currentFolder = folder;
        const input = document.getElementById('tmdb-search-input');
        if (!input || !name) return;
        input.value = name;
        if (shouldSkip(name)) {
            updateStatus('⏭ 目录名命中屏蔽关键词，已跳过自动化');
            return;
        }
        await searchTMDB(name);
    }

    // 1. 搜索 TMDB
    async function searchTMDB(query) {
        const myRun = ++state.runId;
        if (!ensureApiKey()) {
            updateStatus('⚠️ 未设置 TMDB API key，点击右上角 🔑 设置后再搜索');
            return;
        }
        try {
            const urlMatch = query.match(/themoviedb\.org\/tv\/(\d+)/);
            if (urlMatch) { await loadShowById(urlMatch[1], myRun); return; }

            setStep(0);
            updateStatus('正在搜索: ' + query, true);

            const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${tmdbKey()}&query=${encodeURIComponent(query)}&language=zh-CN&page=1`;
            const searchRes = await request('GET', searchUrl);
            if (myRun !== state.runId) return;

            // TMDB 无效 key：status_code 7（Invalid API key）/ 14（Authentication not successful）
            if (searchRes.status_code === 7 || searchRes.status_code === 14) {
                setApiKey('');
                updateStatus('❌ TMDB API key 无效，已清除。点击 🔑 重新输入');
                return;
            }

            if (!searchRes.results || searchRes.results.length === 0) {
                updateStatus('❌ 未找到匹配的剧集，请尝试其他关键词');
                return;
            }

            const results = searchRes.results.slice(0, 5);
            showSearchResults(results, myRun);
            await loadShowById(results[0].id, myRun);

        } catch (error) {
            if (myRun !== state.runId) return;
            updateStatus('❌ 搜索失败: ' + error.message);
        }
    }

    function showSearchResults(results, myRun) {
        const container = document.getElementById('tmdb-search-results');
        container.style.display = 'block';
        container.innerHTML = `
            <div class="tmdb-results-label">搜索结果 (点击可切换)</div>
            ${results.map((r, idx) => {
                const year = r.first_air_date ? r.first_air_date.substring(0, 4) : '—';
                const poster = r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : '';
                const overview = r.overview ? r.overview.substring(0, 60) + (r.overview.length > 60 ? '…' : '') : '';
                return `
                <div class="tmdb-result-card${idx === 0 ? ' selected' : ''}" data-id="${r.id}">
                    ${poster
                        ? `<img class="tmdb-result-poster" src="${poster}" alt="" loading="lazy">`
                        : `<div class="tmdb-result-poster" style="display:flex;align-items:center;justify-content:center;color:#B8A89E;font-size:10px;">暂无</div>`
                    }
                    <div class="tmdb-result-info">
                        <div class="tmdb-result-name">${escapeHtml(r.name)}</div>
                        <div class="tmdb-result-meta">
                            <span class="tmdb-tag">${year}</span>
                            ${r.original_name && r.original_name !== r.name ? `<span style="color:#B8A89E">${escapeHtml(r.original_name)}</span>` : ''}
                            ${r.vote_average ? `<span>⭐ ${r.vote_average.toFixed(1)}</span>` : ''}
                        </div>
                        ${overview ? `<div class="tmdb-result-overview">${escapeHtml(overview)}</div>` : ''}
                    </div>
                </div>`;
            }).join('')}
        `;
        container.querySelectorAll('.tmdb-result-card').forEach(card => {
            card.addEventListener('click', () => {
                container.querySelectorAll('.tmdb-result-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                loadShowById(card.dataset.id, myRun);
            });
        });
    }

    // 2. 加载详情 — 并发获取所有季
    async function loadShowById(showId, myRun) {
        try {
            updateStatus('正在获取剧集详情…', true);
            const detailUrl = `https://api.themoviedb.org/3/tv/${showId}?api_key=${tmdbKey()}&language=zh-CN`;
            const details = await request('GET', detailUrl);
            if (myRun !== state.runId) return;

            state.seriesName = details.name;
            state.seriesYear = details.first_air_date ? details.first_air_date.substring(0, 4) : "未知";

            const seasons = details.seasons;
            updateStatus(`${state.seriesName} (${state.seriesYear})  —  并发获取 ${seasons.length} 季信息…`, true);

            state.tmdbEpisodes = {};
            let completed = 0;

            // ★ 核心优化：并发获取所有季，最多同时 CONCURRENCY 个
            await parallelMap(seasons, async (season) => {
                if (myRun !== state.runId) return;
                const seasonUrl = `https://api.themoviedb.org/3/tv/${showId}/season/${season.season_number}?api_key=${tmdbKey()}&language=zh-CN`;
                const seasonData = await request('GET', seasonUrl);
                if (seasonData.episodes) {
                    seasonData.episodes.forEach(ep => {
                        state.tmdbEpisodes[`${ep.season_number}-${ep.episode_number}`] = ep.name;
                    });
                }
                completed++;
                setProgress((completed / seasons.length) * 100);
            }, CONCURRENCY);

            if (myRun !== state.runId) return;
            setProgress(-1);
            setStep(1);
            updateStatus(`✅ ${state.seriesName} (${state.seriesYear})  —  共 ${Object.keys(state.tmdbEpisodes).length} 集`);

            checkFolderRename();
            await scanAndMatchFiles(myRun);

        } catch (error) {
            if (myRun !== state.runId) return;
            setProgress(-1);
            updateStatus('❌ 获取详情失败: ' + error.message);
        }
    }

    // ===== 文件夹重命名 =====
    function checkFolderRename() {
        state.folderRename = null;
        const folder = state._currentFolder;
        if (!folder || !folder.cid || !folder.name) return;

        const idealName = `${state.seriesName} (${state.seriesYear})`;
        if (folder.name === idealName) return;

        state.folderRename = {
            cid: folder.cid,
            oldName: folder.name,
            newName: idealName,
            status: 'pending'
        };
        renderFolderRenames();
    }

    function renderFolderRenames() {
        const container = document.getElementById('tmdb-folder-rename');
        if (!container) return;

        const items = [];
        if (state.folderRename) {
            items.push({ ...state.folderRename, label: '📁 剧名文件夹' });
        }
        state.seasonFolderRenames.forEach(sr => {
            items.push({ ...sr, label: '📂 Season 文件夹' });
        });

        if (items.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = items.map(fr => {
            const badgeBg = fr.status === 'success' ? 'rgba(76,175,80,0.1)' : fr.status === 'fail' ? 'rgba(229,57,53,0.1)' : 'rgba(245,166,35,0.1)';
            const badgeColor = fr.status === 'success' ? '#4CAF50' : fr.status === 'fail' ? '#E53935' : '#E8A435';
            const badgeText = fr.status === 'success' ? '✓ 已重命名' : fr.status === 'fail' ? '✗ 失败' : '待处理';
            return `
                <div class="tmdb-folder-rename" style="margin-bottom:6px">
                    <div class="tmdb-folder-rename-label">${fr.label}</div>
                    <div class="tmdb-folder-old">${escapeHtml(fr.oldName)}</div>
                    <div class="tmdb-folder-row">
                        <div class="tmdb-folder-new">→ ${escapeHtml(fr.newName)}</div>
                        <span class="tmdb-folder-badge" style="background:${badgeBg};color:${badgeColor};">${badgeText}</span>
                    </div>
                </div>`;
        }).join('');
    }

    async function executeFolderRenames() {
        const pendingFolders = [];
        if (state.folderRename && state.folderRename.status === 'pending') {
            pendingFolders.push(state.folderRename);
        }
        state.seasonFolderRenames.forEach(sr => {
            if (sr.status === 'pending') pendingFolders.push(sr);
        });

        if (pendingFolders.length === 0) return;

        const formData = new URLSearchParams();
        pendingFolders.forEach(fr => {
            formData.append(`files_new_name[${fr.cid}]`, fr.newName);
        });

        try {
            const res = await request('POST', 'https://webapi.115.com/files/batch_rename', formData.toString(), true);
            pendingFolders.forEach(fr => {
                fr.status = res.state ? 'success' : 'fail';
            });
        } catch {
            pendingFolders.forEach(fr => { fr.status = 'fail'; });
        }
        renderFolderRenames();
    }

    // 3. 扫描匹配 — 并发扫描子文件夹
    async function fetchFilesInFolder(cid) {
        const allFiles = [], seasonFolders = [];
        let offset = 0;
        const limit = 500;
        let pathInfo = null;
        while (true) {
            const listUrl = `https://webapi.115.com/files?aid=1&cid=${cid}&limit=${limit}&offset=${offset}&show_dir=1&format=json`;
            const listRes = await request('GET', listUrl);
            if (!listRes.state || !listRes.data) throw new Error("获取文件列表失败：" + (listRes.error || "未知原因"));
            if (!pathInfo && listRes.path) pathInfo = listRes.path;
            listRes.data.forEach(item => {
                if (item.fid) allFiles.push(item);
                else if (item.cid && isSeasonFolder(item.n)) seasonFolders.push(item);
            });
            offset += limit;
            if (offset >= (listRes.count || 0)) break;
        }
        return { files: allFiles, seasonFolders, path: pathInfo };
    }

    // 预编译正则 — 避免每个文件都重新编译
    const RE_EXT = /(\.[^.]+)$/;
    // 模式 1: SxxExx —— 同时给出季和集
    const RE_SXE = /S(\d{1,2})E(\d{2,3})/i;
    // 模式 2: [xx] 或 [xxvN] —— 仅集号；避免误中 [1080p] / [Baha] 这种
    const RE_BRACKET_EP = /\[(\d{1,3})(?:v\d+)?\]/;
    // 模式 3: 空格-空格-数字 —— 仅集号；避免误中 " - 1080p" 这种分辨率
    const RE_DASH_EP = /\s-\s*(\d{1,3})(?:v\d+)?(?=\s|\.|\[|\(|$)/;
    const RE_UNSAFE_CHAR = /[\\/:*?"<>|]/g;

    // 解析文件名中的季/集信息。seasonHint 来自父级 Season 文件夹名；
    // 若文件名只给出集号（[xx] / - xx），则用 seasonHint，否则回落到第 1 季。
    function matchEpisode(filename, seasonHint) {
        let m = RE_SXE.exec(filename);
        if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
        m = RE_BRACKET_EP.exec(filename);
        if (m) return { season: seasonHint || 1, episode: parseInt(m[1], 10) };
        m = RE_DASH_EP.exec(filename);
        if (m) return { season: seasonHint || 1, episode: parseInt(m[1], 10) };
        return null;
    }

    async function scanAndMatchFiles(myRun) {
        if (typeof myRun === 'undefined') myRun = state.runId;
        try {
            updateStatus('正在扫描文件列表…', true);
            const cid = getCurrentCid();
            if (cid === '0') throw new Error("未识别到文件夹 CID");

            const { files: directFiles, seasonFolders, path: currentPath } = await fetchFilesInFolder(cid);
            if (myRun !== state.runId) return;

            // 若当前文件夹本身就是 Season 文件夹，把它的季号作为直属文件的提示
            let directSeasonHint = null;
            if (currentPath && currentPath.length > 0) {
                directSeasonHint = extractSeasonNum(currentPath[currentPath.length - 1].name);
            }
            directFiles.forEach(f => { f._seasonHint = directSeasonHint; });

            let allFiles = directFiles;
            state.seasonFolderRenames = [];

            if (seasonFolders.length > 0) {
                updateStatus(`并发扫描 ${seasonFolders.length} 个 Season 子文件夹…`, true);

                // ★ 核心优化：并发扫描所有子文件夹
                const subResults = await parallelMap(seasonFolders, async (folder) => {
                    if (myRun !== state.runId) return { files: [], folder };
                    const { files: subFiles } = await fetchFilesInFolder(folder.cid);
                    return { files: subFiles, folder };
                }, CONCURRENCY);

                if (myRun !== state.runId) return;

                for (const { files: subFiles, folder } of subResults) {
                    const sNum = extractSeasonNum(folder.n);
                    subFiles.forEach(f => { f._seasonHint = sNum; });
                    allFiles = allFiles.concat(subFiles);
                    if (sNum !== null) {
                        const idealName = `Season ${sNum}`;
                        if (folder.n !== idealName) {
                            state.seasonFolderRenames.push({
                                cid: folder.cid,
                                oldName: folder.n,
                                newName: idealName,
                                status: 'pending'
                            });
                        }
                    }
                }
            }

            // ★ 静默删除：扫描阶段把命中关键字的「文件」(fid 项) 直接送回收站
            // allFiles 来自 fetchFilesInFolder，已经只包含 item.fid 的条目，文件夹不会出现在这里
            if (DELETE_KEYWORDS.length > 0) {
                const kws = DELETE_KEYWORDS.map(k => k.toLowerCase());
                const toDelete = [];
                const kept = [];
                for (const f of allFiles) {
                    const name = (f.n || '').toLowerCase();
                    if (f.fid && name && kws.some(k => name.includes(k))) toDelete.push(f);
                    else kept.push(f);
                }
                if (toDelete.length > 0) {
                    const batchSize = 50;
                    for (let i = 0; i < toDelete.length; i += batchSize) {
                        const batch = toDelete.slice(i, i + batchSize);
                        try { await deleteFidsBatch(batch.map(f => f.fid)); }
                        catch (e) { console.warn('[TMDB Rename] 静默删除失败:', e); }
                        if (myRun !== state.runId) return;
                    }
                    console.log(`[TMDB Rename] 静默删除 ${toDelete.length} 个命中关键字的文件:`,
                        toDelete.map(f => f.n));
                    allFiles = kept;
                }
            }

            // ★ 优化：用预编译正则 + 预构建 Map 避免重复拼接
            state.files = [];
            const episodes = state.tmdbEpisodes;
            const seriesPrefix = `${state.seriesName}.${state.seriesYear}.`;

            for (let i = 0; i < allFiles.length; i++) {
                const fileObj = allFiles[i];
                const originalName = fileObj.n;
                if (!originalName) continue;

                const epInfo = matchEpisode(originalName, fileObj._seasonHint);
                if (!epInfo) continue;

                const seasonNum = epInfo.season;
                const epNum = epInfo.episode;
                const epTitle = episodes[`${seasonNum}-${epNum}`];
                if (!epTitle) continue;

                const extMatch = RE_EXT.exec(originalName);
                const ext = extMatch ? extMatch[1] : '';
                const sxe = `S${seasonNum.toString().padStart(2, '0')}E${epNum.toString().padStart(epNum >= 100 ? 3 : 2, '0')}`;
                const safeEpTitle = epTitle.replace(RE_UNSAFE_CHAR, ' ').trim();
                const newName = `${seriesPrefix}${sxe}.${safeEpTitle}${ext}`;

                if (originalName !== newName) {
                    state.files.push({ fid: fileObj.fid, originalName, newName, status: 'pending', checked: true });
                }
            }

            renderFolderRenames();
            renderFileList();

            const hasFolderWork = state.folderRename || state.seasonFolderRenames.length > 0;
            if (state.files.length > 0 || hasFolderWork) {
                setStep(2);
                const parts = [];
                if (state.files.length > 0) parts.push(`${state.files.length} 个文件`);
                if (state.folderRename) parts.push('剧名文件夹');
                if (state.seasonFolderRenames.length > 0) parts.push(`${state.seasonFolderRenames.length} 个 Season 文件夹`);
                updateStatus(`✅ 匹配到 ${parts.join('、')}需要重命名`);
            } else {
                updateStatus('未找到需要改名的文件');
            }
        } catch (error) {
            if (myRun !== state.runId) return;
            updateStatus('❌ ' + error.message);
        }
    }

    // ===== 文件列表 =====
    function updateSelectCount() {
        const countEl = document.querySelector('.tmdb-select-count');
        if (!countEl) return;
        const checked = state.files.filter(f => f.checked).length;
        countEl.textContent = `${checked} / ${state.files.length}`;
        const selectAllCb = document.getElementById('tmdb-select-all');
        if (selectAllCb) selectAllCb.checked = (checked === state.files.length && state.files.length > 0);
        const execBtn = document.getElementById('tmdb-execute-btn');
        if (execBtn) {
            const pendingChecked = state.files.filter(f => f.checked && f.status === 'pending').length;
            const pendingFolders =
                (state.folderRename && state.folderRename.status === 'pending' ? 1 : 0) +
                state.seasonFolderRenames.filter(sr => sr.status === 'pending').length;
            const total = pendingChecked + pendingFolders;
            execBtn.textContent = `执行重命名 (${total})`;
            execBtn.disabled = (total === 0);
        }
    }

    function renderFileList() {
        const container = document.getElementById('tmdb-file-list');
        if (!container) return;
        if (state.files.length === 0) {
            container.innerHTML = '<div class="tmdb-file-empty">暂无匹配的文件</div>';
            updateSelectCount();
            return;
        }

        // ★ 优化：用 DocumentFragment 一次性写入 DOM
        const allChecked = state.files.every(f => f.checked);
        const checkedCount = state.files.filter(f => f.checked).length;

        const parts = [`
            <div class="tmdb-select-bar">
                <label><input type="checkbox" class="tmdb-checkbox" id="tmdb-select-all" ${allChecked ? 'checked' : ''}> 全选</label>
                <span class="tmdb-select-count">${checkedCount} / ${state.files.length}</span>
            </div>
        `];

        for (let idx = 0; idx < state.files.length; idx++) {
            const f = state.files[idx];
            const statusClass = f.status === 'success' ? 'tmdb-badge-success' : f.status === 'fail' ? 'tmdb-badge-fail' : 'tmdb-badge-pending';
            const statusText = f.status === 'success' ? '✓ 成功' : f.status === 'fail' ? '✗ 失败' : '待处理';
            parts.push(`
            <div class="tmdb-file-item ${f.checked ? '' : 'unchecked'}" data-idx="${idx}">
                <div class="tmdb-new-name-row" style="margin-bottom:4px">
                    <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer">
                        <input type="checkbox" class="tmdb-checkbox tmdb-file-cb" data-idx="${idx}" ${f.checked ? 'checked' : ''}>
                        <span class="tmdb-old-name" style="margin:0" title="${escapeHtml(f.originalName)}">${escapeHtml(f.originalName)}</span>
                    </label>
                    <span class="tmdb-file-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="tmdb-new-name" title="${escapeHtml(f.newName)}">→ ${escapeHtml(f.newName)}</div>
            </div>`);
        }

        container.innerHTML = parts.join('');

        // ★ 优化：事件委托代替逐个绑定
        document.getElementById('tmdb-select-all').addEventListener('change', e => {
            const checked = e.target.checked;
            state.files.forEach(f => { f.checked = checked; });
            // 局部更新 DOM 而非重渲染
            container.querySelectorAll('.tmdb-file-cb').forEach(cb => { cb.checked = checked; });
            container.querySelectorAll('.tmdb-file-item').forEach(item => { item.classList.toggle('unchecked', !checked); });
            updateSelectCount();
        });

        container.addEventListener('change', e => {
            const cb = e.target;
            if (!cb.classList.contains('tmdb-file-cb')) return;
            const idx = parseInt(cb.dataset.idx, 10);
            state.files[idx].checked = cb.checked;
            const item = cb.closest('.tmdb-file-item');
            if (item) item.classList.toggle('unchecked', !cb.checked);
            updateSelectCount();
        });

        updateSelectCount();
    }

    // 4. 执行重命名
    async function executeRename() {
        const btn = document.getElementById('tmdb-execute-btn');
        if (btn) btn.disabled = true;

        const hasPendingFolders = (state.folderRename && state.folderRename.status === 'pending')
            || state.seasonFolderRenames.some(sr => sr.status === 'pending');
        if (hasPendingFolders) {
            updateStatus('正在重命名文件夹…', true);
            await executeFolderRenames();
        }

        const pending = state.files.filter(f => f.status === 'pending' && f.checked);

        const folderSuccessCount =
            (state.folderRename && state.folderRename.status === 'success' ? 1 : 0) +
            state.seasonFolderRenames.filter(sr => sr.status === 'success').length;
        const anyFolderOk = folderSuccessCount > 0;

        if (pending.length === 0) {
            if (anyFolderOk) {
                setStep(3);
                updateStatus(`🎉 ${folderSuccessCount} 个文件夹重命名完成！`);
                setTimeout(() => softRefreshPage(), 100);
            } else {
                updateStatus('没有待处理的项目');
            }
            if (btn) btn.disabled = false;
            return;
        }

        updateStatus(`正在重命名 ${pending.length} 个文件…`, true);
        setProgress(0);

        const batchSize = 50;
        let done = 0;
        for (let i = 0; i < pending.length; i += batchSize) {
            const batch = pending.slice(i, i + batchSize);
            const formData = new URLSearchParams();
            batch.forEach(f => formData.append(`files_new_name[${f.fid}]`, f.newName));
            try {
                const res = await request('POST', 'https://webapi.115.com/files/batch_rename', formData.toString(), true);
                batch.forEach(f => { f.status = res.state ? 'success' : 'fail'; });
            } catch {
                batch.forEach(f => { f.status = 'fail'; });
            }
            done += batch.length;
            setProgress((done / pending.length) * 100);
            renderFileList();
            if (i + batchSize < pending.length) await new Promise(r => setTimeout(r, 300));
        }

        const successCount = state.files.filter(f => f.status === 'success').length;
        const failCount = state.files.filter(f => f.status === 'fail').length;
        setProgress(-1);
        setStep(3);

        let msg = '🎉 完成！';
        if (anyFolderOk) msg += `文件夹 ${folderSuccessCount}✓  `;
        msg += `文件 ${successCount} 成功`;
        if (failCount > 0) msg += ` / ${failCount} 失败`;
        updateStatus(msg);

        if (successCount > 0 || anyFolderOk) setTimeout(() => softRefreshPage(), 100);
        if (btn) btn.disabled = false;
    }

    function softRefreshPage() {
        try {
            const iframe = document.querySelector('iframe[rel="wangpan"]');
            if (iframe && iframe.contentDocument) {
                const links = iframe.contentDocument.querySelectorAll('.file-path a');
                if (links.length > 0) {
                    links[links.length - 1].click();
                    return;
                }
            }
        } catch {}

        try {
            const cid = getCurrentCid();
            if (cid && cid !== '0') {
                const currentHash = location.hash;
                location.hash = '#';
                setTimeout(() => { location.hash = currentHash; }, 50);
                return;
            }
        } catch {}

        updateStatus('🎉 重命名完成！请手动刷新文件列表查看效果');
    }

    // ==========================================
    // CID 监听
    // ==========================================
    let lastKnownCid = '';
    function onCidChange() {
        const currentCid = getCurrentCid();
        if (currentCid === lastKnownCid || currentCid === '0') return;
        lastKnownCid = currentCid;

        state.files = [];
        state.tmdbEpisodes = {};
        state.folderRename = null;
        state.seasonFolderRenames = [];
        state._currentFolder = null;
        setStep(0);
        setProgress(-1);
        const results = document.getElementById('tmdb-search-results');
        if (results) { results.style.display = 'none'; results.innerHTML = ''; }
        const list = document.getElementById('tmdb-file-list');
        if (list) list.innerHTML = '';
        const folderEl = document.getElementById('tmdb-folder-rename');
        if (folderEl) { folderEl.style.display = 'none'; folderEl.innerHTML = ''; }

        autoRun();
    }

    function startCidWatcher() {
        window.addEventListener('hashchange', () => onCidChange());
        window.addEventListener('popstate', () => onCidChange());
        // ★ 优化：用更轻量的 hash 轮询取代 MutationObserver + setInterval 双重轮询
        let pollCid = '';
        setInterval(() => {
            const c = getCurrentCid();
            if (c !== pollCid) { pollCid = c; onCidChange(); }
        }, 2000);
    }

    // ==========================================
    // UI 初始化 — 智能等待而非死等 2 秒
    // ==========================================
    function createUI() {
        const toggleBtn = document.createElement('div');
        toggleBtn.id = 'tmdb-toggle-btn';
        toggleBtn.innerHTML = '🎬';
        toggleBtn.title = 'TMDB 剧集重命名';
        toggleBtn.onclick = () => document.getElementById('tmdb-rename-panel').classList.toggle('tmdb-hidden');
        document.body.appendChild(toggleBtn);

        const panel = document.createElement('div');
        panel.id = 'tmdb-rename-panel';
        panel.classList.add('tmdb-hidden');
        panel.innerHTML = `
            <div class="tmdb-header">
                <div class="tmdb-header-title">
                    <span class="tmdb-logo">🎬</span>
                    TMDB 剧集重命名
                </div>
                <div style="display:flex;gap:6px">
                    <button class="tmdb-close-btn" id="tmdb-key-btn" title="设置 TMDB API key">🔑</button>
                    <button class="tmdb-close-btn" id="tmdb-close-btn">✕</button>
                </div>
            </div>
            <div class="tmdb-steps">
                <div class="tmdb-step active">
                    <span class="tmdb-step-num">1</span><span class="tmdb-step-label">搜索剧集</span>
                </div>
                <div class="tmdb-step-line"></div>
                <div class="tmdb-step">
                    <span class="tmdb-step-num">2</span><span class="tmdb-step-label">匹配文件</span>
                </div>
                <div class="tmdb-step-line"></div>
                <div class="tmdb-step">
                    <span class="tmdb-step-num">3</span><span class="tmdb-step-label">执行重命名</span>
                </div>
            </div>
            <div class="tmdb-body">
                <div class="tmdb-search-row">
                    <input type="text" id="tmdb-search-input" class="tmdb-input" placeholder="输入剧名 或 TMDB 链接">
                    <button id="tmdb-search-btn" class="tmdb-btn tmdb-btn-primary">搜索</button>
                </div>
                <div id="tmdb-search-results"></div>
                <div id="tmdb-status">等待操作…</div>
                <div class="tmdb-progress-wrap"><div class="tmdb-progress-bar"></div></div>
                <div id="tmdb-folder-rename" style="display:none"></div>
                <div id="tmdb-file-list"></div>
            </div>
            <div class="tmdb-action-bar">
                <button id="tmdb-match-btn" class="tmdb-btn tmdb-btn-sm tmdb-btn-secondary" disabled>重新匹配</button>
                <button id="tmdb-execute-btn" class="tmdb-btn tmdb-btn-sm tmdb-btn-primary" disabled>执行重命名 (0)</button>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('tmdb-close-btn').onclick = () => panel.classList.add('tmdb-hidden');
        document.getElementById('tmdb-key-btn').onclick = () => {
            const input = prompt('TMDB API key (v3)\n申请地址: https://www.themoviedb.org/settings/api\n留空则清除当前 key:', tmdbKey());
            if (input === null) return;
            setApiKey(input.trim());
            updateStatus(input.trim() ? '✅ TMDB API key 已保存，可重新搜索' : 'TMDB API key 已清除，点击 🔑 重新设置');
        };
        document.getElementById('tmdb-search-btn').onclick = () => {
            const q = document.getElementById('tmdb-search-input').value.trim();
            if (q) searchTMDB(q);
        };
        document.getElementById('tmdb-search-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') { const q = e.target.value.trim(); if (q) searchTMDB(q); }
        });
        document.getElementById('tmdb-match-btn').onclick = () => scanAndMatchFiles();
        document.getElementById('tmdb-execute-btn').onclick = () => executeRename();

        lastKnownCid = getCurrentCid();
        autoRun();
        startCidWatcher();
    }

    // ★ 优化：智能初始化，DOM ready 后立即执行，不再固定等 2 秒
    function initWhenReady() {
        if (document.body) {
            // 115 是 SPA，需要等 hash 中有 cid 或页面基本框架加载完成
            if (getCurrentCid() !== '0' || document.querySelector('iframe[rel="wangpan"]')) {
                createUI();
            } else {
                // 页面刚加载，hash 还没就绪，短暂等待
                setTimeout(createUI, 500);
            }
        } else {
            document.addEventListener('DOMContentLoaded', () => setTimeout(createUI, 300));
        }
    }

    initWhenReady();
})();
